# 014 — MongoDB-backed dummy login

## Goal
Replace the fake "type a handle, no password" login with real **username + password**
authentication backed by **MongoDB Atlas**. Keep the rest of the app identical:
the same 6 demo accounts (4 users + 2 sellers), and logging in loads that account's
data exactly as today (per-user data is already namespaced by account id in
`apps/web/src/lib/storage.ts`).

## Scope
**In scope**
- A `users` collection in MongoDB Atlas seeded with the existing accounts +
  dummy passwords.
- Express API auth routes: `POST /api/auth/login`, `GET /api/auth/accounts`.
- Login page: add a password field; validate against the API.
- Graceful fallback to the current handle-only login when the DB/API is
  unreachable, so the demo never hard-breaks.

**Out of scope**
- Migrating any other data store (listings, sales, credits, returns, provenance)
  to MongoDB — those stay as they are (localStorage, namespaced by account).
- Real security: password hashing, JWT/session verification, protected routes.
  Credentials are dummy and shown on the login screen on purpose.

## Affected files
- `apps/api/package.json` — add `mongodb`.
- `apps/api/src/config.ts` — add optional `MONGODB_URI`, `MONGODB_DB`.
- `apps/api/src/lib/mongo.ts` — lazy MongoClient singleton (new).
- `apps/api/src/lib/accounts-seed.ts` — demo accounts + passwords + seed fn (new).
- `apps/api/src/routes/auth.ts` — login + accounts routes (new).
- `apps/api/src/index.ts` — mount the auth router.
- `apps/api/.env.example` — document `MONGODB_URI` / `MONGODB_DB`.
- `apps/web/src/lib/api-client.ts` — `login()`, `listAccounts()`.
- `apps/web/src/app/login/page.tsx` — password field + API login (+ fallback).

## Data contracts
Mongo `users` document (server-side only; password never returned):
```
{ id, kind: 'user'|'seller', name, handle, password, city?, initials, glyph, blurb }
```
API responses reuse the web `Account` shape (no `password`). `POST /api/auth/login`
returns `{ account: Account, token: string }` (token is an opaque demo string,
not verified server-side yet).

## UI / behavior
- Login screen shows username + password inputs. The account chips fill the
  username field (they no longer log in directly). Dummy passwords are shown as a
  hint (`<handle>123`).
- On submit: call `POST /api/auth/login`. On success, `setAccount(account.id)` —
  routes sellers to `/seller`, users to `/app/items` (unchanged).
- On `auth_unavailable` (503, DB not configured) or `network_error`, fall back to
  the existing local handle lookup so dev/demo still works before Atlas is wired.

## Acceptance criteria
- With `MONGODB_URI` set, logging in as e.g. `aarav` / `aarav123` opens Aarav's
  user app; `urbanthread` / `urbanthread123` opens the seller dashboard.
- Wrong password is rejected with a clear message.
- With `MONGODB_URI` unset, login still works via the handle fallback.
- `pnpm -r typecheck` passes; `pnpm --filter web build` passes.

## Dummy credentials (shown on login)
| handle | password | role |
|--------|----------|------|
| aarav | aarav123 | user |
| meera | meera123 | user |
| rohan | rohan123 | user |
| ananya | ananya123 | user |
| urbanthread | urbanthread123 | seller |
| techbazaar | techbazaar123 | seller |

## Resolved decisions
- Cloud DB = MongoDB Atlas M0 (free, reachable by deployed web/api).
- Auth backend lives in `apps/api` (Express), not the DynamoDB Lambda.
- Account metadata stays mirrored in `apps/web/src/lib/accounts.ts`; Mongo is the
  auth authority and is seeded from the same list. The web reuses local metadata
  by id so no downstream role wiring changes.
