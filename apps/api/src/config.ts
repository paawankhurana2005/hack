// Loads and validates server config from the environment. Secrets stay here,
// server-side only — never sent to the client.

import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NVIDIA_API_KEY: z.string().min(1, 'NVIDIA_API_KEY is required'),
  NVIDIA_BASE_URL: z.string().url().default('https://integrate.api.nvidia.com/v1'),
  // 'trained-local' = our own DINOv2 grader (ml/grading/serve.py), primary in dev;
  // falls back to 'chat-vlm' (NVIDIA-hosted) automatically on error/timeout (spec 023).
  // Render/prod sets this to 'chat-vlm' explicitly — nobody has deployed the Flask
  // server there, so defaulting to trained-local in prod would pay a timeout on every grade.
  GRADING_PROVIDER: z.enum(['chat-vlm', 'trained-local']).default('trained-local'),
  GRADING_MODEL_URL: z.string().url().default('http://127.0.0.1:8000'),
  GRADING_MODEL: z.string().min(1).default('meta/llama-3.2-90b-vision-instruct'),
  PRICING_MODEL: z.string().min(1).default('meta/llama-3.3-70b-instruct'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  // MongoDB Atlas — backs dummy login. Optional: when unset, auth routes return
  // 503 and the web falls back to handle-only login, so the server still boots.
  MONGODB_URI: z.string().min(1).optional(),
  MONGODB_DB: z.string().min(1).default('reloop'),
  // Langfuse — LLM call tracing (spec 022). Optional: when unset, every model
  // call runs untraced with zero overhead; the server still boots.
  LANGFUSE_PUBLIC_KEY: z.string().min(1).optional(),
  LANGFUSE_SECRET_KEY: z.string().min(1).optional(),
  LANGFUSE_BASE_URL: z.string().url().default('https://cloud.langfuse.com'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  // Intentional exception to the structured-logger convention (spec 022): this
  // runs before `lib/logger.ts` has anything to correlate against, and the
  // process exits immediately after — a plain, readable console line is more
  // useful here than a JSON blob for whoever is staring at a crashed boot.
  // eslint-disable-next-line no-console
  console.error(`[reloop/api] invalid configuration:\n${issues.join('\n')}`);
  // eslint-disable-next-line no-console
  console.error('Copy apps/api/.env.example to apps/api/.env and fill it in.');
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
