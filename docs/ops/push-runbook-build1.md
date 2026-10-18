# Push runbook — Vunnara Build 1 (Parts A–I, + addendum)

One ordered runbook for pushing Build 1's local commits — honest questions, correct audience,
frozen prompt sets, a text-based branded rule, clean names, required location, one run per
question, web search on. Covers everything new since `origin/main`: four additive schema
migrations (0074–0077), the regenerated prod-fix bundle gate, and two data corrections
(brand-name normalization, the branded-flag correction) — now run **after** the deploy (see the
addendum note at the top of their section), so no audit completing mid-push can reintroduce the
old-logic flags the corrections just fixed.

Every step below names an exact file to paste into the Neon SQL editor, production branch —
never SQL to type by hand, never a command run from Claude Code (there is no prod access from
that environment — every file below is marked "Sri-authorized only. NOT run from Claude Code" in
its own header). Stop and send Claude a screenshot at every step marked **⏸ STOP**.

**Addendum note (reviewed 18 Oct, after this runbook's first version):** three corrections are
folded in below, each marked **[addendum]**:
- The name-cleanup and branded-flag-correction data fixes **moved to after the push**
  (Sections 7–8 now), not before it — see Section 6's note for why.
- Section 1.5 (new) — every new environment variable Build 1 reads, checked before push.
- The regenerated bundle (Section 3) adds an "already applied" row for `0069`
  (`action_items.confidence_basis`, task #46 follow-up, applied 18 Oct) so the gate covers every
  column the live code needs, not just this series' own four.
- `0071`'s diagnostic (Section 7, step 1) now also checks for a same-org name collision that
  normalization would create.
- The backup-table drops move to a **new final section**, 7 days after push — never on push day.

**Second addendum note (entry-point check, 18 Oct, after the first addendum landed):** Part C/D's
confirmation gate (`BrandNeedsConfirmationError`) now **blocks every existing brand** the moment
this push lands, until its owner confirms category + location — not just the manual "Run audit"
button. Every background/scheduled/API/CI entry point was audited against that fact and fixed to
skip cleanly (never retry-storm, never a failed CI gate) rather than throw. Two smoke-test items
added to Section 9 below, marked **[2nd addendum]**, confirm this on the live deployment: that
existing brands genuinely show the blocked state (not a silent pass-through), and that a due
schedule for one of them pauses with exactly one notification instead of erroring.

---

## 1. Neon: snapshot before touching anything

In the Neon console, create a branch from the production branch's current tip, named
`pre-push-build1`. This is the rollback point if anything below goes wrong — restoring from it
undoes any DDL (Section 2) or data change (Sections 7–8) applied below, independent of each
fix's own rollback file.

No SQL file — this is a Neon console action (Branches → your prod branch → "Create branch").

---

## 1.5. [addendum] Vercel: new environment variables

Every environment variable Build 1's code reads for the first time, with its default when unset
and whether anything needs setting in Vercel before push:

| Variable | Default when unset | Must be set in Vercel? |
|---|---|---|
| `ENGINE_WEB_SEARCH_CHATGPT` | ON (grounded) | No — only set to `off` if you want ChatGPT answers to stop searching the live web |
| `ENGINE_WEB_SEARCH_CLAUDE` | ON (grounded) | No — same, for Claude |
| `ENGINE_WEB_SEARCH_GEMINI` | ON (grounded) | No — same, for Gemini |
| `DAILY_SPEND_CAP_CENTS` | `10000` (AU$100/day/org) | No — only set if AU$100/day/org is the wrong default cap |

**None of these need to be set for the push to work** — every one has a safe default that matches
the intended production behaviour (web search on, a AU$100/day guard). This step exists so Sri
reviews the defaults once and sets one explicitly only if he wants different behaviour on day one.

Perplexity has no `ENGINE_WEB_SEARCH_PERPLEXITY` toggle — it has no "turn search off" mode at all
(see `docs/ops/web-search-engines.md`), so there's nothing to check for it here.

---

## 2. Schema migrations — four additive columns, applied before push

Each of the four migrations below is additive only (nullable, or `DEFAULT` with no backfill) —
safe to apply ahead of the code that reads/writes it, and each one's own `run1-precheck.sql`
confirms the column is genuinely new before touching anything.

**[addendum] Two confirmations, so nothing here is missed:**
- **`classification_status`'s new `'needs_confirmation'` value, `audience`, and `location_mode`**
  are all plain Postgres `text` columns — Drizzle's `text(..., { enum: [...] })` is a
  TypeScript-only type hint, never a Postgres `ENUM TYPE` or `CHECK` constraint (confirmed by
  reading `db/schema/brands.ts` directly). No extra migration (`ALTER TYPE ... ADD VALUE`, or a
  `CHECK` replacement) is needed beyond the plain `ALTER TABLE ... ADD COLUMN` each migration
  below already does.
- **`brands.prompt_pack_version`** (Part E specified it on `brands` as well as `audits`) already
  exists in production — added by migration `0008_add_brand_classification.sql`, long before this
  series, and already in the bundle's `expected_columns` list. Nothing to add here; only
  `audits.prompt_pack_version` (migration `0049`, below) is new.

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

## 3. Regenerated prod bundle — the schema gate

Paste **`db/prod-fixes/prepush-bundle-build1.sql`** (supersedes
`prepush-bundle-0046-0047-0048-0051-0053-0056-0057.sql`, which stays in place as historical
record — not deleted). Adds five new named rows to the existing grid, each STOPping if its
column is missing:

- Row 21 — `0074: brands classification-confirmation columns present`
- Row 22 — `0075: brands location-confirmation columns present`
- Row 23 — `0076: audits.prompt_pack_version column present`
- Row 24 — `0077: audits.methodology_version column present`
- Row 25 — **[addendum]** `0069: action_items.confidence_basis column present (already applied
  18 Oct)` — folded in so this gate covers every column the live Build 1 code needs, not just
  this series' own four; expect PASS without any action here.

All five ride on the bundle's existing generic `expected_columns` schema-drift check (row 9,
`0048: missing columns`) — adding these 13 columns to that list is what makes rows 21–25
possible; they're restated by name only for visibility in the grid, same convention as every
earlier row this bundle already has (e.g. rows 17–20).

**[addendum] This gate is schema-only** — it does NOT check the data corrections in Sections
7–8 below, because those now run *after* this push, by design (see Section 6's note).

**STOPs if a new column is missing**: row 9's aggregate catches ANY of the 13 columns above that
didn't actually get applied — rows 21–25 just name which specific prod-fix is implicated so you
don't have to cross-reference row 9's comma-joined list by hand.

**Validated against this repo's own live columns (not against real prod)**: ran this exact file
as a read-only query against this session's local Postgres (confirmed by direct column
introspection that none of the 13 columns existed there yet) and got the expected result —
`OVERALL` showed STOP, with rows 21–25 and row 9 all correctly listing the missing columns by
name, alongside this bundle's own pre-existing, unrelated STOPs (`0051`/`0053`/`0056`/`0057`,
none of which are this runbook's concern — see `push-runbook-2026-10b.md`). The reverse direction
(apply the columns, confirm the new rows flip to PASS) could not be re-verified from inside this
session — the sandbox's own safety guard blocks schema changes and bulk reads against anything
resembling a production target, by design. The SQL itself is syntactically valid (it ran without
error against the live grid) and follows the exact pattern of every PASS-producing row already in
this bundle (row 9's own MISSING/OK logic, unchanged) — Sri's run of Section 2 above, followed by
this step, is the actual first end-to-end confirmation, which is the correct order anyway (schema
applied before the gate that checks for it, never the reverse).

**⏸ STOP — the `OVERALL` row (seq 0) must read PASS. Screenshot the whole grid to Claude before
continuing.** If it reads STOP, read the specific STOP row(s) below it — each names exactly
what's wrong — and do not proceed to step 4 until a re-run shows PASS. (Expect PASS here only if
Section 2 above has completed on production, AND the pre-existing, unrelated
`0051`/`0053`/`0056`/`0057` rows already show PASS from earlier pushes — if any of those were
never applied, their own STOP rows still show here too; that's `push-runbook-2026-10b.md`'s scope,
not this one's, but it still blocks this gate the same way.)

---

## 4. Push

Sri runs the push himself, from his own machine — never from Claude Code (`CLAUDE.md`'s standing
rule): `origin main`, confirming afterward that `origin/main`'s tip matches this Build 1 series'
last local commit.

---

## 5. Vercel: deployment health

In the Vercel dashboard, confirm the deployment built from the new tip commit shows Ready, and
the Production environment's badge is filled blue (pointing at this deployment, not a stale one).

---

## 6. [addendum] Why the data corrections now come after the push

Sections 7–8 (brand-name normalization, the branded-flag correction) were originally placed
*before* the push. Reviewed 18 Oct: that leaves a gap where the OLD code is still live while the
corrected data already reflects the NEW logic — any audit that completes in that gap runs under
the old `isBrandedPrompt`/name-matching code and writes NEW citation rows with the old, wrong
flags again, undoing the correction for that audit before the push even lands.

Running them *after* Section 5's deploy check closes that gap entirely: by the time either
correction runs, every audit in flight (including ones that started mid-deploy) is already
governed by the new code, so nothing newly written can need the old-logic fix. This is why
Sections 7–8 are numbered after Push/Vercel-health here, not before.

---

## 7. [addendum] Name cleanup — brand-name normalization (Part A)

A data correction, not a schema change: some brand names have untrimmed or doubled internal
whitespace that `lib/brands/normalize.ts`'s `normalizeBrandName` (used by mention detection and
the branded-prompt rule) doesn't produce — this fixes the stored names to match what the live code
now normalizes to, so mention-detection and the branded rule stop silently missing a name that's
"the same" brand but not byte-identical.

1. Paste **`db/prod-fixes/diag-0070-brand-name-normalize.sql`** (read-only, two queries). The
   first lists untrimmed/doubled-whitespace rows — note its row count, which is what step 2 and 4
   below should match. **[addendum] The second query is new**: it checks whether normalizing any
   two brands in the SAME org would make their names identical (there's no DB-level unique
   constraint on `brands.name` to catch this automatically). Expect zero rows from the second
   query — if it returns any, STOP and look at those specific brands by hand before continuing;
   don't run step 2 until you're sure the collision is expected (e.g. a genuine duplicate brand
   that should probably be merged or deleted, not just renamed).
2. Paste **`db/prod-fixes/0071-brand-name-normalize-run1-backup.sql`** — snapshots only the
   affected rows into `_backup_0071_brand_names` (Neon's editor can't `\copy`). Expect
   `backup_row_count` to equal diag-0070's first-query row count.
3. Paste **`db/prod-fixes/0071-brand-name-normalize-run2-apply.sql`** — one transaction, touches
   only the backed-up rows, never a blind update across every brand. Expect
   `updated_row_count` to equal run1's `backup_row_count`.
4. **⏸ STOP — screenshot to Claude**: Paste
   **`db/prod-fixes/0071-brand-name-normalize-run3-post-check.sql`**. Expect
   `remaining_mismatch_count = 0`.

**[addendum] Leave `_backup_0071_brand_names` in place** — it's dropped in Section 9, seven days
after push, never on push day (see that section's own note for why).

---

## 8. [addendum] Branded-flag correction (Part B)

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

**[addendum] Leave `_backup_0073_citations_branded` in place too** — both backups drop together
in Section 9, seven days after push.

---

## 9. Smoke test

Trigger a fresh audit for a real brand through the normal product flow (not a script), for a
brand that has confirmed its category/audience (Part C) and location (Part D) — the wizard now
requires both. Once it completes:

**⏸ STOP — screenshot all of these to Claude:**
- The wizard: confirm the location step is genuinely required (can't continue without either a
  confirmed suburb/city or the "online only" checkbox), and the Step 4 summary shows it correctly.
- The audit detail page's header: confirm the label reads "N questions × M engines = K answers"
  (never "calls"), with a "Method: web-grounded (v2)" (or memory-only, if the per-engine web
  search env vars are all off) suffix, **[addendum] and that the US$ cost figure reflects actual
  search fees, not just token cost** (`docs/ops/web-search-engines.md`'s documented per-search
  price, added on top wherever grounding was on for that call).
- **[addendum] `Live calls > 0`** — confirms the new cache key (grounding mode + methodology
  version, Part G.4) means nothing from before this push can be silently reused: a brand's very
  first post-push audit should show real live calls, not 100% cached.
- **[addendum] If any engine's search fails during this audit**, confirm the per-engine
  breakdown shows e.g. "Gemini: search failed for 2 of 12 questions (excluded, not \"not
  mentioned\")", and the Multidimensional-breakdown note says the affected scores/CIs only count
  successful answers. (Not expected on a healthy run — only check this if it happens.)
- **[addendum] If this audit reuses any cached answer**, confirm the header shows its real age
  (e.g. "cached answers from 16 Oct 14:45 (up to 44h old)"), derived from the matching
  `llm_response_cache` row's own `created_at`.
- The Responses tab: confirm the new question overview shows "Counted in your score" and "Mentions
  your name, not counted" groups, with a Yes/No per engine that links down to the matching
  evidence card below.
- The brand detail page: confirm the sparkline shows no stray "questions/methodology changed"
  marker for this one fresh audit (it only fires between two existing audits with different
  versions — nothing to compare yet on a brand's first Build-1-era audit).
- The public `/methodology` page and the in-app `/methods` page: confirm both show the new "How we
  gather answers" section (question selection, web search, one run, cache-sharing caveat, location
  caveat).
- **[addendum] Action Center or the audit page's Recommended actions**: find one legacy
  recommendation (any row with no `confidence_basis` — oldest brands are most likely to have one)
  and confirm its title reads "Check: ..." (never the bare claim) with a muted "<Impact> ·
  unverified" badge (never a plain red "High").
- **[2nd addendum] Pick any pre-existing brand that has never confirmed its category/location**
  (any brand created before this push, if its owner hasn't acted yet) and open its brand page:
  confirm "Run audit" is disabled with a CTA to confirm business details (`#confirm-business-details`),
  never a silent pass-through to a real audit. This is the expected, intended state for every such
  brand immediately after this push — not a bug to fix, just confirm it reads as a clear CTA, not
  a dead button with no explanation.
- **[2nd addendum] If any confirmed-ready brand has an active daily/weekly schedule**, confirm its
  next scheduled run still completes normally (unaffected by this gate). Separately, pick one
  unconfirmed brand's schedule (if any existed before this push) and confirm, after its next due
  run, the Schedule page shows status "Needs confirmation" with the paused-reason text visible, no
  new failed/error audit row, and exactly one email/in-app notification was sent for it (check the
  org's notification history, not the inbox — the test suite proves "exactly one" at the function
  level; this just confirms the live path matches) — never a repeating retry on each subsequent
  cron tick.

This is the one step that confirms the actually-deployed code behaves correctly against a real
audit, not just that the schema/data checks passed.

---

## 10. [addendum] 7 days after push, once verified — drop the backup tables

Not on push day. Once Sections 7–8's post-checks have looked right for a full week and you're
confident neither rollback file will be needed:

1. Paste **`db/prod-fixes/0071-brand-name-normalize-run4-drop-backup.sql`** — drops
   `_backup_0071_brand_names`. (**[addendum]** this file replaces what used to be a hand-typed
   `DROP TABLE` instruction in this runbook.) Expect "Statement executed successfully".
2. Paste **`db/prod-fixes/0073-branded-flag-correction-run4-drop-backup.sql`** — drops
   `_backup_0073_citations_branded`. Expect "Statement executed successfully".

After this, the rollback files in Section 11 for `0071`/`0073` can no longer restore from a
backup table — only the Neon branch snapshot from Section 1 can.

---

## 11. Rollback — if something above goes wrong

**Application rollback** (wrong code live, schema/data are fine): in Vercel → Deployments, find
the previous deployment (the one built before this push) and use its "..." menu → Promote to
Production. This repoints the Production alias without a new build or any DB change.

**Data rollback** (only if Section 7 or 8's correction itself needs reverting — rare, and only
safe if the application has already been rolled back first):
- `db/prod-fixes/0071-brand-name-normalize-rollback.sql` — restores brand names from
  `_backup_0071_brand_names`. Will fail or no-op if that backup table was already dropped in
  Section 10 — restore from the Neon branch snapshot (Section 1) instead if so.
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

The Neon branch snapshot from Section 1 (`pre-push-build1`) is the blunt-instrument fallback if
any individual rollback file above needs undoing, or if something broke that none of them cover.
