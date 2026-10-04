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

## 14. Meta Tags display hardcoded wrong weights + discarded granular state (task UU, 2026-10-04)

Task TT found the Meta Tags audit page showed a per-component breakdown that didn't match the scorer: the
page hardcoded its own weights (`3/3/3/3/2`) in `app/(auth)/brands/[brandId]/meta-tags/page.tsx`, completely
disconnected from the real scorer weights (`4/3/3/2/2` in `lib/technical-audit/orchestrate.ts`'s
`scoreMeta`) — Title under-weighted by 1, Canonical over-weighted by 1, cancelling out so the total (14)
matched by coincidence while every row's point value was fiction (the same llms.txt pattern as task GG).
Separately, `scoreMeta` itself only ever returned 5 booleans — the real description length and the three
individual Open Graph sub-flags (`ogTitle`/`ogDesc`/`ogImage`) were computed as locals and discarded before
reaching `findings.meta`, so a description that's present-but-too-long, or an OG set missing only
`og:image`, was indistinguishable from fully absent once collapsed to a boolean. For Bondi: description is
184 chars (fails only the ≤160 ceiling) and OG has 2 of 3 tags (only `og:image` missing) — both showed a
flat "✗ 0/3" that read as "add this from scratch."

Fixed: `scoreMeta` now exports `META_WEIGHTS` (the single source of truth both the scorer and the page use)
and persists the granular fields (`descriptionLength`, `descriptionVerdict`, `ogTitle`, `ogDesc`,
`ogImage`) into `findings.meta`. The page imports `META_WEIGHTS` instead of hand-maintaining a second copy,
and shows honest present-but-imperfect messages ("Present but too long — 184 chars", "2 of 3 present — add
og:image") built only from the real granular fields. **No scoring logic changed** — the 4/3/3/2/2 weights,
the 50–160 description window, and the all-or-nothing OG rule are exactly as before; Bondi's total stays
6/14, only the per-row numbers and messages became truthful.

**Legacy audits** (written before this deploy) have only the original 5 booleans — the page detects this
(`hasGranularMetaFields`) and shows the existing boolean row plus a "re-audit to see detail" note, never
fabricating a present-but-imperfect message from a boolean alone, same as task GG's llms.txt checklist.

**Product decision for Sri (not implemented):** should the scorer award partial credit instead of
all-or-nothing — e.g. Open Graph 2/3 → 2 pts, a present-but-long description → 1 pt? Zero is defensible now
that the customer can see *why*, but partial credit may be more motivating. Flagging for a future call.

## 15. Batch-fix: AI Discovery weights + Brand & Entity directory tier (task WW, 2026-10-04)

Task VV swept all 8 technical-audit dimension displays for the GG/UU bug class (hardcoded weights
disconnected from the scorer; discarded granular state collapsing a real middle state into a flat "✗
0/N"). Two more carried it, both pure display bugs with every real value already available — no scorer or
`findings` change needed:

- **AI Discovery** (`app/(auth)/brands/[brandId]/ai-discovery/page.tsx`) hardcoded `2/2/1/1`; the real
  scorer (`lib/ai-discovery/endpoints.ts`) is `3/1/1/1` — `ai.txt` under-weighted, the FAQ endpoint
  over-weighted, cancelling to a coincidentally-correct total of 6 (the same meta/canonical cancellation
  shape as task UU). Fixed by exporting `AI_DISCOVERY_WEIGHTS` from the scorer and having both the scorer
  and the page read from it.
- **Brand & Entity** (`app/(auth)/brands/[brandId]/brand-entity-audit/page.tsx`)'s AU Directory row rendered
  a binary `present ? 2 : 0`, but the real scorer (`lib/brand-entity/score.ts`) has a 3-tier rule (0
  directories → 0, exactly 1 → 1, 2+ → 2) — a 1-directory brand showed "2/2" when only 1 of 2 points was
  actually earned, so the 4 displayed rows didn't sum to the real `scoreBrandEntity`. Fixed by exporting
  `scoreDirectoryTier` from the scorer and having the page call it with the real directory count instead of
  re-implementing (and getting wrong) its own threshold. Inert for Bondi specifically (0 directories, so
  0/2 either way) but wrong for any 1-directory brand.

Both fixes recompute from data already present in `findings` — **no re-audit needed**, existing stored
audits display correctly as soon as this deploys (unlike task UU, which needed new persisted fields before
its honest messages could appear).

**This completes the VV sweep: all 8 technical-audit dimension displays now import their weights/logic from
the scorer that actually computes them — no display re-implements or re-hardcodes scoring.** One low-priority
leftover from VV, not part of this bug class: the Content Quality page doesn't surface the already-computed
`capsuleFinding` string (task KK's "no question-style headings found" explanation) — unused helpful text,
not a weight or honesty bug, left for a future nicety.

## 16. SSR-check per-page metric was a false negative — real byte-ratio never matched real JS behaviour (task YY, 2026-10-04)

Task XX found `lib/ssr-check/per-page.ts`'s per-page `jsDisabledContentPct` was a false-negative bug, not a
legitimate stricter measure: it divided real server-rendered content (`page.textContent`, already
cheerio-stripped of scripts/styles/nav/footer) by 30% of the page's **total raw bytes** (`page.html.length`
— every script, style, nav, and footer tag still counted in full). No headless render exists anywhere in
the pipeline (confirmed by repo-wide grep; Playwright is a test-only devDependency) — there was never an
actual "without JS vs with JS" comparison to make, despite the page's copy implying one. A well-SSR'd page
with ~1,454 words of real content (Bondi) scored 7–27% / "needs review" purely because it also ships normal
analytics/tracking scripts and navigation markup, the same boilerplate virtually every real site carries.
The compound "fully server-side" gate (`pct ≥ 70 AND criticalCtas AND schemaVisible`) made "0 of 8" close to
the default outcome regardless of actual SSR quality, since `schemaVisible` is false for any page with no
JSON-LD at all.

**The composite Technical Score was never affected** — `scoreContent` is computed by a separate branch in
the same function (`bodyHasContent = wordCount > 50`), which was already correct and stays untouched (same
constant, same operator, now sourced from `SSR_CONTENT_THRESHOLDS.hasContentMin` instead of an inline `50`).

Fixed (option B — honest reframe of the single no-JS fetch, not a new headless render): the per-page metric
now reports the real server-rendered word count and a `good`/`thin`/`none` verdict
(`SSR_CONTENT_THRESHOLDS.goodContentMin = 300`, `.hasContentMin = 50`), with `status` driven purely by that
verdict instead of the old 3-way compound gate. The copy on `app/(auth)/brands/[brandId]/ssr-check/page.tsx`
no longer implies a without-vs-with-JS comparison that was never built. Existing stored audits keep the old
27%/"review" numbers until re-run; this is display-only, no migration.

**Deferred (option A, not built):** a real headless-render (Playwright) comparison of a no-JS fetch against
an actual JS-executed render, for genuine crawler-visibility detection — flagged as a future enhancement,
not implemented here given the infra/latency/cost of a per-page headless render in the audit pipeline.

## 17. Overview dashboard: Avg visibility blended audit history + SoV strip summed >100% (task BBB, 2026-10-04)

Task ZZ found two display-only bugs on the Overview dashboard (`app/(auth)/dashboard/page.tsx`). The
underlying audit/snapshot data was already correct — only the dashboard's own aggregation was wrong.

**Avg visibility** computed `AVG(score_composite)` over every completed audit for the org, blending
pre-QQ-fix inflated scores (65.9/66.9) with post-QQ honest ones (0.0) into a reading of 46.4, while Bondi's
actual current visibility was 0.0 — and weighted multi-brand orgs by how many times each brand happened to
be audited. Fixed: the query now picks each brand's single most-recently-completed audit
(`DISTINCT ON (brand_id) ... ORDER BY brand_id, completed_at DESC`) and averages only those — Bondi's card
now reads 0.0. Sub-label reworded from "Across all completed audits" to "Current score across tracked
brands."

**Share of Voice strip** (`components/domain/visibility/dashboard-sov-strip.tsx`) had its own
`Math.max`-per-competitor aggregation across `share_of_voice_snapshots` rows — the exact bug task X already
fixed once, in the Visibility Hub (`aggregateShareOfVoice` in `sov-donut.tsx`, which sums real mention
counts and defends against mixing audits), but which recurred in this second, separate consumer that never
called the shared function. Each displayed competitor % was its own single best (engine, category) segment
rather than a normalized share, summing to 122.8% instead of ~100%. Fixed: the strip now imports and calls
the same `aggregateShareOfVoice()` the Hub uses — no second implementation left. The underlying snapshot
data was already latest-audit-scoped and organic-filtered (AA); only the strip's own aggregation was wrong.

Both fixes are frontend/query-only, read existing stored data, and are **effective immediately — no
re-audit needed**.

## 18. Both prompt-injection detectors were broken regexes, falsely accusing sites of manipulation (task DDD, 2026-10-04)

Task CCC found both detectors in `lib/prompt-injection/detect.ts` fire on essentially every audited site, and
confirmed byte-level against the live `bondiplumbing.com.au`:

- **Invisible Unicode (was CRITICAL):** the character class accidentally included a literal ASCII space
  (U+0020) plus the stray literal characters `{`, `2`, `}`, so the regex matched the first ordinary space on
  any page — Bondi had zero genuine invisible characters; "Found on 9 pages" was spaces. No count threshold
  existed; any single match fired CRITICAL.
- **HTML comment injection (was WARNING):** `/<!--[\s\S]*?(ignore|disregard|act as|you are)/i` had no `-->`
  boundary, so the lazy wildcard ran past the comment close. On Bondi it matched 60,649 characters — from a
  benign `<!-- Injecting site-wide to the head -->` tracking comment to the word "ignored" in ordinary
  visible safety copy. The customer-facing evidence (truncated to 100 chars) showed the benign comment, not
  the actual trigger.

**Neither finding ever fed the Signals score** — `scoreSignals = aggregateNegativeScore(detectNegativeSignals(...))`
only; prompt injections were never passed in. The Signals page's own copy implied otherwise (a combined
"X negative signals · Y prompt injections detected" line directly under the score), which is also fixed
here. The real negative signals (keyword stuffing, CTA count, thin content) were independently re-verified
genuine against the live site and are untouched.

Fixed, all in `lib/prompt-injection/detect.ts` unless noted:
- Invisible-Unicode class tightened to the 12 genuinely invisible/bidi-control codepoints only (U+00AD,
  U+200B–U+200F, U+202A–U+202E, U+2060, U+FEFF), decoded and verified byte-by-byte to confirm no stray
  character crept back in. Now requires a real hidden-text signature — a run of ≥2 consecutive invisible
  characters, or ≥8 scattered occurrences — not any single occurrence; a lone soft hyphen, emoji ZWJ, or BOM
  is no longer enough.
- HTML-comment detection now extracts each comment's own inner text (`/<!--([\s\S]*?)-->/g`) and tests the
  instruction keywords against that text only, so a keyword appearing elsewhere on the page can never be
  blamed on an unrelated earlier comment.
- Evidence strings for both now quote the actual offending snippet (the invisible-char run with its named
  codepoints, or the comment's own inner text) instead of a truncated match-start that wasn't the reason.
- `app/(auth)/brands/[brandId]/signals/page.tsx` + `components/domain/technical/signals-detail.tsx`: the
  score card's summary line now mentions only negative signals; the injection section is relabelled
  "Content integrity checks" with an explicit "Informational" badge and a note that it isn't part of the
  score.
- `lib/ssr-check/per-page.ts`: removed the separate `MAX_PAGES = 8` cap (page-count display only, no scoring
  effect) so it scans the same full crawl the signal/injection detectors already do — resolves the
  "8 pages" vs "9 pages" inconsistency at the root rather than explaining it in two places.

**No score change, no migration, display/detection-only, new audits only** — existing stored audits (and
any demo already shown to a prospect) keep the false findings until re-run.

## 19. AI Discovery reframed as "emerging/recommended" — copy and display only, scoring unchanged (task GGG, 2026-10-04)

Task FFF Part C found AI Discovery was presented with the same flat authority as the genuinely-standardized
dimensions (Robots, Schema, Meta), even though 3 of its 4 signals (`/ai/summary.json`, `/ai/faq.json`,
`/ai/service.json`) trace only to the Auriti-Labs reference project the PRD's own v1.11 changelog flags as
untrustworthy (self-authored scoring rubric, zero third-party review, all-mocked test suite, inconsistent
star counts). Only `.well-known/ai.txt` (or root `/ai.txt`) has independent grounding — verified live
against the real IETF draft `draft-car-ai-txt-wellknown-00`, which genuinely specifies this path. Sri's
decision: keep the dimension and its 6 points exactly as scored, but stop implying it's a standard every
site should already meet.

Fixed, copy/display only:
- AI Discovery Audit page: a framing note under the header ("these are emerging... not a fix for a
  standards violation"), plus a per-row provenance tag — "Emerging standard · IETF draft" for ai.txt,
  "Vunnara-recommended format" for the other three.
- Technical Audit overview: the AI Discovery row carries a small "emerging" label; its 6-point contribution
  to the composite `/100` is unchanged.
- Methodology page: new honest entry citing the real, verified IETF draft for ai.txt; states plainly the
  three JSON endpoints are Vunnara's own recommendation, not an industry standard — no Auriti-Labs citation
  (consistent with the NN primary-source guardrail).

**`AI_DISCOVERY_WEIGHTS`, the detector, `orchestrate.ts`, and `computeTechnicalComposite` were not touched.**
Effective immediately on existing audits (labels render regardless of stored data) — no re-audit needed.

Also noted, not built: no Action Center recommendation or generator exists for AI Discovery at all (task
FFF Part B) — a 0/6 here has no guided fix, unlike llms.txt's dedicated generator. A product gap, not a bug.
