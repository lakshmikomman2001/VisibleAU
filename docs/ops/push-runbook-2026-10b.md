# Push runbook — 2026-10b (Task #46, Phase 3)

One ordered runbook for pushing Phase 3's local commits (full answer text storage, Sentiment/
Context marked "not yet measured" everywhere, the `is_cache_hit` prod-fix renumbering). Unlike
`push-runbook-2026-10.md`, only **one** column needs a prod apply before this push —
`citations.is_cache_hit` (`0056`) is **already live on production**, applied by Sri himself on
17 Oct, ahead of this runbook. `citations.response_text` (`0057`) is not yet applied anywhere but
locally.

Every step below names an exact file to paste into the **Neon SQL editor, production branch** —
never SQL to type by hand, never a command run from Claude Code. Stop and send Claude a screenshot
at every step marked **⏸ STOP**.

---

## 1. Neon: snapshot before touching anything

In the Neon console, create a branch from the production branch's current tip, named
`pre-push-2026-10b`. This is the rollback point if anything in steps 2–3 goes wrong — restoring
from it undoes any DDL applied below, independent of `0057-rollback.sql`'s own file.

No SQL file — this is a Neon console action (Branches → your prod branch → "Create branch").

---

## 2. `0056` — `citations.is_cache_hit` (already applied 17 Oct — re-run the post-check only)

This column is already live. Nothing to apply here — this step just re-confirms it's still
correct before the bundle gate in step 4 relies on it.

1. Paste **`db/prod-fixes/0056-run3-post-check.sql`**.
2. Expect: `column_present = t`, `is_nullable = NO`, `column_default = false`,
   `app_role_can_insert = t`, `app_role_can_select = t`.
3. If any of those don't match, **stop and send Claude a screenshot** — do not proceed. (This
   would mean something changed `is_cache_hit` since 17 Oct; it should not need re-applying.)

No **⏸ STOP** marker here in the usual sense — this step can't fail forward into anything, it's a
read-only sanity check of state that's already correct. If it somehow isn't, treat it as a STOP
anyway and escalate before continuing.

---

## 3. `0057` — `citations.response_text` (new this runbook)

1. Paste **`db/prod-fixes/0057-run1-precheck.sql`**. Expect `column_present = f`, plus the current
   `citations` row count (context only, not a gate).
2. Paste **`db/prod-fixes/0057-run2-apply.sql`** — one paste, single transaction. Expect
   "Statement executed successfully" on every tab. Nullable, no default: safe for the code that's
   live right now (it doesn't know this column yet; new rows just get NULL until the push below
   lands).
3. Its own post-check — **⏸ STOP — screenshot to Claude**: Paste
   **`db/prod-fixes/0057-run3-post-check.sql`**. Expect `column_present = t`, `is_nullable = YES`,
   `column_default` NULL, `app_role_can_insert = t`, `app_role_can_select = t`.

**⚠️ Order matters**: this step must complete before step 4's bundle gate — the bundle's row 20
(`0057: citations.response_text column present`) reads this column and will show STOP until it
exists.

---

## 4. Regenerated bundle — the final gate

Paste **`db/prod-fixes/prepush-bundle-0046-0047-0048-0051-0053-0056-0057.sql`** (supersedes
`prepush-bundle-0046-0047-0048-0051-0053.sql`, which stays in place as historical record — not
deleted). Adds two new named rows to the existing grid:

- Row 19 — `0056: citations.is_cache_hit column present (already applied 17 Oct)` — expected
  **PASS** without any action here (step 2 already confirmed it).
- Row 20 — `0057: citations.response_text column present` — **PASS** once step 3 above completes.

Both ride on the bundle's existing generic `expected_columns` schema-drift check (row 9) — adding
`citations.response_text`/`citations.is_cache_hit` to that list is what makes rows 19/20 possible;
they're restated by name only for visibility in the grid, same convention as rows 17/18
(`0051`/`0053`), per this bundle's own header comment.

**Validated locally (STOP→PASS), not against real prod**: run against the local `visibleau_prod`
schema mirror (`localhost:5432`, same database `scripts/db/schema-drift-local.ts` compares
against) with neither column present — rows 19 and 20 both show **STOP**, `OVERALL` shows **STOP**
with 6 total STOP rows (the other 4 are this mirror's own pre-existing, unrelated staleness:
`0051`/`0053`'s checks, both not yet applied to this particular local copy). After adding both
columns to that same local mirror (`ALTER TABLE citations ADD COLUMN response_text text` /
`ADD COLUMN is_cache_hit boolean NOT NULL DEFAULT false`), re-running shows rows 19 and 20 both
flip to **PASS**, `OVERALL` STOP count drops to 4 (only the pre-existing, unrelated `0051`/`0053`/
`org_members.expires_at` rows remain). Both test columns were dropped again afterward, returning
the local mirror to its original state — this task didn't touch it permanently; only the
`db/prod-fixes/*.sql` files themselves are new.

**⏸ STOP — the `OVERALL` row (seq 0) must read `PASS`. Screenshot the whole grid to Claude before
continuing.** If it reads `STOP`, read the specific `STOP` row(s) below it — each names exactly
what's wrong — and do not proceed to step 5 until a re-run shows `PASS`. (Expect `PASS` here if
steps 1–3 of *this* runbook and steps 2–4 of `push-runbook-2026-10.md` have all already completed
on this production database; if `0051`/`0053` were never applied to production in the first
place, their own STOP rows will still show here too — that's `push-runbook-2026-10.md`'s scope,
not this one's, but it still blocks this gate the same way.)

---

## 5. Push

Sri runs, from his own machine (never from Claude Code — `CLAUDE.md`'s standing rule):

```
git push origin main
```

Confirm: `git log origin/main --oneline -1` shows the Phase 3 commit(s) as the tip.

---

## 6. Vercel: deployment health

In the Vercel dashboard, confirm the deployment built from the new tip commit shows **Ready**, and
the Production environment's badge is filled blue (pointing at this deployment, not a stale one).

---

## 7. Re-audit Bondi (brand id `54b58fce-98f9-4749-ae25-9e541c0f874a`) and confirm it live

Trigger a fresh audit for this brand through the normal product flow (not a script). Once it
completes:

**⏸ STOP — screenshot both of these pages to Claude:**
- The audit detail page's Analysis tab — confirm Sentiment and Context render "Not yet measured"
  (neutral styling, tooltip), never a number, and the Visibility Score / Multidimensional
  breakdown reflect the renormalised Frequency/Position/Source-citation-only weighting.
- The Responses tab — confirm at least one response shows the "Show full answer" control (full
  `response_text` stored for this new audit, not just the 500-char snippet).

This is the one step that confirms the actually-deployed code behaves correctly against a real
audit, not just that the schema/role checks passed.

---

## 8. `diag-0058` — full-text mention scan (read-only, after the fresh audit above)

Paste **`db/prod-fixes/diag-0058-fulltext-mention-scan.sql`**. This is the Phase 3 follow-up to
`diag-0055` (which only ever had `response_snippet` to scan): per engine, for Bondi's latest and
previous completed audits, it reports `response_text` presence/length stats, the stored
`brand_mentioned` count, a raw regex scan for `"bondi\s*plumbing"` or the brand's domain stem
(word-anchored with `\y`, not `\b` — `diag-0055`'s own domain-stem branch can never match because
Postgres's `\b` is a backspace escape, not a word boundary, left as a flagged, not fixed, gap),
a separate looser `"Bondi"`-alone count, and up to 3 excerpts for rows where a raw scan matched
but the app didn't count a mention.

**Run this AFTER step 7's fresh audit completes** — before that, every row's `response_text` is
NULL and this query degrades to a snippet-only scan (same limitation `diag-0055` always had).

**⏸ STOP — screenshot the result to Claude.** Not a push gate (purely diagnostic, read-only) —
but the point of this whole Phase 3, Part B effort was to settle whether Bondi's audit #19
zero-mention-rate finding (the original `diag-0055` question) holds up now that the full answer
text is actually inspectable, not just the first 500 characters of it.

---

## 9. Rollback — if something above goes wrong

**Application rollback** (wrong code live, schema is fine): in Vercel → Deployments, find the
previous deployment (the one built before this push) and use its "..." menu → **Promote to
Production**. This repoints the Production alias without a new build or any DB change.

**Schema rollback** (only if `0057` itself needs reverting — rare, and only safe if the
application has already been rolled back first per the file's own header warnings):
- `db/prod-fixes/0057-rollback.sql` — drops the `response_text` column outright. **Only run this
  after the application rollback above**, and be aware of the **data-loss caveat in its own
  header**: unlike `0056`'s boolean, this destroys every full answer captured since `0057-run2`
  was applied — there is no other durable copy (`llm_response_cache` only holds 48h, and
  `response_snippet` is just the first 500 characters). If the full text might be wanted later,
  `\copy` the column out first; the file's own header gives the exact command.
- `0056` is **not** part of this runbook's rollback scope — it predates this push and was never
  applied by it; do not run `db/prod-fixes/0056-rollback.sql` as part of recovering from *this*
  push.

The Neon branch snapshot from step 1 (`pre-push-2026-10b`) is the blunt-instrument fallback if
`0057-rollback.sql` itself needs undoing, or if something broke that it doesn't cover.
