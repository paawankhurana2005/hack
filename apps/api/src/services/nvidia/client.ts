// Thin wrapper over NVIDIA's OpenAI-compatible chat API. Shared by the grading
// (vision) and pricing (text) services so the HTTP + JSON-extraction logic lives
// in one place.

import type { Config } from '../../config.js';
import { traceModelCall, type ModelCallResult, type TraceMeta } from '../../lib/langfuse.js';

export interface ChatContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  /** Spec 022: optional Langfuse trace correlation — omit to run untraced. */
  traceMeta?: TraceMeta;
}

// Hard ceiling on a single model call so a stuck upstream can never hang the
// request indefinitely.
const REQUEST_TIMEOUT_MS = 45_000;

/** POST a chat completion and return the assistant's text content. Throws on
 *  transport errors, timeout, or an empty response. Every call is traced via
 *  Langfuse when configured (see lib/langfuse.ts) — this is the one seam all
 *  NVIDIA calls in the API go through, so tracing lives here, not per call site. */
export async function nvidiaChat(cfg: Config, req: ChatRequest): Promise<string> {
  return traceModelCall(req.traceMeta ?? {}, req.model, req.messages, () => doChat(cfg, req));
}

async function doChat(cfg: Config, req: ChatRequest): Promise<ModelCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${cfg.NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        max_tokens: req.maxTokens ?? 512,
        temperature: req.temperature ?? 0.2,
        top_p: req.topP ?? 0.7,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`NVIDIA request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`NVIDIA API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('empty model response');
  return {
    output: content,
    usage: data.usage && {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    },
  };
}

/** Pull the first balanced JSON object out of arbitrary model text. */
export function extractJson(text: string): Record<string, unknown> {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('no JSON object in model response');
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
    }
  }
  throw new Error('unterminated JSON object in model response');
}
