# Claude Code — DIAGNOSE + FIX: `INNGEST_DEV=1` not taking effect — app stuck in Inngest Cloud mode

`INNGEST_DEV=1` was added to `.env.local` and the Next.js app was fully restarted, but the app is STILL in Inngest
**Cloud mode**:
- `POST /api/brands/[id]/drafts` → 500, caused by `Inngest API Error: 401 Event key not found` at
  `drafts/route.ts:64` (`inngest.send()`). The 401 is a CLOUD-mode auth error — in dev mode there'd be no auth, so
  dev mode is NOT active.
- The Next.js terminal is flooded with `PUT /api/webhooks/inngest 400` every ~700ms — the local Inngest dev server
  (running at :8288, synced) repeatedly trying to register with the app and being REJECTED with 400. The app won't
  accept the dev server's sync handshake because it thinks it should talk to Cloud.

Both symptoms = the app is NOT respecting `INNGEST_DEV=1`. Find WHY and fix it. Environment is **LOCAL app
(localhost:3000) against the PROD database** — this is local config/client wiring, NOT a deployed prod change.

> Likely cause: the Inngest client (`new Inngest({...})`) is instantiated with an explicit `eventKey`
> (`process.env.INNGEST_EVENT_KEY`, currently the stub `local-stub`). When an event key is present, the Inngest
> SDK uses Cloud mode and `INNGEST_DEV` may not override it — so the client always tries Cloud auth and 401s,
> regardless of the env var. But CONFIRM via the actual files before fixing.

---

## STEP 1 — Inspect the env file (rule out a malformed/conflicting var)
```bash
grep -n "INNGEST" .env.local
# also check no other env file overrides it / is loaded instead:
grep -rn "INNGEST" .env .env.development .env.dev 2>/dev/null
# confirm which env file the start script actually loads (package.json dev script, any dotenv config):
grep -n "dev" package.json | head; grep -rn "dotenv\|loadEnv\|.env" next.config.* 2>/dev/null
```
Report:
- Is `INNGEST_DEV=1` present in `.env.local`, exactly (no quotes, no trailing space, value `1`)?
- Any conflicting line (`INNGEST_DEV=0`, `INNGEST_BASE_URL`, a Cloud URL)?
- Is `.env.local` actually the file the app loads, or does the start script load a different env file?

## STEP 2 — Inspect the Inngest CLIENT config (the prime suspect)
```bash
grep -rn "new Inngest" lib/ inngest/ app/ --include=*.ts
# then read the client file the above points to, e.g.:
cat lib/inngest/client.ts 2>/dev/null || cat inngest/client.ts 2>/dev/null
grep -rn "eventKey\|isDev\|INNGEST_DEV\|INNGEST_EVENT_KEY\|baseUrl\|INNGEST_BASE_URL" lib/ inngest/ --include=*.ts
```
Report the EXACT `new Inngest({...})` configuration:
- Does it pass `eventKey: process.env.INNGEST_EVENT_KEY`? (If yes — and the key is the stub — that's almost
  certainly forcing Cloud mode.)
- Does it set `isDev` anywhere? Read `INNGEST_DEV`?
- Any `baseUrl`/`INNGEST_BASE_URL` pointing at Cloud?

## VERDICT + FIX (apply the one the evidence supports)

### If CAUSE = malformed/missing/conflicting env var (STEP 1)
Fix `.env.local` so `INNGEST_DEV=1` is present and correct, remove any conflicting var, ensure the app loads that
file. Restart. (Local file only — do NOT touch deployed env.)

### If CAUSE = client forces Cloud mode via explicit eventKey (STEP 2 — most likely)
Make the Inngest client respect dev mode. The clean pattern: when `INNGEST_DEV` is truthy (local dev), the client
should run in dev mode and NOT send a Cloud event key. For example:
```ts
import { Inngest } from "inngest";

const isDev = process.env.INNGEST_DEV === "1" || process.env.NODE_ENV !== "production";

export const inngest = new Inngest({
  id: "visibleau",
  // In dev mode, do NOT pass a Cloud eventKey — the local dev server doesn't authenticate.
  // Only pass the eventKey in non-dev (Cloud) mode.
  ...(isDev ? {} : { eventKey: process.env.INNGEST_EVENT_KEY }),
  isDev, // explicitly tell the SDK
});
```
- Adapt to the SDK version's actual options (confirm `isDev` is the correct option for the installed `inngest`
  version; if not, the correct lever may be omitting `eventKey` + setting `INNGEST_DEV` env, which the SDK reads).
- The goal: with `INNGEST_DEV=1`, the client targets the LOCAL dev server (:8288), sends events without Cloud
  auth, and the `PUT /api/webhooks/inngest` sync returns 200 (not 400).
- **Do NOT hardcode dev mode unconditionally** — it must be conditional on `INNGEST_DEV`/non-production, so the
  same client still works in real prod (Cloud mode with the real key). This must not break the production path.

### If CAUSE = both
Fix both the env var and the client conditional.

## INVARIANTS — do not violate
- LOCAL change only (client code + `.env.local`). Do NOT change deployed/prod env or hardcode dev mode in a way
  that would break real production (prod must still use Cloud mode + real `INNGEST_EVENT_KEY`).
- The client must be CONDITIONAL: dev mode when `INNGEST_DEV=1`/non-prod, Cloud mode otherwise. One client, two
  modes — same pattern that lets it work locally now and in prod later.
- Do NOT change the event names, the `draft/generate` / `task/completed` contracts, or any function logic — this is
  purely about how the client picks dev vs Cloud mode.

## VERIFY — the tell is the 400→200 flip
1. After the fix + full app restart (Ctrl+C then start fresh — NOT hot reload), watch the terminal: the
   `PUT /api/webhooks/inngest` calls should now return **200** (the dev server successfully syncs with the app),
   NOT the 400 spam. THIS is the proof the app is in dev mode.
2. `localhost:8288/apps` → `visibleau` app shows **Synced** with functions listed.
3. Retry draft generation (Sydney Plumbing "Add a Wikipedia entry" task → Generate): `POST /drafts` returns **202**
   (not 500/401).
4. Inngest dashboard → Runs: `generate-content-draft` fires + completes → draft created → appears in Drafts tab.
5. Task completion also works now (same client): completing a task fires `task/completed` → trigger-validation-reaudit.

## REPORT
- STEP 1: the `INNGEST` env lines; whether `INNGEST_DEV=1` is correct + which env file the app loads.
- STEP 2: the exact `new Inngest({...})` config — does it force `eventKey`? set `isDev`? read `INNGEST_DEV`?
- The verdict (env var / client-forces-cloud / both) + the fix applied.
- **Behavioural proof:** the `PUT /api/webhooks/inngest` 400 spam flips to 200; draft generation returns 202;
  `generate-content-draft` runs; draft appears.
- Confirm invariants: local-only, client is conditional (dev vs Cloud), prod path not broken, event contracts
  unchanged.

## NOTE
This finally explains why both the draft 500 AND the original task-completion event failures persisted — the app
was never actually in dev mode, so NO Inngest event could be delivered locally (the dev server's sync was being
400-rejected the whole time). Fixing the client's dev-mode detection makes ALL event-driven features work locally
at once (draft, complete→re-audit, scheduled audits, bulk). For real prod deploy, the same conditional client uses
Cloud mode with real keys — a separate go-live step.
