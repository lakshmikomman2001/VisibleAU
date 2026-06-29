# Claude Code — FIX: Inngest signing-key 400 → force dev mode with INNGEST_DEV=1

The Resend crash is fixed, BUT `PUT /api/webhooks/inngest` now **400s repeatedly** with "Your signing key is
invalid" — **even though the Inngest dev server IS running on :8288.** Root cause: **Inngest v4 defaults to Cloud
mode.** The client (`lib/inngest/client.ts` = `new Inngest({ id: "visibleau" })`) has no dev-mode signal, so the
SDK does real CLOUD signature validation against `INNGEST_SIGNING_KEY=local-stub` → rejects it → 400. The local
dev server's handshake is never used because the SDK thinks it's in production. Fix: force dev mode locally.

> The dev server is fine — DON'T restart it. The fix is an env var + restarting the **Next.js app** (the SDK
> reads dev-mode config at module load). Per Inngest v4 docs: "v4 defaults to Cloud mode, so set isDev: true or
> INNGEST_DEV=1 for local development."

## STEP 1 — Add INNGEST_DEV=1 to the local env
Add to `.env.local` (and `.env.dev` if the app loads it locally — match where `INNGEST_EVENT_KEY=local-stub` is):
```
INNGEST_DEV=1
```
- This is LOCAL-ONLY. Do NOT add it to any production env / `.env.production*` — prod must stay in Cloud mode
  (prod requires the real signing key). Keeping it in `.env.local`/`.env.dev` only is correct.
- Do NOT hardcode `isDev: true` in `lib/inngest/client.ts` — that would force dev mode in prod too. The env var
  is the right per-environment approach.

## STEP 2 — Verify written
```bash
grep -n "INNGEST_DEV" .env.local .env.dev 2>/dev/null
# Confirm it's NOT in a prod env file:
grep -rn "INNGEST_DEV" .env.production* 2>/dev/null   # should return nothing
```

## STEP 3 — RESTART the Next.js app (env read at module load)
- Ctrl+C the `:3000` dev server, restart (`npm run dev`), wait for "Ready".
- LEAVE the Inngest dev server (`:8288`) running — it does NOT need restarting.

## STEP 4 — CONFIRM the sync now succeeds (acceptance check)
1. **App terminal:** `PUT /api/webhooks/inngest` changes from **400 → 200** (the repeated 400s STOP). This is the
   key signal — dev mode means the stub signing key is accepted + the SDK talks to the local dev server.
   - If a DIFFERENT error appears, capture it. But expect 200.
2. **Inngest dashboard → Apps** (`http://localhost:8288/apps`): app shows **Synced** (Error badge cleared).
3. **Inngest dashboard → Functions:** functions are listed — confirm **`triggerValidationReaudit`** (+
   `weekly-digest-cron`, `schedule-workflow-runs`, `generate-content-draft`, Phase 1 fns).

## STEP 5 — THE TEST: complete a task → event fires (finally)
On the Bondi kanban (`/brands/8f59b2a2-6aa0-4318-9848-b33ed520ca36/workflow/tasks`):
- Drag a task (the "Get mentioned in relevant Reddit threads" task in Review) to **Done**.
- `POST .../complete` returns **200** (no 401 "Event key not found", no "complete→complete").
- Inngest dashboard → **Runs**: the **`task/completed`** event fires AND **`triggerValidationReaudit`** triggers.
- EXPECTATION: `triggerValidationReaudit` has `step.sleep('14 days')` → it **starts then sleeps** (scheduled
  state). That IS success — verifying the event fired + function triggered, not instant completion.

## REPORT
1. `grep` confirming `INNGEST_DEV=1` in `.env.local`/`.env.dev` (+ absent from prod env files).
2. Next.js app restarted (Inngest dev server left running).
3. `PUT /api/webhooks/inngest` now 200 (400s stopped)? Inngest Apps = Synced? Functions lists
   `triggerValidationReaudit`?
4. Drag-to-Done: `/complete` → 200? `task/completed` fired + `triggerValidationReaudit` triggered (then sleeping)?
5. Note for prod checklist: prod must NOT set INNGEST_DEV; it uses real keys + Cloud mode (already on the
   deployment checklist).
