# Scaling plan — from demo data layer to AWS

This documents how ReLoop's data layer works **today** (hackathon demo) and the
concrete path to **production scale on AWS**. The current design is deliberately
swappable: the app talks to the data layer through a few narrow seams, so the
move to AWS is a backend change, not an app rewrite.

---

## Today (demo)

| Concern | Current implementation | Why it's fine for a demo |
|--------|------------------------|--------------------------|
| **Auth** | Dummy username/password in MongoDB Atlas (`users` collection), plaintext, validated by `POST /api/auth/login`. | Credentials are throwaway and shown on the login screen. |
| **User + app data** | Generic localStorage ↔ MongoDB mirror. localStorage stays the synchronous source of truth; a debounced snapshot syncs to the `state` collection per scope (`<accountId>` and `__shared__`). | Zero per-store rewrites; the app stays fast and stable; data follows the user across devices. |
| **Images** | Compressed (~160KB) base64, stored inline in the synced snapshot. | A handful of photos per user fits Atlas free tier (512MB) and the 16MB BSON doc limit. |
| **API** | Single Express instance on Render (free tier, sleeps when idle). | One judge, low traffic. |

**Seams that make this swappable** (the only places that touch the data layer):
- `apps/web/src/lib/cloud-sync.ts` → `getScope()` / `putScope()` (HTTP to the API).
- `apps/api/src/routes/state.ts` and `routes/auth.ts` → the only DB-aware code.
- `apps/api/src/lib/mongo.ts` → the single DB client.

---

## Production target (AWS)

The repo already contains the AWS groundwork in [`infra/`](../infra) — a DynamoDB
table, an S3 bucket with presigned uploads, and a Lambda behind a Function URL.
The scale plan promotes that from "provenance only" to the primary data layer.

```
            Browser (Next.js on Vercel/CloudFront)
                         │  HTTPS
                         ▼
            API  (ECS Fargate / Lambda behind ALB, autoscaled)
              │                 │                  │
              ▼                 ▼                  ▼
   DynamoDB (app data)   S3 + CloudFront (images)   Cognito (auth)
        │
        └── DynamoDB Streams ─► async workers (grading, routing, notifications)
```

### Migration mapping

| Concern | Demo → | AWS production |
|--------|--------|----------------|
| **Auth** | Plaintext in Mongo | **Amazon Cognito** user pools (hosted login, hashed creds, JWT). API verifies the JWT; routes become protected. |
| **App data** | Mongo `state` snapshots | **DynamoDB** single-table design. Per-scope snapshot → **per-entity items** (`PK=accountId`, `SK=entity#id`) so writes are granular, not whole-blob. The existing `reloop-provenance` table pattern (`pk`/`sk`) extends directly. (If we want to keep MongoDB semantics instead, **Amazon DocumentDB** is the drop-in.) |
| **Images** | base64 inline | **S3** objects + **CloudFront** CDN. Browser uploads via presigned PUT (already implemented in `infra/lambda/index.mjs` `/presign`); the DB stores only the URL. Removes the 16MB/512MB ceilings entirely. |
| **Sync model** | Debounced full-scope PUT | Granular writes per change; **DynamoDB Streams** fan out to async workers (the queue/worker layer from the architecture audit) for grading, routing, notifications. |
| **API hosting** | 1× Render instance | **ECS Fargate** or **Lambda** behind an **ALB**, horizontally autoscaled, stateless (no in-memory state — already true today). |
| **Secrets** | `.env` / Render dashboard | **AWS Secrets Manager** / SSM Parameter Store. |
| **Observability** | `console.*` | **CloudWatch** logs/metrics + X-Ray tracing (see audit §9). |

### What actually changes in code
Because the app only knows the seams above, the migration is contained:
1. Swap `apps/api/src/lib/mongo.ts` for a DynamoDB client (or point it at DocumentDB — no app change).
2. Reimplement `routes/state.ts` over DynamoDB items instead of one snapshot doc.
3. Add an image-upload path: `cloud-sync` / capture flows call `/presign` (already in `infra/`), store the returned S3 URL instead of inlining base64.
4. Put **Cognito** in front; add JWT verification middleware; the web swaps its dummy login for the Cognito flow.

The web app's stores, components, and flows stay as-is — they keep reading
localStorage, which keeps mirroring to whatever backend the seams point at.

---

## Why this order
1. **Images → S3 first** — removes the only hard storage ceiling and is already scaffolded in `infra/`.
2. **Data → DynamoDB** — granular writes + Streams unlock the async grading/routing pipeline.
3. **Auth → Cognito** — real identity + protected routes, prerequisite for any real user data.
4. **API → ECS/Lambda + ALB** — horizontal scale once state is fully externalized (it already is).
