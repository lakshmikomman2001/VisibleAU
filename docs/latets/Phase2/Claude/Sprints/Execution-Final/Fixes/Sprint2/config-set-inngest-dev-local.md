# Claude Code — CONFIG (local only): add `INNGEST_DEV=1` to `.env.local` so the app uses the local Inngest dev server

**Environment: LOCAL app (`localhost:3000`) pointed at the PROD database.** This changes ONLY the local machine's
`.env.local` — it does NOT touch any deployed/production environment.

## Problem
`POST /api/brands/[id]/drafts` returns 500 (and task-completion events fail) because the app is in Inngest **Cloud
mode** trying to reach Inngest Cloud with a stub key. The Inngest **dev server is already running** at :8288 and
synced, but the app isn't pointed at it. `.env.local` currently has `INNGEST_EVENT_KEY=local-stub` and **no
`INNGEST_DEV=1`**, so the app defaults to Cloud mode (Inngest v4 default) and the `inngest.send()` throws.

## ⚠️ CRITICAL SCOPE — LOCAL ONLY
- `INNGEST_DEV=1` is for LOCAL DEVELOPMENT ONLY. It tells the app to send events to the LOCAL dev server (:8288)
  instead of Inngest Cloud.
- **NEVER set `INNGEST_DEV=1` in a deployed/production environment** (Vercel env, prod `.env`, etc.). Real prod
  must use Cloud mode with real `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`. Setting dev mode in real prod would
  break all background jobs (the app would look for a local dev server that doesn't exist there).
- This change is confined to the local `.env.local` file. Do NOT modify `.env`, `.env.production`, any deployment
  config, or any committed env file.

## THE CHANGE
1. Open `.env.local` (in the project root, e.g. `C:\startup\VisibleAU\src\.env.local`).
2. Add the line (if not already present):
   ```
   INNGEST_DEV=1
   ```
3. Leave `INNGEST_EVENT_KEY=local-stub` as-is — in dev mode the dev server does NOT authenticate, so the stub key
   is ignored/harmless.
4. Do NOT change any other env var.
5. The Next.js app (`:3000`) must be **restarted** for the new env var to load (env vars load at process start).
   The Inngest dev server (:8288) stays running as-is — do NOT restart it.

## VERIFY
1. After restarting the app, confirm `INNGEST_DEV=1` is set:
   ```bash
   grep -n "INNGEST_DEV" .env.local
   ```
2. Retry draft generation: open the draft modal on the Sydney Plumbing "Add a Wikipedia entry" task → Generate.
   The `POST /api/brands/.../drafts` should now return **202** (not 500).
3. Inngest dashboard (`localhost:8288` → Runs): `generate-content-draft` fires and completes → the draft row is
   created → appears in the Drafts tab.
4. Task completion events also now work (the same Cloud-mode issue affected them): completing a task fires
   `task/completed` → `trigger-validation-reaudit` runs.

## REPORT
- Confirm `INNGEST_DEV=1` added to `.env.local` ONLY (no other env file touched).
- Confirm the app was restarted (not the Inngest dev server).
- Behavioural proof: draft generation returns 202, `generate-content-draft` runs in the Inngest dashboard, draft
  appears.
- Confirm: only `.env.local` changed; no deployment/prod config touched.

## NOTE — this is the local fix; real prod is separate
This makes the LOCAL app (against the prod DB) work by routing events through the local Inngest dev server. For a
REAL production deploy, Inngest needs the opposite: Cloud mode with real `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`
and the deployed serve endpoint registered with Inngest Cloud — that's a separate go-live task, NOT this change.

Also: the bare unhandled `inngest.send()` in `drafts/route.ts:64` (and any other route calling `inngest.send()`
without try/catch) remains a latent robustness gap — it 500s when Inngest is unreachable. With `INNGEST_DEV=1`
set + the dev server running, it won't be hit now, but hardening those sends (clean error instead of opaque 500)
is a separate optional improvement banked for later.
