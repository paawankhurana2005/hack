import { env } from './env.js';
import { NvidiaApiError } from './errors.js';

export interface NvidiaContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface NvidiaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | NvidiaContentBlock[];
}

const BASE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const TIMEOUT_MS = 30_000;

export async function nvidiaChat(params: {
  model: string;
  messages: NvidiaMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        max_tokens: params.maxTokens ?? 512,
        temperature: params.temperature ?? 0.2,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new NvidiaApiError(response.status, body);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  const content = data.choices[0]?.message.content;
  if (content === undefined) {
    throw new NvidiaApiError(200, 'Empty choices array in NVIDIA response');
  }
  return content.trim();
}
