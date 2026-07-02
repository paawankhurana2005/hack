// Loads and validates server config from the environment. Secrets stay here,
// server-side only — never sent to the client.

import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NVIDIA_API_KEY: z.string().min(1, 'NVIDIA_API_KEY is required'),
  NVIDIA_BASE_URL: z.string().url().default('https://integrate.api.nvidia.com/v1'),
  GRADING_PROVIDER: z.enum(['chat-vlm']).default('chat-vlm'),
  GRADING_MODEL: z.string().min(1).default('meta/llama-3.2-90b-vision-instruct'),
  PRICING_MODEL: z.string().min(1).default('meta/llama-3.3-70b-instruct'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  // MongoDB Atlas — backs dummy login. Optional: when unset, auth routes return
  // 503 and the web falls back to handle-only login, so the server still boots.
  MONGODB_URI: z.string().min(1).optional(),
  MONGODB_DB: z.string().min(1).default('reloop'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  // eslint-disable-next-line no-console
  console.error(`[reloop/api] invalid configuration:\n${issues.join('\n')}`);
  console.error('Copy apps/api/.env.example to apps/api/.env and fill it in.');
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
