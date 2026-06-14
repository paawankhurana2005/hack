# Deploying ReLoop

Two pieces, deployed separately:

| Piece | Host | What it is |
| --- | --- | --- |
| `apps/web` | **Vercel** | Next.js app (the whole UI). Static + client-side. |
| `apps/api` | **Render** | Express API for AI grading / pricing / agent narration / Rufus. |

The marketplace, provenance chains, EcoCredits, listings etc. are **client-side
(localStorage)** and work without the API. The API is only needed for the
photo-grading, pricing, agent-narration, and Rufus chat features. Deploy the API
first so you have its URL for the web build.

---

## Order of operations

1. Deploy the **API** to Render → get its URL (e.g. `https://reloop-api.onrender.com`).
2. Deploy the **web** app to Vercel with `NEXT_PUBLIC_API_BASE_URL` = that URL → get the Vercel URL.
3. Set the API's `WEB_ORIGIN` = the Vercel URL (for CORS) and redeploy the API.

---

## 1) API on Render

The repo ships a `render.yaml` blueprint.

- Render Dashboard → **New → Blueprint** → select this GitHub repo.
- Render reads `render.yaml`, creates the `reloop-api` web service, and prompts
  for the two secret env vars below.
- Build: `corepack enable && pnpm install --frozen-lockfile`
- Start: `pnpm --filter @reloop/api start:prod` (runs via `tsx` — no compile step;
  needed because `@reloop/shared` is consumed as raw TS).
- Health check: `GET /health`.

### Env vars (set in the Render dashboard)
| Key | Required | Value |
| --- | --- | --- |
| `NVIDIA_API_KEY` | **Yes** | Your NVIDIA NIM key (`nvapi-…`). The server refuses to boot without it. |
| `WEB_ORIGIN` | **Yes** | The Vercel URL, e.g. `https://reloop.vercel.app` (set after step 2). |
| `NODE_VERSION` | preset | `20` (already in `render.yaml`). |
| `PORT` | auto | Render injects it; the app reads it automatically. |
| `NVIDIA_BASE_URL` / `GRADING_MODEL` / `PRICING_MODEL` | optional | Override only if you don't want the defaults in `apps/api/src/config.ts`. |

> No NVIDIA key? The API currently **requires** one (`config.ts`). To run a
> keyless mock build you'd relax that schema — tell me and I'll wire a
> `MOCK_MODE` fallback so grading returns canned results.

---

## 2) Web on Vercel

- Vercel → **Add New → Project** → import this repo.
- **Root Directory:** `apps/web` (Vercel still installs from the pnpm workspace root).
- **Framework Preset:** Next.js (auto-detected). Leave build/install commands default.

### Env var (set in the Vercel project)
| Key | Required | Value |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | **Yes** | The Render API URL, e.g. `https://reloop-api.onrender.com`. Baked in at build time, so redeploy if it changes. |

---

## 3) Close the loop (CORS)

Back in Render, set `WEB_ORIGIN` to the live Vercel URL and trigger a redeploy.
CORS already allows that origin plus any `localhost` port for local dev.

---

## What I need from you to do it end-to-end
I can prepare the repo (done) but I can't create your cloud accounts or hold your
secrets. To finish, either:
- **You** click through the two dashboards above and paste the keys (recommended —
  keeps `NVIDIA_API_KEY` private), or
- give me a **Vercel token** + **Render deploy hook/API key** and I'll drive the
  CLIs — but you'd still set `NVIDIA_API_KEY` yourself in the dashboard.

The only real secret is **`NVIDIA_API_KEY`**. Everything else is just URLs.
