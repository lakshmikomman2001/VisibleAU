# Claude Code — DIAGNOSE (report-first, NO fixes): `POST /api/brands/[id]/drafts` returns 500 on prod DB

Clicking "Generate" in the draft modal returns **500 (Internal Server Error)** with the UI message "Failed to
queue draft generation." Browser console confirms: `POST /api/brands/39a9e4c7-b01d-4289-890d-17203b13ec02/drafts
→ 500` (from `generate-draft-modal.tsx:52`). Surfaced when testing against the **freshly-migrated prod database**
(Sydney Plumbing Solutions, task "Add a Wikipedia entry for your business").

A 500 is an UNHANDLED server exception — NOT a clean handled failure. The cause must be confirmed from the actual
error/stack trace before fixing. **DIAGNOSE ONLY. Report the root cause + fix direction. Change NO source.**

Three plausible causes (the fix differs sharply for each — do NOT assume):
1. **Unhandled `inngest.send()` failure** — the `/drafts` route calls `inngest.send({ name: 'draft/generate', ... })`
   WITHOUT the graceful try/catch that the complete route just got (the sibling fix). In prod, Inngest is
   unreachable (stub `INNGEST_EVENT_KEY`, no `INNGEST_DEV=1`), so the send throws → unhandled → 500. (Most likely,
   given the complete route had the identical non-atomic pattern.)
2. **Migrated-prod DB/schema error** — `content_drafts` was one of the 3 tables just created in the prod migration.
   A missing column, an enum mismatch, an RLS policy, or a NOT NULL/default difference between the migrated prod
   table and what the insert expects → DB throws → 500.
3. **recommendation_key → draft_type translation error** — `content-generator.ts` translates the task's
   recommendation_key (hyphen) to a `draft_type` (underscore). If this task's recommendation_key has no mapping
   (or the translation table errors), the route could throw before/at insert → 500.

> Note: this is the sibling pattern to the complete-route bug just fixed (non-atomic, unhandled fallible op). But
> CONFIRM — it could equally be a migrated-schema issue on `content_drafts`. The 500's stack trace tells us which.

---

## STEP 1 — Get the ACTUAL error (this is the whole diagnosis)
The 500 means something threw. Find it:
```bash
# The route handler — where does it throw?
cat app/api/brands/[brandId]/drafts/route.ts
```
And **capture the server-side error**: reproduce the 500 (click Generate, or curl the endpoint) and read the
**Next.js dev server terminal** (the `:3000` process, NOT the Inngest terminal) — it prints the unhandled
exception + stack trace. Report the EXACT error message and the line it threw at.
```bash
# If the terminal scrollback is lost, reproduce via curl and capture the response/log:
curl -i -X POST "http://localhost:3000/api/brands/39a9e4c7-b01d-4289-890d-17203b13ec02/drafts" \
  -H "Content-Type: application/json" \
  -d '{"taskId":"<the Wikipedia task id>","contentFormat":"expert_article"}' 2>&1 | head -40
```
Report: the actual exception text. This single thing identifies the cause. Categories to match it against:
- `INNGEST_EVENT_KEY` / `Event key not found` / `inngest` / fetch-to-Inngest error → **Cause 1** (unhandled send).
- `column ... does not exist` / `null value in column` / `violates ... constraint` / `relation content_drafts`
  / RLS/permission → **Cause 2** (migrated schema).
- `Cannot read .../undefined` / mapping / `draft_type` / translation → **Cause 3** (recommendation→draft_type).

## STEP 2 — Inspect the route's error handling (is the send unhandled?)
In `drafts/route.ts`, confirm:
- Does it `await inngest.send({ name: 'draft/generate', ... })`? Is that call inside a try/catch, or unhandled
  (so a send failure 500s the whole route)? Compare to the just-fixed complete route's decoupled pattern.
- Does it create a `content_drafts` row BEFORE the send, or does the Inngest function create it? (Per canon: the
  route returns 202 and the Inngest `generateContentDraft` fn creates the row — so the route's main job is
  validate + send. If the row creation is in the route, that's a DB-error surface.)
- Order of operations: validate → (create row?) → send. Where could it throw?

## STEP 3 — Verify the prod `content_drafts` schema matches the insert (rule out Cause 2)
Since `content_drafts` was just migrated:
```bash
# What columns does prod content_drafts actually have?
psql "$PROD_DATABASE_URL" -c "\d content_drafts"
# Compare to what the route/Inngest fn inserts (columns, NOT NULLs, enums, defaults)
psql "$PROD_DATABASE_URL" -c "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='content_drafts' ORDER BY ordinal_position;"
```
Report: do the prod columns match what the code inserts? Any missing column / NOT NULL without default / enum the
insert violates? Is RLS enabled and does the insert path satisfy it? (If the migration created the table but, say,
missed a column or a default, the insert 500s — that's Cause 2, a data/migration fix, not a code fix.)

## STEP 4 — Confirm whether Inngest is even reachable right now
```bash
# Is INNGEST_DEV set? What's the event key?
grep -nE "INNGEST_DEV|INNGEST_EVENT_KEY|INNGEST_SIGNING" .env.local .env 2>/dev/null
```
Report: is `INNGEST_DEV=1` set? Is the event key the stub or real? Is the dev server reachable at :8288? If
Inngest is unreachable AND the send is unhandled (STEP 2), that's Cause 1 confirmed — the send throws and 500s.
(If Inngest IS reachable and it still 500s, Cause 1 is unlikely → lean Cause 2/3.)

## VERDICT (report one, with the actual error as evidence)
- **(1) UNHANDLED INNGEST SEND** — the route's `inngest.send()` is not wrapped; Inngest unreachable in prod → throws
  → 500. Same class as the complete-route bug. → Fix: decouple the send (try/catch, log loudly, return a clean
  status — same pattern as the complete-route fix), so a send failure doesn't 500. NOTE: unlike complete, draft
  generation NEEDS the event to actually create the draft — so the fix should return a clean error (e.g. 503
  "draft generation unavailable — Inngest not reachable") rather than a misleading success, AND the underlying
  prod-Inngest wiring still needs fixing for drafts to actually work. Report this nuance.
- **(2) MIGRATED-SCHEMA ERROR** — the insert hits a `content_drafts` column/constraint/enum/RLS mismatch from the
  migration. → Fix: correct the prod schema (the missing column/default/policy), NOT app code. Report exactly
  what's mismatched.
- **(3) TRANSLATION ERROR** — recommendation_key→draft_type mapping throws for this task. → Fix: the translation
  table / null-handling in content-generator.ts. Report the unmapped key.
- **(COMBINATION)** — e.g. unhandled send AND a schema gap. Report both.

## REPORT
- **STEP 1: the EXACT server-side exception + stack line** (the decisive evidence).
- STEP 2: the route's send handling (wrapped or unhandled) + whether the route or the Inngest fn creates the row.
- STEP 3: prod `content_drafts` schema vs the insert — any mismatch (column/NOT NULL/enum/RLS).
- STEP 4: INNGEST_DEV / event key / dev-server reachability.
- **The verdict (1/2/3/combination)** with the actual error backing it.
- The precise fix direction for Sri to approve (do NOT apply).
- Confirm: no source/data changed (diagnosis only).

## NOTE — relationship to the complete-route fix + the broader prod-Inngest gap
The complete route was just hardened against unreachable Inngest (idempotent + decoupled send). If this is Cause 1,
the draft route has the SAME unhandled-send pattern and needs the analogous treatment — BUT draft generation can't
"succeed without the event" the way completion can (completion has the DB as truth; a draft only exists if the
Inngest fn runs). So the right fix is a clean, honest failure (not a fake success) PLUS fixing prod Inngest
reachability. This connects to the broader pattern: every event-driven feature (complete, draft, re-audit,
scheduled audits) needs working Inngest in this prod environment — local dev server (START-INNGEST.bat +
INNGEST_DEV=1) for the local-app-against-prod-DB setup, or Inngest Cloud keys + deployed serve endpoint for a real
prod deploy. Flag whether the 500 is fundamentally "Inngest isn't wired for prod" vs a code/schema defect.
