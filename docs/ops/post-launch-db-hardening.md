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

## 9. Existing Mention/Citation/archetype values still include branded-prompt mentions (task DD, 2026-10-01)

Task CC found `lib/visibility/visibility-trend-aggregator.ts` computed `mentionRate`/`citationRate` (and
the archetype derived from them) over EVERY citation with no `is_branded_prompt` filter — the same
inflation #8/AA fixed for Share of Voice, left unfixed here, so the two panels disagreed (SoV excluded
branded prompts, the Mention-Source Divide panel didn't). Fixed in task DD: all three counts
(`totalPrompts`/`mentionedPrompts`/`citedPrompts`) now exclude `is_branded_prompt = true` rows (`IS NOT
TRUE`, same NULL-keeps-unfiltered semantics as AA — no migration needed, the column already exists).
Every `visibility_trends` row (and every report/PDF built from it) computed before this fix still
reflects the inflated numbers; nothing is backfilled. Re-running the aggregation for an existing period
needs a fresh `trend/aggregated` pass, not a code-only fix — track alongside #5, #6, #7 and #8 in the
same re-audit/recompute sweep before these numbers go to customers. The still-open
`build-prompt-pack.ts` branded-prompt path noted in #8 affects this metric too, for brands using that
path — not fixed here either.

## 10. Existing audits show a fabricated llms.txt per-component breakdown (task GG, 2026-10-02)

Task FF proved `lib/llms-txt/depth-score.ts`'s score was always correct; the bug was entirely display-side:
`lib/technical-audit/orchestrate.ts` computed the real 6 per-component booleans but discarded them,
persisting only the summed `depthScore`, so
`app/(auth)/brands/[brandId]/llms-txt-generator/page.tsx` guessed the breakdown from that single number
via wrong cumulative thresholds (`score >= 6/9/12/15`) — producing an inverted checklist (e.g. for Bondi
Plumbing's real score of 9 from present+links+depth, it showed H1+blockquote and Sections as passing and
Links and Content depth as failing, the exact opposite of reality). Fixed in task GG: `orchestrate.ts`
now persists `findings.llmsTxt.components` (the real flags) and the generator page reads them directly
— `buildLlmsTxtChecklist` returns `null` (no fabricated breakdown, a fallback note instead) when they're
absent. Every `technical_audits` row written before this fix lacks `components` and will show that
fallback note until the brand's next audit — the *total* score on those rows was always correct, only
the per-component checklist was ever wrong. Track alongside #5, #6, #7, #8 and #9 in the same
re-audit sweep, though this one is lower urgency: unlike the others, it never misstated the headline
number customers see, only a secondary breakdown.

## 11. Visibility Score now excludes branded prompts at the source (task HH, 2026-10-02) — NOT part of the regeneration sweep

Task EE found the audit scorer itself (`lib/audit/run-audit-inline.ts` /
`inngest/functions/run-audit.ts`) counted every LLM call toward Frequency/Position/Sentiment/Context/
Accuracy with no `is_branded_prompt` check — the same gap as #8/#9, but a third location, and the one
feeding the headline Visibility Score directly. Fixed in task HH defensively: both files now call one
shared pure helper, `lib/audit/organic-citations.ts`'s `selectOrganicCitations`, which excludes every
branded-prompt call from all five dimensions' scoring inputs before they're computed (not just
Frequency) — kept in lockstep deliberately, since these two files have drifted out of sync before (the
13.75-floor bug).

**This changed NO existing scores and is explicitly NOT part of the re-audit sweep in #5–#10.** At the
current `PROMPTS_PER_AUDIT = 10`, an audit only ever pulls the lowest-ranked 10 vertical-pack templates,
and the first branded (`{brand}`-containing) template is rank 34 — no audit today has ever included a
branded prompt, so `selectOrganicCitations` is a byte-for-byte no-op on every score computed so far
(proven in `tests/unit/audit/organic-citations.test.ts`'s regression test). This is purely defensive,
future-proofing against a higher tier or a future `PROMPTS_PER_AUDIT` increase reaching into
branded-ranked prompts.

## 12. Three Technical Audit scorer gaps closed defensively — NOT part of the regeneration sweep (task KK, 2026-10-03)

Task JJ reality-checked all 8 Technical Audit dimensions against Bondi Plumbing's live site and found the
41/100 honest — but surfaced three latent "credit/assert for an uncheckable thing" gaps that produce no
wrong number for Bondi today but would misfire for other brands. Fixed in task KK, all three single-sourced
(no Inngest sibling to drift — confirmed via Part D):
1. `lib/answer-capsules/check-capsule.ts`'s `checkCapsuleQuality` returned full marks (6/6) for a page with
   **zero** question-style headings — a site with no Q&A structure scored identically to one with
   perfectly-formed answer capsules. Now scores 0 with an actionable finding ("No question-style headings
   found…"). Bondi has a real question heading that fails the length bar, not zero questions, so this was
   already inert for Bondi and stays inert.
2. `lib/robots-txt/analyze.ts`'s "no blanket AI block" and "AI bots not explicitly blocked" sub-checks (6 of
   18 points) passed trivially on a missing/empty robots.txt — absence looked identical to a genuinely
   permissive file. Now gated on the file actually existing; a missing robots.txt scores at most 3/18 (the
   one independent CDN-status check), not ~9/18. Bondi's real, permissive file is unaffected (still 18/18).
3. `lib/brand-entity/au-directory-aggregate.ts` treated a 403/401/429 (directory blocked the request) the
   same as a 404 (genuinely not listed) — a business that IS listed but blocked our check would be reported
   as "not found," a false negative that damages recommendation credibility. Now a three-state classifier
   (`listed` / `not_listed` / `unverifiable`) that never asserts absence it didn't confirm, plus checks the
   brand's name actually appears in a 200 response body instead of treating any successful page load as
   "listed," plus a realistic browser User-Agent to reduce false 403s. Bondi's real directories (two 403s,
   two 404s) still contribute 0 to the numeric score — only the finding text changes, from "not listed" to
   "couldn't verify — blocked the check" for the two 403s.

**This changed NO existing Bondi score** (robots 18/18, content quality 6/12, brand & entity 2/10 — proven
byte-identical in `tests/unit/technical-audit/kk-bondi-regression.test.ts`) **and is NOT part of the
re-audit sweep in #5–#11** — like task HH, this is purely defensive, correcting what happens on inputs no
current audit has actually produced (zero question headings, a missing robots.txt) or correcting finding
*text* only (the directory 403 case). Existing stored audits keep their old findings until re-audited;
only new audits reflect the honest text.

## 13. Visibility Score was inflated for every classified brand (task QQ, 2026-10-04) — real brands' scores DROP on next audit

Tasks PP and QQ found that HH/AA/DD's organic-only exclusion (`#11`) was inert for every brand with a
classification/promptPack — i.e. every real customer, including Bondi — not because no branded prompts
existed, but because `lib/audit/run-audit-inline.ts` / `inngest/functions/run-audit.ts` hardcoded
`isBranded: false` for every prompt sourced from `brand.promptPack` or `buildPromptPack()`, including the
brand-named "is {brand} popular", "{brand} vs X", "best alternatives to {brand}" prompts that pool
deliberately generates. Those prompts trivially guarantee a mention, so they were being counted as organic,
inflating Frequency and every dimension downstream of it. For Bondi: 4 of its 9 real prompts name the brand
— exactly the "all four engines = 44.0%" pattern (task PP) and the 44.4% headline Frequency.

Fixed at the source via a new shared helper, `lib/audit/flag-branded-prompts.ts`'s `isBrandedPackPrompt`,
called identically by both `run-audit-inline.ts` and `run-audit.ts`: a prompt is flagged branded by
provenance (set-membership against the enriched pool `buildEnrichedPrompts` would deterministically produce
for that brand's classification), not by regexing the already-interpolated text.

**Real brands' Frequency and Visibility Score will DROP to their honest organic level on their next audit —
this is a correction, not a regression.** Existing stored audits (including Bondi's prior ones) keep their
inflated scores until re-run; no existing row is touched or recomputed here. The response cache (task PP) is
on LLM *responses* only, not on scores, so a fresh audit re-scores correctly even when it replays a cached
response.

**Product note (flagged, not implemented):** excluding branded prompts is correct for an AI-*visibility*
score, but discarding them loses signal customers may still want ("when people ask about us by name,
here's what AI says") — a candidate for a separate, clearly-labelled panel in a future task, not mixed into
the headline score.

**Update (tasks RR/SS, 2026-10-04) — nine secondary surfaces were still branded-inflated, now fixed:**
Task RR found that QQ only fixed the five headline dimension scores (stored on `audits.score_*`) — nine
other surfaces aggregated `citations` directly (`GROUP BY`/`COUNT`/`SUM` with `brand_mentioned = true` and
no branded exclusion), so the audit page's per-engine panel, sentiment bar, competitor "you" figure, and
mention-rate stat; the brand dashboard's avg-position/total-mentions/per-engine tiles; the `latest-audit`
API's `engineStats` (feeding the PDF report's per-engine breakdown); both Wins Feed queries
(`findNewCitations`/`findNewEngineCoverage`); and Citation Source Intelligence's `gapSeverity` all still
showed branded-inflated numbers that contradicted the correct 0.0 headline for an all-branded-mentions audit
like Bondi's — the page literally disagreed with itself.

Task SS fixed all nine via one shared predicate, `ORGANIC_ONLY` (`lib/audit/organic-filter.ts`):
`` sql`${citations.isBrandedPrompt} IS NOT TRUE` ``, imported into every one of those nine queries rather
than hand-written per site, so they can't drift apart from each other or from `selectOrganicCitations`
(`#11`). **This is purely a display/aggregation fix — no scoring logic changed, no migration needed.**

For a **post-QQ audit** (stored `is_branded_prompt` flags correct), every panel on the page is now
consistent with the 0.0 headline. For a **pre-QQ stored audit** (flags still wrong at write time), these
nine surfaces — like the headline score itself — remain inflated until that brand is re-audited; this fix
does not touch or recompute anything already written.
