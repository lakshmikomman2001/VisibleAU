# Push runbook — Vunnara Build 1 (Parts A–I)

One ordered runbook for pushing Build 1's local commits — honest questions, correct audience,
frozen prompt sets, a text-based branded rule, clean names, required location, one run per
question, web search on. Covers everything new since `origin/main`: four additive schema
migrations (0047–0050), two data corrections (brand-name normalization, the branded-flag
correction), and the regenerated prod-fix bundle gate that must show PASS before pushing.

Every step below names an exact file to paste into the Neon SQL editor, production branch —
never SQL to type by hand, never a command run from Claude Code (there is no prod access from
that environment — every file below is marked "Sri-authorized only. NOT run from Claude Code" in
its own header). Stop and send Claude a screenshot at every step marked **⏸ STOP**.

---

## 1. Neon: snapshot before touching anything

In the Neon console, create a branch from the production branch's current tip, named
`pre-push-build1`. This is the rollback point if anything below goes wrong — restoring from it
undoes any DDL or data change applied in steps 2–4, independent of each fix's own rollback file.

No SQL file — this is a Neon console action (Branches → your prod branch → "Create branch").

---

## 2. Schema migrations — four additive columns, applied before push

Each of the four migrations below is additive only (nullable, or `DEFAULT` with no backfill) —
safe to apply ahead of the code that reads/writes it, and each one's own `run1-precheck.sql`
confirms the column is genuinely new before touching anything.

### 2a. `0074` — `brands` classification-confirmation columns (Part C)

Mirrors `db/migrations/0047_brands_classification_confirmation.sql`.

1. Paste **`db/prod-fixes/0074-brands-classification-confirmation-run1-precheck.sql`**. Expect all
   four `*_present = f` (`classification_error`, `category_confirmed_at`, `audience`,
   `categories`).
2. Paste **`db/prod-fixes/0074-brands-classification-confirmation-run2-apply.sql`** — one paste,
   single transaction. Expect "Statement executed successfully".
3. **⏸ STOP — screenshot to Claude**: Paste
   **`db/prod-fixes/0074-brands-classification-confirmation-run3-post-check.sql`**. Expect all
   four `*_present = t`, `categories_default_is_empty = t`.

### 2b. `0075` — `brands` location-confirmation columns (Part D)

Mirrors `db/migrations/0048_brands_location_confirmation.sql`.

1. Paste **`db/prod-fixes/0075-brands-location-confirmation-run1-precheck.sql`**. Expect all six
   `*_present = f` (`suburb`, `city`, `state`, `country`, `location_mode`,
   `location_confirmed_at`).
2. Paste **`db/prod-fixes/0075-brands-location-confirmation-run2-apply.sql`**. Expect "Statement
   executed successfully".
3. **⏸ STOP — screenshot to Claude**: Paste
   **`db/prod-fixes/0075-brands-location-confirmation-run3-post-check.sql`**. Expect all six
   `*_present = t`, `no_brand_backfilled = t` — no existing brand got a guessed location it never
   confirmed.

### 2c. `0076` — `audits.prompt_pack_version` (Part E.2)

Mirrors `db/migrations/0049_audits_prompt_pack_version.sql`.

1. Paste **`db/prod-fixes/0076-audits-prompt-pack-version-run1-precheck.sql`**. Expect
   `prompt_pack_version_present = f`.
2. Paste **`db/prod-fixes/0076-audits-prompt-pack-version-run2-apply.sql`**. Expect "Statement
   executed successfully".
3. **⏸ STOP — screenshot to Claude**: Paste
   **`db/prod-fixes/0076-audits-prompt-pack-version-run3-post-check.sql`**. Expect
   `prompt_pack_version_present = t`, `every_existing_row_reads_as_one = t` — every pre-existing
   audit reads back as version 1 (the DEFAULT), never a guess.

### 2d. `0077` — `audits.methodology_version` (Part G.7)

Mirrors `db/migrations/0050_audits_methodology_version.sql`.

1. Paste **`db/prod-fixes/0077-audits-methodology-version-run1-precheck.sql`**. Expect
   `methodology_version_present = f`.
2. Paste **`db/prod-fixes/0077-audits-methodology-version-run2-apply.sql`**. Expect "Statement
   executed successfully".
3. **⏸ STOP — screenshot to Claude**: Paste
   **`db/prod-fixes/0077-audits-methodology-version-run3-post-check.sql`**. Expect
   `methodology_version_present = t`, `every_existing_row_reads_as_one = t` — every pre-existing
   audit reads back as methodology 1 (memory-only), honest since none of them had web search
   wired in any engine.

---

## 3. Name cleanup — brand-name normalization (Part A)

A data correction, not a schema change: some brand names have untrimmed or doubled internal
whitespace that `lib/brands/normalize.ts`'s `normalizeBrandName` (used by mention detection and
the branded-prompt rule) doesn't produce — this fixes the stored names to match what the live code
now normalizes to, so mention-detection and the branded rule stop silently missing a name that's
"the same" brand but not byte-identical.

1. Paste **`db/prod-fixes/diag-0070-brand-name-normalize.sql`** (read-only). Note the row count —
   this is what step 2 and 4 below should match.
2. Paste **`db/prod-fixes/0071-brand-name-normalize-run1-backup.sql`** — snapshots only the
   affected rows into `_backup_0071_brand_names` (Neon's editor can't `\copy`). Expect
   `backup_row_count` to equal diag-0070's row count.
3. Paste **`db/prod-fixes/0071-brand-name-normalize-run2-apply.sql`** — one transaction, touches
   only the backed-up rows, never a blind update across every brand. Expect
   `updated_row_count` to equal run1's `backup_row_count`.
4. **⏸ STOP — screenshot to Claude**: Paste
   **`db/prod-fixes/0071-brand-name-normalize-run3-post-check.sql`**. Expect
   `remaining_mismatch_count = 0`.

Leave `_backup_0071_brand_names` in place for now — it's dropped in step 5 of Section 4, after
that section's own backup is also confirmed good (one combined cleanup, not two separate ones).

---

## 4. Branded-flag correction (Part B)

Another data correction: `citations.is_branded_prompt` was set by two rules that each got it
wrong in a different direction — one missed every already-expanded intent-signal-derived prompt
that happened to name the brand, the other flagged by pool membership instead of the text itself.
This recomputes the correct value with a `plpgsql` mirror of the real
`lib/audit/flag-branded-prompts.ts` logic (parity-tested against the TS function on 17 fixture
cases — see `tests/integration/branded-flag-sql-parity.integration.test.ts`), applied only to
`citations` rows belonging to a `complete` audit.

1. Paste **`db/prod-fixes/diag-0072-branded-flag-mismatch.sql`** (read-only, two queries: per-audit
   counts, then grand totals). Note the grand-total row count (`total_false_to_true +
   total_true_to_false`) — this is what step 2 below should match.
2. Paste **`db/prod-fixes/0073-branded-flag-correction-run1-backup.sql`** — snapshots only the
   citation rows that will change into `_backup_0073_citations_branded` (`id`,
   `is_branded_prompt`). Expect `backup_row_count` to equal diag-0072's grand total from step 1.
3. Paste **`db/prod-fixes/0073-branded-flag-correction-run2-apply.sql`** — one transaction, touches
   only the backed-up rows. Expect `updated_row_count` to equal run1's `backup_row_count`.
4. **⏸ STOP — screenshot to Claude**: Paste
   **`db/prod-fixes/0073-branded-flag-correction-run3-post-check.sql`**. Expect
   `total_false_to_true = 0 AND total_true_to_false = 0`.
5. Once step 4 looks right and you're confident the rollback below will never be needed, paste
   **`db/prod-fixes/0073-branded-flag-correction-run4-drop-backup.sql`** AND manually run
   `DROP TABLE IF EXISTS _backup_0071_brand_names;` in the same submission (Section 3's own
   backup — this fix has no dedicated drop file since it's a single `DROP TABLE`, not worth its
   own numbered file). Expect "Statement executed successfully" for both.

---

## 5. Regenerated prod bundle — the final gate

Paste **`db/prod-fixes/prepush-bundle-build1.sql`** (supersedes
`prepush-bundle-0046-0047-0048-0051-0053-0056-0057.sql`, which stays in place as historical
record — not deleted). Adds four new named rows to the existing grid, each STOPping if its
column is missing:

- Row 21 — `0074: brands classification-confirmation columns present`
- Row 22 — `0075: brands location-confirmation columns present`
- Row 23 — `0076: audits.prompt_pack_version column present`
- Row 24 — `0077: audits.methodology_version column present`

All four ride on the bundle's existing generic `expected_columns` schema-drift check (row 9,
`0048: missing columns`) — adding Build 1's 12 new columns to that list is what makes rows 21–24
possible; they're restated by name only for visibility in the grid, same convention as every
earlier row this bundle already has (e.g. rows 17–20).

**STOPs if a new column is missing**: row 9's aggregate catches ANY of the 12 new
`brands`/`audits` columns from Section 2 that didn't actually get applied — rows 21–24 just name
which specific prod-fix is implicated so you don't have to cross-reference row 9's comma-joined
list by hand.

**Validated against this repo's own live columns (not against real prod)**: ran this exact file
as a read-only query against this session's local Postgres (confirmed by direct column
introspection that none of the 12 new columns existed there yet) and got the expected result —
`OVERALL` showed STOP, with rows 21–24 and row 9 all correctly listing the 12 missing columns by
name, alongside this bundle's own pre-existing, unrelated STOPs (`0051`/`0053`/`0056`/`0057`,
none of which are this runbook's concern — see `push-runbook-2026-10b.md`). The reverse direction
(apply the 12 columns, confirm rows 21–24 flip to PASS) could not be re-verified from inside this
session — the sandbox's own safety guard blocks schema changes and bulk reads against anything
resembling a production target, by design. The SQL itself is syntactically valid (it ran without
error against the live grid) and follows the exact pattern of every PASS-producing row already in
this bundle (row 9's own MISSING/OK logic, unchanged) — Sri's run of Section 2 above, followed by
this step, is the actual first end-to-end confirmation, which is the correct order anyway (schema
applied before the gate that checks for it, never the reverse).

**⏸ STOP — the `OVERALL` row (seq 0) must read PASS. Screenshot the whole grid to Claude before
continuing.** If it reads STOP, read the specific STOP row(s) below it — each names exactly
what's wrong — and do not proceed to step 6 until a re-run shows PASS. (Expect PASS here only if
Sections 2–4 above have all completed on production, AND the pre-existing, unrelated
`0051`/`0053`/`0056`/`0057` rows already show PASS from earlier pushes — if any of those were
never applied, their own STOP rows still show here too; that's `push-runbook-2026-10b.md`'s scope,
not this one's, but it still blocks this gate the same way.)

---

## 6. Push

Sri runs the push himself, from his own machine — never from Claude Code (`CLAUDE.md`'s standing
rule): `origin main`, confirming afterward that `origin/main`'s tip matches this Build 1 series'
last local commit.

---

## 7. Vercel: deployment health

In the Vercel dashboard, confirm the deployment built from the new tip commit shows Ready, and
the Production environment's badge is filled blue (pointing at this deployment, not a stale one).

---

## 8. Smoke test

Trigger a fresh audit for a real brand through the normal product flow (not a script), for a
brand that has confirmed its category/audience (Part C) and location (Part D) — the wizard now
requires both. Once it completes:

**⏸ STOP — screenshot all of these to Claude:**
- The wizard: confirm the location step is genuinely required (can't continue without either a
  confirmed suburb/city or the "online only" checkbox), and the Step 4 summary shows it correctly.
- The audit detail page's header: confirm the label reads "N questions × M engines = K answers"
  (never "calls"), with a "Method: web-grounded (v2)" (or memory-only, if the per-engine web
  search env vars are all off) suffix.
- The Responses tab: confirm the new question overview shows "Counted in your score" and "Mentions
  your name, not counted" groups, with a Yes/No per engine that links down to the matching
  evidence card below.
- The brand detail page: confirm the sparkline shows no stray "questions/methodology changed"
  marker for this one fresh audit (it only fires between two existing audits with different
  versions — nothing to compare yet on a brand's first Build-1-era audit).
- The public `/methodology` page and the in-app `/methods` page: confirm both show the new "How we
  gather answers" section (question selection, web search, one run, cache-sharing caveat, location
  caveat).

This is the one step that confirms the actually-deployed code behaves correctly against a real
audit, not just that the schema/data checks passed.

---

## 9. Rollback — if something above goes wrong

**Application rollback** (wrong code live, schema/data are fine): in Vercel → Deployments, find
the previous deployment (the one built before this push) and use its "..." menu → Promote to
Production. This repoints the Production alias without a new build or any DB change.

**Data rollback** (only if Section 3 or 4's correction itself needs reverting — rare, and only
safe if the application has already been rolled back first):
- `db/prod-fixes/0071-brand-name-normalize-rollback.sql` — restores brand names from
  `_backup_0071_brand_names`. Will fail or no-op if that backup table was already dropped in
  Section 4 step 5 — restore from the Neon branch snapshot (step 1) instead if so.
- `db/prod-fixes/0073-branded-flag-correction-rollback.sql` — restores `citations.is_branded_prompt`
  from `_backup_0073_citations_branded`. Same caveat: fails if that backup was already dropped —
  fall back to the branch snapshot.

**Schema rollback** (only if one of the four new columns itself needs reverting — rare, and only
safe after the application rollback above):
- `db/prod-fixes/0074-brands-classification-confirmation-rollback.sql`
- `db/prod-fixes/0075-brands-location-confirmation-rollback.sql`
- `db/prod-fixes/0076-audits-prompt-pack-version-rollback.sql`
- `db/prod-fixes/0077-audits-methodology-version-rollback.sql`

Each drops only the columns its own migration added — nullable/no-default columns, so dropping
them loses nothing the live (rolled-back) application code ever wrote on purpose.

The Neon branch snapshot from step 1 (`pre-push-build1`) is the blunt-instrument fallback if any
individual rollback file above needs undoing, or if something broke that none of them cover.
