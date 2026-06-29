# Claude Code — DIAGNOSE: Inngest "401 Event key not found" on task completion (local setup)

Sprint 2 manual testing: completing a task (drag to Done) now works — the task lands in Done with status
`complete` — BUT `POST /api/brands/[id]/tasks/[taskId]/complete` returns **400**, and the UI shows **"Inngest
API Error: 401 Event key not found."** So the `/complete` route correctly *tries* to emit the `task/completed`
event (the wiring is right!), but the local Inngest setup can't send it — missing/invalid event key, or the
Inngest dev server isn't running. **Diagnose the local Inngest config — report what's missing. Don't change
secrets/env without telling Sri what to set.**

> Report-first. This is an environment/config issue, not a code bug. Find out HOW Inngest is meant to run
> locally and WHAT'S missing. Report the fix (which env var / dev-server command) for Sri to apply.

## CONTEXT
- The error is from Inngest's event API: **401 "Event key not found"** = the Inngest client tried to send an
  event but has no valid event key (the credential for sending events).
- The completion logic SUCCEEDS (task → `complete`, in Done). Only the **event emission** fails. So the pipeline
  (`/complete` → emit `task/completed` → `trigger-validation-reaudit`) is correctly wired; it just can't emit.
- Locally, Inngest events are usually handled one of two ways: (a) the **Inngest Dev Server**
  (`npx inngest-cli dev`) intercepts events and provides a local key automatically, or (b) a real
  **`INNGEST_EVENT_KEY`** is set in `.env.local`.

## STEP 1 — What does the Inngest client expect?
```bash
# How is the Inngest client constructed? Does it use a key, dev mode, or a base URL?
grep -rn "new Inngest\|eventKey\|INNGEST_EVENT_KEY\|INNGEST_SIGNING_KEY\|isDev\|INNGEST_DEV\|baseUrl\|inngest({" lib/ inngest/ app/ --include=*.ts | head -20
# The send/emit call that's failing (task/completed):
grep -rn "task/completed\|inngest.send\|\.send(" app/api/brands/*/tasks/*/complete/ lib/ inngest/ --include=*.ts | head
```
Report: how the Inngest client is configured (does it read `INNGEST_EVENT_KEY`? does it enable a dev mode?),
and where `task/completed` is sent.

## STEP 2 — What's in the local env?
```bash
# Is the event key (and signing key) set locally?
grep -i "INNGEST" .env .env.local .env.development 2>/dev/null
# (Report PRESENCE only — do NOT print secret values. Just whether each key is set + looks like a real value vs placeholder/empty.)
```
Report: is `INNGEST_EVENT_KEY` present and non-placeholder? `INNGEST_SIGNING_KEY`? Any `INNGEST_DEV` /
`INNGEST_BASE_URL`?

## STEP 3 — Is a dev server expected / running?
```bash
# Does package.json have an Inngest dev-server script?
grep -i "inngest" package.json
# Is the Inngest serve endpoint mounted? (where the dev server connects)
grep -rn "serve(" app/api/inngest/ app/api/webhooks/inngest/ --include=*.ts | head
# Is anything listening on the Inngest dev port (default 8288)? (best-effort)
curl -s http://localhost:8288 >/dev/null 2>&1 && echo "Inngest dev server appears UP on :8288" || echo "Nothing on :8288 (dev server likely NOT running)"
```
Report: is there an Inngest dev-server script? Is the serve endpoint mounted (and at which path)? Is the dev
server running?

## STEP 4 — Determine the fix (report, don't apply secrets)
Based on 1–3, identify which case applies:
- **Case A — Dev-server intended, not running:** the client is in dev mode and expects `npx inngest-cli dev`,
  but the dev server isn't up. Fix: run the Inngest dev server (report the exact command, e.g.
  `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest` — adjust to the actual serve path from
  STEP 3). With the dev server running, events emit locally and `task/completed` flows to
  `trigger-validation-reaudit`.
- **Case B — Real key expected, missing/placeholder:** the client reads `INNGEST_EVENT_KEY` but it's
  empty/placeholder. Fix: set a valid `INNGEST_EVENT_KEY` in `.env.local` (Sri provides the value from the
  Inngest dashboard) — OR switch local dev to the dev-server approach (Case A), which is the usual local path.
- **Case C — Client/serve-path mismatch:** the dev server is running but pointed at the wrong serve URL (the
  `-u` path doesn't match the mounted endpoint from STEP 3). Fix: align the dev-server `-u` to the real path.

## REPORT (no secret values; recommend the fix for Sri to apply)
1. How the Inngest client is configured (key-based vs dev-mode) + where `task/completed` is sent.
2. Env presence: is `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` set (yes/no/placeholder) — NO values printed.
3. Dev server: script present? serve endpoint path? dev server running on :8288?
4. **Root-cause case (A/B/C)** + the exact fix (the dev-server command with the correct `-u` path, or the env
   var to set). Recommend the standard LOCAL approach (usually the Inngest dev server).
5. Confirm: the `/complete` → `task/completed` → `trigger-validation-reaudit` wiring is correct in code (so once
   the event can emit, the loop fires) — i.e. this is purely a local setup gap, not a code bug.
