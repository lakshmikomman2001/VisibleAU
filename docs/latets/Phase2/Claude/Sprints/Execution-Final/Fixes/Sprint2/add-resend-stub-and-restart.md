# Claude Code — ADD RESEND_API_KEY stub + RESTART the Next.js app (verify it takes effect)

The Inngest serve endpoint (`/api/webhooks/inngest`) is still 500-ing with **"Missing API key ... new
Resend"** from `lib/digest/send.ts:3` (`new Resend(process.env.RESEND_API_KEY)` at module load). The stub hasn't
taken effect — most likely the env var wasn't written, OR the **Next.js app wasn't restarted** (env vars are read
at module load; a running app won't see a new var). Fix it AND verify.

> The key missing step is restarting the **Next.js `:3000` app** (NOT just the Inngest dev server). Resend is
> instantiated in the app, so the app process must restart to pick up the new env var.

## STEP 1 — Add the var to .env.local (and .env.dev if the app loads it)
Ensure this exact line exists in `.env.local` (the file the running app loads — same one with
`INNGEST_EVENT_KEY=local-stub`):
```
RESEND_API_KEY=re_local_stub_for_dev
```
- If `.env.dev` is also loaded locally, add it there too (match wherever the Inngest stubs live).
- No quotes, its own line. Use the `re_` prefix (Resend may validate key shape).

## STEP 2 — VERIFY it was actually written (don't assume)
```bash
# Confirm the line is present in the env file(s):
grep -n "RESEND_API_KEY" .env.local .env.dev 2>/dev/null
```
Expected: shows `RESEND_API_KEY=re_local_stub_for_dev`. If it's NOT there, the edit didn't save — redo STEP 1.
Also confirm there isn't a SECOND env file overriding it (e.g. `.env` or `.env.production.local`) with an empty
`RESEND_API_KEY=`:
```bash
grep -rn "RESEND_API_KEY" .env* 2>/dev/null
```
If multiple files set it, ensure the one the app actually loads has the stub (Next.js precedence:
`.env.local` overrides `.env`; `.env.development` is loaded in dev).

## STEP 3 — RESTART THE NEXT.JS APP (the missing step)
- Stop the `:3000` dev server: Ctrl+C in its terminal.
- Start it again (the project's dev command, e.g. `npm run dev`).
- Wait for "Ready". **This is essential** — without restarting, the app keeps the old env and keeps crashing.
- Leave the Inngest dev server (`:8288`) running; it will re-poll the app automatically.

## STEP 4 — CONFIRM the fix worked (acceptance check)
1. **App terminal:** the repeated `PUT /api/webhooks/inngest 500 ... Missing API key` errors **STOP.** Watch for
   ~10–15s (the Inngest dev server polls every few seconds). No more Resend crash.
   - **If a 500 with a DIFFERENT error appears** (e.g. another module doing `new Stripe(...)` /
     `new Anthropic(...)` at module load) → capture that NEW stack trace and report it. That's the next domino,
     same bug class — do not assume the Resend fix failed.
2. **Inngest dashboard → Apps** (`http://localhost:8288/apps`): the app shows **Synced** (no Error badge).
3. **Inngest dashboard → Functions:** the functions are listed — confirm **`triggerValidationReaudit`** appears
   (plus `weekly-digest-cron`, `schedule-workflow-runs`, `generate-content-draft`, + Phase 1 functions).

## STEP 5 — Behavioural test: complete a task → event fires
On the Bondi kanban (`/brands/8f59b2a2-6aa0-4318-9848-b33ed520ca36/workflow/tasks`):
- Drag a task (the "Your AU local directory listings" task in Review) to **Done**.
- Confirm `POST .../complete` returns **200** (no 401, no "complete→complete").
- Inngest dashboard → **Runs**: the **`task/completed`** event fires AND **`triggerValidationReaudit`** triggers.
- EXPECTATION: `triggerValidationReaudit` has `step.sleep('14 days')` → it **starts then sleeps**. That sleeping/
  scheduled state IS success — you're verifying the event fired + function triggered, not instant completion.

## REPORT
1. `grep` output confirming `RESEND_API_KEY=re_local_stub_for_dev` is in `.env.local` (+ no conflicting override).
2. Confirm the Next.js app was **restarted**.
3. After restart: are the `/api/webhooks/inngest` 500s gone? (If a NEW different error appears, paste its stack.)
4. Inngest Apps = Synced? Functions lists `triggerValidationReaudit`?
5. Drag-to-Done: `/complete` → 200? `task/completed` fired + `triggerValidationReaudit` triggered (then sleeping)?
6. Reminder: the proper code fix (lazy Resend instantiation + sweep other eager-instantiation modules) is still
   pending — this was the env-stub unblock only.
