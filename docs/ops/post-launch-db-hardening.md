# Post-launch DB hardening

Found during the F-series sign-up-500 incident investigation (2026-09-18). None of these block
launch — Neon prod is verified clean (0 FATAL drift, 74 tables, 208 policies) as of migration 0031.
Filed here so they don't get lost, not fixed yet.

## 1. Rename the duplicate `0010_*` / `0011_*` migration files

`0010_baseline-reconcile.sql` / `0010_phase2_sprint1_platform.sql` and
`0011_phase2_sprint2_workflow.sql` / `0011_watery_cerebro.sql` share numeric prefixes. Whatever
process originally applied migrations to Neon almost certainly resolved this by lexicographic
filename order (`baseline-reconcile` before `phase2_sprint1_platform`, `phase2_sprint2_workflow`
before `watery_cerebro`) — fragile and non-obvious to a future reader. Renumber one file in each
pair (e.g. to `0010a_*` / `0010b_*`, or shift everything after up by one) with an explicit ordering
break-proof (a test or script assertion that migration filenames sort into a total, unambiguous
order) so this can't silently recur.

## 2. Diagnose and fix the `0008` duplicate-migration issue

Found as a side effect of a genuine fresh-build (0000→0031) replay for the F5 drift-guard proof:
`0008_add_brand_classification.sql` and `0008_brief_luckman.sql` both add `brands.classification`,
`classification_status`, `classification_at`, `prompt_pack`, `prompt_pack_version` — the second file
is not idempotent (`ADD COLUMN` without `IF NOT EXISTS`), so it errors on a fresh chain where the
first file already added them. On a chain run without `ON_ERROR_STOP`, this doesn't block the rest
of the migration (Postgres just logs the 5 errors and continues), which is presumably why it went
unnoticed — but it means fresh-build replays currently depend on that specific error-tolerant
behavior rather than actually succeeding cleanly. Make `0008_brief_luckman.sql`'s adds idempotent
(`IF NOT EXISTS`) and confirm a fresh replay has zero errors, not just zero *fatal* ones.

## 3. Make the migration runner hard-stop on the first failure

The current apply process (however migrations were originally run against Neon) evidently didn't
hard-stop when `0010_phase2_sprint1_platform.sql`'s `audits` `ADD COLUMN IF NOT EXISTS` block failed
to take effect — the rest of that file's later statements, and the rest of the migration chain,
continued regardless, and the gap went undetected until a real user hit it in production. Formalize
the migration runner as: one transaction per file (`BEGIN`/`COMMIT` wrapping the whole file, not just
individual guarded blocks) + `ON_ERROR_STOP=1`, so a failure anywhere in a file rolls back that file
entirely and stops the run rather than silently proceeding with a partially-applied migration. Add a
test that injects a deliberately failing statement into a scratch migration chain and asserts
nothing after it (in that file or subsequent files) got applied.

## 4. Bring local `visibleau_prod`'s stale types in line with Neon's (correct) types

`pnpm db:drift` (WARN-level, not FATAL) flags two type mismatches where **Neon has the correct,
already-fixed type** and the local mirror is stale:
- `ai_bot_ip_ranges.cidr`: local `text`, Neon `cidr` (fixed by migration 0026)
- `crawler_visit_logs.source_ip`: local `text`, Neon `inet` (fixed by migration 0026)

Local `visibleau`/`visibleau_prod` predate migration 0026's type fix in this respect. Re-run the
relevant portion of 0026 (or a targeted follow-up) against both local databases so all three
environments match exactly, and `db:drift`'s WARN list reflects only genuinely-unexplained
differences going forward.

## 5. Existing `generated_reports` rows predate the level-vs-delta fix (task T, 2026-09-24)

Every `generated_reports` row created before the task T fix (`lib/communication/narrative-generator.ts`)
carries a fabricated "improved/declined by N points this period" headline for any brand with ≥1
audit in its period — the code narrated `visibility_trends.score_composite_avg` (a per-period
average level) as if it were a period-over-period change, with no real prior-period comparison at
all. The fix only affects narration going forward; it does not touch or regenerate anything already
written to `generated_reports.narrative_text`/`headline`. Before any existing report is shown to a
customer, decide whether to regenerate (re-run `generate-narrative-report` for each affected
brand/period) or invalidate (flag old rows as stale / block delivery) — this is a separate follow-up
task, not done here.

## 6. Existing Technical Audit rows have inflated llms.txt scores (task Z, 2026-09-30)

Every `technical_audits` row scored before the task Z fix (`lib/technical-audit/orchestrate.ts` +
`lib/llms-txt/depth-score.ts`) treated ANY `2xx` response from `/llms.txt` (and `/llms-full.txt`) as
a real file, with no content-type or body-shape check — a soft-404 that returns `200 text/html` (the
site's own homepage) was scored as a partial llms.txt, typically awarding "present" + "depth" (and
sometimes "fullTxt") points a brand with no llms.txt at all never earned. Confirmed on Bondi Plumbing
(brand `54b58fce-98f9-4749-ae25-9e541c0f874a`): `bondiplumbing.com.au/llms.txt` doesn't exist and
soft-404s to HTML, yet scored ~9/18 pre-fix. The fix only affects audits run from here on — it does
not touch or recompute `score_llms_txt`/`score_composite` on any row already written. Any brand
audited before this fix carries an inflated llms.txt (and therefore Technical composite) score until
re-audited. Before these numbers are shown to a customer, decide whether to re-audit affected brands
or recompute/flag existing rows — a separate follow-up task, not done here — track alongside #5 and
#7, the same "old rows predate a scoring/narration fix" shape.

## 7. Existing `share_of_voice_snapshots` rows predate the sum-not-max fix (task X, 2026-09-25)

Every `share_of_voice_snapshots` row written before the task X fix
(`lib/visibility/sov-calculator.ts` + `inngest/functions/calculate-share-of-voice.ts`) has
`brand_mention_count`/`competitor_mention_count`/`total_mention_count` NULL — those columns didn't
exist yet. The Visibility page's aggregator (`components/domain/visibility/sov-donut.tsx`) now reads
one audit at a time and sums real counts across engine groups when they're present, but falls back to
a single group's stored percentage (an honest approximation, never `Math.max`) when they're not. Raw
counts populate from each brand's next `audit.complete` run onward; nothing is backfilled — total_prompts
predates this and is a different denominator (citation-row count, not mention count) that can't
reconstruct it. Not customer-blocking on its own (the aggregation is honest either way), but worth a
re-audit sweep alongside #5 and #6 so all three trust-critical numbers (report deltas, llms.txt, SoV)
are on fully-corrected data at the same time.

## 8. Existing citations/SoV rows still include branded-prompt mentions (task AA, 2026-09-30)

Every `citations` row written before the task AA fix (`lib/audit/run-audit-inline.ts` +
`inngest/functions/run-audit.ts` + `lib/verticals/expand-prompt.ts`) has `is_branded_prompt` NULL —
the column didn't exist yet — so `lib/visibility/sov-calculator.ts`'s `groupCitationsByEngine` treats
them as not-branded and includes them in Share of Voice, same as before this fix. Prompts whose
template names the brand directly (e.g. "Is {brand} reputable?", "{brand} vs {competitors}" — 13 of
124 templates in the au-tradies pack) guarantee a trivial mention and inflated Bondi Plumbing's SoV to
33.7%, ahead of real directories. `is_branded_prompt` populates correctly from each brand's next
`audit.complete` run onward; nothing is backfilled — `citations.prompt` stores the already-expanded
text with no link back to which template produced it, so branded-ness can't be reconstructed for
existing rows. Track alongside #5, #6 and #7 — the same "old rows predate a scoring fix" shape,
needing the same re-audit sweep before these numbers go to customers. Also noted in task AA's own
investigation: `lib/prompts/build-prompt-pack.ts` (the classification-based prompt path, a separate
mechanism from the vertical-pack templates this fix covers) generates its own brand-named prompts
(e.g. "Is {brandName} popular in Australia?") with no template artifact to check against — brands
using that path still have uncorrected SoV inflation from this same category of bug, a genuinely
separate gap this task did not fix.
