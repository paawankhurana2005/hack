# 015 — Cloud state sync (all user data → MongoDB)

## Goal
Persist **all** user-generated data to the cloud (MongoDB Atlas), not just login.
A signed-in user's data follows them across devices/sessions, and the shared demo
data (marketplace listings, returns queue) persists too. Builds on [[014-mongo-auth]].

## Approach — generic localStorage ↔ cloud mirror (no store rewrites)
The app has ~13 stores with inconsistent key schemes (some namespaced per account
via `storage.ts` `nsKey`, some global like `reloop.listings` / `reloop_returns_v1`).
Rewriting each into async network calls would ripple through every component that
reads them synchronously. Instead we mirror at the storage layer:

- **localStorage stays the synchronous source of truth** — existing stores are
  untouched.
- A client module (`cloud-sync.ts`) hooks `localStorage.setItem`/`removeItem` and
  pushes a **debounced snapshot** to the API.
- On login / initial load we **hydrate** localStorage from the cloud first.

### Scoping
- Keys `reloop.<accountId>.*` → that account's scope (per-user data).
- Other `reloop.*` / `reloop_*` keys → a single `__shared__` scope (marketplace,
  returns queue, sales) so shared demo data persists.
- A *different* account's namespaced keys are never folded into `__shared__`.
- `reloop.account` (the device-local login pointer) is never synced.

## Affected files
- `apps/api/src/routes/state.ts` — `GET/PUT /api/state/:scope` (new).
- `apps/api/src/index.ts` — mount `/api/state`.
- `apps/web/src/lib/cloud-sync.ts` — mirror: hydrate, snapshot, debounced push (new).
- `apps/web/src/lib/role-context.tsx` — hydrate on initial load + on login;
  `stopCloudSync` on logout. `setAccount` is now async.

## Data contracts
MongoDB `state` collection, one doc per scope:
```
{ scope: string, data: Record<string, string>, updatedAt: string }
```
`data` maps a localStorage key → its raw stored JSON string (opaque to the server).
API: `GET /api/state/:scope` → `{ scope, data, updatedAt }`;
`PUT /api/state/:scope` body `{ data }` → upsert.

## Behavior
- Login → pull `__shared__` + account scope into localStorage (bounded ~5s so a
  cold API never blocks first paint), then navigate.
- Any tracked write → debounced (800ms) push of account + shared snapshots.
- Logout → stop syncing.
- Best-effort: if the API/DB is unreachable, every call no-ops and the app runs on
  localStorage alone (graceful, same as before).

## Images
All active capture flows now store **compressed base64** (`image.ts`, ≤160KB each),
so photos ride along in the snapshot and persist to the cloud automatically:
- Sell flow (`capture-step.tsx`, `sell/page.tsx`, `sell-session.tsx`) — already base64.
- Return flow (`BuyerStep1.tsx`) — switched from raw `readAsDataURL` (multi-MB,
  blew the localStorage quota so `saveReturn` silently dropped them) to
  `compressFile`, so return photos now actually persist and sync.
- The `Step1Reason`/`Step2Grading` `blob:` URLs are in **dead components** (0
  importers — superseded by the `BuyerStep*` flow) and don't affect persistence.

**Known limitation:** base64-in-the-cloud-doc is fine for demo volumes but not for
scale — a real build would offload images to S3/Cloudinary and store only URLs.

## Acceptance criteria
- `GET/PUT /api/state/:scope` round-trips; bad scope → 400; no Mongo → 503. ✅ verified live
- `pnpm -r typecheck` and `pnpm --filter web build` pass. ✅
- Logging in hydrates that account's cloud data; changes push back within ~1s.

## Open / follow-ups
- Convert return/sell photo capture from `blob:` URLs to base64 so photos persist
  and sync. (Next step.)
- For production scale: move images to object storage; consider per-key sync
  instead of whole-scope snapshots if data grows large.
- Add `MONGODB_URI` to Render env for the deployed API.
