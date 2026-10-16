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

## 20. Answer Capsules detector measured the wrong thing, and silently missed most page-builder sites (task NNN, 2026-10-05)

Task MMM found the Answer Capsules numbers were honest for Bondi today, but for the wrong reasons underneath.
Three real bugs, all in `lib/answer-capsules/find-questions.ts` / `check-capsule.ts`:

1. **Measured the first sentence, not the answer.** The capsule check used `firstSentenceWords` against a
   15-30 word range, while the UI always said 20-25 in three places. A dead `words` variable already computed
   the full-paragraph count and was never used — the evident original intent.
2. **Extraction silently returned "" on page-builder markup.** Bondi is Duda-built: every block (heading,
   paragraph) is wrapped in its own container `<div>`, so a heading's real answer is a sibling of the
   heading's *parent*, not of the heading itself. The plain sibling-walk returned empty text for "What's your
   plumbing emergency?" (H3) — not because there's no answer, but because the walk looked in the wrong place.
   **This false-negatives most Wix/Squarespace/Duda small-business sites — the exact target market.**
3. **`capsuleFinding` was computed and never surfaced**, and the zero-question empty state showed "Re-run the
   technical audit…", implying stale data when it actually meant "we checked, found none."

Fixed (Sri's decision: capsule = 20-25 words, matching the UI; keep H2/H3 scope, do not broaden heading levels):
- `find-questions.ts`: new single-sourced `ANSWER_CAPSULE_WORDS = { min: 20, max: 25 }`; `hasCapsule` now checks
  the full following-text word count (dead `words` variable removed, now the one used). The sibling-walk falls
  back to the heading's parent's (and if needed grandparent's) following siblings when the heading's own
  siblings have no text — fixes the page-builder case without changing the already-working simple-markup case.
- `answer-capsules/page.tsx`: all three "20-25 word" strings now read `ANSWER_CAPSULE_WORDS` via a derived
  `CAPSULE_RANGE_LABEL` — same single-source pattern as `META_WEIGHTS`/`AI_TXT_PATHS`. `capsuleFinding` added to
  `ContentFindings` and rendered in the empty state; a genuinely-computed zero (`questions` present as `[]`) now
  shows the honest "no question-style headings" message, while a missing `questions` field (pre-dates this
  field) still asks for a re-run — these are no longer conflated.
- `check-capsule.ts`: the zero-questions finding now says "We checked your H2/H3 headings…" instead of a bare
  "No question-style headings found" — a site whose FAQ headings are all H4/H5/H1 (out of scope, e.g. Bondi's
  own homepage) is told what was actually checked, not "no Q&A structure at all."

**Live-reconciled against bondiplumbing.com.au (task NNN):** still 4 questions, all "needs capsule" — now
measured honestly. Real word counts: "What's your plumbing emergency?" → 0 (its answer lives inside a
JS-rendered tabs widget's base64-encoded config, never server-rendered text — a genuine "no answer paragraph,"
not an extraction bug); the 3 H2 questions → 102 / 156 / 103 words (their real, multi-paragraph answers, all
comfortably outside 20-25). `checkCapsuleQuality`'s score is unchanged (0/4 passed before this fix, 0/4 still
pass after — same Content Quality contribution, same `contentScore` for Bondi).

**Needs a re-audit** to take effect on stored data — the fix changes what the detector computes, not a
migration. No existing score changes until a brand's next audit runs.

## 21. Answer Capsules measured the whole section, not the opening answer (task OOO, 2026-10-05)

NNN (section 20) correctly switched from first-sentence to real answer text, but still accumulated every
block from the heading to the next heading — the whole section. Two problems this caused: real content
sections are almost never exactly 20-25 words total, so "With Capsules" was structurally ~always 0 and could
never fire positive; and it contradicted the feature's own definition — "a direct answer immediately
following the heading… AI engines prefer content that **starts** with the answer." A page that correctly
opens with a tight 22-word capsule and then elaborates was measured as the full 100+ words and falsely
flagged "needs capsule."

Fixed in `lib/answer-capsules/find-questions.ts`: the sibling-walk (including NNN's parent/grandparent
fallback for page-builder markup, unchanged) now returns only the **first non-empty block** after the
heading — skipping blank spacer blocks (a real pattern on Bondi's page-builder markup) — instead of
accumulating every block up to the next heading. `ANSWER_CAPSULE_WORDS` (20-25), the extraction fallback, the
single-sourced UI copy, and the empty-state/KK-gate behaviour are all unchanged — only the *extent* of text
measured changed.

**Live-reconciled against bondiplumbing.com.au:** still 4 questions, all "needs capsule" — Bondi's outcome is
unchanged. Real opening-paragraph word counts (vs NNN's whole-section counts): "What's your plumbing
emergency?" → 0 → 0 (unchanged, JS widget); "How do tree roots damage drainage?" → 102 → **47**; "How do we
fix a Plumbing Pipe Blockage?" → 156 → **14**; "Hot Water Systems…" → 103 → **56**. All still outside 20-25,
so `checkCapsuleQuality`'s score for Bondi is unchanged (0/4 before and after).

**Needs a re-audit** to take effect on stored data — no migration, no score change until a brand's next audit
runs.

## 22. Brand & Entity directory table showed KK's "unverifiable" as a false "Not found" (task QQQ, 2026-10-05)

The PPP source-attribution audit found every Brand & Entity check genuinely queries a real source (ABR, the
Wikipedia search API, live per-directory fetches) — but the directory table threw away the honest result.
`checkAuDirectories` and `run-technical-audit-inline.ts` compute and store a real three-state `status: "listed"
| "not_listed" | "unverifiable"` (task KK: a directory that blocked or failed the check — 403/429/timeout — must
never be reported as a confirmed absence). The page's local `BrandEntityFindings` type only declared
`{ name, present, url }` — no `status` — and rendered `dir.present ? "Found" : "Not found"`, silently collapsing
"unverifiable" into "Not found." That told a customer "you're not listed on Hipages" when the real answer was
"we couldn't check" — the exact regression KK fixed in scoring, re-broken in display.

Fixed in `app/(auth)/brands/[brandId]/brand-entity-audit/page.tsx`: the directory type now carries the real
`status` (imported from `au-directory-aggregate.ts`, single-sourced; a legacy audit without it falls back to
`present → "listed"` / `!present → "not_listed"`, the only two states that binary could ever have meant). The
table renders the real three states — "Listed" (now linked to the real profile URL via `ExternalLink`, closing
the directory half of PPP's attribution gap), "Not found", and "Couldn't verify" styled distinctly (warning, not
danger) from a confirmed absence.

**Display + type only — the AU Directory Aggregate score is unchanged.** `directoryCount` already counted only
`dir.present` (true only when `status === "listed"`), so an unverifiable directory already contributed 0, same
as before; only the label changed, not the number. Effective immediately on existing audits that stored
`status` (everything post-KK) — no re-audit needed, no migration.

## 23. Brand & Entity now surfaces the real sources behind each signal (task RRR, 2026-10-05)

The PPP source-attribution audit found every Brand & Entity check genuinely queries a real source (ABR,
Wikipedia search API, live directory fetches) — but the evidence each check computes (the ABR record, a
Wikipedia URL, directory profile URLs) was shown as inert text or discarded outright, leaving an agency no way
to click through and verify a result themselves. Scoped to Brand & Entity plus one new reusable component (not
a full sweep — Robots/Meta/SSR/Signals/Visibility attribution is deferred, per Sri).

Built `components/domain/brand-entity/verified-source.tsx` — the first component of its kind (confirmed via
PPP: nothing like it existed). Renders a real external link ("Verified against {source} ↗", `target="_blank"`,
`rel="noopener noreferrer"`) when a URL is present, honest inert text ("Checked against {source}") when it
isn't — both the link text and the no-url text can be overridden per call site so the wording never overclaims
beyond what was actually checked (e.g. a provided-but-unconfirmed ABN links the ABR record with "View the ABR
record," not "Verified").

Wired into `brand-entity-audit/page.tsx`:
- **ABN** — "No ABN verified" was ambiguous, hiding three different situations. Now distinguishes them using
  `brand.abn` (the raw input) plus `abnStatus`: not provided → "add it in brand settings"; provided and
  verified → "Verified on the Australian Business Register — {EntityName}" (using `abnEntityName`, pulled from
  a `brandEntityScores` query that already ran on this page but was previously discarded as `_entityScore`) +
  a link to the real, live-verified public ABR record (`https://abr.business.gov.au/ABN/View?abn=...`);
  provided but not matched/active, or the check didn't complete (missing GUID, malformed input, network
  failure — the stored fields can't tell these apart, so this is the clearest honest wording they support) →
  says so, with a link to the same ABR page so the reader can check it themselves.
- **Wikipedia** — the real `wikipediaAuUrl` is now an actual link when found; when not found, links a
  reconstructed, live-verified Wikipedia search (`en.wikipedia.org/w/index.php?search=...`) instead of leaving
  the result as inert "Not found on Wikipedia" text.
- **AU Directories** — the QQQ-era directory link now routes through the same shared component for visual and
  behavioural consistency; QQQ's three-state status logic is untouched.
- **AU TLD** — left as-is; its "source" is the registered domain, already shown as the detail text.
- A one-line frame under the header: "Every signal is checked against a public source — click through to
  verify."

**Display-only — no scorer change.** Every `present`/`earned`/`max` field is byte-identical to before; only
`detail` text and the new `source` field were added. Effective immediately on existing audits; no re-audit, no
migration.

## 24. Visibility audit 95% CIs counted cache replays as independent trials (task SSS, 2026-10-05)

Task AAA (read-only) confirmed the LLM cache key (`sha256(prompt + model)`, no run index) means only run 1 of
each (engine, prompt) pair is ever a real LLM call — runs 2–5 replay that exact cached response. A 200-"call"
audit makes 40 real calls. The 95% CI formulas (`lib/scoring/dimension-ci.ts` + `wilson.ts`) are textbook-correct
Wilson/normal-approximation intervals, but they were fed `n = totalCalls` (≈200) — counting the 4 replays per
prompt as independent trials. True independent `n ≈ 40`, so the reported margin was **~√5 ≈ 2.24× tighter**
than the evidence actually supports: overstated precision, not a fabricated number.

Fixed: `AuditCallOutcome` now carries `runNumber`; `selectOrganicCitations` computes `distinctSampleCount` /
`distinctMentionedCount` / `distinctAccWithSourcesCount` — the count of `runNumber === 1` rows only, per
dimension — alongside the existing (unchanged) replay-inflated totals. `run-audit-inline.ts` and
`inngest/functions/run-audit.ts` now feed `computeDimensionCIs` the distinct counts instead of
`totalCalls`/`mentionRows.length`. **Point estimates are untouched** — `scoreFrequency`, `scoreComposite`,
mention counts, etc. are computed from the same (correct, replay-inflated) totals as before, since every replay
is byte-identical to its run-1 original and preserves the exact same proportion; only the CI's own internal
sample-size denominator changed, widening the interval honestly.

**The CI is computed once at audit-completion and stored in `confidenceIntervals`/`scoreConfidenceLow/High` —
not recomputed on display.** This fix affects audits computed *after* it ships; existing audits keep their
already-stored (too-narrow) intervals until their next run.

Also found while researching this (not fixed — flagged for Part C below): all 4 LLM impls use
`temperature: 0.7`, confirming the 5-run design was meant to capture genuine run-to-run variance, which the
cache currently discards for free. The Responses tab (`app/(auth)/audits/[auditId]/page.tsx`) labels each row
"Run {n}," visually implying 5 independent observations when 4 are literally the same text — the same
misleading-independence pattern as the CI bug, just unfixed on the display side.

**Deferred decisions for Sri (temperature-dependent, not implemented):**
1. Make the 5 runs genuinely independent (nonce in the cache key, or `bypassCache` for runs 2–N) — real
   variance since temp=0.7, but ~5× the LLM spend/latency per audit. Worth it only once genuine per-run
   variance is a feature customers are told they're getting, not as a blanket default.
2. A force-fresh path for "Run audit" (today impossible inside 48h, end to end) — smaller, independent of
   (1), and fixes a harder dead-end than (1) does.
3. Relabel "Run {n}" in the Responses tab (and/or the call-count display) to distinguish a real call from a
   cached replay — cheap, no cost tradeoff, same truth-in-labeling fix as this task applied to the CI.

## 25. Responses tab presented 4 cache replays as independent "Run 2–5" (task TTT, 2026-10-05)

Deferred item 3 from task SSS, done. The Responses tab (`app/(auth)/audits/[auditId]/page.tsx`) — the evidence
screen that's supposed to substantiate every score — labelled each of 5 rows per (engine, prompt) "Run 1"
through "Run 5" as if each were an independent observation, when runs 2–5 are byte-identical 48h-cache replays
of run 1 (confirmed task SSS/AAA; temp 0.7 on all 4 engines, so this wasn't a no-op cache hit on identical
output — the replay is what made them identical). Presenting dupes as independent runs on the one screen meant
to build trust in the number undercut exactly that trust.

Fixed, content-based (not a hardcoded "5" — a future genuinely-independent run with distinct text still shows
on its own row): new `lib/audit/dedupeResponses()` collapses rows whose response text is identical within the
same (engine, prompt) group into the first occurrence, tagged with `replicaCount`. The query now orders by
`(engine, prompt, runNumber)` rather than `createdAt` so a replay group can never be split across a page
boundary, which the dedup depends on. The per-row badge shows "Run N" only when `replicaCount === 1`
(genuinely singular); once replicas exist it reads "Live · N× identical (cached)" instead. A new
`COUNT(DISTINCT (engine, prompt, response_snippet))` query feeds an honest "{distinct} distinct real responses"
line into the tab's summary, alongside the existing (unchanged) stored total.

**Display-only, reads existing stored citations — no data/score/migration change, effective immediately** (no
re-audit). Pairs with the SSS confidence-interval fix; the same two deferred decisions remain (make the 5 runs
genuinely independent at ~5× cost, and/or add a force-fresh path).

## 26. The "SE Ranking Dec 2025" fabrication NN removed from methods.ts was still live elsewhere (task UUU, 2026-10-05)

Task KKK found task NN's fabricated **"SE Ranking Dec 2025" study** (`7e7b1ef`; confirmed to exist nowhere in the
literature, including its telltale "4.9 vs 4.4 avg citations with FAQ in content" figure) was never swept from
three parallel locations, all carrying the exact same fabricated source and/or figures:

1. **`db/seed/citability-methods/seed.ts`** — 5 entries (`faq-in-main-content`, `content-freshness`,
   `schema-faq-page`, `content-depth-1500`, `date-stamps`). This seeds the live `citability_methods` DB table,
   queried by the **authenticated `/methods` page**, sorted `effectSizePct` DESC — a confirmed fabrication was
   customer-facing.
2. **`db/seed/recommendations/research-citations.ts`** — 2 entries (`faq-content`, `stale-content`), with a
   URL (`seranking.com/blog/ai-overviews-study/`) that live-verified to HTTP 404, plus the same invented
   "4.9 vs 4.4" and "5.0 vs 3.9" figures. Seeds `recommendation_research`.
3. **`tests/qa/sprint6/shared/seed.ts`** — 1 entry (`faq-content`'s `evidenceRefs`), same dead URL and figure.
   A Playwright QA fixture, not customer-facing, but carrying the same fabrication.

**Fixed in all three**: removed the fabricated source/URL/figures, re-attributed as `"VisibleAU Original"` /
`"Vunnara estimate"` (matching this codebase's existing honest-self-attribution convention), kept every
underlying method, its `effectSizePct` number, and its `appliesTo`/dimension untouched — this task kills the
fabrication only; whether these specific percentages are the right numbers is a separate, not-yet-authorized
effect-size-provenance decision.

**The live `citability_methods` and `recommendation_research` DB rows are NOT fixed by this commit** — the seed
file only takes effect on the next full reseed. Two ways to fix the live rows (reported, neither executed —
Production write gate, Sri's call, Neon snapshot first):
- **Full reseed** (`pnpm seed`): deletes and re-inserts the *entire* `citability_methods` (47 rows) and
  `recommendation_research` (12 rows) tables. Fixes the fabrication but is a much larger blast radius than
  needed for 7 rows total.
- **Targeted update** (recommended — lower blast radius): `UPDATE citability_methods SET source = 'VisibleAU
  Original', effect_size_notes = '...' WHERE method_key IN ('faq-in-main-content', 'content-freshness',
  'schema-faq-page', 'content-depth-1500', 'date-stamps')` (safe — `method_key` is `UNIQUE NOT NULL`), plus the
  equivalent `UPDATE recommendation_research ... WHERE recommendation_key IN ('faq-content', 'stale-content')
  AND source LIKE 'SE Ranking%'` (scoped by the old source value too, since `recommendation_key` alone isn't
  unique in this table).

**Until the live rows are fixed, the fabrication remains visible on `/methods` even after this code ships.**

## 27. /methods citability effect-sizes reframed as Vunnara estimates, with real links only where verified (task VVV, 2026-10-05)

Task KKK found `/methods`' effect-size percentages were presented with no honest provenance at all: all 22
"AutoGEO ICLR 2026" entries cited a real, ICLR-2026-accepted paper (arXiv 2510.11438) for topics it doesn't
study (AutoGEO is a content-*rewriting* framework; nothing in this seed is a content-rewriting method), the
seed had no `citationUrl` field whatsoever, and several other sources (Tinuiti/Profound/TEAM LEWIS/HubSpot,
plus 3 Princeton-labelled entries citing a non-existent "Allen et al. 2024") couldn't be tied to a live,
verifiable source when checked (their claimed report URLs all return HTTP 404; only the companies' root
domains are real). Per Sri: **the effect-size percentages are Vunnara's own estimates** — reframe honestly,
link only what's genuinely verified.

**Classified all 47 entries** (`db/seed/citability-methods/seed.ts`): **4 are `research`** (the real Aggarwal
et al. GEO paper, Princeton KDD 2024 — `add-statistics-with-sources`, `add-expert-quotes`,
`add-authoritative-references`, `outbound-authority-links`), carrying the genuine `arxiv.org/abs/2311.09735`
citation and fixed notes (removed the invented "Allen et al." / "10,000 queries" elaboration, kept the
verified GEO-bench framing). **The other 43 are `vunnara_estimate`** (including all 22 former AutoGEO
entries and the 6 Tinuiti/Profound/TEAM LEWIS/HubSpot ones) — `source` reads `"VisibleAU Original"`,
`citationUrl` is `null`. Every method and its `effectSizePct` number is unchanged — only the attribution.

**Added `citability_methods.citation_url` + `source_type`** (migration `0034_citability_methods_provenance.sql`,
hand-written per `db/migrations/README.md`'s convention — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, a
`CHECK (source_type IN ('research','vunnara_estimate'))` constraint, idempotent). **Not applied to any
database from this task** — see the rollout note below.

**Single-sourced the verified citations**: new `lib/methodology/verified-citations.ts` holds the 5 already-
verified (name, url) pairs (Aggarwal GEO, 2× Ahrefs, Zyppy/Leapd, Ahrefs misinformation experiment). Both
`lib/methodology/methods.ts` and the seed now import from here instead of re-typing the same strings — this
is exactly the drift that let "SE Ranking Dec 2025" (task NN, task UUU) survive unnoticed in one list after
being removed from the other. A guard test (`tests/unit/methodology/verified-citations-guard.test.ts`) scans
both files for known-fabricated strings and any AutoGEO citation.

**`/methods` now renders provenance honestly**: a `research` entry shows a real linked source ("Research:
{source}" via the shared `VerifiedSource` component, task RRR); a `vunnara_estimate` entry shows a plain,
muted "Vunnara estimate" label, not a citation. A new framing line: *"Effect sizes are Vunnara's own estimates
based on AEO best practice; where independent research supports a method, it's linked."* The `effectSizePct`
sort is unchanged.

**Rollout (not executed — Production write gate, Sri's call, Neon snapshot first):**
1. Run migration `0034` on prod (adds 2 nullable columns + a CHECK constraint — safe, no data change).
2. Fix the live rows. **`pnpm seed`'s full-reseed path is not actually available for prod at all** — it
   hard-refuses to run against any `*.neon.tech` host unconditionally (confirmed in `db/seed/seed.ts`; see
   `db/migrations/README.md`). The only viable path is a **targeted `UPDATE citability_methods SET source =
   ..., citation_url = ..., source_type = ... WHERE method_key = '...'`** per affected row (47 rows, scripted
   from this seed file's new data) — lower blast radius than a reseed would have been anyway.
3. The display fix is effective **the moment this code deploys**, even before the rows are updated: the page
   no longer renders the raw `source` string at all (`research` requires both `sourceType === "research"` AND
   a non-null `citationUrl`), so on existing rows — `source_type`/`citation_url` both NULL until step 2 runs —
   every row falls through to "Vunnara estimate." No stale or fabricated source string (AutoGEO, SE Ranking,
   etc.) can render on `/methods` after deploy, regardless of migration/seed timing. Step 2 only restores the
   4 real research links; it isn't needed to stop the dishonest display.

## 28. Action Center's Evidence Link rendered recommendation_research raw, with no provenance gate — including frozen copies (task XXX, 2026-10-06)

Task WWW (read-only) confirmed `/methods` never renders `effectSizeNotes` — the field the SE Ranking
fabrication lived in — so UUU/VVV fully closed that surface. But it found a **worse, live leak elsewhere**:
`components/domain/action-center/evidence-link.tsx` rendered `ref.source` and `ref.summary` directly and
unconditionally — no provenance gate at all, unlike `/methods` after VVV. The evidence comes from
`recommendation_research` via `lib/recommendations/index.ts`'s `buildRecommendations`, which copies
`{source, url, summary}` into `evidenceRefs` — and **`evidenceRefs` is baked onto `action_items.evidence_refs`
at generation time, never re-joined on view**. Any `faq-content`/`stale-content` recommendation generated
**before** UUU's fix has the fabricated "4.9 AI citations vs 4.4 without" / SE Ranking text **permanently
frozen** on that row — fixing the live `recommendation_research` rows would never reach those frozen copies;
it only stops *future* copies from being made.

**Fixed with the same gate pattern as `/methods` (VVV), applied at render time so it also neutralizes already-
frozen rows with no DB change:**
- New `lib/methodology/verified-citations.ts` export `deriveSourceType(source, url)` — an exact-match runtime
  equivalent of VVV's hand-classification (no schema change; `recommendation_research` keeps its existing
  columns). `buildRecommendations` now derives `sourceType` per ref from this function and strips the `url`
  for any non-`"research"` ref, so a link can never be built out of an unverified source.
- `EvidenceLink` now requires `sourceType === "research"` **and** a real `url` before rendering the raw
  `source`/`summary` (via the shared `VerifiedSource` component, task RRR) — otherwise it shows a plain
  "Vunnara estimate" label and the recommendation's **own** honest `action` text, never `ref.summary`. **Every
  ref built before this field existed has no `sourceType` at all**, so it falls through the same way an
  explicit `vunnara_estimate` would — this is what neutralizes a frozen fabricated ref on deploy, with zero
  database change.
- Also closed a smaller, same-class exposure WWW found: `app/api/citability-methods/route.ts` and
  `lib/citability/catalogue.ts` both `select()`-ed every `citability_methods` column (including
  `effectSizeNotes`) and returned it raw — zero frontend callers today, but a real authenticated endpoint
  anyone logged in could call directly. Narrowed the projection to drop `effectSizeNotes` from both (routes
  kept, not removed, since narrowing is lower-risk than deleting a route with unknown external callers).

**Also found, not fixed (out of scope — flagged for a VVV-style follow-up):** `research-citations.ts`'s
"Princeton GEO Study (2024)" entries cite `arxiv.org/abs/2404.11973` — live-verified to be a **different,
unrelated paper** ("A critical review of methods and challenges in large language models"), not the Aggarwal
et al. GEO paper `verified-citations.ts` actually verified. `deriveSourceType`'s exact-match design correctly
classifies these as `vunnara_estimate` regardless (conservative by construction), so this doesn't under-
protect anything — but the citation itself is still wrong and worth a dedicated fix.

**Gated prod data step (not executed — Production write/read gate):**
1. `recommendation_research` live-row UPDATE (`faq-content`, `stale-content` — the UUU-fixed seed values) —
   **cleanup now, not urgent**: the render gate already neutralizes display; this only restores accurate
   provenance for genuine refs and stops the fabrication being copied into *future* `evidence_refs`.
2. `action_items.evidence_refs` backfill for already-frozen rows — **cleanup/enrichment, not urgent
   fabrication-removal**, since Part B's fall-through already hides the raw text. To size it, Sri would run
   (not executed here): `SELECT count(*) FROM action_items WHERE evidence_refs @> '[{"source":"SE Ranking
   Dec 2025"}]'::jsonb` (and the equivalent for the other pre-UUU source strings in `research-citations.ts`'s
   history) to find how many rows carry frozen fabricated evidence, before deciding whether to backfill
   `sourceType`/re-run `buildRecommendations`'s mapping against them.
3. **After this code deploys, no fabricated or ungated evidence reaches a customer screen from any surface
   found across WWW/XXX** — confirmed: `/methods` (VVV), the orphaned API/catalogue exposure (this task), and
   Action Center's Evidence Link (this task) are all gated the same way, and the gate's fall-through covers
   both future refs with no match and every already-frozen ref with no `sourceType` at all.

## 29. A real paper was cited with the wrong arXiv id — a different mis-citation class from fabrication (task YYY, 2026-10-06)

Found in task XXX's own investigation: `db/seed/recommendations/research-citations.ts`'s three "Princeton GEO
Study (2024)" entries cited `arxiv.org/abs/2404.11973` — live-verified to be **a different, unrelated paper**
("A critical review of methods and challenges in large language models"), not Aggarwal et al.'s real GEO
paper (`arxiv.org/abs/2311.09735`). Same class as AutoGEO (#26): a real source, pointed at the wrong thing —
not a fabrication, but just as capable of misleading a reader who clicks through.

**The decisive check**: does the same wrong id exist in `lib/methodology/verified-citations.ts` — the single
source VVV created, which actually renders as a clickable "Research: … ↗" link on live `/methods` rows?
**No** — `verified-citations.ts`'s `aggarwalGEO.url` was already correct (`2311.09735`); `methods.ts` imports
it and was therefore also already correct. **No live `/methods` research link was ever wrong.** The wrong id
was isolated to `research-citations.ts` (and a QA fixture, `tests/qa/sprint6/shared/seed.ts`, that copied it)
— and because its citation's exact `(name, url)` pair never matched `verified-citations.ts` anyway (different
name string), task XXX's `deriveSourceType` already classified it `vunnara_estimate` regardless of the wrong
id, so it was never rendered as a clickable research link on the Action Center Evidence Link either. The bug
was real but latent — a landmine for a future edit, not a live mis-citation.

**Fixed**: dropped the url (rather than pointing it at the correct id) on all 3 `research-citations.ts`
entries plus the QA fixture copy — the `summary` text on these entries makes a specific claim ("41% across
10,000 queries", "+115% for lower-ranked content") that was never verified against what the real Aggarwal
paper actually reports (the same "real source, invented specifics" pattern VVV already found and fixed in the
sibling citability-methods seed), so pointing the url at the correct paper without reconciling that text would
just relocate the same problem. Left honestly unlinked; a VVV-style full reconciliation of this file's
citations remains a separate, flagged follow-up.

**Guard strengthened** (`verified-citations-guard.test.ts`): pins `VERIFIED_CITATIONS.aggarwalGEO.url` to
contain `2311.09735`, and asserts the literal wrong id `2404.11973` appears nowhere (comment-stripped) across
all 4 guarded files. Full live-URL-resolves-to-the-named-paper checking isn't unit-testable offline — the
pinned known-good/known-bad ids are the pragmatic, automatable guard; the live verify pass itself (curl +
WebFetch) is what this task actually ran to confirm the 5 `VERIFIED_CITATIONS` URLs and the IETF ai.txt draft
citation.

**Prod implication: none new.** The `/methods` `citationUrl` is copied into the `citability_methods` row at
seed time and read from the row at render time, not looked up from `verified-citations.ts` live — but since
that module was already correct, there's nothing to carry into VVV's already-gated prod UPDATE. The
`research-citations.ts` fix (dropping the wrong id) doesn't change any currently-rendered output either
(confirmed: it was never classified `research` to begin with) — it folds into XXX's already-flagged, already
not-urgent `recommendation_research` cleanup UPDATE, with no new urgency.

**Live-verified** (not unit-testable, done manually this task): `arxiv.org/abs/2311.09735` (200, the real GEO
paper), both Ahrefs URLs (200), the Zyppy/Leapd URL (200), and the IETF ai.txt draft (200) all resolve.
`businesswire.com/news/home/20260526119691/en/` (the Ahrefs misinformation-experiment citation) returned
HTTP 403 — inconclusive (businesswire.com commonly blocks non-browser requests; a web search independently
confirmed the underlying Ahrefs experiment is real, just couldn't confirm this exact press-release id under
that block). Flagged, not changed, pending a human check from a real browser.

## 30. `/methods` 500'd in prod: VVV's migration 0034 was never applied (task ZZZ, 2026-10-06)

Live outage, ~2h. VVV's code (task #27) started reading `citability_methods.citation_url`/`source_type`, but
migration `0034_citability_methods_provenance.sql` (which adds those columns) was never applied to prod —
there is no automated path from a merged migration to live Neon. `package.json`'s `build` script is plain
`next build`; CI's `pnpm db:migrate` runs `drizzle-kit migrate` against an ephemeral local `visibleau_test`
container, never prod. Migrations `0012+` are hand-written SQL applied only via a manual `psql -f` step
(`db/migrations/README.md`), because `drizzle-kit generate`/`push` is blocked (its own snapshot tracking is
stuck at `0011`). A single forgotten manual step → `column "citation_url" does not exist` (42703) → Server
Components render error (Error ID 815956127) on every `/methods` load, and on `/api/citability-methods` and
`lib/citability/catalogue.ts`.

**Fixed** by Sri running the emitted `db/prod-fixes/0034-apply-prod.sql` (verbatim from the real migration,
additive/nullable/idempotent) after a Neon snapshot — no app code changed; the fix was always the missing
migration, not the code. `db/prod-fixes/0034-precheck-prod.sql` and `0034-rollback-prod.sql` were emitted
alongside it for review; none of the three were run by Claude Code.

**Process gap, not yet closed**: nothing currently stops code that depends on a column from deploying before
that column exists on prod. Flagged as a follow-up (a migrate-before-promote guard), not built in this task.

## 31. `/methods` rendered empty in prod: `citability_methods` had the right columns but no rows (task 2026-10-06)

Follow-on to #30: once `0034` was applied, `/methods` loaded without error but showed an empty table —
`citability_methods` had always been empty on prod (the local-only `pnpm seed` hard-refuses any `*.neon.tech`
host, so nothing ever loaded the 47-method seed there). Fixed by generating
`db/prod-fixes/seed-citability-methods-prod.sql` directly from `db/seed/citability-methods/seed.ts`'s
`CITABILITY_METHODS` (via a small read-only generator, `scripts/ops/generate-citability-methods-prod-sql.ts` —
connects to no database, just prints SQL) — every value is read from the already-corrected seed, never
hand-typed, so none of the fabrications/mis-citations removed in tasks NN/UUU/VVV/YYY could resurface in the
prod copy. 47 rows: 4 `research` (Aggarwal et al., `arxiv.org/abs/2311.09735`), 43 `vunnara_estimate` (no
url). `ON CONFLICT (method_key) DO UPDATE` — idempotent and doubles as the refresh path for any future
provenance correction. Emitted for Sri to run after a snapshot; not executed by Claude Code.

**Deliberately NOT seeded in this task**: `recommendation_research` — it still carries the unreconciled
"41% across 10,000 queries" / "+115% for lower-ranked content" summary text flagged in #28/#29 as never
verified against what the real Aggarwal paper reports. Seeding it now would carry that same unverified
specificity into prod. Action Center's Evidence Link therefore stays empty (XXX's provenance gate renders
"Vunnara estimate" with no link when there's no row to read) until that reconciliation happens.

## 32. `/methods` effect-size percentages were invented precision — replaced with honest impact tiers (2026-10-06)

Sri's decision: `citability_methods.effect_size_pct` (e.g. `wikipedia-presence` = `47.90`) originated with the
fabricated SE Ranking / AutoGEO data (#26, task KKK). Tasks UUU/VVV/YYY stripped the citations but kept the
suspiciously-precise numbers, relabelled "Vunnara estimate" — but nobody at Vunnara ever actually measured or
estimated them; keeping a number implies a precision that was never real. Replaced with a qualitative
`impact_tier` (`high`/`medium`/`low`), assigned by genuine reasoning about each method's real AEO/GEO merit —
**not** by thresholding the old percentages (several tiers deliberately diverge from what a mechanical bucket
of the old number would give, e.g. `remove-prompt-injections` is `high` despite its old figure being one of
the lowest, because the real stake is delisting risk, not a missed opportunity; `google-business-profile` and
`cdn-allow-ai`/`robots-allow-ai` are `high` as binary enablers — foundational preconditions, not merely
"big observed effects").

**Lucky simplification**: prod `citability_methods` was still empty when this task ran (#31's seed hadn't
been applied yet), so the fabricated percentages never reached prod — nothing to clean up there, only to make
sure prod is seeded with tiers from the start.

**Tier proposal (Sri should review/edit before the prod seed runs)**:

| Method | Tier | Why |
|---|---|---|
| add-statistics-with-sources | High | Aggarwal GEO (real research): citation-addition is one of the study's top-performing methods |
| add-expert-quotes | High | Aggarwal GEO (real research): same top-performing citation-addition method |
| add-authoritative-references | High | Aggarwal GEO (real research): same citation-addition method |
| wikipedia-presence | High | Wikipedia is one of the most heavily-cited entity sources for LLM factual queries |
| faq-in-main-content | Medium | Real content placement benefit, but incremental over having the content exist at all |
| content-freshness | Medium | Freshness is a real AI-crawling signal but a modest, incremental one |
| reddit-presence | Medium | Perplexity draws heavily on Reddit, but community dynamics limit how controllable/scalable this is |
| medium-articles | Low | Nice-to-have third-party publishing; not a primary AI-citation lever |
| linkedin-presence | Low | Marginal entity-graph support; not a primary AI-citation lever |
| press-mentions | Medium | Valuable independent corroboration, but earned media is slow and hard to control |
| comparison-content | High | Comparison/"best for" content directly matches high-intent AI-answer query patterns |
| schema-organization | Medium | Foundational entity schema that underlies other signals, though limited standalone lift |
| schema-local-business | Medium | Directly supports local entity resolution for AU local-AI answers |
| schema-faq-page | Low | Schema alone has limited effect without real visible content |
| schema-article | Low | Marginal snippet-selection aid |
| llms-txt-file | Low | Emerging/speculative standard; no major engine confirmed using it yet |
| robots-allow-ai | High | Binary enabler — if bots are blocked, nothing else in this list matters |
| server-side-rendering | High | Binary enabler — CSR-only pages are invisible to most AI crawlers |
| answer-capsule-pattern | High | Core AEO technique for verbatim-quotable answers; Vunnara's own answer-capsule feature |
| nap-consistency | Medium | Real local entity-trust signal, but incremental |
| au-directory-presence | Medium | Feeds local AI responses for AU businesses, incremental |
| google-business-profile | High | Primary direct feed into Google AI Overviews for local queries |
| content-depth-1500 | Medium | Depth helps but quality matters more than word count alone |
| title-tag-optimization | Low | Minor snippet-selection hygiene |
| meta-description-quality | Low | Minor snippet-selection hygiene |
| canonical-tags | Low | Hygiene; prevents dilution rather than driving citation |
| og-tags-complete | Low | Minimal relevance to AI citation specifically |
| internal-linking | Medium | Real structural signal for topical understanding, but incremental |
| outbound-authority-links | High | Aggarwal GEO (real research): part of the citation-addition method |
| author-attribution | Medium | Meaningful expertise/accountability signal, not foundational |
| date-stamps | Low | Minor visible freshness signal, lower impact than actual content updates |
| suburb-specific-pages | Medium | Matches local AU query patterns; a content-scale play, not universally essential |
| remove-cta-overload | Low | UX hygiene; marginal AI-citation effect |
| reduce-popup-density | Low | UX/crawler-accessibility hygiene |
| fix-broken-links | Low | Hygiene; low material impact on citation likelihood |
| reduce-ad-density | Low | UX hygiene |
| remove-hidden-text | Medium | Avoids an active AI-manipulation signal that can actively harm trust |
| remove-prompt-injections | High | Risk-mitigation — can cause outright delisting, not just a missed opportunity |
| ai-txt-endpoint | Low | Emerging/speculative standard |
| ai-summary-json | Low | Speculative structured endpoint; no major adoption evidence |
| ai-faq-json | Low | Speculative structured endpoint |
| ai-service-json | Low | Speculative structured endpoint |
| cdn-allow-ai | High | Binary enabler — a CDN block prevents all AI crawling regardless of anything else |
| sitemap-xml | Low | Baseline discovery hygiene, not a differentiator |
| hreflang-tags | Low | Narrow localisation benefit |
| reduce-boilerplate | Medium | Genuine content-quality signal — more unique, citable content per page |
| abn-registration | Medium | Strengthens AU entity verification/trust, valuable but not foundational |

**`effect_size_pct` decision**: the column is already nullable (no `NOT NULL` in the original definition), so
the lower-risk move is to **leave it in place, unpopulated**, rather than attempt this codebase's first-ever
`DROP COLUMN` against a table `drizzle-kit` can't track (see `db/migrations/README.md`). Migration `0035`
only adds `impact_tier`; it does not touch `effect_size_pct`. The seed and the regenerated prod SQL both
explicitly set `effect_size_pct = NULL` (including on `ON CONFLICT DO UPDATE`), so a reseed also wipes any
stale invented value a prior load left behind. **Known stale, not touched**: `app/api/citability-methods/
route.ts`, `lib/citability/catalogue.ts`, and `lib/citability/apply.ts` still select/order by
`effect_size_pct` — all three have **zero live callers** (confirmed by search), so nothing renders the now-
always-NULL value; flagged for a future cleanup rather than touched here, since the explicit scope of this
task was the seed and the live `/methods` page.

**Rollout order** (document, don't execute — mirrors the 6 Oct lesson from #30): (1) Sri snapshots prod; (2)
apply `db/prod-fixes/0035-apply-prod.sql` (adds `impact_tier`) — low risk since `citability_methods` is still
empty; (3) deploy this task's code (now safe — the column exists); (4) run the regenerated
`db/prod-fixes/seed-citability-methods-prod.sql` (47 rows, tiers, no percentages); (5) verify `/methods`: 47
rows with High/Medium/Low badges, 4 research links, no percentages anywhere.

## 33. `/methods` was unreachable — no sidebar entry, no link from Action Center (2026-10-07)

`/methods` (Citability Methods) had **no navigation entry anywhere** — the only way to reach it was typing
the URL directly, so no real client ever would have found it. Added two entry points: a **"Methodology"**
item in the sidebar's Workspace section (`components/domain/app-sidebar.tsx`, next to Action Center, `ListChecks`
icon), and a **"See the full methodology →"** link in Action Center's header (`app/(auth)/action-center/page.tsx`),
visible in both the populated and empty-recommendations states, not repeated per card.

**Access control checked, not assumed**: `/methods` has no plan/role gate on visibility — `app/(auth)/methods/
page.tsx` only requires sign-in (same `getCurrentUser()` + redirect pattern as every other Workspace page);
free tier gets a top-10-limited view with an upsell banner, not a block. This matches every existing
`WORKSPACE_ITEMS` entry (none of which are tier-gated for visibility either), so the new sidebar item needed
no extra condition — it renders unconditionally like its siblings.

**⚠️ Deploy-after-seed dependency**: this is display-only (no schema/data change), but it must reach
production **after** `db/prod-fixes/seed-citability-methods-prod.sql` (#31/#32) has actually been run — a nav
link that lands on an empty 0-row table is worse than no link at all. Not gated in code (the task's own
instruction); flagged here for Sri's deploy ordering.

## 34. Trust Intelligence reassured on absence + Consensus fabricated 100/"top tier" from a stub (2026-10-07)

Found by the Trust Intelligence diagnostic: the headline Hallucination Risk ("0/100, clean record, Low, 0 =
safe") was purely a function of `risk === 0`, with no way to tell "0 incidents because there's no AI coverage
to check" apart from a genuinely clean record across real coverage. Worse, **Consensus Score fabricated a
100%/"top tier" result for every brand** — its scoring input hardcoded every field to "matches" behind a
`// TODO: implement per-source checking in production` comment that was never resolved, in both the monthly
cron and the manual "Refresh" button. LinkedIn and YouTube Presence had the same stub pattern (hardcoded to
the opposite, worst-case direction — always 0), and the Entity Score page's "Refresh" button implied a check
that doesn't change the score it displays (confirmed: `refreshEntityScore`'s write never touches `scoreOf10`).

**Fixed, this task — no tile may assert a result it did not measure:**

- **Hallucination Risk headline** (`app/api/brands/[brandId]/trust/route.ts`): added `citationCount` (via new
  `lib/trust/citation-coverage.ts`'s `getBrandCitationCount`, a count of this brand's `citations` rows joined
  through `audits`) to `computeTrustSummary`'s `TrustSummary`. Threshold: **citationCount > 0** required for
  any "clean record / Low / 0 = safe" framing; at exactly 0, `riskLevel` is `null` and the rationale is routed
  through `ExplainabilityService.annotate()` (passing `sampleSize: 0`), reusing its existing honest "no data"
  wording instead of a hand-rolled string.
- **Overall Trust Score**: `100 - hallucinationRisk` is now excluded from the average when `citationCount` is
  0 — exactly like the other components are already excluded when null. `overallTrustScore` is now
  `number | null`; `null` renders an explicit "Insufficient data to score" state via a new `insufficientData`
  prop on `TrustScoreCard` (also used for the Hallucination Risk card when `riskLevel` is null). A new
  "Overall Trust Score" card was added to the hub page — `overallTrustScore` was computed but never actually
  rendered anywhere before this task. Note: `entityScore` still defaults to `0` (not `null`) when no
  `brandEntityScores` row exists — a separate, pre-existing design choice left out of this task's explicit
  scope — so in the current data model `overallTrustScore` always has at least that term and will land on `0`
  rather than `null` for a fully blank brand; `null` is correctly wired and will fire once/if that default is
  revisited.
- **Three stubs neutralized** (`lib/trust/stub-implementation-status.ts`'s `TRUST_CHECK_IMPLEMENTED` flags,
  all `false`): LinkedIn Presence, YouTube Presence, and Consensus Score's GET routes, refresh (POST) routes,
  and monthly cron jobs (`inngest/functions/audit-linkedin-presence.ts`, `audit-youtube-presence.ts`,
  `check-cross-platform-consensus.ts`) all check the flag first and refuse to read, write, or present
  anything while it's `false` — returning `{ implemented: false }` (501 on refresh) instead. The GET routes'
  gate runs before any DB read, so even a stub row already sitting in a dev database from earlier testing
  can no longer be presented as a result. The three pages render a new shared
  `components/domain/trust/not-yet-measured-card.tsx` ("Measurement not yet available") with the Refresh
  button disabled and relabeled "Not yet available", instead of the real scorecard. The Consensus cron's
  `avgScore < 70` alert path, which was already dead code (the stub guarantees `avgScore = 100`), is now
  additionally unreachable because the cron skips entirely.
- **Entity Score "Refresh" button**: removed (it never changed `scoreOf10`, the only thing the page
  displays) — replaced with static copy, "Updates with each full audit". The backend
  `entity-score/refresh` route is untouched (still reachable directly, now orphaned from the UI) since it's
  not itself dishonest, just pointless.
- **Honest empty states for the three real tiles** (Hallucination Incidents, Evidence Archive, Citation
  Source Intelligence): all empty-by-construction for a near-zero-citation brand, previously showing "No
  hallucinations detected — your brand facts are consistent" unconditionally. Their GET routes now also
  return `citationCount`; each page shows "Not enough AI coverage to assess" when it's 0, and the existing
  (now genuinely earned) message otherwise, naming the real sample size.

**Not touched, flagged as a related gap**: the Entity Score page's Knowledge Panel and Wikidata cards read
`brandEntityScores.knowledgePanelPresent`/`wikidataEntryPresent`, which are *also* hardcoded stubs in
`lib/trust/entity-checker.ts` (same `// TODO` pattern) — out of this task's explicit scope (it named
Consensus/LinkedIn/YouTube/the Entity refresh button specifically), but the same honesty gap exists there.

**Screen stays orphaned**: `/brands/[brandId]/trust` is still not linked from any nav (confirmed unchanged) —
per Sri's explicit instruction, it stays unreachable until the real LinkedIn/YouTube/Consensus checks land.

## 35. Real YouTube Presence check (API v3) + two honesty follow-ups (2026-10-09)

`YOUTUBE_API_KEY` is now set in Vercel. Built the real YouTube Presence check and flipped
`TRUST_CHECK_IMPLEMENTED.youtubePresence` to `true` — the only one of the three stubbed checks neutralized in
#34 to go live so far (LinkedIn and Consensus remain stubs, still gated).

**Matching (integrity crux: never claim a channel without a confident match).**
`lib/trust/youtube-channel-lookup.ts`'s `scoreChannelMatch(brandName, brandDomain, candidate)` — a pure,
0-1 confidence score from only the two signals available in `search.list`'s own snippet (title,
description), deliberately avoiding a per-candidate `channels.list` call that would blow the quota budget:
an exact normalized title match alone scores 0.6 (clears the threshold); a weak title-substring match OR the
brand's domain root appearing in the description each score 0.35 alone (does **not** clear it); the two
together (0.70) do. **`MATCH_CONFIDENCE_THRESHOLD = 0.6`** — the top search result is never taken blindly;
below threshold → `"not_found"`, not a guess.

**Lookup + enrich** (`checkYoutubePresence`): `search.list(type=channel, q=<brand name>, maxResults=5)` (100
units) → score every candidate → if the best clears the threshold, `channels.list(part=snippet,statistics,
contentDetails, id=<channelId>)` (1 unit) for subscriberCount/videoCount/the uploads playlist id, then
`playlistItems.list(uploads, maxResults=1)` (1 unit) for the last-upload date. ~102 units/check → ~95
checks/day on the free 10k quota. A 403 `quotaExceeded` and any network/timeout error are classified
distinctly and never treated as "not found". A failed recency lookup degrades gracefully (the already-
confirmed match still stands; `lastUploadAt` is just null) rather than discarding the match.

**Three honest, distinctly-stored outcomes** (`youtube_presence_audits.check_status`): `'confirmed'` (real
stats, channel link, match confidence — the YouTube Presence page shows the matched channel itself, not just
a bare score, so the agency can judge/correct a wrong match), `'not_found'` (checked, no confident candidate
— a real measured zero, not a stub), `'unavailable'` (missing key / quota / network error, with
`unavailable_reason` recorded — rendered as a visually distinct "Measurement temporarily unavailable" warning
card, never a fabricated 0/score).

**Honest scoring, not the stub-era formula**: `scoreYoutubePresence` (the old stub-era scorer) required inputs
(longformVideoCount, videosWithChapters, embeddingPages*, etc.) that YouTube Data API v3 simply cannot provide
without a website crawl or content-classification pass neither of which this task builds. Left it in place
(still covered by its own pre-existing tests) and added `scoreYoutubePresenceFromChannel` instead, scoring only
what's actually measured: channel exists (40, foundational), subscribers (≥1000: +20, ≥100: +10), total videos
(≥20: +20, ≥5: +10), days since last upload (≤90: +20, ≤365: +10). Max 100. These thresholds are proposed, not
validated against a real channel — reasonable starting points, not holy writ.

**Schema**: migration `0036` adds `channel_id`, `channel_title`, `last_upload_at`, `match_confidence`,
`check_status`, `unavailable_reason` to `youtube_presence_audits` (additive/nullable, same idiom as 0034/0035).
`channel_url` already existed and is reused as-is. Emitted `db/prod-fixes/0036-{precheck,apply,rollback}-prod.sql`
— **apply before deploying this task's code** (the 6/7 Oct lesson); not run from Claude Code.

**Follow-up 1 — `entityScore` → `null` default** (`lib/trust/trust-scorer.ts`): a never-audited brand (no
`brandEntityScores` row) now gets `entityScore: null`, not `0` — so the Overall Trust Score's "all components
absent → insufficient data" state (added in #34, but previously unreachable because entityScore always
contributed a real 0) can actually fire. Bondi (a real 2/10 row) is unaffected: `"2.00"` is truthy as a
stored string regardless of numeric value, so the real-row branch is unchanged — confirmed by a dedicated
test (`entityScore` stays 20/100). A genuinely-measured entity score of exactly 0/10 also stays `0`, not
`null` (same truthy-string check, unaffected by numeric value).

**Follow-up 2 — Knowledge Panel / Wikidata stubs neutralized** (new `TRUST_CHECK_IMPLEMENTED.knowledgePanel`/
`wikidata`, both `false`): `refreshEntityScore` only calls `checkKnowledgePanel`/`checkWikidata` and only
writes their columns when the respective flag is true — previously it always wrote a fabricated `false`.
`entity-score/route.ts` additionally nulls out `knowledgePanelPresent`/`wikidataEntryPresent` in its response
regardless of what's already stored (so a stub-written `false` already sitting in a dev row can't leak
through either) and returns `knowledgePanelImplemented`/`wikidataImplemented` flags; the page renders the
shared `NotYetMeasuredCard` in place of each card while its flag is false.

**Drive-by bug found and fixed while touching this route**: `entity-score/route.ts` was reconstructing
`auDirectoryPresence` from the stub directory-checker's `hipagesPresent`/`yellowPagesPresent`/etc columns
(always false) and using it to **overwrite** the real `auDirectoryPresence` jsonb column — written by the
real technical-audit pipeline (`lib/brand-entity/au-directory-aggregate.ts`) and already present via
`...latest` — meaning the Directory Presence row on this page always showed "0 directories" regardless of
the real, already-correct data sitting right next to it. Removed the reconstruction; the real data now flows
through unmodified. `checkDirectories` itself (the stub) is untouched — out of this task's named scope — but
its output no longer clobbers real data downstream.

**Verification for Sri** (after deploy, on a brand with a real channel — not Bondi): run Refresh, confirm
real subscriber/video counts and the channel link appear and the match is correct. Then on Bondi: confirm
the honest "No confirmed YouTube channel found" state, not a fake score.

## 36. Live test found a name-only YouTube false match — matching now requires domain corroboration (2026-10-09)

**Found in live testing of #35.** The 0.6 name-only match grabbed the wrong channel: for brand "Bondi
Plumbing" it matched a channel *named* "Bondi Plumbing" whose actual content — video descriptions linking
`getplumbing.com.au` — belongs to a different company, "Get Plumbing". The match was scored 40/100 "Medium"
(see #35's recalibration below) and fed into the Overall Trust Score. The 60%-confidence disclosure correctly
prompted the user to catch it, but a name-only match must never be trusted/scored in the first place. Name is
not identity.

**Confidence tiers redefined** (`lib/trust/youtube-channel-lookup.ts`). Name similarity (`scoreChannelMatch`,
unchanged internally) is now only a "worth enriching" signal — `MIN_NAME_SIMILARITY_TO_ENRICH = 0`, any
nonzero relevance is worth one `channels.list` + one `playlistItems.list` call; it is **never** sufficient to
confirm a match on its own. Confirmation now requires **domain corroboration**: `extractDomains()` scans the
channel's `description` + `customUrl` (from `channels.list`) and up to 5 recent video descriptions (from
`playlistItems.list(part=snippet, maxResults=5)`, ~1 extra quota unit) for real, non-generic domains (a
hardcoded exclusion list filters out youtube.com/social platforms/link-shorteners) and compares them to the
brand's own domain:
- Brand's domain (or a subdomain either direction) found → **`confirmed`** (`confirmedVia: "domain"`).
- A different real domain found, brand's own absent → **`unconfirmed`** (`reason: "domain_mismatch"`) — the
  live Get Plumbing case, exactly reproduced as a test.
- No real domain either way → **`unconfirmed`** (`reason: "no_domain_signal"`) — name-only, not enough to
  trust.
- `not_found` (no candidate had even nonzero name relevance) and `unavailable` are unchanged from #35.

**`unconfirmed` is never scored and never in the Overall Trust Score**: `buildYoutubePresenceAuditRow` sets
`presenceScore: null` for this status (the candidate's identity/stats ARE stored, for the confirm/correct UI
only) — `lib/trust/trust-scorer.ts` already excludes a null `youtubePresenceScore` from the average, so no
change was needed there; this is literally the existing "insufficient data" exclusion applied to a new case.
The YouTube Presence page shows an amber "We found a channel that might be yours — confirm it's correct to
score your YouTube presence" card with the candidate's title/link/stats and an inline confirm form, no score,
no scorecard. This disclosure pattern is kept (as instructed) for the genuinely-uncertain case; the
`confirmed` state no longer carries a hedging "correct before trusting" caveat since confirmation now means
something — though a correction form stays available there too, in case domain corroboration was itself a
false positive.

**Recalibrated scoring** (`lib/trust/youtube-auditor.ts`'s `scoreYoutubePresenceFromChannel`) — the live
dormant channel (0 subs, 1 video, upload 12 years ago) scored 40/100 "Medium" purely because "channel exists"
alone was worth 40 of the old formula's 100 points. Existence now contributes only 10; subscribers/videos/
recency each contribute up to 30: `10 + (≥1000 subs:30/≥100:15/else 0) + (≥20 videos:30/≥5:15/else 0) +
(≤90d:30/≤365d:15/else 0)`, max 100. The live dormant case now scores **10 → Low** (confirmed by test); a
real active channel (500 subs, 15 videos, upload 30 days ago) scores 70 → High; a modest one (150 subs, 4
videos, 100 days) scores 40 → Medium. Proposed, not validated against a large sample of real channels.

**User-confirmed channel (PART C)**: new `brands.youtube_channel_url` (migration `0037`, additive/nullable) —
when set, `checkYoutubePresence` resolves it directly via `channels.list(id=... | forHandle=...)` (1 quota
unit, `confirmedVia: "user_url"`, `matchConfidence: 1`) and skips the fuzzy search entirely. Set via the same
"Refresh" endpoint (`POST /api/brands/[brandId]/youtube-presence/refresh`) with an optional `{ channelUrl }`
body — persisted to the brand row first, then used immediately; the monthly cron also reads it going forward,
so a confirmed brand never pays the ~102-unit fuzzy-search cost again. Only `/channel/<id>` and `/@handle`
URL forms are resolved; legacy `/c/` and `/user/` URLs return `null` (not `unavailable` — the input was the
problem, not the API) and fall through to the fuzzy search. `youtube_presence_audits.check_status`'s CHECK
constraint is widened (same migration) to allow the new `'unconfirmed'` value.

**Pre-check copy** (confirmed already correct, not re-broken): the `!data` branch (no row at all — never
checked) already said "Not checked yet" / "Click Refresh..." from #35's own build, not the premature "No
YouTube channel found" the task description was concerned about — tightened further to "Not measured yet"
and pinned with a regression test so it can't drift back.

**Schema**: migration `0037` — `db/prod-fixes/0037-{precheck,apply,rollback}-prod.sql` emitted, not run;
apply before deploying this code (6/7 Oct lesson).

**`/trust` stays out of nav** (confirmed unchanged).

## 37. The `domain_mismatch` sub-case rendered the soft no-signal copy, not the stronger finding it actually was (2026-10-10)

**Live, verified 10 Oct, on #36's own deploy.** For brand Bondi Plumbing, the only candidate channel is
*named* "Bondi Plumbing" but its single video description (31 Jul 2014) reads *"Get Plumbing PTY Ltd based
in Chatswood … http://www.getplumbing.com.au/"* — a different company, with Bondi's own domain
(`bondiplumbing.com.au`) absent. The tile rendered the generic unconfirmed copy ("might be yours — confirm
it's correct … nothing on the channel confirms it's this brand's"). That wording is for the genuinely-
ambiguous `no_domain_signal` case; this one is stronger — a different business's domain was *positively*
found.

**Diagnosis (code-level, not a live DB read — see below).** Tried the read-only `youtube_presence_audits`
SELECT this task asked for first; the `DATABASE_URL` available in this environment turned out to point at a
**local** Postgres instance literally named `visibleau_prod`, not the real Neon production database — and it
doesn't even have the `check_status` column (added by migrations 0036/0037), confirming it's a stale local
artifact, not a usable mirror of whatever Sri saw live. **Flagging this plainly rather than fabricating a row
quote.** Fell back to tracing the code directly: ran the actual `extractDomains()` function against the exact
described text (`"Get Plumbing PTY Ltd based in Chatswood … http://www.getplumbing.com.au/"`) — it correctly
returns `["getplumbing.com.au"]` (confirmed by a pinned regression test). **Extraction was never broken —
PART B′ does not apply.** The real bug: `checkYoutubePresence` *did* compute `reason: "domain_mismatch"`
correctly, but `buildYoutubePresenceAuditRow` discarded both `reason` and the actual conflicting domain
before writing the row — neither was ever persisted or returned by the GET route, so the UI had no way to
distinguish `domain_mismatch` from `no_domain_signal` even though the backend had already told the
difference apart correctly.

**Fix (display + logic only, confirmed no migration needed)**: `checkYoutubePresence`'s outcome now also
returns `conflictingDomain: string | null` (the actual detected domain). `buildYoutubePresenceAuditRow`
persists `[reason, conflictingDomain?]` via the **already-unconstrained `gaps` jsonb column** — no new
column, no CHECK-constraint change (the task's suggested `unavailable_reason` column was checked and
rejected: migration 0036 added a `CHECK (... IN ('missing_api_key','quota_exceeded','network_error'))` on
it, so storing `"domain_mismatch"` there would violate the constraint; `gaps` has no such constraint and
already means "short textual detail about the check"). The GET route now also returns `brandDomain`
(already-fetched brand data) for the "(not {brandDomain})" wording. The page reads `gaps[0]`/`gaps[1]` to
render two distinct headers — `domain_mismatch`: *"We found a channel with this name, but it looks like a
different business"* + *"the channel links to {domain} (not {brandDomain}), so it's probably not yours"*;
`no_domain_signal`: unchanged soft *"might be yours"* wording — both still render the unconfirmed/unscored
treatment (no score, excluded from the Overall Trust Score) and both keep the confirm-your-URL override
(verified it's a single shared form instance, not duplicated per branch, so PART C's override was never at
risk of being dropped from either sub-case).

**Plain deploy — no migration.** Confirmed: no new column, `gaps`'s existing jsonb type already accepts any
array shape. `/trust` confirmed still not in nav.

## 38. Hallucination detection is a hollow scaffold — `is_accurate` is never written (2026-10-10)

**Found by the Hallucination Incidents diagnostic.** `detectHallucinations()`
(`lib/trust/hallucination-detector.ts`) only inserts an incident when `citations.is_accurate = false`. A
repo-wide grep for `isAccurate:`/`hallucinationFlags:` as write targets turned up exactly one hit — the
column definitions in `db/schema/citations.ts` — and nothing else. **No code anywhere ever writes
`citations.is_accurate` or `hallucination_flags`.** There is no fact-extraction and no cross-engine
comparison implemented. The column stays `NULL` on every row ever inserted, `WHERE is_accurate = false` can
never match a `NULL`, and `hallucination_incidents` is therefore **permanently empty for every brand**,
regardless of whether that brand's facts are actually consistent or wildly wrong. *"No hallucinations
detected — your brand facts are consistent across N AI responses"* presented a feature that measures nothing
as a large, clean, measured sample — the same class as the LinkedIn/YouTube/Consensus stubs (§34), but the
most complete instance of it, since there's no real detection engine behind it at all.

**Sri's decision: neutralize, don't launder.** A nicer (deduped) denominator on a claim from a detector that
does zero detection is still a false claim. The real detector (fact extraction + cross-engine consistency) is
a separate future build — nothing of it was built here.

**Fix — Part A (gate behind the flag).** Added `hallucinationDetection: false` to `TRUST_CHECK_IMPLEMENTED`
(`lib/trust/stub-implementation-status.ts`), same pattern as the other stubs. `app/api/brands/[brandId]/hallucinations/route.ts`
now returns `NOT_YET_IMPLEMENTED_RESPONSE` before touching the DB while the flag is false; the sub-page
(`app/(auth)/brands/[brandId]/trust/hallucinations/page.tsx`) renders the shared `NotYetMeasuredCard` instead
of "No hallucinations detected / consistent across N". The Trust headline (`app/api/brands/[brandId]/trust/route.ts`)
gates `riskLevel`/`riskRationale` on the same flag, ahead of the existing `citationCount === 0` check, so the
"clean record" framing can no longer render there either — it now reads "Hallucination detection hasn't been
built yet ... No score has been measured."

**Fix — Part B (stop the live inflation of the Overall Trust Score).** §32 (`92b92b1`) excluded
`100 − hallucinationRisk` from `overallTrustScore` only when `citationCount === 0`. Because `hallucinationRisk`
is mathematically always `0` (the incidents table is always empty), any brand with `citationCount > 0` — e.g.
Bondi's 2620 — was having a **phantom 100** averaged into its Overall Trust Score, for a check that never
actually ran. `lib/trust/trust-scorer.ts` now gates the term on `TRUST_CHECK_IMPLEMENTED.hallucinationDetection`
first (`citationCount > 0` stays as a second, independent guard for once the real detector ships, so "0 of 0
checked" still can't read as clean even then). Verified in `tests/phase2/sprint5/trust-scorer.test.ts` with a
Bondi-shaped fixture (`citationCount: 2620`, entity + LinkedIn both present): the average changes from
`avg([100, 90, 90]) = 93` to `avg([90, 90]) = 90` once the phantom term is excluded. Bondi's own live
before/after numbers were not pulled — see the note on Neon access below.

**Fix — Part C (stop overstating coverage elsewhere `citationCount` is shown).** Added
`getBrandDistinctCitationCount` (`lib/trust/citation-coverage.ts`) — the persisted, aggregate-query
equivalent of `lib/audit/organic-citations.ts`'s `selectOrganicCitations().distinctSampleCount`: `run_number
= 1` (collapses the ~4 cache-replay rows per prompt) and not a branded-prompt call (`is_branded_prompt IS NOT
TRUE`, treating pre-migration `NULL` rows as organic per their existing documented semantics). `citation-sources`
and `evidence` routes switched to it, so neither shows the ~5x replay-inflated raw count as a coverage figure.
`getBrandCitationCount` (the raw, replay-inflated count) is kept — it's still correct for its original job as
an audit-progress-bar denominator and for the `citationCount === 0` "any coverage at all" gate, which only
needs to distinguish zero from nonzero, not report an exact size.

**Part D — tests.** New `tests/unit/trust/hallucination-detection-neutralized.test.ts` covers the flag, both
gated surfaces (route + page + headline), and `getBrandDistinctCitationCount`'s filter shape. Updated
`tests/phase2/sprint5/trust-scorer.test.ts` (4 assertions changed to reflect the term being excluded
regardless of `citationCount`), `tests/unit/trust/honest-headline-and-overall-score.test.ts` (2 assertions
re-anchored to the new if/else structure), and `tests/unit/trust/honest-empty-states.test.ts` (citation-sources/evidence
now expect `getBrandDistinctCitationCount`). RED→GREEN verified via `git stash` on the 9 implementation files:
17 new/changed assertions failed against the pre-fix code, all passed restored; full `tests/unit/trust` +
`tests/phase2/sprint5` suite: 247/248 (the one failure is the same pre-existing, unrelated local-DB index
check seen throughout this session). `pnpm typecheck && pnpm build` green. `/trust` confirmed still not in
nav.

**Part E — the real detector (scoped, not built).** A genuine hallucination check would extract factual
claims about the brand from each engine's response (price, location, founder, products, etc.), compare them
across engines/responses — and ideally against a ground-truth source of the brand's real facts, which doesn't
exist anywhere in this system yet — then write `is_accurate`/`hallucination_flags` on the `citations` rows
before flipping `TRUST_CHECK_IMPLEMENTED.hallucinationDetection = true`. This adds a real LLM cost per audit
(an extra claim-extraction pass per response, plus either a comparison pass or a ground-truth lookup) and
needs that ground-truth source decided before it can be scoped further.

**Neon access note (same discipline as §37).** Pulling Bondi's live before/after numbers would have required
either Bondi's `organization_id` (RLS on `audits`/`citations` blocks the ordinary app-role connection without
it) or the RLS-bypassing service-role credentials — the permission system blocked that escalation during the
diagnostic and this task kept the same discipline rather than retrying it another way. The unit-test fixture
above proves the mechanism with the real shape of the live case instead.

## 39. Overall Trust Score averaged in stale pre-honesty-pass stub rows — LinkedIn and Consensus were gated in the UI, never in the scorer (2026-10-11)

**Found by the overall-score diagnostic — arithmetic closed exactly.** Bondi's Overall Trust Score read **40**,
not the ~20 its only real, live component (Entity 2/10 → 20/100) should have produced alone. §38 gated the
hallucination term in `computeTrustSummary` on `TRUST_CHECK_IMPLEMENTED.hallucinationDetection`, but
**`linkedinPresenceScore` and `consensusScore` were never gated at all** — `trust-scorer.ts` read whatever
rows already existed in `linkedin_presence_audits`/`brand_consensus_checks` unconditionally. The honesty pass
(§34) stopped the LinkedIn/Consensus **route and cron** from writing *new* fabricated rows, and the **tiles**
already showed "not yet measured" — but nothing ever excluded the **pre-gate stub rows already sitting in
the tables**, and the scorer kept reading them. For Bondi: a stale LinkedIn stub row (`presenceScore: 0`,
from the old `scoreLinkedinPresence({companyPageExists: false, ...all 0})` stub input) and a stale Consensus
stub row (`consistencyScore: 100`, from the old `computeConsistencyScore({nameMatch: true, ...all true})`
stub input — the code comment literally says it "fabricates a 100/'top tier' consistency score every month").
`avg([20, 0, 100]) = 40` — exact match to the live number. Entity was confirmed canonical (same `scoreOf10`
column the Brand & Entity tile reads, no drift) and YouTube was confirmed correctly null (the latest row is
`unconfirmed`, `presenceScore: null` per §37) — neither was the source.

**Fix.** Added a single shared `gated<T>(implemented: boolean, value: T | null): T | null` helper
(`lib/trust/trust-scorer.ts`) and applied it to every stub-backed component — `linkedinPresenceScore`,
`consensusScore`, `youtubePresenceScore` (defensive — a no-op today since `youtubePresence` is `true` and an
unconfirmed row is already `null` at the source, but it protects against a future re-neutralization leaking a
stale *confirmed* score the same way LinkedIn/Consensus just did), and the existing hallucination term
(rewritten through the same helper for consistency). This is the single gate point: a future stub-backed
component added to the average without going through `gated()` is now the only way this class of bug could
recur.

**Verified via a Bondi-shaped fixture** (`tests/phase2/sprint5/trust-scorer.test.ts`): entity 20, stale
LinkedIn row (0), stale Consensus row (100), both flags false, no YouTube row → **40 (pre-fix) → 20
(post-fix)**. Also verified: all components gated/absent → `null` ("Insufficient data to score"), not 0 and
not a laundered number; the gate is flag-*conditional*, not an unconditional null — a confirmed YouTube row
(flag true) still contributes (65 → overall 65), and flipping `consensusScore` true via `vi.doMock` lets its
real averaging math (67) through unchanged. `gated()` itself unit-tested directly as a pure function. RED→GREEN
via `git stash` on `trust-scorer.ts` alone: 8 of 19 assertions failed against the pre-fix scorer (one of them
literally `TypeError: gated is not a function`, since the helper didn't exist yet), all 19 passed restored.
`tests/phase2/sprint5` + `tests/unit/trust`: 262/263 (the one failure is the same pre-existing, unrelated
local-DB index check seen throughout this session). `pnpm typecheck && pnpm build` green. Plain logic change,
no migration, no row deletes, no RLS bypass. `/trust` confirmed still not in nav.

**Landmine for the future real builds (do not resolve here).** The fabricated stub rows (LinkedIn `0`,
Consensus `100`) are now inert — the scorer nulls them and the tiles already gate on the flag — but they still
physically exist in `linkedin_presence_audits`/`brand_consensus_checks`. When the real LinkedIn/Consensus
checks eventually ship and their flags flip to `true`, the scorer will start reading these same stale
fabricated rows again until a fresh real audit overwrites them for that brand — a fabricated `0` or `100`
could briefly resurface for any brand whose real audit hasn't run yet. **Before flipping either flag**, the
stub rows must be purged or guaranteed superseded by a fresh real audit first (snapshot → delete, or a
backfill sweep) — this needs a deliberate, Sri-authorized prod write with a backup, not something to do
casually alongside the flag flip. Not resolved here; no rows were touched or deleted.

## 40. Evidence Archive persisted cache replays as distinct evidence — real data, but ~5× inflated at write time (2026-10-11)

**Confirmed by the Evidence Archive diagnostic.** The data is genuinely real LLM output — no mock path in
production (`lib/llm/index.ts` only returns `MockLLM` when `LLM_MODE === "mock"` or `NODE_ENV === "test"`,
neither true in prod). But the archive listed cache replays as distinct snapshots, and unlike the Responses-tab
bug (§25, task TTT, `996223d` — a query-time display issue over `citations`, which still has `run_number`),
this one is **persisted**: `captureEvidenceSnapshots` (`lib/trust/evidence-archiver.ts`) copied **every**
`citations` row for an audit — all ~4 byte-identical cache-replay rows per `(engine, prompt)` pair, same cache
mechanism as task SSS/§24 (`sha256(prompt + model)`, no run index) — into `evidence_snapshots`, which has
**no `run_number` column of its own**. The replay information was lost at insert, permanently. The read route
(`ORDER BY captured_at DESC LIMIT 200`, no dedupe) then showed each real response ~5×, and with ~80% of that
200-row window being duplicates, far fewer than 200 distinct responses ever surfaced — on a screen whose whole
purpose is to substantiate trust.

**Fix — write-time.** `captureEvidenceSnapshots` now filters the audit's citations to `run_number = 1` before
capturing (`and(eq(citations.auditId, auditId), eq(citations.runNumber, 1))`) — confirmed `run_number` is
present and populated on every `citations` row (`db/schema/citations.ts`, `lib/audit/run-audit-inline.ts`'s
`runOneCall`), and `run_number = 1` is the one real/first call per `(engine, prompt)` pair (task SSS). Future
audits store exactly one snapshot per pair, not five; distinct prompts are unaffected (the filter removes
replays, not genuine variety).

**Fix — read-time.** Historical rows already in the table have no `run_number` to filter on, so
`app/api/brands/[brandId]/evidence/route.ts` dedupes by content instead, reusing the **existing**
`dedupeResponses()` helper from §25 (`lib/audit/dedupe-responses.ts`) — no second implementation, just mapping
`rawResponse` → the `responseSnippet` field it expects. The LIMIT-window problem was handled by
over-provisioning the raw fetch: `.limit(DISPLAY_LIMIT * RUNS_MAX)` (`RUNS_MAX` imported from
`lib/llm/tier-engines.ts`, not a magic number) before `dedupeResponses(...).slice(0, DISPLAY_LIMIT)` — a plain
`DISPLAY_LIMIT`-row fetch would still have mostly collapsed to ~1/5th as many distinct responses, since
replicas of a group cluster together in `captured_at` order.

**Tests** (`tests/unit/trust/evidence-archive-dedup.test.ts`): write-time — a mocked, already-filtered
citations input produces exactly one snapshot per `(engine, prompt)`; read-time — source assertions that the
route imports `dedupeResponses` and fetches `DISPLAY_LIMIT * RUNS_MAX`; and a direct behavioral proof of the
route's fetch+dedupe+slice composition — 1000 raw rows (200 distinct groups × 5 replicas) → all 200 distinct
groups survive, versus a contrasting "naive `LIMIT 200` before dedupe" test showing that approach collapses to
fewer than 100. RED→GREEN via `git stash` on both implementation files: 4 of 8 new tests failed against the
pre-fix code, all 8 passed restored. `tests/unit/trust` + `tests/unit/audit` + `tests/phase2/sprint5`:
316/317 (the one failure is the same pre-existing, unrelated local-DB index check seen throughout this
session). `pnpm typecheck && pnpm build` green. `/trust` confirmed still not in nav.

**Historical backfill — optional, Sri-gated, not run.** The replay rows still physically exist in
`evidence_snapshots`; the read-time dedupe already makes the screen honest regardless, so this is storage
cleanup, not a correctness requirement. Emitted `db/prod-fixes/0040-{precheck,apply,rollback}-prod.sql`:
precheck reports total rows, distinct groups, and the largest duplicate-group sizes (a sanity check against
the expected ~5×); apply deletes all but the newest row (by `captured_at`, tiebroken by `id`) per
`(brand_id, engine, prompt, raw_response)` group — matching exactly what the read-time dedupe already keeps,
so applying it changes nothing a user sees, only what's stored; rollback notes this is an unrecoverable
`DELETE` with no SQL-level undo — a Neon snapshot before applying is required, not optional. Not run.

## 41. Citation Source Intelligence: undeduped per-audit wall, mostly-"other" classifier, unlabeled (2026-10-11)

**Confirmed by the diagnostic.** `/trust/citation-sources` had three independent bugs. (1) **The 5th surface of the
`lib/llm/cache.ts` 48h replay bug** (after §23/§24/§36/§39/§40): `buildCitationSourceIntelligence`'s
`auditCitations` query had no `run_number = 1` filter, so every card's count included the ~4 cache replays —
*and* `citation_source_intelligence`'s unique index (`csi_unique_with_audit`) is scoped per `audit_id`, so
every completed audit wrote its own permanent row set with no rollup, and `citation-sources/route.ts` read
**all** of them (no `audit_id` filter), producing the ever-growing wall of per-audit duplicate cards. (2) **The
classifier was too narrow**: `lib/visibility/citation-source-classifier.ts`'s `URL_PATTERNS` was missing the
real AU trade directories/marketplaces (hipages, oneflare, airtasker, serviceseeking) — `au_directory`'s own
seed description (`db/seed/citation-source-affinity.ts`) already names Hipages as an example, but the regex
never matched it, so real citations fell through to "other" by default. (3) **The screen never stated what it
measures** — "Covered"/"gap" looks like overall brand visibility but actually describes the brand's presence
within one source category for one engine.

**Fix — Part A (dedupe + roll up).** `buildCitationSourceIntelligence` now filters to `run_number = 1`
(matching §38–§40) before grouping/counting. It also writes the aggregate slot the schema already reserved but
nothing ever used — `csi_unique_aggregate ON (brand_id, engine, source_type) WHERE audit_id IS NULL` — via
`onConflictDoUpdate` with `targetWhere` to match that partial index, upserting one rolling "current" row per
`(engine, sourceType)` with each new audit's own numbers (latest-audit, not a multi-audit window — the
simplest honest "current" view). The per-audit rows are **still written unchanged** — two other real consumers
(`lib/communication/narrative-generator.ts`'s `source_type_gaps` narrative line,
`lib/platform/local-ai-trust-scorer.ts`'s `au_directory` count, and `inngest/functions/render-report-pdf.ts`'s
PDF summary) read them historically, and removing the per-audit writes would have broken all three. Each of
those three now explicitly excludes the new aggregate row (`isNotNull(auditId)`) so it can't double up against
their existing per-audit-based counts — a drive-by fix beyond the original diagnostic's scope, found by
checking who else reads this table before touching the write path.

The new `getCurrentCitationSources` (`lib/trust/citation-intelligence.ts`) is the read side: aggregate rows if
any audit has completed under this code, else falls back to the single most-recent historical audit's own row
set — so the screen never regresses to empty immediately after deploy, before the next audit runs, and the
duplication wall is gone immediately either way. **What's fixed immediately vs. at next audit**: the
*duplication* (one card per source type, not a growing pile) is fixed the moment this deploys, even on
pre-existing data. The *counts* (still replay-inflated on rows written before this fix) and *classification*
(still narrow-classifier "other" on rows written before Part B) only become accurate once each brand's next
audit runs under this code — `citedSourceType` is stored at classification time, not recomputed retroactively.

**Fix — Part B (classifier).** Added `hipages.com.au`, `oneflare.com.au`, `airtasker.com`,
`serviceseeking.com.au` → `au_directory`; `business.google.com`, `g.page` → `review_site` (same local-business/
review data surface as the existing `google.com/maps` pattern — not a new `CitedSourceType` union member, so no
schema/type change). The final `return "other"` default is kept — an unrecognised domain, or a citation with no
extracted URL at all, is honestly "other".

**Fix — Part C (label).** Added a one-line clarifier under the page header: reports the sources AI engines
cite for category-level questions in this brand's space, not the brand's own visibility; "Covered" means the
brand appears *within* that source category. `SourceGapCard` now renders a neutral fallback line when
`sourceAffinityNote` is null (true for every "other" card, since `SOURCE_AFFINITY_NOTES` has no "other" entry)
instead of silently rendering nothing.

**Fix — Part D (badge stability).** Already satisfied by Part A's write-path structure: `gapSeverity` is
computed once per `(engine, sourceType)` group from that one audit's own `share`/`brandPresent`, and the exact
same values are written to both the per-audit row and the aggregate row in the same call — so the aggregate's
badge reflects one audit's real signal, not a mix of unlabeled duplicates from different audits.

**Tests.** New `tests/integration/citation-source-aggregate.integration.test.ts` runs against a real local
Postgres (`visibleau` dev DB) — proves the `run_number = 1` filter (15 replay rows → citationCount 3), the
`onConflictDoUpdate`/`targetWhere` partial-index upsert actually replacing (not duplicating) the aggregate row
across two simulated audits, and `getCurrentCitationSources`'s aggregate-then-fallback read, including the
fallback path with the aggregate rows deleted. New assertions in `tests/phase2/sprint3/citation-source-classifier.test.ts`
for the four newly-classified domains + Google Business Profile. New
`tests/unit/trust/citation-source-intelligence-label.test.ts` for the label/fallback-note copy and the three
drive-by consumer guards. RED→GREEN via `git stash` on all 9 implementation files: 13 of 24 targeted assertions
failed against the pre-fix code (including two `TypeError: getCurrentCitationSources is not a function`),
all passed restored. One existing task-#38 test needed a regex loosened (it checked for an exact `import {
getBrandDistinctCitationCount } from "@/lib/trust"` line, which Part A's new combined import broke — fixed to
match the imported name, not the exact line). Full `tests/unit/trust` + `tests/phase2/sprint5` +
`tests/phase2/sprint3/citation-source-classifier.test.ts` + both citation-source integration files: 302/303
(the one failure is the same pre-existing, unrelated local-DB index check seen throughout this session).
Separately confirmed (via `git stash`, not just assumed) that ~70 failures seen in a broader sprint3/integration
run are pre-existing local-dev-DB schema drift (`brands.youtube_channel_url`, added by migration 0037, was
never manually applied to the local `visibleau` dev DB) — identical with or without this task's changes, so
not caused by this work. `pnpm typecheck && pnpm build` green. No migration (both unique indexes already
existed). `/trust` confirmed still not in nav.

**Structural note (not built here).** This is the **5th** independent re-read of `citations` that forgot to
dedupe (§23/§24/§36/§39 + this one). Recommend a dedicated follow-up refactor: a single canonical deduped-citations
selector every surface reads through, so a 6th can't reintroduce the same bug blind to the first five fixes.

## 42. Before pushing §41 (`cbe2868`): verify `csi_unique_aggregate` exists in prod, make the upsert non-fatal (2026-10-11)

**Why this check mattered.** §41's write-path added `onConflictDoUpdate({ target: [...], targetWhere: sql\`audit_id
IS NULL\` })` to `buildCitationSourceIntelligence`. Postgres only accepts an `ON CONFLICT ... WHERE` clause when a
**matching partial unique index** actually exists — if prod lacks `csi_unique_aggregate`, every audit's
`buildCitationSourceIntelligence` call throws `there is no unique or exclusion constraint matching the ON CONFLICT
specification`, which would have broken **audits**, not just this one screen. The integration test proved the
mechanism against the local `visibleau` dev DB, which this session already found drifts from prod (§37's
`youtube_channel_url` column, confirmed missing locally). Same code-ahead-of-schema risk class as the 0034–0037
incidents.

**Part A — where the index is defined, and its applied-to-prod status.** `csi_unique_aggregate ON
citation_source_intelligence (brand_id, engine, source_type) WHERE audit_id IS NULL` is defined identically in
**two** places: `db/migrations/0016_phase2_sprint5_trust.sql` (the original Phase 2 Sprint 5 Trust migration that
creates the table) and `db/migrations/0010_baseline-reconcile.sql` (an earlier-numbered, idempotent `IF NOT EXISTS`
catch-up migration that re-states the same table/indexes — both are drizzle-tracked, per `db/migrations/meta/0010_snapshot.json`
and `0011_snapshot.json` both showing the index). Applied-to-prod status: **probably-applied, not confirmed**. The
table and its sibling index `csi_unique_with_audit` almost certainly exist in prod — the feature has been visibly
live all session (Bondi's real, if inflated, per-audit cards), which is only possible if inserts against
`csi_unique_with_audit` have been succeeding. Since `csi_unique_with_audit` and `csi_unique_aggregate` are adjacent
statements in the *same* migration file, if the migration ran far enough to create the table and the first index, it
almost certainly ran the next statement too — but this project's own history (the exact `youtube_channel_url` drift,
and the original AA-tables-wrong-types incident this document opens with) proves narrow, partial drift of exactly
this shape is a real, repeated failure mode here, not a hypothetical. Only migrations 0034–0037 were directly
confirmed applied to prod this session; 0012–0033 (which includes 0016) were not. Verdict: **requires verification
before relying on it**, not an assumption either way.

**Part B — emitted, not run.** `db/prod-fixes/0041-csi-aggregate-index-{precheck,apply,rollback}-prod.sql`.
Precheck lists every index on `citation_source_intelligence` (confirm `csi_unique_aggregate`'s exact `indexdef`
matches `(brand_id, engine, source_type) ... WHERE (audit_id IS NULL)`) and confirms the aggregate slot has never
been written to (`count(*) WHERE audit_id IS NULL` should read 0 pre-deploy). Apply (only if missing):
`CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS csi_unique_aggregate ON citation_source_intelligence (brand_id,
engine, source_type) WHERE audit_id IS NULL` — `CONCURRENTLY` must run as its own standalone statement, not inside a
transaction. Rollback: `DROP INDEX CONCURRENTLY IF EXISTS` (index-only, doesn't touch any rows already written under
it). Order: snapshot → precheck → apply only if missing → re-precheck to confirm → **then** push `cbe2868` and this
follow-up commit together.

**Part C — the aggregate upsert made non-fatal, defence in depth regardless of Part A/B's outcome.** The
`onConflictDoUpdate` call in `buildCitationSourceIntelligence` is now wrapped in its own `try/catch`, separate from
the per-audit insert above it (which is unaffected and always still runs). On failure, logs a structured
`console.error` (`brandId`, `auditId`, `engine`, `sourceType`, the error message — no secrets) and continues — the
aggregate row is a display optimisation, not the source of truth: `getCurrentCitationSources` already falls back to
the latest audit's per-audit rows when no aggregate row exists, so a failed upsert degrades gracefully to "duplicate
wall gone, but not yet reading the aggregate" instead of failing the audit. New
`tests/unit/trust/citation-intelligence-aggregate-resilience.test.ts`: a mocked `onConflictDoUpdate` that throws the
real Postgres "no unique or exclusion constraint" message — confirms `buildCitationSourceIntelligence` still
completes, the per-audit row is still written, and the structured error is logged. RED→GREEN via `git stash` on
`citation-intelligence.ts` alone: both new tests failed against the pre-try/catch code with that exact thrown error,
both passed restored. Re-ran the full task-§41 suite including the real-DB integration test (confirms the try/catch
doesn't change the happy-path behaviour where the index does exist): 304/305 (same pre-existing unrelated index
check). `pnpm typecheck && pnpm build` green.

**Part D — scope-only check on the three per-audit consumers (read-only, nothing changed).** All three read
**across every historical audit**, not scoped to one: `narrative-generator.ts`'s `source_type_gaps` case and
`render-report-pdf.ts`'s PDF summary both do `ORDER BY calculatedAt DESC LIMIT 20` with no audit filter (now also
excluding the new aggregate row) — capped at 20 rows total, but those 20 can span however many audits. More notably,
`local-ai-trust-scorer.ts`'s `au_directory` query has **no limit at all** — genuinely unbounded across every audit
ever run for the brand. It computes `citationScore = presentAuDir / totalAuDir × 100`, one of five weighted
components (`gmb` 25%, `directory` 25%, `abn` 15%, `nap` 20%, `citation` 15%) summed into `localAiTrustScore`
(0–100), stored on `agent_readiness_scores.local_ai_trust_score` via `inngest/functions/score-agent-readiness.ts`.
Rendered on two live pages: `/brands/[brandId]/health-check` (as `localAuthorityScore`) and
`/brands/[brandId]/retrieval/agent-readiness`. This is the same accumulation pattern §41 fixed for the Citation
Source Intelligence screen itself, just not yet fixed here — flagged as a candidate for the same aggregate-row read,
scope only, nothing changed in this task.

**Task #44 addendum — now a *definitional* divergence, not just an accumulation-pattern one.** §43's Part B changed
`buildCitationSourceIntelligence` to count **every** cited source in a response's `citedSources` array (via
`classifyCitedSources`), while `local-ai-trust-scorer.ts`'s `au_directory` query still reads the single, first-only
`citations.citedSourceType` column written by `classify-citation-sources.ts`. The two surfaces now compute "how many
AU-directory citations does this brand have" two different ways — the Citation Sources screen's count will generally
run higher than whatever `local-ai-trust-scorer.ts` derives from the same underlying data, for the same brand, same
time period. Flagging this for the queued Local AI Trust diagnostic to pick up; not resolved here.

## 43. Perplexity's real cited sources were unreachable; one citedSourceType per response, not per source; "other" badged like a real gap (2026-10-11)

**Confirmed by the post-re-audit diagnostic**, on top of §41's dedupe/rollup/classifier fix. (1) Perplexity's
structured `citations`/`search_results` fields are non-standard, outside the OpenAI schema
`@ai-sdk/openai`'s generic client (used to call Perplexity's OpenAI-compatible endpoint) understands — never
surfaced, and `CompleteOutput` had no field to carry them regardless. Perplexity, the one search-grounded
engine, contributed 0 classified sources despite naming real AU directories/review sites in every response.
(2) `classify-citation-sources.ts` only ever classified `citedSources[0]`, so "Citations: N" counted
**responses**, not cited sources. (3) `computeGapSeverity` had no awareness of `sourceType`, so "other"
(unclassified) got the same Critical/Warning/Covered scale as a real, actionable category.

**Fix — Part A (capture Perplexity's structured sources).** The official `@ai-sdk/perplexity` provider was
evaluated first and found **incompatible**: every published version (1.x through 5.0.10 checked) depends on
`@ai-sdk/provider` 1.x or 4.x+ / `@ai-sdk/provider-utils` 2.x or 5.x+, while this project's installed
`ai@6.0.195` core (and `@ai-sdk/openai@3.0.67`, shared by the other three engines) requires
`@ai-sdk/provider@3.x` / `@ai-sdk/provider-utils@4.x` — no released version targets that generation.
`lib/llm/perplexity-impl.ts` now calls Perplexity's `/chat/completions` endpoint directly via `fetch()`,
parsing `citations` (a plain URL array) and `search_results[].url` (newer API versions) from the JSON body,
with a 2-retry/30s-timeout policy matching `generateText()`'s own default `maxRetries: 2`. Added
`CompleteOutput.citedUrls?: string[]` (shared interface; the other three engines leave it `undefined`). Both
audit runners — `lib/audit/run-audit-inline.ts` *and* `inngest/functions/run-audit.ts` (drifted from each
other before, task SS) — now merge `result.citedUrls` with `extractCitations()`'s text-pattern output via a
single new shared helper, `mergeCitedSources()` (`lib/audit/extract-citations.ts`), structured URLs listed
first since they're the more reliable source.

**Migration 0038** (`llm_response_cache.cited_urls`, nullable jsonb): `lib/llm/cache.ts`'s `setCached`/
`getCached` only ever stored/returned `response`/`tokensUsed`/`costEstimateUsd` — a cache hit on a replay
within the 48h TTL would have silently dropped a Perplexity response's structured sources on every one of the
~4 replay calls. Both functions are now also hardened to degrade gracefully (cache miss / response not
cached, logged) on **any** failure, not just a missing column — previously only `google-impl.ts` guarded its
own `getCached()` call; `openai-impl.ts`/`anthropic-impl.ts`/`perplexity-impl.ts` all awaited it unguarded,
so centralizing the guard inside `cache.ts` itself fixes that inconsistency for all four engines at once.
Emitted (apply-before-deploy, not optional this time) `db/prod-fixes/0043-llm-cache-cited-urls-{precheck,
apply,rollback}-prod.sql` — unlike §42's index check, a missing `cited_urls` column affects **every** cached
LLM call for **every** engine (via Drizzle's schema-aware `.select()`/`.insert()`), not one display feature,
so the non-fatal guard is defence in depth, not a substitute for applying first.

**Fix — Part B (count every cited source).** Chose the no-migration path: `buildCitationSourceIntelligence`
now re-classifies **every** URL in each response's `citedSources` (already a jsonb array) via
`classifyCitedSources` at aggregation time, rather than reading the single `citedSourceType` column —
deliberately re-running classification logic here instead of persisting a new per-citation-URL column.
`citedSourceType` itself is untouched (still the first-classified source) for `narrative-generator.ts`/
`render-report-pdf.ts`/`local-ai-trust-scorer.ts`'s existing per-audit reads. `brandPresent` per group is
true when either the response that cited the source also mentioned the brand, **or** the source itself
classifies as `brand_owned` — both are genuine, measured presence signals. A response with zero extracted/
structured sources still counts as one "other" unit so it isn't silently dropped from the totals.

**Fix — Part C (honest Unclassified state).** Added a fifth `GapSeverity` value, `"unclassified"` — applied
by `buildCitationSourceIntelligence` whenever `sourceType === "other"`, overriding what `computeGapSeverity`
(kept unchanged and independently testable) would otherwise have returned. "Other" stays in the share
denominator (excluding it would inflate real categories' shares past what the evidence supports).
`SourceGapCard` renders a distinct neutral badge (`GAP_CONFIG.unclassified`) instead of falling through to
`GAP_CONFIG.covered` — the previous fallback-default, which would have shown "other" as a false-reassuring
green "Covered" badge now that it's an explicit value rather than whatever `computeGapSeverity` happened to
return. The card's body text for unclassified sources states the real share plainly ("X% of this engine's
cited sources couldn't be categorised yet"). `getCurrentCitationSources` sorts unclassified cards last.

**Tests.** `tests/unit/llm/perplexity-impl.test.ts` (citedUrls parsing, search_results merge/dedupe, cost/
token parity, retry-then-succeed, exhausted-retries throw, missing-API-key, non-OK-status handling);
`tests/unit/llm/cache.test.ts` (citedUrls persist/restore, non-fatal on failure); `mergeCitedSources` cases
added to `tests/unit/audit/extract-citations.test.ts`; `tests/unit/audit/run-audit-citedurls-parity.test.ts`
(both runners use the one shared helper); `tests/unit/trust/citation-intelligence-multi-source.test.ts`
(multi-source counting, zero-source "other" fallback, "other" excluded from severity but not the denominator,
brandPresent's two conditions); a real render test in `tests/unit/trust/source-gap-card.test.tsx` (not a
source-string check — confirms "Unclassified" actually renders, not a silent fallback to "Covered"). Updated
the real-DB `tests/integration/citation-source-aggregate.integration.test.ts` and
`tests/unit/trust/citation-intelligence-aggregate-resilience.test.ts` to seed `cited_sources` (the new
classification input) alongside the old `cited_source_type` column. RED→GREEN via `git stash` on all 10
implementation files: 31 of 46 new/changed assertions failed against the pre-fix code, all 46 passed
restored. Broader regression run: confirmed (via `git stash`, not assumed) that the ~65 failures seen are
pre-existing local-dev-DB schema drift and one unrelated seed-file content check, identical with or without
this task's changes. `pnpm typecheck && pnpm build` green. `/trust` confirmed still not in nav.

**Verification note (same shape as §40/§41/§42).** Classification happens at audit time, so Bondi's screen
only reflects this fix after its **next audit** — expect Perplexity's card(s) to move from 100% "other" to
real `au_directory`/`review_site` categories once that audit's responses are classified under this code.

**Product note (scope only, not built).** OpenAI/Anthropic/Gemini are called with no web-search/grounding
tool enabled at all — their answers reflect model training-data recall, not what a user sees from
ChatGPT/Gemini with search turned on, and structurally can't produce `citedUrls` the way Perplexity now does
without that tool being added. Whether audits should enable search grounding for those three engines is a
product/cost decision for Sri, not part of this change.

## 44. Pre-push follow-up for §43 (`df5c140`): stale pre-migration cache entries, a cache-reader audit, and honest "Covered" copy (2026-10-11)

**Why this check mattered.** Bondi was re-audited the same day §43 shipped. `llm_response_cache`'s 48h TTL means
it still held Perplexity responses for the exact same prompts, written **before** `cited_urls` existed. A
re-audit inside that window would hit the cache, get `citedUrls: null` back, and Perplexity would stay 100%
"other" — §43's fix would have looked broken on the very first verification attempt.

**Fix — Part A (stale cache entries are a miss, for citation-supplying engines only).** Added
`ENGINE_SUPPLIES_STRUCTURED_CITATIONS: Record<Engine, boolean>` (`lib/llm/interface.ts`) — currently only
`perplexity: true` — a data-driven flag, not a model-string check, so a future grounded engine stays correct
automatically. `getCached` (`lib/llm/cache.ts`) now takes an `engine` parameter (threaded through all four
engine impls' call sites) and, for an engine where `ENGINE_SUPPLIES_STRUCTURED_CITATIONS[engine]` is true,
treats a cached row with `citedUrls == null` as a miss — not incrementing `hitCount`, letting the caller
re-fetch and `setCached` backfill the row with real sources. Specifically `== null` (not falsy/empty-array):
a genuinely-fetched row with `citedUrls: []` (the provider found zero citations) stays a real hit, not forced
to miss. The other three engines, which never set `citedUrls`, see `null` as their normal permanent state and
are unaffected — still a genuine hit.

**Part B — reader/writer audit (read-only, nothing changed).** The *only* active code that reads or writes
`llm_response_cache` is `lib/llm/cache.ts`'s `getCached`/`setCached` — no cleanup/expiry cron, no stats/admin
page, no script. (`scripts/db/tier1a-app-role.sql`, `rls-missing-tables.sql`, `sprint2-rls.sql` reference the
table name only for RLS/grant statements, not query logic.) Both functions use Drizzle's schema-aware
`.select()`/`.insert()` over the full `llmResponseCache` column set, so both would throw `42703` if `df5c140`
deploys before migration `0038` lands — already why §43 made both non-fatal. **Stated plainly: if `0043` is
not applied before push, every cache read/write for every engine fails (caught, logged, degrading to a
miss/no-cache), so every single LLM call across every engine hits the live API instead of the cache — roughly
5× the LLM cost per audit** (every one of the ~5 replay-eligible calls per prompt becomes a real call) until
the migration is applied, not just a Perplexity-specific cost. This is the concrete number behind §43's
"apply-before-deploy, not optional" framing.

**Fix — Part C (honest "Covered" copy).** §41's clarifier said `"Covered" means the brand appears within that
source category` — but `brandPresent` (§43, `buildCitationSourceIntelligence`) is actually true when *the
response that cited the source also mentioned the brand*, or the source itself is `brand_owned`. The former
reads as "the brand is listed on these sources"; the latter is "the engine talked about the brand while also
citing this kind of source" — a different, weaker claim. Updated the page clarifier
(`app/(auth)/brands/[brandId]/trust/citation-sources/page.tsx`) to state the real definition in one sentence.
No card-level tooltip exists beyond the one-word badge label, so nothing else needed updating.

**Tests.** Extended `tests/unit/llm/cache.test.ts`: Perplexity with `citedUrls: null` → miss; Perplexity with a
real array → hit; Perplexity with `citedUrls: []` → still a hit (not forced to miss); each of the other three
engines with `citedUrls: null` → still a hit (parameterized). Updated
`tests/unit/trust/citation-source-intelligence-label.test.ts`'s "Covered" assertion to the new copy, asserting
the old wording is gone, not just supplemented. RED→GREEN via `git stash` on all 7 implementation files: 3 of
16 targeted assertions failed against the pre-fix code, all passed restored. Broader
`tests/unit/llm` + `tests/unit/trust` + `tests/unit/audit` + the two real-DB integration tests: 296/296.
`pnpm typecheck && pnpm build` green. No new migration. `/trust` confirmed still not in nav.

**Part D — docs note for the queued Local AI Trust diagnostic.** Added to §42: `local-ai-trust-scorer.ts`
still counts via the single first-classified `citedSourceType`, while the Citation Sources screen (§43) now
counts every cited source per response — a genuine definitional divergence between the two surfaces for "how
many AU-directory citations does this brand have," not resolved here.

## 45. Citation Sources: top cited domains per card + "Retrieved" vs "Recalled" labelling (2026-10-11)

**Why.** §41/§42 made "Citations: N" and the source-category badges real, but a card still said nothing about
*which* domains made up that count, and treated a ChatGPT/Claude/Gemini "source" (no web search — a domain
the model wrote from memory) the same as a Perplexity source (a domain a live search actually returned). The
preceding diagnostic scoped two fixes: persist the top domains at aggregation time (cheaper than a read-time
rescan on every page load), and label origin. A third candidate, classifying `competitor_site`, stays
deferred — `brands.competitors` stores names, not domains, so there's nothing to match a cited URL against
without new competitor-domain capture at brand setup (product backlog).

**Part A — origin per cited source (no migration).** `CitationOrigin = "retrieved" | "recalled"` added to
`lib/audit/extract-citations.ts`. `extractCitations()` (pattern-matches URLs/domains out of model text) tags
every entry it produces `"recalled"`; `mergeCitedSources()` tags structured-URL-derived entries (a provider's
own citation metadata) `"retrieved"`. Both runners (inline + inngest) go through this one shared helper, so
there was nothing to duplicate per-runner. `resolveCitationOrigin(entry, engine)` handles **legacy rows**
written before this change, which have no `origin` field at all: returns the entry's own `origin` if present,
else falls back to `ENGINE_SUPPLIES_STRUCTURED_CITATIONS[engine]` (§44's flag) — `"retrieved"` for Perplexity,
`"recalled"` for the other three. Stored as part of the existing `citedSources` jsonb array — no schema
change for Part A.

**Part B — `top_domains` persisted at aggregation (migration `0039` / prod-fix `0044`).** In
`buildCitationSourceIntelligence` (`lib/trust/citation-intelligence.ts`), per `(engine, sourceType)` group —
same `run_number = 1`, organic-only filter as every prior aggregation pass, unchanged — up to 8
`{ domain, count, origin, isBrand? }` entries are computed, sorted by count desc. Domains are normalised via
`toRegistrableDomain()` (strips `www.` and reduces subdomains to the registrable domain, reusing the same
AU-style multi-part-suffix set — `com.au`/`net.au`/`org.au`/`co.nz` — the source classifier already used) —
applied defensively at aggregation time regardless of what the write-time normalisation already did. A
domain's rolled-up origin is `"retrieved"` if *any* occurrence in the group was retrieved, otherwise
`"recalled"`. The brand's own domain, when cited, classifies as `brand_owned` — its own card, not folded into
`other` — and is flagged `isBrand: true` there.

Migration `0039`: `ALTER TABLE citation_source_intelligence ADD COLUMN IF NOT EXISTS top_domains jsonb;` —
additive, nullable. Both the per-audit insert and the aggregate upsert (`audit_id IS NULL`, §41/§42) write
`top_domains`, each wrapped in the same non-fatal nested-retry pattern §42 established for the aggregate
upsert: first attempt includes `topDomains`; on failure (missing column, or — aggregate only — the
`csi_unique_aggregate` index still missing) it retries the **same insert, with the `topDomains` key omitted
entirely** (not nulled — referencing a genuinely-missing column in SQL throws `42703` regardless of the
value bound to it); only if that also fails does it give up and log the pre-existing non-fatal message. This
is defence in depth, **not** a substitute for applying `0044` first.

**⚠️ APPLY-BEFORE-PUSH IS MANDATORY.** Four call sites select the full `citation_source_intelligence` column
set — `getCurrentCitationSources` (`lib/trust/citation-intelligence.ts`), `narrative-generator.ts`,
`local-ai-trust-scorer.ts`, and `render-report-pdf.ts`. None of these reads are wrapped in a fallback (by
design — read-side safety here is procedural, not code-level, same reasoning as §43's migration gate). If this
commit's code reaches prod before `0044` is applied, all four throw `42703` the moment they run: Citation
Sources, Health Check / Agent Readiness, and the PDF report all break. Sequence: snapshot `pre-0044` → run
`0044-csi-top-domains-precheck-prod.sql` → apply `0044-csi-top-domains-apply-prod.sql` → re-run precheck to
confirm → push → verify `git log origin/main` → Vercel filled-blue.

**Part C — card rendering, security-hardened.** `SourceGapCard` (`components/domain/trust/source-gap-card.tsx`)
renders each card's top domains under a "Top cited domains" label with an origin badge — "Retrieved",
"Recalled" (tooltip: domains the model wrote from memory, not verified by a live search, may be outdated or
invented), or "Retrieved (N) + Recalled (M)" when a card mixes both — reachable by keyboard (`tabIndex`,
`title` + `aria-label`, `role="note"`) as well as mouse/screen-reader. A domain only ever renders as a link
when **both** `origin === "retrieved"` **and** `safeHttpHref(domain)` succeeds — that helper builds
`https://${domain}`, parses it with the `URL` constructor, and returns `null` unless the resulting protocol is
strictly `http:`/`https:` (a `javascript:`-shaped or otherwise malformed domain string can't produce a link
regardless of its claimed origin). Linked domains get `target="_blank"` +
`rel="noopener noreferrer nofollow"`. Recalled domains are always plain text — never a link, independent of
what `safeHttpHref` would return — since they're unverified and possibly invented. All domain text renders
through React's default escaping (no `dangerouslySetInnerHTML`). The brand's own domain gets a small "this
brand" badge. `top_domains === null` (a pre-migration row, or a non-fatal write that fell back to omitting it)
shows "Top domains appear after the next audit." — distinct from a genuinely-computed empty array (nothing
extractable in that card's responses), which renders no domains list at all rather than a false "appears
after next audit" claim.

**Tests.** `tests/unit/audit/extract-citations.test.ts`: origin tagging (retrieved vs recalled) at
extraction/merge time; `resolveCitationOrigin` against legacy entries with no `origin` field, per engine;
`toRegistrableDomain` (www., subdomains, AU-style suffixes, already-registrable input unchanged).
`tests/unit/trust/citation-intelligence-aggregate-resilience.test.ts`: both the per-audit insert and the
aggregate upsert retry without `topDomains` (simulating a real `42703`) and the row still writes, with both
non-fatal messages logged. `tests/integration/citation-source-top-domains.integration.test.ts` (real local
`visibleau` DB): 3 responses + 4 byte-identical replays each → correct counts (replays excluded — proves
`run_number = 1` filtering still holds for this new code path), `www.`/subdomain variants of the same domain
merge into one entry with the summed count, sorted desc, the brand's own cited domain lands in its own
`brand_owned` card flagged `isBrand`; a 10-distinct-domain response caps at 8; a Perplexity structured source
is tagged `retrieved` through to the stored `top_domains`. `tests/unit/trust/source-gap-card.test.tsx`: null
`topDomains` shows the fallback copy and nothing else; empty array renders no list; a retrieved domain is a
real `<a>` with the exact hardened `rel` and `https://` href; a recalled domain is plain text with the
tooltip; a mixed card shows both counts and links only the retrieved entry; the brand badge renders; a
`javascript:`-shaped "domain" with `origin: "retrieved"` still never becomes a link.

RED→GREEN via `git stash` on all 5 implementation files + the migration + the 3 prod-fix files: 21 of 36
targeted assertions failed against the pre-fix code, all 36 passed restored. Broader
`tests/unit/trust` + `tests/unit/audit` + `tests/unit/llm`: 269/269. Real-DB integration
(`citation-source-aggregate`, `citation-source-top-domains`, `ss-organic-filter-surfaces`): 16/16 — confirmed
against the local `visibleau` dev DB with migration `0039` applied directly (CLAUDE.md: dev is safe to
experiment on). `pnpm typecheck && pnpm build` green. `/trust` confirmed still not in nav.

**Verification note.** Like §40/§41, this is computed at audit time, not backfilled for existing rows. A
Bondi re-audit within 48h is cheap and is enough to see top domains and origin labels appear on real cards.

### §45 follow-up (before pushing `17974b3`): PSL-aware domains, and the resilience test §42 (`9c0fa00`) proved on mocks turned out not to hold against real Postgres

**Part A — `toRegistrableDomain` is now PSL-aware, not a 4-entry hand-rolled list.** The original version only
knew `com.au`/`net.au`/`org.au`/`co.nz` — every other AU multi-part suffix (`gov.au`, `edu.au`, `asn.au`,
`id.au`, and the state-government `nsw.gov.au`/`vic.gov.au`/etc. shapes) fell through to a plain "last two
labels" reduction, collapsing e.g. `fairtrading.nsw.gov.au` down to `gov.au` — merging every unrelated
government agency's citations into one row. Replaced with `tldts` (maintained, TypeScript-native, zero runtime
deps, ships the full IANA PSL; preferred over `psl`, which is less actively maintained and untyped), used
ICANN-suffix-only so a brand's own domain is never folded into a private suffix like `*.vercel.app`. Returns
`null` for IPs/localhost/garbage/bare suffixes — the caller falls back to the raw host rather than dropping the
citation. Table-driven tests cover the task's full list, including `fairtrading.nsw.gov.au` → `nsw.gov.au` (the
PSL's actual eTLD+1 for that domain — a state-government second-level domain is its own public suffix, so this
is the PSL-correct result, not a bug) and confirm `classifyCitedSources` is unaffected (classification runs on
the raw URL before this normalisation touches anything).

The `isBrand` badge on a `top_domains` entry now compares registrable-domain-to-registrable-domain, not
`classifySourceTypeWithBrand`'s substring-of-URL check — that check alone would badge
`bondiplumbing.com.au.evil-tracker.com` (a cited URL that merely *contains* the brand's domain as a substring)
as "this brand," which is a much stronger, more visible claim than the category-bucketing substring check was
ever meant to support. `sourceType`/category bucketing is untouched (still the classifier's own call, matching
§43/§44's documented `brandPresent` semantics) — only the display badge is stricter.

**Part B — two real-Postgres risks the mocked `9c0fa00`/§45 resilience tests couldn't catch.** The task asked
whether `buildCitationSourceIntelligence`'s writes run inside a transaction, so savepoints could be added if
so. Investigating turned up a **second, more severe bug** the transaction question's own real-DB proof
immediately exposed:

1. **Drizzle's `.insert(table).values({})` emits every column the table object declares**, using `default` for
   anything the caller's object omits — confirmed via `.toSQL()`. Omitting the `topDomains` *key* from the JS
   object never omitted `"top_domains"` from the generated SQL. So the §45 "retry without it" fallback, as
   originally written, referenced the exact same missing column on its retry and failed identically — meaning
   if `0044` were somehow not applied before deploy (precisely the scenario the fallback exists to protect
   against), **no `citation_source_intelligence` row would ever get written at all**, not just a degraded one
   without `top_domains`. The mocked resilience test couldn't catch this because it never exercises Drizzle's
   real query builder. Fixed with a second, file-local table descriptor,
   `citationSourceIntelligenceNoTopDomains` (`lib/trust/citation-intelligence.ts`, deliberately **not** under
   `db/schema/` so `drizzle-kit generate` never sees a second "citation_source_intelligence" table) — identical
   columns minus `top_domains`, used only by the two fallback branches, so the retry's SQL genuinely never
   mentions that column.
2. **Both callers today (`serviceDb` in the Inngest function, the plain `db` client in tests) pass a
   non-transactional client** — each top-level `.insert()` is its own autocommit statement, so a failed
   statement never poisons a later one. But `buildCitationSourceIntelligence`'s own signature
   (`tx: DbClient = typeof db | TxClient`) explicitly allows a future caller to pass an already-open
   transaction. In Postgres, any failed statement poisons the enclosing transaction until `ROLLBACK` — a
   try/catch around the failure doesn't undo that. Each guarded write (the per-audit insert's retry, the
   aggregate upsert and its retry) is now wrapped in its own `tx.transaction(async (sp) => {...})`: a
   `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` when `tx` is already a transaction (confirmed in drizzle-orm's
   postgres-js driver source — nested `.transaction()` calls `session.client.savepoint(...)`), or a fresh
   standalone transaction when it's a plain client (a no-op behaviour change for today's two real callers).

**Real-DB proof (`tests/integration/citation-source-savepoint.integration.test.ts`, local `visibleau`, `0039`'s
column dropped and restored within the test).** Two scenarios: (a) a plain, non-transactional call — before
the fix, the row was silently never written at all (`expect([]).toHaveLength(1)` failed with 0 rows), proving
risk 1 in isolation; (b) `buildCitationSourceIntelligence` called inside an outer transaction alongside an
unrelated sentinel write — before the fix, the whole test threw an **uncaught `PostgresError: column
"top_domains" ... does not exist`** that escaped the entire `db.transaction()` block (the final `COMMIT` on an
already-aborted transaction surfaces the original error) — a more alarming failure mode than silent rollback,
since it means a future caller's *unrelated* code throws for a reason that has nothing to do with what it
called. Both scenarios pass cleanly after the fix: the sentinel row and the per-audit/aggregate rows (written
without `top_domains`) all commit.

**Verdict on `9c0fa00`'s original resilience test (§42).** Its own claim — "the aggregate upsert failing
doesn't fail the audit" — still holds (confirmed again here), but its mechanism (a mocked `tx` that just throws
and returns) never could have caught either risk above, both of which are specifically about what real
Postgres does to subsequent statements after a failure. Both mocked resilience test files
(`citation-intelligence-aggregate-resilience.test.ts`, `citation-intelligence-multi-source.test.ts`) now also
have a `transaction()` method added to their mock `tx` objects (so they exercise the same code path), but
mocks remain a test of *this function's own control flow*, not of Postgres transaction semantics — that
guarantee now rests on the real-DB test above, not on any mock.

**Tests.** Table-driven `toRegistrableDomain` tests (the task's full list) + 4 IP/localhost/garbage/IPv6 cases
→ `null`, in `tests/unit/audit/extract-citations.test.ts`. Three new cases in
`tests/unit/trust/citation-intelligence-multi-source.test.ts`: `google.com/maps` + `business.google.com`
classify `review_site` and both normalise to `google.com` in `top_domains`; the substring-vs-registrable
`isBrand` distinction (the `evil-tracker.com` case); a genuine `www.`/subdomain brand match still badges
correctly. Two new real-DB tests in `citation-source-savepoint.integration.test.ts` (described above). RED→GREEN
via `git stash` on both implementation files: 9 of 50 targeted assertions failed against the pre-fix code
(including both real-DB savepoint tests), all 50 passed restored. Broader `tests/unit/trust` +
`tests/unit/audit` + `tests/unit/llm`: 287/287. Real-DB integration (all four CSI-touching files): 18/18.
`pnpm typecheck && pnpm build` green. New dependency: `tldts` (added via `pnpm add`, zero runtime deps of its
own). No new migration.

## 46. Citation Sources, live after `17974b3`/`3416a26`: overstated counts, two missing categories, invisible link affordance, gov.au too coarse (2026-10-11)

**Verified live.** Top domains render, `.com.au` stays intact, Retrieved/Recalled labels are correct, and
Unclassified now surfaces the competitor plumbers engines actually cite. Four remaining issues, all from the
same live Bondi data.

**Part A — count integrity.** Gemini's "other" card showed 5 citations and zero top domains; Claude's showed 5
citations and only 3 domains despite the cap being 8. The cause: `citedSources` entries whose host doesn't
resolve to a real domain at all were still being tallied into `citationCount` and the per-engine share
denominator — `toRegistrableDomain(rawDomain) ?? rawDomain.toLowerCase()` (the §45-follow-up fallback) always
counted *something*, even garbage.

*Diagnosis, corrected.* The task's own hypothesized junk shapes (`Pty.Ltd`, `e.g`, `St.Kilda`, `x.pdf`) turned
out not to match `extractCitations()`'s bare-domain regex at all — its suffix list (`com.au|com|net|org|io|
co.nz`) is a closed set that never offered these strings to validation in the first place. Direct testing
found the REAL false-positive classes instead: (1) `markdownLinks`/`bareUrls` extract `new URL(url).hostname`
from *any* `https?://` URL with zero suffix validation — a hallucinated URL's host (an IP, `localhost`, a
single-label internal hostname, an invented TLD) was stored as-is; (2) a genuinely surprising gap in the
§45-follow-up `toRegistrableDomain` itself — `getDomain()` alone accepts `"example.invalidmadeuptld"` and
`"report.pdf"` as if they were real domains, because its fallback treats any unrecognised final label as a
possibly-obscure-but-real TLD rather than rejecting it; (3) a genuine but narrower regex false-positive in
`domainRefs` — a version-string/abbreviation fragment coincidentally ending in a real suffix (`"v2.1.com"` →
`"1.com"`, `"U.S.com"` → `"S.com"`), which tldts validation *can't* catch because `"1.com"`/`"s.com"` are
themselves syntactically valid (if unlikely) domains. Emitted `db/prod-fixes/diag-0045-citedsources-unparseable.sql`
(read-only, lists Bondi's latest audit's raw `citedSources` domain strings per engine) for Sri to eyeball the
real data directly, rather than relying on guessed examples.

*Fix 1 — `toRegistrableDomain` now checks `isIcann`.* `parse()` exposes `isIcann`, true only for a genuine
ICANN-delegated TLD; every previously-tested real case (`com.au`, `com`, `co.nz`, `gov.au`, even the Google-run
gTLD `.page`) is `isIcann: true`, while `"x.pdf"`/`"report.pdf"`/`"example.invalidmadeuptld"` are `false`. This
is what "a valid ICANN registrable domain" (the task's own wording) actually requires — `getDomain()` alone
wasn't it. One surprising, correctly-NOT-rejected case: `"Pty.Ltd"` parses as a real domain because `.ltd` is
itself a genuine ICANN gTLD, not a company-suffix abbreviation — the honest limit of shape/suffix validation,
though moot in practice since the bare-domain regex never offers it this string (`.ltd` isn't in its suffix
list).

*Fix 2 — extraction-time validation, all three passes.* `extractCitations()` (`lib/audit/extract-citations.ts`)
now drops any match whose host fails `toRegistrableDomain` (debug-logged, no PII — it's model-generated text,
not anything about a real person) across markdown links, bare URLs, and the bare-domain regex alike (the
`markdownLinks` pass also gained the try/catch the other two already had, closing a latent unhandled-throw
risk on a malformed markdown-link URL). The bare-domain regex's label-before-suffix now requires 2+ characters
(was 1+), killing the clearest version-string/abbreviation shape — doesn't fully close that class (a 2+-char
fragment that happens to look like a real short domain is still indistinguishable), but removes the most
implausible single-character matches.

*Fix 3 — aggregation-time validation, covers already-stored rows too.* In `buildCitationSourceIntelligence`
(`lib/trust/citation-intelligence.ts`), a classified source whose `rawDomain` fails `toRegistrableDomain` is no
longer tallied at all — not counted toward `citationCount`, the share denominator, or `top_domains`. Because a
group is only created by a `tally()` call, a card whose *every* entry fails validation is never created in the
first place — "cards with 0 valid entries are not rendered" falls out of this for free, with no separate
suppression step, and without disturbing the pre-existing, still-tested §43 behaviour where a response with a
genuinely *empty* `citedSources` array still counts as one honest "nothing extracted" unit (that branch is
untouched — the two cases are structurally distinguishable: an entry that was attempted and failed validation
is simply never tallied, while an empty array was never attempted at all).

**Invariant**, tested both ways: `citationCount === sum(top_domains[].count)` when a card has ≤ 8 distinct
domains (exact equality — every entry that counts is a validated, tallied domain); `citationCount >= sum` at
the > 8 boundary (the top-8 cap truncates display, not counting).

**Part B — widened classifier, domains confirmed real (not guessed).** `womo.com.au` (Word of Mouth) was
already named in `au_directory`'s own seed description (`db/seed/citation-source-affinity.ts`) as an example —
the Hipages lesson (§41) again, docs and code drifting apart — but never actually in the pattern list. Added.
New category **`industry_association`** ("Industry body"): `mpansw.com.au` (seen directly in live Bondi data),
`masterplumbers.com.au` and `plumber.com.au` (Master Plumbers & Mechanical Services Association of Australia —
both confirmed via web search), `masterbuilders.com.au` (Master Builders Australia, confirmed), `hia.com.au`
(Housing Industry Association, confirmed both ways). Deliberately **excluded**: hypothetical state-variant
domains (`mpavic.com.au`, `mpaqld.com.au`) and `mba.org.au` — not independently confirmed, and "don't guess" is
explicit. New category **`government_regulator`** ("Regulator / government"): matched by the `*.gov.au` suffix
itself, not by enumerating specific department domains — the TLD is the reliable, auto-identifiable signal;
trying to name every state's fair-trading/licensing authority would mean guessing the same way the
industry-association state variants were deliberately not guessed. Both new `sourceType`s get a seed entry in
`SOURCE_AFFINITY_NOTES`.

⚠️ **A real classifier bug found and fixed during this work, not asked for but directly adjacent:** the first
draft of the `industry_association` pattern (`plumber\.com\.au`, no word-boundary anchors) would also have
matched any *unrelated* business's domain merely ending in those characters — e.g. a genuine competitor at
`bobsplumber.com.au` or `sydneyplumber.com.au` would have been wrongly classified as the industry body. Fixed
with `\b` anchors on every new pattern; a regression test (`bobsplumber.com.au`/`sydneyplumber.com.au` → `other`,
not `industry_association`) locks this in. The pre-existing patterns (`news.com.au` is the most generic-looking
one) weren't touched — same risk class, but out of this task's scope and not something observed to have
actually misfired.

**No migration.** Confirmed: neither `citations.cited_source_type` nor `citation_source_intelligence.source_type`
has a CHECK constraint or enum anywhere in `db/migrations/` — both are unconstrained `text` columns. Adding new
string values needs no schema change.

**Part C — visible link affordance.** A retrieved domain previously looked identical to recalled plain text
except by hovering. `SourceGapCard` (`components/domain/trust/source-gap-card.tsx`) now always underlines a
retrieved link (not hover-only), adds a `focus-visible` outline for keyboard users, and renders a small
external-link SVG icon (`aria-hidden`) alongside the domain text. The anchor's `aria-label` is
`"{domain} (opens in new tab)"` — what a screen reader announces, replacing the visible text + decorative icon.
Recalled entries are unaffected (still plain `<span>` text, no icon, no link role).

**Part D — gov.au/edu.au group by full hostname.** `toRegistrableDomain("fairtrading.nsw.gov.au")` correctly
reduces to `"nsw.gov.au"` (the PSL's actual eTLD+1 there — `nsw.gov.au` is itself the public suffix, so
different NSW agencies are different "sites" under PSL rules) — right for eTLD+1 purposes, wrong for this
product, where NSW Fair Trading and Service NSW are different journeys a tradie cares about separately. New
`toDisplayDomain()` (`lib/audit/extract-citations.ts`): for a registrable domain ending in `.gov.au`/`.edu.au`
(or exactly equal to either), returns the full hostname (minus `www.`) instead; every other domain keeps the
normal registrable-domain grouping. Used only for the `TopDomainEntry.domain` display/grouping key in
`buildCitationSourceIntelligence` — validity (`toRegistrableDomain`) and the brand-domain comparison both stay
on the registrable domain regardless, unaffected by this.

**Tests.** Extraction: markdown link / bare URL / bare-domain-regex junk (IP, invented TLD, `localhost`,
internal single-label host) all dropped, debug-logged, never throw; the tightened regex rejects
`"1.com"`/`"s.com"`-shaped matches; `toRegistrableDomain` table extended with the `isIcann`-rejected cases and
the `Pty.Ltd`-is-NOT-rejected finding; `toDisplayDomain` table (gov.au/edu.au full-hostname vs. everything else
registrable). Aggregation (mocked): an IP alongside a real domain only counts the real one; a 5-entries-all-junk
card produces no card at all; the invariant at both ≤8 and >8; `fairtrading.nsw.gov.au`/`service.nsw.gov.au`
stay distinct, not merged. Classifier: host→category table for every new pattern, plus the
`bobsplumber.com.au`/`sydneyplumber.com.au` collision-prevention regression. Real-DB
(`citation-source-top-domains.integration.test.ts`, local `visibleau`): junk entries excluded, gov.au hosts
distinct, the invariant, after a genuine jsonb round-trip. `SourceGapCard`: new category labels ("Industry
body", "Regulator / government"); retrieved link has the icon + `aria-hidden` + `(opens in new tab)` accessible
name; recalled entry has neither link role nor icon.

RED→GREEN via `git stash` on all five implementation files (`lib/audit/extract-citations.ts`,
`lib/trust/citation-intelligence.ts`, `lib/visibility/types.ts`, `lib/visibility/citation-source-classifier.ts`,
`components/domain/trust/source-gap-card.tsx`) plus `db/seed/citation-source-affinity.ts`. Broader
`tests/unit/trust` + `tests/unit/audit` + `tests/unit/llm` + the classifier's own `tests/phase2/sprint3/
citation-source-classifier.test.ts`: all passing (a separate, large batch of pre-existing failures across
unrelated `tests/phase2/sprint3/*` files — a local dev DB missing `brands.youtube_channel_url`, migration
`0037`, never applied — predates this task and wasn't touched). Real-DB integration (all CSI-touching files):
passing. `pnpm typecheck && pnpm build` green. No migration. `/trust` confirmed still not in nav.

**Verification note.** Computed at audit time, same as every prior section here — a Bondi re-audit (cache, so
~US$0.04) is enough to confirm Gemini/Claude "other" counts now equal their listed domains (or the card
disappears), `womo` lands under AU directory, and `mpansw`/`hia` land under Industry body.

### §46 follow-up (before pushing `ee21e46`): the rolling aggregate now REPLACES its set instead of upserting into it

**The bug.** §46 made a card with zero valid entries never get *created* in a given audit's results — but the
rolling aggregate (`citation_source_intelligence`, `audit_id IS NULL`, one row per `(brand, engine,
source_type)`) was only ever **upserted** per group, every audit, since §41. A category with no group in the
*current* audit is a category the per-group upsert loop never visits — its aggregate row from whichever earlier
audit last wrote it just sits there, untouched, forever. Concretely: Bondi's Gemini "other" (5 citations, 0
domains — exactly the row §46's count-integrity fix exists to stop producing) would still render after a
re-audit, because nothing ever told its aggregate row to go away. Any category that disappears between audits
has this problem, not just this one case.

**Part A — replace, not merge.** `buildCitationSourceIntelligence` (`lib/trust/citation-intelligence.ts`) no
longer upserts the aggregate per group inside the main loop. Each group's intended aggregate row is collected
into `aggregateRowValues` as the loop runs (unchanged per-audit insert, still per-group, still history); once
the loop finishes, ONE operation — inside a single `tx.transaction()` (a savepoint when nested, same as every
other guarded write since the §45 follow-up) — deletes every one of the brand's aggregate rows, then
(re-)inserts the audit's full current set (skipped entirely if that set is empty). A reader can never observe a
partial state: if the insert half fails, the whole savepoint — delete included — rolls back together, so the
aggregate keeps its previous complete set rather than landing half-replaced or momentarily empty. The
topDomains-missing-column fallback is unchanged in spirit (retry the whole delete+insert via the
file-local no-top_domains table descriptor) — note the DELETE itself never references `top_domains` at all, so
only the INSERT half can actually fail on it; redoing the DELETE on retry is harmless since the first attempt's
delete was already rolled back with its failed savepoint.

**A welcome side effect:** this also means the `csi_unique_aggregate` missing-partial-index failure mode (§41
Part C / §42) is no longer *possible* for the aggregate write at all — there's no `ON CONFLICT` clause left
that could need a matching index, since the delete already cleared anything that could conflict. The §42
resilience test's specific scenario (simulate the index missing, prove the audit survives) is now obsolete by
construction; `tests/unit/trust/citation-intelligence-aggregate-resilience.test.ts` was updated to simulate a
generic forced aggregate-write failure instead, since that's the failure mode that can still actually occur.

**Edge case: zero valid groups.** If an audit finds nothing valid anywhere for the brand (`aggregateRowValues`
empty), the replace step still runs — delete everything, insert nothing — so the aggregate ends up genuinely
empty for that brand, not holding onto a previous audit's numbers. The screen's existing empty-state copy
(`app/(auth)/brands/[brandId]/trust/citation-sources/page.tsx`) already covers this: "No citation source data
yet — Run an audit to analyse citation sources." (the `citationCount > 0, sources.length === 0` branch, since
`citationCount` comes from the separate, validity-agnostic `getBrandDistinctCitationCount`).

**Part B — read-path: aggregate-empty vs. aggregate-absent.** Because the aggregate is now ALWAYS replaced
(including to empty), an empty `aggregateRows` result in `getCurrentCitationSources` became ambiguous: it could
mean "this brand has never been audited under the aggregate-writing pipeline at all" (§41's original reason the
per-audit-rows fallback exists) or "the brand's actual latest completed audit found nothing, and genuinely wrote
nothing anywhere." Those need different answers — show stale history in the first case, the honest empty state
in the second — and nothing in `citation_source_intelligence` alone can tell them apart (an operation that
writes zero rows leaves zero trace, by definition). Resolved without a migration by cross-checking the real
`audits` table: fetch the brand's actual most recently **completed** audit; if its ID doesn't match the audit
ID the per-audit-rows fallback was about to use, a *later* audit has completed since those rows were written
and wrote nothing at all (otherwise its own rows, or a fresh aggregate replace, would already be visible) —
meaning it genuinely found zero valid groups, and `getCurrentCitationSources` returns `[]` rather than falling
back to the older rows.

**Tests (real DB, `tests/integration/citation-source-aggregate-replace.integration.test.ts`).** Audit N
`{gemini/other, claude/au_directory}` → audit N+1 `{claude/au_directory}` only: aggregate contains *only*
claude/au_directory afterward, gemini/other gone, audit N's per-audit rows untouched. Audit N+2 with
citedSources that are non-empty but 100% unparseable (no group created at all): aggregate empties, and
`getCurrentCitationSources` returns `[]` rather than audit N+1's rows. A forced failure specifically on the
aggregate's insert half (a `NOT VALID` CHECK constraint blocking `audit_id IS NULL` rows — the DELETE is
unaffected by it, isolating the failure to exactly the INSERT; real Postgres, not a mock): the aggregate retains
its exact previous row set (via the savepoint rollback), and the new audit's own per-audit row still commits.
RED→GREEN via `git stash`: 2 of 3 real-DB tests failed against the pre-replace-set (upsert-only) code — the
third (general "a forced failure doesn't corrupt anything") held under both, since "nothing changes on total
failure" is true for upsert-only too; kept anyway, it's still a real guarantee for the new code specifically.
Both mocked resilience test files updated for the new `.delete()` + array-`.insert().values()` shapes. Broader
`tests/unit/trust` + `tests/unit/audit` + `tests/unit/llm` + the classifier test: 336/336. Real-DB integration
(all five CSI-touching files): 22/22. `pnpm typecheck && pnpm build` green. No migration.

### §46 follow-up (3rd, before pushing `ee21e46` + `a988c80`): empty answers are zero citations, not one phantom "other"; engines that cited nothing get an honest row; three more real directories confirmed

**Evidence.** Sri ran the read-only `diag-0045` diagnostic against prod: 55 distinct cited domains behind
Bondi's latest audit, **none suspicious** — every extracted entry really is a domain, and per-engine sums match
the screen exactly. But Gemini had **zero** cited entries while its card showed "other · 5 citations", and
Claude's "other" had 3 real entries (womo, mpansw, hia) while showing 5. The "5 with no domains" from §46's own
diagnosis was never junk domains — it was **every answer that cited no sources being counted as one phantom
"other" citation**.

**Part A — the code path, quoted, and why §46 didn't already fix it.** `buildCitationSourceIntelligence`
(`lib/trust/citation-intelligence.ts`) had, since task #43:
```ts
if (citedSources.length === 0) {
  // No source extracted/returned for this response at all -- still
  // counts as one "other" source so a real organic response is
  // never silently dropped from the totals.
  tally(engine, "other", cit.brandMentioned);
  continue;
}
```
§46's domain-validity check (added the same week) only ever runs **inside** the `classified.forEach` loop below
this branch — it validates entries *inside* a non-empty `citedSources` array; it was never reachable for a
response whose array was empty in the first place, which is exactly why Gemini's zero-citation answers kept
showing up as "other" after §46 shipped. Traced the two other candidate legacy paths the task named:
`inngest/functions/classify-citation-sources.ts` (writes `citations.cited_source_type` at capture time from
`classified[0]`) explicitly `continue`s on an empty array too — it never independently counts anything; and
`narrative-generator.ts`/`local-ai-trust-scorer.ts` (the other two readers) both read `citation_source_intelligence`
rows written *by* `buildCitationSourceIntelligence`, not `citedSourceType` directly — grep confirms neither file
references `citedSourceType` at all. There is no separate `citedSourceType ?? "other"` fallback anywhere in the
real code; the fix only needed to happen in the one place above.

**Fix.** The branch now simply `continue`s — contributes to neither `citationCount` nor `totalByEngine` (the
share denominator) for any category. Real-DB test (`citation-source-aggregate-replace.integration.test.ts`):
Gemini with 5 distinct organic (run_number=1) responses, every one `citedSources: []`, run alongside Claude
citing 3 real sources across its own responses — Gemini contributes zero to every category (see Part B for
what IS shown for Gemini), Claude's categorised total is exactly 3, not 5.

**Part B — engines that cited nothing are shown, not silently dropped.** Removing the phantom "other" tally
would otherwise make a zero-citation engine simply vanish from the screen, indistinguishable from an engine
that was never audited. New sentinel `NO_CITATIONS_SOURCE_TYPE` (`"__no_citations__"`, exported from
`lib/trust/citation-intelligence.ts`) — written through the *exact same* per-audit-row and aggregate-replace
machinery as any real category (so it correctly disappears again via §46 2nd-follow-up's replace-set semantics
the moment that engine cites something in a later audit), computed from a new `organicResponseCountByEngine`
tally (every organic response, regardless of whether it cited anything — `totalByEngine` can't be reused here,
since an engine with zero valid citations is absent from it entirely) compared against which engines actually
got a real group. Uses the existing schema — no migration. `CitationSourcesPage`
(`app/(auth)/brands/[brandId]/trust/citation-sources/page.tsx`) splits `sources` into real category cards and
`NO_CITATIONS_SOURCE_TYPE` rows, rendering the latter after the category grid as plain text: "{Engine} cited no
sources in {N} answers." (singular "answer" at N=1), via `SourceGapCard`-free `<li>`s — no badge, no share.

An engine whose every citation merely *failed validation* (§46's own domain-validity fix) gets the identical
treatment — "cited no sources" is the honest description of "cited only unresolvable junk" from the user's
side, same as citing literally nothing. The two are structurally indistinguishable from each other by
construction (an entry that's attempted-and-invalid is never tallied at all, same as one that was never
attempted), and the task's own Part B wording ("zero valid cited sources") asked for exactly this.

**Part C — three more real AU directories/review sites confirmed, two left alone.** Candidates seen in
Perplexity's retrieved sources against live Bondi data, each independently web-verified (not guessed) before
classifying:
- `wordofmouth.com.au` → `au_directory`. The same Word of Mouth platform as `womo.com.au` (WOMOW Pty Ltd's
  original domain; `womo.com.au` the shortened one it also goes by).
- `servicetasker.com.au` → `au_directory`. A trade marketplace — post a task, get quotes from local tradies,
  ABN-checked businesses — the same shape as hipages/oneflare/airtasker.
- `homedone.com.au` → `au_directory`. Same shape again: compare local tradies by reviews/credentials, 17,500+
  listed businesses, businesses can claim their listing.
- `bestinhood.com` → `review_site`. An independent local-business review/recommendation aggregator — not
  AU-specific (14 cities, international) — the same category TrustPilot (also not AU-specific) already sits in.
- `fixedtoday.com.au` → **left as "other", not classified.** This is a genuine competitor's own website (Fixed
  Today Plumbing, Sydney, NSW Licence 305428C) — not a directory, marketplace, or review aggregator at all.
  Exactly the kind of real competitor signal the Unclassified bucket exists to surface.
- `starworks.com.au` → **left as "other", not classified.** A B2B reputation-management SaaS tool businesses
  use to generate their *own* reviews elsewhere ("grows your reviews… sends review requests by SMS/email") —
  not itself a place a consumer goes to find or review a business, so it doesn't cleanly fit either existing
  category. Ambiguous; left unclassified rather than guessed.

Confirmed (unchanged, already worked): `verify.licence.nsw.gov.au` classifies `government_regulator` (suffix
match) and groups/displays by its own full hostname, not collapsed into `nsw.gov.au` alongside every other NSW
department (§46 2nd follow-up's `toDisplayDomain`).

**No migration.** Confirmed again: `source_type`/`cited_source_type` remain unconstrained `text` columns.

**Tests.** `citation-intelligence-multi-source.test.ts`: the empty-citedSources tests from task #43 rewritten
for the corrected behaviour (NO_CITATIONS_SOURCE_TYPE instead of phantom "other"); the "all-entries-invalid"
test from §46's own 1st follow-up updated the same way; two tests kept their ORIGINAL intent (testing the
"other"/unclassified-override/share-denominator behaviour) by switching their seed data from empty arrays to a
genuinely-unclassifiable-but-non-empty domain. New `tests/unit/trust/citation-sources-page.test.tsx`: the
exact sentence text (including singular/plural), a real category card and a no-citations row rendering
together, and confirms the no-citations row carries no SourceGapCard badge. `citation-source-classifier.test.ts`:
host→category table for all four new domains, the two confirmed-"other" verdicts, and
`verify.licence.nsw.gov.au`. `citation-source-aggregate-replace.integration.test.ts` extended with the
Gemini-zero/Claude-3-of-5 real-DB scenario, an all-invalid-both-engines scenario (both engines now show
`NO_CITATIONS_SOURCE_TYPE`, read path surfaces them rather than falling back), and a genuinely-zero-citations
audit (the true empty-aggregate case §46 2nd follow-up's read-path fix protects).

RED→GREEN via `git stash` on the three implementation files
(`lib/trust/citation-intelligence.ts`, `lib/visibility/citation-source-classifier.ts`,
`app/(auth)/brands/[brandId]/trust/citation-sources/page.tsx`): 13 failed outright plus render crashes (the
page's own `NO_CITATIONS_SOURCE_TYPE` import resolving to `undefined` against the reverted module) against the
pre-fix code; all 106 targeted tests passed restored. Broader `tests/unit/trust` + `tests/unit/audit` +
`tests/unit/llm` + the classifier test: 348/348. Real-DB integration (all five CSI-touching files): 23/23.
`pnpm typecheck && pnpm build` green. No migration. `/trust` confirmed still not in nav.

**Verification note.** Computed at audit time — a Bondi re-audit (cached, ~US$0.04) is enough to confirm Gemini
shows "cited no sources in N answers" instead of a phantom "other" card, Claude's categorised total is honest,
and wordofmouth/servicetasker/homedone land under AU directory.

### §46 follow-up (4th, before pushing `ee21e46`+`a988c80`+`d3854ce`): the NO_CITATIONS_SOURCE_TYPE sentinel must not leak into the other readers

**Part A — prod constraint check (read-only).** Confirmed (again) in every local migration: `citation_source_intelligence.source_type`
(`0010_baseline-reconcile.sql`, `0016_phase2_sprint5_trust.sql`) and `citations.cited_source_type`
(`0010`, `0013_phase2_sprint3_visibility.sql`) are both plain `TEXT`/`TEXT NOT NULL` — no `CHECK`, no `ENUM`,
no `DOMAIN` type, anywhere, on either column, in any migration file. Grepped every `ALTER TABLE
citation_source_intelligence`/`ALTER TABLE citations` statement across `db/migrations/*.sql`: only RLS
enablement and unrelated `ADD COLUMN`s. This can't rule out something applied by hand outside the tracked
migration history, which is exactly why `db/prod-fixes/precheck-0046-csi-source-type-constraint.sql` (read-only:
column data type, every CHECK constraint on both tables via `pg_constraint`, enum labels via `pg_enum`, current
distinct `source_type` values) exists for Sri to run against the real prod database before this stacks of
commits goes out.

**Part B — every reader, audited.** Grepped every `citationSourceIntelligence`/`citation_source_intelligence`
reference outside tests/schema/migrations. Six real readers found — three more than the task named:

| Reader | file:line | Effect of the sentinel (before this commit) |
|---|---|---|
| `getCurrentCitationSources` | `lib/trust/citation-intelligence.ts` | Already correctly split by `d3854ce` on the *write* side intent, but the function itself still returned one mixed `StoredSourceRow[]` — the ONE caller (the Citation Sources page) did its own ad-hoc `sourceType !== NO_CITATIONS_SOURCE_TYPE` filtering, correctly, but nothing stopped a reader from forgetting to. |
| `narrative-generator.ts` (`source_type_gaps`) | `lib/communication/narrative-generator.ts:282-297` | **Leaked.** `csiRows.length` ("N source types analysed") counted the sentinel as a source type; `criticalGaps` was safe (`gapSeverity` is always `"unclassified"` for the sentinel). |
| `render-report-pdf.ts` ("Source Type Gaps") | `inngest/functions/render-report-pdf.ts:148-171` | **Leaked**, identical pattern to narrative-generator.ts -- same inflated "N source types analysed" count in the PDF body text. |
| `local-ai-trust-scorer.ts` | `lib/platform/local-ai-trust-scorer.ts:68-77` | **Already safe.** Filters `eq(citationSourceIntelligence.sourceType, "au_directory")` explicitly -- the sentinel's `sourceType` is never `"au_directory"`, so it can't reach this query regardless. Feeds `score-agent-readiness.ts` (`inngest/functions/score-agent-readiness.ts:216`), confirmed the only live Agent Readiness wiring -- no separate "trust overview tile" reads this table directly. |
| `citation-failure-diagnosis.ts` (CPR-01) | `lib/visibility/citation-failure-diagnosis.ts:60-86` | **Latently fragile, not currently observable.** `GROUP BY source_type` top-5-by-count would include the sentinel, but the only consumer (`row.source_type === "brand_owned" && Number(row.cnt) === 0`) is dead code by construction (a `GROUP BY` row's count can never be 0) -- fixed anyway, in case that dead logic is ever corrected to do what its name implies. |
| `fetch-precedes-citation.ts` | `lib/agent-analytics/fetch-precedes-citation.ts:38` | **Pre-existing broken code, unrelated.** References `cs.source_url`, a column that has never existed on this table -- would throw 42703 if ever executed, regardless of the sentinel. Also filters `brand_present_in_source = true`, which the sentinel (always `false`) could never match even if the column bug were fixed. Not touched -- out of scope, and fixing a dead query risks introducing behaviour nobody asked for. |

**Part C — real categories by default, sentinel only on purpose.** Chosen approach: `getCurrentCitationSources`
now returns `{ categories: RealCategoryRow[]; enginesWithoutCitations: NoCitationsRow[] }` instead of one mixed
array -- callers get the split for free instead of each having to remember a string compare. A new exported type
predicate, `isRealSourceCategory(sourceType): sourceType is CitedSourceType`, is the one canonical check (used
internally by the split itself); any reader could use it directly too, but going through
`getCurrentCitationSources` is preferred where the "current state" semantics (aggregate-or-latest-audit-fallback)
are what's wanted. For the three readers that do their OWN direct `citationSourceIntelligence` queries (not
through `getCurrentCitationSources` -- they read UP TO 20 PER-AUDIT rows across recent history, a different
question from "current state"), the exclusion is applied directly in the query's `WHERE` clause (SQL-level, not
filtered after fetch) -- essential for `narrative-generator.ts`/`render-report-pdf.ts` specifically, since both
use `LIMIT 20`: filtering after fetch could leave fewer than 20 genuine rows if the sentinel happened to be within
the most-recent 20 by `calculatedAt`.

**Type safety at the read boundary.** `RealCategoryRow` narrows `StoredSourceRow.sourceType: string` down to
`CitedSourceType` (`lib/visibility/types.ts`'s existing, closed union -- the sentinel was never added to it, and
stays out of it). `NoCitationsRow` is `{ id, engine, answerCount }` only -- deliberately missing `gapSeverity`,
`citationShare`, `sourceAffinityNote`, `topDomains`, so there's nothing category-shaped for a careless reader to
sum into a real total. The sentinel row's own stored numeric fields: `citationCount` = the engine's real organic
response count (not a citation count -- there were none); `citationShare` = `"0"` (no category, no share
concept applies); `brandPresentInSource` = `false` always; `topDomains` = `[]` always; `gapSeverity` =
`"unclassified"` always (never `"critical"`, so it can never masquerade as an actionable gap in a critical-gaps
list).

**PDF parity, decided.** Yes, per the task's own stated preference: `render-report-pdf.ts` now also renders
"{Engine} cited no sources in {N} answers." as its own section ("Engines With No Citations"), sourced from
`getCurrentCitationSources`'s `enginesWithoutCitations` (the brand's CURRENT state, matching the screen) -- not
derived from the existing up-to-20-cross-audit-history query, since "which engines currently cite nothing" is a
snapshot question, not a rolling one.

**Tests.** Real-DB (`citation-source-sentinel-leak.integration.test.ts`): Brand A (Gemini's 5-empty-answer
sentinel alongside Claude's and Perplexity's real citations) vs. Brand B (the identical real data, Gemini never
audited at all) -- `narrative-generator.ts`'s "N source types analysed" line is byte-identical between the two;
`computeLocalAiTrustScore`'s citation sub-score and total are identical between the two; `categories` excludes
Gemini entirely while `enginesWithoutCitations` carries exactly its 5-answer count; Claude's one empty response
among 5 doesn't dilute its two real categories' shares (50%/50% of 4 real responses, not 40%/40% of 5).
Source-grep (`citation-source-intelligence-label.test.ts`, extending the existing CONSUMERS table pattern):
narrative-generator.ts/render-report-pdf.ts/citation-failure-diagnosis.ts all reference
`NO_CITATIONS_SOURCE_TYPE`; render-report-pdf.ts also calls `getCurrentCitationSources` and renders the parity
line. Replace-set reversibility, both directions (`citation-source-aggregate-replace.integration.test.ts`): an
audit with Gemini's sentinel followed by an audit with Gemini's real sources flips the aggregate row from the
sentinel to the real category; the reverse (real sources, then an audit where Gemini cites nothing) flips it back.
`citation-sources-page.test.tsx`/`honest-empty-states.test.ts`/the API route updated for the new `{ categories,
enginesWithoutCitations }` response shape in place of the old single `sources` array.

RED→GREEN via `git stash` on the six implementation files (`lib/trust/citation-intelligence.ts`,
`lib/communication/narrative-generator.ts`, `inngest/functions/render-report-pdf.ts`,
`lib/visibility/citation-failure-diagnosis.ts`, the citation-sources API route, and the Citation Sources page):
18 failures plus render crashes against the pre-fix code (several test files couldn't even construct valid
fixtures without the new exports); all passed restored. Broader regression: 365/365 unit, 34/34 real-DB
integration. `pnpm typecheck && pnpm build` green. No migration -- pending Sri's `precheck-0046` confirmation.
`/trust` confirmed still not in nav.

### §46 follow-up (5th): replaced the impossible `brand_owned` check with an honest "your website isn't cited" diagnosis, honesty-checked the rest of the page, deleted the confirmed-dead modules

**Part A -- the task's own premise, corrected.** The task's stated justification ("No classifier, migration or
seed produces a `brand_owned` source type") is **factually wrong**, re-confirmed by fresh grep:
`classifySourceTypeWithBrand()` (`lib/visibility/citation-source-classifier.ts:51-56`) DOES produce it --
`if (brandDomain && url.toLowerCase().includes(brandDomain.toLowerCase())) return "brand_owned";` -- and
`db/seed/citation-source-affinity.ts:16` carries a seed note for it. The underlying recommendation (don't key this
diagnosis off `citation_source_intelligence.source_type === "brand_owned"`) is still correct, just for different,
more precise reasons: (1) the old CPR-01 query had no `audit_id` filter at all -- cross-audit mixing; (2) its
`LIMIT 5`-by-count could exclude the `brand_owned` row even when present; (3) the classifier's check is a
substring-of-URL match, weaker than the registrable-domain comparison this diagnosis now uses. Separately,
`brandPresentInSource`/`brandPresent` (`lib/trust/citation-intelligence.ts` ~345-357:
`cit.brandMentioned || isBrandSourceType`) is a compound "mentioned in answer text OR classified brand_owned"
signal, confirmed NOT a pure "domain cited" signal -- also unusable for this diagnosis.

**Part B -- the new query.** `checkBrandDomainNotCited()` (`lib/visibility/citation-failure-diagnosis.ts:65-156`)
replaces the dead CPR-01 branch entirely -- the old `citation_source_intelligence` GROUP BY query and its
`row.source_type === "brand_owned" && cnt === 0` check (impossible: a GROUP BY row's count is never 0) are
deleted outright, not patched. New logic: one `brands.domain` lookup, reduced via the same `toRegistrableDomain()`
already used by `buildCitationSourceIntelligence`; one `citations` query scoped to the latest **completed**
audit (`audits.status = 'complete'`, `ORDER BY completed_at DESC LIMIT 1`), filtered to `ORGANIC_ONLY` and
`run_number = 1` -- the same scope `buildCitationSourceIntelligence` uses, and deliberately NOT `top_domains`
(capped at 8, so a real citation could be invisible there). Every `cited_sources` entry across every row is
scanned unconditionally and reduced to its registrable domain for comparison -- `www.`/subdomain variants match
because both sides go through the identical `toRegistrableDomain()` reduction. Copy per state: no brand domain on
record -> no diagnosis (never claims "not cited" when it can't check); real sources cited, none the brand's ->
"AI engines cited {N} sources across {E} engines, and none was your website." with a per-engine
Retrieved/Recalled breakdown; brand's own domain cited (at any count, anywhere in the unbounded scan) -> no
diagnosis; engines cited nothing at all -> no diagnosis (the existing NO_CITATIONS_SOURCE_TYPE "cited no sources"
row already covers that case, and reading it here would double up). **Index coverage** (confirmed against the
real local DB's `pg_indexes`, not just migration files): `audits` has no `(brand_id, status, completed_at)`
index -- only `audits_org_audit_number_idx` and `audits_org_completed_idx`, both `organization_id`-led -- so the
latest-audit lookup is a sequential scan of one brand's own (typically small) audit rows, not the whole table.
`citations.audit_id` similarly has no dedicated index (only `citations_pkey`) -- the same pre-existing gap
`buildCitationSourceIntelligence`'s own citations query has lived with since task #41. Neither gap is new here,
and both stay bounded to one audit's rows -- no per-request scan of all audits.

**Part C -- honesty pass on the rest of `diagnose()`.**

| Diagnosis | Data read | run_number=1/organic? | Hardcoded/mocked? | Audit scoping | RLS/org context |
|---|---|---|---|---|---|
| `missing_topic_coverage` | `topical_coverage_gaps` (no `audit_id` column at all -- continuously updated in place per `(brand_id, vertical, topic_cluster)`, not a per-audit row) | N/A -- table has no replay/run_number concept to filter | No | N/A -- "current state", not audit-scoped by design (product judgement, unchanged) | Via caller's `tx` |
| `brand_domain_not_cited` (new) | `brands.domain`, `citations.cited_sources` | Yes -- `ORGANIC_ONLY` + `run_number=1` | No | Scoped to the one latest completed audit (new -- see Part B) | Via caller's `tx` |
| `competitor_cited_instead` | `comparison_prompt_results` | N/A -- `run-comparison-prompts.ts` writes exactly one row per `(competitorDomain, engine)` per audit, never a replay loop, so there's nothing to de-duplicate (confirmed by reading the function) | No | **Fixed** -- previously mixed every historical audit's rows together (no `audit_id` filter); now scoped to the same latest completed audit as the row above | Via caller's `tx` |

Also found and fixed in this same file, incidental to the Part C review but squarely the same "no rendered number
is honest and no surface throws" class of bug this task is about: `comparison_prompt_results.competitor_cited`
is a column that has **never existed** (real column: `competitor_mentioned`) -- confirmed via direct query
against the real local DB (`column "competitor_cited" does not exist`, SQLSTATE 42703). Nothing caught this
(`diagnose()` has no try/catch; the route has no try/catch around `await diagnose(...)`), so the entire Citation
Failure page 500'd for any brand with comparison-prompt data. Fixed in the same edit as the audit-scoping fix
above, served by the existing `comparison_audit_idx` (`audit_id`) index.

**Part D -- confirmed-dead modules deleted**, after re-confirming zero live importers (grep across all of
`app/`, `lib/`, `scripts/`, `db/`, `inngest/`, `tests/` -- only historical `docs/` sprint-prompt/handoff files
matched, not live code):
- `lib/agent-analytics/fetch-precedes-citation.ts` + its `FetchCitationCorrelation`/`getFetchPrecedesCitation`
  re-exports in `lib/agent-analytics/index.ts`. (References `citation_source_intelligence.source_url`, a column
  that never existed -- see §46 4th follow-up's table above.)
- `lib/trust/knowledge-panel-checker.ts` + `lib/trust/wikidata-checker.ts` + their `checkKnowledgePanel`/
  `checkWikidata` re-exports in `lib/trust/index.ts`. Confirmed `entity-checker.ts`'s OWN inline
  `checkKnowledgePanel`/`checkWikidata` stub functions (lines 119, 128 -- local to that module, never imported
  from the deleted files) and `TRUST_CHECK_IMPLEMENTED` gating are untouched; the only test referencing these
  names (`entity-knowledge-wikidata-neutralization.test.ts`) exercises the inline stubs, not the barrel.
- `lib/audit/prompts.ts` (`TRADIES_PROMPTS`/`ALLIED_HEALTH_PROMPTS`/`SAAS_PROMPTS`) -- re-confirmed zero live
  importers, and confirmed live audits read `brand.promptPack` instead (DB-driven, `inngest/functions/
  run-audit.ts:89`), not this file's static arrays.

**Part E -- tests.** `tests/phase2/sprint3/citation-failure-diagnosis.test.ts` rewritten with a table-identity-
dispatching mock (`.from(table)` compared against the real imported `audits`/`brands`/`citations`/
`topicalCoverageGaps` table objects) covering: fires when real sources are cited and none match the brand's
domain, with the per-engine Retrieved/Recalled breakdown in the evidence text; does NOT fire when the brand's own
domain was cited; `www.`/subdomain variants still match (does NOT fire); does NOT fire with no brand domain on
record; does NOT fire when engines cited nothing at all; does NOT fire when every `cited_sources` entry fails
domain validation (junk only); never fires with no completed audit; the `competitor_cited`/`competitor_mentioned`
fix (asserts the executed query's reconstructed SQL text contains `competitor_mentioned` and `audit_id`, never
`competitor_cited`). `tests/unit/trust/citation-source-intelligence-label.test.ts`'s CONSUMERS table updated --
`citation-failure-diagnosis.ts` removed from the list of files expected to reference `NO_CITATIONS_SOURCE_TYPE`,
since it no longer queries `citation_source_intelligence` at all. RED→GREEN via `git stash` on the three
implementation files (`lib/agent-analytics/index.ts`, `lib/trust/index.ts`,
`lib/visibility/citation-failure-diagnosis.ts`): 2 genuine failures against the pre-fix code (the "fires" case and
the comparison-prompt fix; the "does NOT fire" cases pass vacuously both before and after, since the old dead
branch also never fired); both GREEN restored. Broader regression: 211/211 unit tests directly touched by this
change (`tests/unit/trust/`, `tests/unit/agent-analytics/`) pass. `pnpm typecheck && pnpm build` green.

**Known, pre-existing, unrelated blocker for the real-DB integration suite** (not caused by this task, not fixed
by it): the local `visibleau_e2e` test database is missing at least migration `0037_youtube_channel_confirmation`
(confirmed: `brands.youtube_channel_url does not exist`, SQLSTATE 42703) -- this single drift breaks dozens of
unrelated integration tests across the whole suite (FK constraints, `budget_policy`/`metric_quality_gate`/
`prompt_pack_coverage`/`provider_capability`/`sampling_policy` index checks, etc.), none of which this task's
diff touches. Confirmed unrelated: `git status --short` shows only the 9 files this task modifies/deletes; none
of the failing integration test files or their subject modules appear in that list. Left untouched -- applying
migrations to a shared test database is outside this task's scope and this file's own "no prod writes, no
migration unless flagged" constraint; Sri should run `pnpm db:migrate` against `visibleau_e2e` separately. No new
migration needed for this task's own changes.

**Correction (6th follow-up, below): that `pnpm db:migrate` recommendation was wrong.** `pnpm db:migrate` is
`drizzle-kit migrate`, which only replays drizzle-kit's own tracked snapshot (migrations 0000-0011) -- confirmed
this session that `drizzle.__drizzle_migrations` is completely EMPTY on all three local databases, meaning
`db:migrate` has never actually been the apply path for ANY of them, hand-written or not. The real fix (and the
one this 6th follow-up actually used) is `db/migrations/README.md`'s own documented path: `psql -f
db/migrations/00NN_*.sql`, in order, for every hand-written file (0012 onward) -- they're idempotent
(`IF NOT EXISTS`/`DO $$ ... EXCEPTION WHEN duplicate_object`), so replaying the whole 0012-0039 range is safe
even on a partially-migrated database.

### §46 follow-up (6th, before pushing `b648a13`): prove it on a real DB, add the missing indexes, make `brand_owned` use the one domain rule everything else uses

**Part A -- real-DB proof, not mocks.** Brought all three local databases' schemas up to date by replaying every
hand-written migration (`0012` through `0039`, plus the unnumbered `sprint-8-tables.sql`) via `psql -v
ON_ERROR_STOP=1 --single-transaction -f`, in order -- confirmed via `pnpm db:drift` before/after on each:

| Database | FATAL before | FATAL after | Notes |
|---|---|---|---|
| `visibleau` (dev) | 12 | 0 (policy-count threshold only) | |
| `visibleau_e2e` (test) | 16 | 0 (policy-count threshold only) | Also missing most RLS policies (1 vs 208 expected) before the replay -- not just the 0037+ column gaps the task named. |
| `visibleau_prod` (local mirror) | 16 | 0 (policy-count threshold only) | **Required explicit authorization mid-task** -- see below. `0023`-`0026` (agent-analytics `ai_bot_ip_ranges.cidr`/`crawler_visit_logs.source_ip` still `text`, not `cidr`/`inet`) failed and rolled back cleanly (`--single-transaction` per file) -- this is the EXACT pre-existing, already-documented gap in section 4 above, untouched, out of scope for this task. |

**The `visibleau_prod` discovery.** Mid-task, found that 5 pre-existing integration test files --
`tests/e2e/backend/07-rls-isolation.test.ts`, `tests/phase2/sprint1/e2e-rls-fk-services.integration.test.ts`,
`tests/phase2/sprint3/e2e-cross-sprint-seams.integration.test.ts`,
`tests/phase2/sprint3/e2e-visibility-behavioral.integration.test.ts` (the Citation Failure route's own behavioral
tests), and `tests/phase2/sprint3/e2e-visibility-db.integration.test.ts` -- hardcode their connection string
directly to `postgresql://postgres:password@localhost:5432/visibleau_prod`, not `visibleau_e2e`. That's the exact
database name CLAUDE.md restricts ("write ONLY when explicitly authorized, pg_dump backup first"), and these
tests seed and tear down real rows there. Stopped and asked Sri before touching it. Authorized for this task
only (not a standing authorization) -- `pg_dump -F c` backup taken first (`visibleau_prod_pre0046-6th_*.dump`,
3.5MB), then migrated the same idempotent way as the other two databases.

**Real-DB tests added**, converting/extending the 11 mocked tests from `b648a13`:
- `tests/integration/citation-failure-brand-domain.integration.test.ts` (new, targets `visibleau` dev, the
  established convention for `tests/integration/*` files in this feature area): fires with real organic sources
  cited, none the brand's; silent when the brand's own domain was cited; silent when the brand's domain is the
  9th distinct domain in one response (the explicit regression guard against reading `top_domains`, which caps
  at 8 -- `checkBrandDomainNotCited` never reads `top_domains` at all, so this proves the guard holds); silent
  with no brand domain on record; silent when engines cited nothing; `www.`/subdomain variants match; a
  `run_number > 1` replay row citing the brand does NOT suppress the diagnosis (proves exclusion, not just
  absence of counter-evidence); a branded-prompt row citing the brand does NOT suppress it either; reads the
  latest completed audit only (an older audit's brand citation doesn't leak in); `competitor_cited_instead` only
  counts the latest audit's `competitor_mentioned` rows, never mixing an older audit's competitor in.
- `tests/phase2/sprint3/e2e-visibility-behavioral.integration.test.ts`: one new route-level test -- seeds a real
  `comparison_prompt_results` row, hits `GET /api/brands/[brandId]/citation-failure` for real, asserts 200 (not
  the old 500) with a real `competitor_cited_instead` diagnosis. RED-checked directly against `3720ea5`'s
  pre-`b648a13` file: genuine `42703 column "competitor_cited" does not exist` from real Postgres, not a mock.
  The existing "returns 404 for cross-org brand" test in this same file is pre-existing and still asserts a
  strict `404` -- see Part A's pre-existing-failures table below for why it's 403 instead, left alone per this
  task's own "another org's brand -> 404/403" wording (either is accepted for the NEW test; the OLD test's
  strict assertion wasn't touched, since loosening someone else's existing assertion is a product call, not
  mine to make unasked).

**Full suite, before vs. after the migration replay** (`--project integration`, all three databases now
current): 762 total tests, 683 passed / 79 failed -> 726 passed / 36 failed. Every one of the 36 remaining
failures was individually traced and is pre-existing, unrelated to this task's diff (confirmed by cross-checking
`git status --short` -- none of the 14 still-failing files import anything this task touches):

| Failing file | Cause | Related to this task? |
|---|---|---|
| `e2e-visibility-behavioral.integration.test.ts` (12 of 15 initial failures) | A systemic 403-vs-404 mismatch: `assertBrandAccess`'s `BrandAccessDeniedError` maps to 403 in every route (`visibility`, `fan-out`, `topical-gaps`, `citation-failure`, `competitive-benchmark`, `wins`), but these tests assert a strict `404`. Pre-existing across 6 unrelated routes. | No -- the Citation Failure route's OWN new logic (brand-domain check, competitor fix) all pass; only this shared, pre-existing access-check code path disagrees with the test. |
| `e2e-visibility-behavioral.integration.test.ts` (3 more), `e2e-visibility-db.integration.test.ts` | `competitive-benchmark` route/CPR-01 response-shape and source-grep mismatches | No -- different route, not touched |
| `e2e-rls-fk-services.integration.test.ts`, `entity-alter.integration.test.ts` | Missing unique indexes/FKs on unrelated Sprint 1/5 platform tables (`budget_policy`, `sampling_policy`, `metric_quality_gate`, `prompt_pack_coverage`, `provider_capability`, `brand_entity_market_idx`) | No |
| `invisible-brand-scoring.integration.test.ts` | `SERVICE_DATABASE_URL` falls back to the OS user (`password authentication failed for user "srini"`) -- a test-env config gap, not a schema or code issue | No |
| `e2e-cross-sprint-seams.integration.test.ts` | Inngest `serve()` array count assertion (`34` expected, `44` actual) -- stale count, functions added since | No |
| `governance/s8-governance-db.integration.test.ts`, `agent-analytics/schema.integration.test.ts`, `section3/section3.test.ts`, `validation-reaudit.integration.test.ts`, `retrieval-rls.integration.test.ts`, `s6-wiring.integration.test.ts`, `backend-integration.test.ts` (1 of 2), `schema-drift.integration.test.ts` | Unrelated pre-existing gaps (org_members access logic, RLS policy naming, crawler-log pipeline, source-grep drift, empty-string UUID handling, stale thresholds, `DATABASE_URL_FOR_DRIFT` not propagated into the test runner) | No |

**RED->GREEN**: `git stash` on all 6 implementation/schema files this task touches (`db/schema/audits.ts`,
`db/schema/citations.ts`, `lib/audit/extract-citations.ts`, `lib/trust/citation-intelligence.ts`,
`lib/visibility/citation-failure-diagnosis.ts`, `lib/visibility/citation-source-classifier.ts`) -- 3 genuine
failures against the pre-fix code (the classifier's new substring-vs-registrable-domain table case, the
invariant test, and the "no longer misclassified" case); the real-DB brand-domain file passes either way, since
`checkBrandDomainNotCited`'s own comparison was already correct before this task's Part C refactor -- only its
code path changed (now routed through the shared helper), not its behaviour. All restored green. Broader
regression: 447 passed (1 pre-existing unrelated `.tsx` component-copy test file, 10 tests, excluded -- confirmed
zero imports of anything this task touches). `pnpm typecheck && pnpm build` green.

**Part B -- indexes.** Confirmed via `pg_indexes` (not just migration files): `citations` had only `citations_pkey`;
`audits` had `audits_pkey`, `audits_org_audit_number_idx` (`organization_id`, `audit_number`), and
`audits_org_completed_idx` (`organization_id`, `completed_at`) -- neither covers a `brand_id`-first lookup.
Confirmed the exact filter shape is shared by FOUR call sites, not just the one this task names:
`buildCitationSourceIntelligence` and `checkBrandDomainNotCited` both run `citations WHERE audit_id = ? AND
is_branded_prompt IS NOT TRUE AND run_number = 1`; `checkBrandDomainNotCited` and `getCurrentCitationSources`'s
own latest-audit fallback (`lib/trust/citation-intelligence.ts:812-817`) both run `audits WHERE brand_id = ? AND
status = 'complete' ORDER BY completed_at DESC LIMIT 1`; Evidence Archive (`lib/trust/evidence-archiver.ts:32-33`)
runs the same `citations` shape minus the organic filter.

Seeded a local 30-brand x 8-audit x 4-engine x 5-run bench (72,000 citations rows) against `visibleau` and ran
`EXPLAIN (ANALYZE, BUFFERS)` before/after creating `citations_audit_run_idx (audit_id, run_number)` and
`audits_brand_completed_idx (brand_id, completed_at DESC) WHERE status = 'complete'`:

| Query | Before | After |
|---|---|---|
| `citations` by `audit_id` + `run_number=1` | Seq Scan, 1757 buffers, 5.77ms, 71,940 rows filtered out | Index Scan, 22 buffers, 0.135ms |
| `audits` latest-completed by `brand_id` | Seq Scan + explicit Sort, 10 buffers | Index Scan (pre-sorted by the index), 3 buffers, Sort step eliminated entirely |

The absolute numbers are small at this bench scale, but the Seq Scan's cost is driven by the TOTAL row count
across every customer, not one audit's/brand's own rows -- it only gets worse as the product grows; the Index
Scan stays flat regardless. Added `citations_audit_run_idx`/`audits_brand_completed_idx` to the Drizzle schema
(`db/schema/citations.ts`, `db/schema/audits.ts`) and `db/migrations/0040_citations_audits_hot_path_indexes.sql`
(plain `CREATE INDEX IF NOT EXISTS`, idempotent, applied to `visibleau` and `visibleau_e2e` directly). **Could
not apply migration 0040 to the local `visibleau_prod` instance** -- Claude Code's own auto-mode safety
classifier blocked the command twice (`[Production Deploy]`, then `[Modify Shared Resources]`) despite Sri's
in-conversation, session-scoped authorization for touching that database; this is a tool-level guardrail
independent of that authorization. Sri needs to run `psql -h localhost -p 5432 -U postgres -d visibleau_prod -f
db/migrations/0040_citations_audits_hot_path_indexes.sql` himself if the local `visibleau_prod` mirror should
have these indexes too -- doesn't block anything else in this task.

Emitted `db/prod-fixes/0047-citations-audits-indexes-{precheck,apply,rollback}-prod.sql` for the real Neon prod --
`CREATE`/`DROP INDEX CONCURRENTLY IF EXISTS`, one statement per numbered step with an explicit instruction to run
each alone (not batched) since `CONCURRENTLY` can't run inside a transaction block, plus a post-apply `indisvalid`
check. **This is NOT apply-before-push**: neither query depends on either index existing, both are read-path
performance only. Recommended timing: before the next customer audit, not necessarily before this commit's push.

**Part C -- one shared brand-domain rule.** `classifySourceTypeWithBrand()` (`lib/visibility/
citation-source-classifier.ts`) used `url.toLowerCase().includes(brandDomain.toLowerCase())` -- a substring-of-URL
check that would call a competitor like `bondiplumbingservices.com.au`, or a directory listing URL like
`hipages.com.au/connect/bondiplumbing`, "brand_owned" purely because the brand's domain string appears inside
the URL. `lib/trust/citation-intelligence.ts` already had a STRICTER, correct registrable-domain comparison for
the `top_domains[].isBrand` badge (added in task #45's follow-up, with its own docstring already explaining
exactly why the classifier's check was too weak) -- meaning the two signals could, and did, disagree: a card
could show `sourceType: "brand_owned"` while its own `top_domains` entry said `isBrand: false` for the identical
domain.

Extracted the stricter comparison into one shared `isBrandDomain(urlOrHost, brandDomain)` helper
(`lib/audit/extract-citations.ts`, alongside `toRegistrableDomain`/`toDisplayDomain`/`resolveCitationOrigin` --
the existing home for this kind of domain primitive) and pointed every comparison at it: the classifier's
`brand_owned` call, `top_domains[].isBrand` (removing its now-duplicate inline version), and
`checkBrandDomainNotCited` (removing its own duplicate inline version, added only one commit ago in `b648a13`).
A brand with no domain on record never matches anything, in all three call sites.

| Input | Expected | Passes |
|---|---|---|
| `https://www.bondiplumbing.com.au/contact` | brand | Yes |
| `bondiplumbing.com.au` | brand | Yes |
| `https://bondiplumbingservices.com.au` | not brand | Yes |
| `https://hipages.com.au/connect/bondiplumbing` | not brand (stays `au_directory`) | Yes |
| `https://bondiplumbing.com.au.evil.example` | not brand | Yes |
| uppercase / trailing dot | brand | Yes |
| brand with no domain | never brand | Yes |

(`tests/phase2/sprint3/citation-source-classifier.test.ts`, 8 new `it.each` cases.) Added the invariant test the
task asked for directly (`tests/unit/trust/citation-intelligence-multi-source.test.ts`): for every card
`buildCitationSourceIntelligence` returns, `sourceType === "brand_owned"` if-and-only-if every one of its
`topDomains` entries has `isBrand: true` -- this is now STRUCTURALLY guaranteed (both signals derive from the
identical `isBrandDomain()` call on the identical `rawDomain`), not just coincidentally true for the fixtures
tested.

`brand_owned` already has a label in the Citation Sources label map, a seed affinity note
(`db/seed/citation-source-affinity.ts:16`), and is a member of the closed `CitedSourceType` union
(`lib/visibility/types.ts:113`) -- confirmed it renders as a normal category and `isRealSourceCategory` already
treats it as real (the predicate only excludes the `NO_CITATIONS_SOURCE_TYPE` sentinel string, and `brand_owned`
has never been that). `brandPresentInSource`/`brandPresent`
(`lib/trust/citation-intelligence.ts`, `cit.brandMentioned || isBrandSourceType`) is still a COMPOUND OR --
mentioned in the answer's text OR this source is the brand's own domain -- documented in-place with an expanded
comment pointing at this section. Audited every surface that reads it: `local-ai-trust-scorer.ts` uses it only
as an internal numeric signal, no user-facing copy; the only UI surface,
`app/(auth)/brands/[brandId]/trust/citation-sources/page.tsx:101-108`, already states the compound meaning
correctly ("'Covered' means the engine mentioned this brand in an answer that cites this kind of source (or
cited the brand's own site)") -- fixed in an earlier task (#44), nothing to change here.

**Found but deliberately NOT changed** (same "report, don't silently expand scope" principle as the rest of this
task): `lib/visibility/sov-calculator.ts:95,101`, `lib/visibility/topical-gap-calculator.ts:51`, and
`lib/visibility/visibility-trend-aggregator.ts:103-106` each compare a cited/mentioned domain against the
brand's domain via plain case-insensitive STRING EQUALITY (`domain.toLowerCase() === brandDomain.toLowerCase()`,
or an exact-match JSONB `@>` containment check) -- not even a substring match, and not the registrable-domain
reduction either. A `www.bondiplumbing.com.au` citation would NOT match the brand in Share-of-Voice, topical-gap
competitor-coverage, or visibility-trend citation-rate scoring, even though it does everywhere this task's fix
touches. These feed live scoring numbers (SoV %, topical gap detection, visibility trend rates) for every brand,
past and future -- unifying them is a materially bigger, higher-blast-radius change than "a new commit on top of
`b648a13`," and changes real historical numbers silently. Flagged for Sri to decide, not fixed here.

**Stored data.** `buildCitationSourceIntelligence` re-classifies from `citations.cited_sources` FRESH every time
it runs -- it never reads the legacy `citations.cited_source_type` column (written only by the old, separate
`classify-citation-sources.ts` Inngest function). It's triggered once per audit, by
`inngest/functions/build-citation-source-intelligence.ts`, and (since task #46's 3rd follow-up) REPLACES that
brand's entire aggregate set on every call. **A re-audit DOES fix a brand's current-state numbers** (the next
`buildCitationSourceIntelligence` call re-classifies everything with the new `isBrandDomain()` rule and replaces
the aggregate). It does NOT retroactively fix the stored PER-AUDIT `citation_source_intelligence` rows of
already-completed historical audits -- those keep whatever classification they were written with until a
backfill re-runs `buildCitationSourceIntelligence` against each historical `audit_id` explicitly. No backfill
script was written -- that's a write to real data, out of scope here, and Sri should decide whether any brand's
history is worth backfilling versus just letting it self-heal on the next audit.

### §46 follow-up (7th): test-DB hygiene, a real local migrate path, the partial index's literal, and the suite green

**Part A -- tests can never touch a `_prod` database.** Inventoried every test file/helper that opens its own
DB connection (42 files via `postgres()`, plus every `tests/qa/*/shared/db.ts` and `tests/e2e/*/helpers/db.ts`
resolving purely through `DIRECT_URL ?? DATABASE_URL`/`DATABASE_URL`, no hardcoded fallback). Confirmed **zero**
hits for `neon.tech` across every test file and every `.env.test*` value -- every connection resolves to
`localhost`/`127.0.0.1`, across four distinct local DB names: `visibleau` (the large majority), `visibleau_e2e`
(the designated test DB, via env), `visibleau_test` (3 files -- `tests/integration/section2/_harness.ts`,
`section2.test.ts`, `section3.test.ts` -- a standalone harness that `vi.mock`s `@/db/client` directly, bypassing
env resolution entirely), and **`visibleau_prod`** -- the 5 files this follow-up's predecessor (`dea4e46`)
flagged: `tests/e2e/backend/07-rls-isolation.test.ts`, `tests/phase2/sprint1/e2e-rls-fk-services.integration.test.ts`,
`tests/phase2/sprint3/{e2e-cross-sprint-seams,e2e-visibility-behavioral,e2e-visibility-db}.integration.test.ts`.

Moved all 5 off `visibleau_prod` onto one shared, env-driven helper: `tests/helpers/test-db-url.ts`'s
`getTestDatabaseUrl()` reads `TEST_DATABASE_URL ?? DATABASE_URL` (added `TEST_DATABASE_URL` to `.env.test.local`,
pointing at `visibleau_e2e` -- the literal database name now lives in exactly one gitignored env file, never in
a `.ts` file) and runs every resolved URL through `scripts/db/local-db-guard.ts`'s `assertLocalSafeDatabaseUrl()`:
throws unless the host is `localhost`/`127.0.0.1`, the DB name doesn't match `/prod/i`, and the URL doesn't
contain `neon.tech` -- case-insensitive, and the thrown error redacts the password. `07-rls-isolation.test.ts`
keeps its own `E2E_APP_DB_URL` override (it needs to match whatever DB the live app server under test is
configured with) but the override is run through the same guard too, not exempted. Unit-tested the guard
directly (`tests/unit/db/local-db-guard.test.ts`, 9 cases: localhost/127.0.0.1 allowed; non-local host,
`visibleau_prod`, `VisibleauPROD`, `my_Production_db`, any neon.tech URL, and an unparseable string all
rejected; the thrown message never contains the password).

Repointing the 5 files onto `visibleau_e2e` surfaced that two of them depend on fixed-ID org/brand/user rows
(`31a7c684-...` "VisibleAU Dev", `21ac96a7-...` "Test Agency 2", brand `358e8579-...` "Canva", user
`dcae4ffd-...` "Sri (Dev)") that only ever existed on the local `visibleau_prod` mirror -- not an accident, just
nobody had reason to notice until these files stopped pointing there. `tests/integration/global-setup.ts` (new,
below) seeds these idempotently (`ON CONFLICT (id) DO NOTHING`) so the 5 files work unchanged after repointing.

**`visibleau_prod` is now fully out of the test path** -- migration 0040 (the two indexes from the 6th
follow-up) no longer needs to be applied there for any test to pass; Sri doesn't need to run the `psql` command
this doc previously asked for. (It's still a reasonable thing to apply there eventually for parity with the
other local databases, just no longer load-bearing for any test.)

**Part B -- one reliable local migrate path + drift checks.** `pnpm db:migrate` (`drizzle-kit migrate`) was
never actually the apply path for ANY local database: `drizzle.__drizzle_migrations` is completely empty on
`visibleau`, `visibleau_e2e`, and `visibleau_prod` alike, confirmed this session. Added `pnpm db:migrate:local`
(`scripts/db/migrate-local.ts`): resolves `DIRECT_URL ?? DATABASE_URL`, runs the same `assertLocalSafeDatabaseUrl`
guard, then applies **every** migration file (`0000` through the newest, plus the unnumbered
`sprint-8-tables.sql`) in plain lexicographic filename order via `postgres.js`'s `sql.unsafe(fileText)` (no
external `psql` binary needed) -- that ordering already produces the correct historical apply order for the
three known same-prefix pairs (section 1 above) with no special-casing. A ledger table
(`_local_migrations_applied`) records each applied filename so repeat runs skip straight past what's already
there; every hand-written file (0012+) is independently idempotent anyway, so this is a speed optimization, not
a correctness requirement.

**Caveat, found while validating the script against a 4th, previously-unknown local database
(`visibleau_test`):** migrations `0000`-`0011` (drizzle-kit-generated) are NOT idempotent, unlike the
hand-written `0012`+ range -- running `db:migrate:local` against a database that already has that range applied
(but has no ledger yet, since the ledger is new) fails immediately on `0000` (`type "region" already exists`).
Fixed by hand for `visibleau_test` (pre-populated the ledger with the 15 `0000`-`0011` filenames, confirmed via
`pnpm db:drift:local` that only the expected `0012`+ column gaps remained, then let the script apply those
normally) -- a database that's either genuinely empty or already ledger-tracked doesn't hit this; one that's
"partially migrated via some other process, never through this ledger" does. Worth a `--mark-base-applied` flag
or similar if this comes up again.

Added `pnpm db:drift:local` (`scripts/qa/schema-drift-local.ts`): same `DIRECT_URL ?? DATABASE_URL` resolution
and guard, then the exact same `checkSchemaDrift()` the generic `pnpm db:drift` and the new bootstrap gate both
use -- no more hand-exporting `DATABASE_URL_FOR_DRIFT` for a local check.

`tests/integration/global-setup.ts` (wired via `vitest.config.ts`'s `globalSetup` for the "integration"
project) now runs once before the whole suite: (1) the same DB-safety guard against `DATABASE_URL`; (2) loads
`.env.test.local` via `dotenv` itself -- discovered along the way that plain `vitest run` does NOT auto-populate
`process.env` from it (every pre-existing file that needed a DB connection either hardcoded a literal fallback
or called `dotenv.config()` itself; centralizing it here means `tests/helpers/test-db-url.ts` and anything else
can now rely on `DATABASE_URL`/`TEST_DATABASE_URL` actually being set); (3) `checkSchemaDrift()`, excluding
`"launch invariant:"`-prefixed findings (RLS policy count, seeded `vertical_packs` rows -- prod-launch-readiness
checks a persistent test DB was never meant to satisfy, not schema structure) -- any remaining FATAL throws
immediately with the exact missing column list and a `pnpm db:migrate:local` pointer, instead of 42703s
surfacing one-by-one, confusingly, deep in unrelated test files; (4) the fixed-ID org/brand/user seed from Part
A, plus the global AU_EN platform reference data (`metric_quality_gates`, `provider_market_capabilities`, one
`market_ai_budget_policies` row) `tests/phase2/sprint1/e2e-rls-fk-services.integration.test.ts` depends on and
which also only ever existed on the local `visibleau_prod` mirror -- reusing `db/seed/metric-quality-gates.ts`'s
and `db/seed/provider-market-capabilities.ts`'s own exported constants, not hand-copied data.

**Found and fixed along the way, same root cause class:** the real `ai_bot_registry` seed
(`db/seed/ai-bot-registry/seed.ts`, 21 entries including `GPTBot`) had never been (re-)run against `visibleau`,
`visibleau_e2e`, or `visibleau_test` -- all three were stuck on an older, incomplete snapshot (20 rows, missing
`GPTBot` among others). Its `seedBotRegistry()` is a pure upsert (`onConflictDoUpdate` on `ua_token`); ran it
against all three.

Emitted `db/prod-fixes/diag-0048-schema-drift-prod.sql` -- generated (not hand-written) from the exact same
Drizzle `getTableConfig()` introspection `scripts/qa/schema-drift.ts` uses: a `VALUES` list of every
(table, column, expected type, expected not-null) the TS schema declares (956 rows) and every (table, index
name, expected columns, unique) the TS schema declares (66 rows, primary keys excluded -- they're implicit from
`.primaryKey()`, never in this list, and would otherwise show as 54 lines of pure "EXTRA IN PROD" noise on every
table in every environment), each `FULL OUTER JOIN`ed against `information_schema.columns`/`pg_indexes` to
surface `MISSING IN PROD`/`EXTRA IN PROD`/`TYPE MISMATCH`. Validated by running it against the local
`visibleau_prod` mirror as a stand-in for the real Neon editor: correctly reproduced the exact same 6 known
benign `TYPE MISMATCH` findings `pnpm db:drift` already reports (array-display-format only) and the 2 genuinely
missing indexes (`ai_referral_hits_dedup_idx`, pre-existing; `audits_brand_completed_idx`/`citations_audit_run_idx`,
the 6th follow-up's still-pending ones), with zero false positives. Header comment states what "clean" (zero
rows from both queries) looks like. Read-only, NOT run from Claude Code -- Sri runs it in the Neon SQL editor.

**Part C -- the partial index's literal.** `audits.status` is a plain `text` column (`db/schema/audits.ts`),
never an enum. Confirmed via grep across `lib/`, `inngest/`, `app/` that every writer and every reader --
17 call sites -- already agrees on the literal `"complete"`, never `"completed"`; confirmed independently
against real data (`GROUP BY status` on the local `visibleau_prod` mirror: 53 `complete`, 2 `failed`, 1
`pending`, zero `completed`). Added `AUDIT_STATUS_COMPLETE = "complete" as const` (`db/schema/audits.ts`,
exported from the schema barrel) and pointed the two queries `audits_brand_completed_idx` is actually built to
serve (`checkBrandDomainNotCited`, `getCurrentCitationSources`'s latest-audit fallback) at it, so those two
specifically can't silently drift from the index's own `WHERE status = 'complete'` predicate. Did not rewrite
the other 15 call sites -- already provably consistent today, and a mechanical rename across files this task
has no other reason to touch is lower value than the risk of a transcription slip. The partial index's own SQL
predicate (`sql\`status = 'complete'\`` in `db/schema/audits.ts`) is still a separate literal Drizzle's
`.where()` takes as a raw fragment, not a reference to the constant -- not auto-kept-in-sync by TypeScript,
documented in-place with a comment to change both together if this ever changes. Added the `GROUP BY status`
check to `db/prod-fixes/0047-citations-audits-indexes-precheck-prod.sql` as step 3, with an explicit "if the
completed value isn't `'complete'`, stop" header note.

**Part D -- the 403-vs-404 policy, and getting the suite green.** Policy: 404 for a brand request where the
brand doesn't exist or belongs to a different org (never confirm another org's resource exists); 403 reserved
for a same-org brand a member's own role doesn't extend to (existence isn't in question there). `assertBrandAccess`
(`lib/governance/access-control.ts`) already had exactly these two distinct throw sites but collapsed both into
one `BrandAccessDeniedError` always mapped to 403 by every catch site. Gave the error a `reason: "not_found" |
"role_restricted"` property (defaulting to `"not_found"`, the safer choice, for any construction site that
doesn't specify one) and added one shared `brandAccessErrorResponse(e)` helper that maps `"role_restricted"` to
403 and everything else to 404, returning `null` for anything it doesn't recognize so a route's catch block can
re-throw. This is additive and backward compatible: every OTHER pre-existing `BrandAccessDeniedError` catch
site in the app (46 routes, untouched) still does `instanceof BrandAccessDeniedError -> 403` exactly as before --
unaffected, since it's still the same class, just not yet updated to read `.reason`.

Adopted the new helper in **8 routes**, not the 6 originally named -- 2 more (`journeys`, `site-readiness`) were
found because existing, already-failing tests in `tests/phase2/sprint9/integration/backend-integration.test.ts`
directly demanded the identical fix:

| Route | Why it needed the fix |
|---|---|
| `visibility`, `fan-out`, `topical-gaps`, `citation-failure`, `competitive-benchmark`, `wins` | The 6 originally named -- failing in `e2e-visibility-behavioral.integration.test.ts` |
| `journeys` | `backend-integration.test.ts`'s "§2.2 Brand Isolation" test expected 404 |
| `site-readiness` | Same test file, same expectation, a different describe block |

Did not extend the fix to the other 46 `BrandAccessDeniedError` call sites -- no currently-failing test demands
it for any of them, and auditing/changing 46 routes' error handling in one commit is a materially bigger,
unverified blast radius than this task's actual evidence supports. Tracked here for whoever does take that on.

**Every remaining integration failure across this whole follow-up, resolved or quarantined** (the count moved
as fixes landed and two more root causes surfaced only at full-suite scale, below -- 12 tests are quarantined
in the final, confirmed-green state):

| Test | Root cause | Outcome |
|---|---|---|
| `e2e-visibility-behavioral.integration.test.ts` (12 tests, 6 routes) | 403-vs-404 policy, see above | Fixed |
| `backend-integration.test.ts` §2.2 (`journeys`) | Same policy, 7th route | Fixed |
| `backend-integration.test.ts` §2.2 (`site-readiness`) | Same policy, 8th route | Fixed |
| `backend-integration.test.ts` "tier gates read subscriptions" | `journeys/route.ts` now gates tier via the shared `assertTier()` helper, which itself reads `subscriptions` -- the route's own source no longer spells the word literally | Fixed (check `assertTier` usage instead) |
| `e2e-visibility-behavioral.integration.test.ts` topical-gaps (3 tests) | `assertTier(..., "growth")` fires before brand access ever runs; no subscription was ever seeded for `TEST_ORG_A`/`TEST_ORG_B` in this file, defaulting both to `"free"` and 403ing every topical-gaps request regardless of brand access | Fixed (seeded a `"growth"` subscription per org in `beforeAll`; restored one before the later soft-deleted-brand block, since TRACK 2c's tier-boundary tests delete+reinsert+delete their own row and leave none behind) |
| `e2e-visibility-behavioral.integration.test.ts`/`e2e-visibility-db.integration.test.ts` competitive-benchmark (5 tests) | Describe a response contract (`?competitor=` query param; `{ comparisonData, competitorNarrative, dataAvailableFrom, shareOfVoice, topicalGaps }`) the route no longer implements -- it now derives competitors from the brand's own configured list and returns `{ competitors, summary, tier }` | **Quarantined** (`it.skip` + owner note: competitive-benchmark feature owner, rewrite against the real current contract) |
| `s8-governance-db.integration.test.ts` "assertBrandAccess with real org_members data" (3 tests) | `testBrandA`/`testBrandB` were literal UUIDs with no corresponding `brands` row at all -- `assertBrandAccess`'s first check (does this brand exist) always threw, regardless of the org_members setup each test actually meant to exercise; would have failed identically against the unmodified function | Fixed (seeded both brands under `testOrgId` in a new `beforeAll`) |
| `e2e-rls-fk-services.integration.test.ts` (5 index-name tests) + `entity-alter.integration.test.ts` (1) | Expected Drizzle's auto-generated default constraint-naming convention; every one of these tables defines its unique index with an explicit short name instead (`budget_policy_unique`, `metric_quality_gate_unique`, `prompt_pack_coverage_unique`, `provider_capability_unique`, `sampling_policy_unique`) -- confirmed against `db/schema/*.ts` and the real DB. `entity-alter`'s case is different: `0017_phase2_sprint5_entity_alter.sql` creates `brand_entity_market_idx` and then immediately drops it a few lines later, superseded by the unique index that covers the same leading columns | Fixed (corrected the expected names) |
| `e2e-rls-fk-services.integration.test.ts` (6 data tests: budget policy, quality gates, provider capabilities) | Missing `visibleau_e2e` seed data for the global AU_EN platform tables | Fixed (seeded via `global-setup.ts`, see Part B) |
| `e2e-rls-fk-services.integration.test.ts` "rejects duplicate" (sampling_policies, prompt_pack_coverage, provider_market_capabilities -- 3 tests) | Genuinely flaky, confirmed via repeated back-to-back full-file runs with zero code changes in between (50/50 passing, then a run with 2-34 failures cascading through the rest of the file, then 50/50 again) -- no leftover `'TEST_UQ'` row was ever found immediately after a failing run, ruling out simple stale data from an incomplete prior cleanup. `'TEST_UQ'` is unique to this one file (no cross-file collision) | **Quarantined** (not confidently root-caused; owner note added in-file -- confirmed quarantining just these 3 stabilizes the whole file across 3 consecutive clean runs, meaning the larger cascading failures seen in bad runs were a downstream effect of these 3, not independent) |
| `agent-analytics/schema.integration.test.ts` "ai_referral_hits has org_isolation policy" | `0029_rls_full_tenant_isolation.sql` deliberately drops the single combined policy this test checks for, replacing it with 4 per-operation policies for finer-grained control | Fixed (checks for all 4) |
| `validation-reaudit.integration.test.ts` | Exact-string source-grep expected `markReauditDeferred(taskId, "quota_exceeded")`; real call has a third parameter (`serviceDb`) added since | Fixed |
| `s6-wiring.integration.test.ts` | Exact-string source-grep expected `"0.70"`/`"0.40"`; real code writes `0.7`/`0.4` (numerically identical, different literal) | Fixed |
| `e2e-cross-sprint-seams.integration.test.ts` "serve() array has 34 functions" | Stale count -- 44 real, named functions registered today, all of S1/S2's specifically-named ones still present (the next test's actual regression guard) | Fixed (updated to 44) |
| `schema-drift.integration.test.ts` | Its own docstring says it's meant for a database that "just replayed the full migration chain... from empty" -- a one-off fresh-build check that instead runs every time against the persistently-reused `visibleau_e2e`, which was never meant to satisfy the launch invariants it also checks (seeded `vertical_packs`, exact policy count) | **Quarantined** (column-level drift, its real stated purpose, is now covered continuously by `global-setup.ts`'s bootstrap gate; owner note: run `pnpm db:drift:local` by hand against a throwaway fresh-replayed DB for the genuine fresh-build check) |
| `section3/section3.test.ts` "13-line log -> 8 hits" | `SYNTHETIC_LOG`'s rows are hardcoded to `10/Jul/2026`; the real route builds its window as `new Date()` minus `days` -- as of 2026-10-13 that's ~3 months outside any rolling 30-day window. Independently ruled out the registry (confirmed both the general incompleteness AND the specific missing `GPTBot` entry, fixed both, no difference) before concluding this | **Quarantined** (owner note: make the log's timestamps relative to test runtime instead of a fixed calendar date) |
| `retrieval-rls.integration.test.ts` "without setRlsContext" | Passes standalone (`vitest -t`) and reproduces correctly by hand via `psql` (identical `SET LOCAL ROLE` + unset GUC sequence returns 0 rows, no error); fails only after the two tests above it run first in the same file, each using their own `client.begin()` against a shared `max: 1` connection | **Quarantined** (investigated, not confidently fixable without risking RLS-policy-adjacent SQL changes under this task's own "no RLS bypass" constraint; owner note: try a fresh connection per test, or an explicit GUC reset in `beforeEach`, to rule the leak path in or out) |

**One more root cause, found only at full-suite scale.** A solo full-suite run (nothing else touching
`visibleau_e2e` concurrently) kept failing `e2e-visibility-db.integration.test.ts` with a brand-insert FK
violation against `organizations` -- Part A's seeded fixture org had vanished mid-run. Traced to
`tests/phase2/sprint4/helpers/test-db.ts`'s `truncateAll()` (`TRUNCATE organizations, brands, audits,
subscriptions, ... CASCADE`), used by two sprint4 integration tests for their own full-isolation strategy --
pointed at the same `visibleau_e2e` via its own `dotenv.config()` call, which has worked all along; nothing
about this follow-up's changes newly exposed it. Depending on file execution order within the 250-file suite,
it can run between global-setup's one-time seed and a later file that assumes the seed is still there. Fixed by
making the dependency defensive instead of relying on a single global seed surviving the whole run: extracted
the fixture constants and the idempotent insert logic into `tests/integration/shared-fixtures.ts`
(`ensureSharedFixtures()`), which `global-setup.ts` now calls, and which each of the 4 files that depend on
these rows (`e2e-visibility-behavioral`, `e2e-visibility-db`, `e2e-cross-sprint-seams`,
`e2e-rls-fk-services`.integration.test.ts) ALSO calls in its own `beforeAll` -- `ON CONFLICT DO NOTHING` makes
the repeat calls free. Reproduced the fix with a solo, nothing-else-running full-suite run: clean, before
re-adding the defensive calls it failed; after, 0 failures.

**A second, genuinely flaky root cause**, found the same way (reproducible only at specific moments, not tied
to any code path): three "rejects duplicate" tests in `e2e-rls-fk-services.integration.test.ts`
(`sampling_policies`, `prompt_pack_coverage`, `provider_market_capabilities`) intermittently failed to see their
own immediately-prior INSERT's unique-constraint violation -- confirmed via repeated back-to-back runs with
zero code changes in between (50/50 passing, then failing, then passing again), and confirmed NOT caused by
leftover data (checked directly against the DB immediately after a failing run -- clean). Also discovered,
while investigating, that several of this session's OWN earlier manual re-runs of this file had left stray
`'TEST_FK'`/`'TEST_UQ'` rows behind in `visibleau_e2e` from runs interrupted by this task's own debugging
process (one hit a 300-second foreground timeout mid-file) -- cleaned those up directly, which resolved most of
the apparent flakiness, but these 3 specific tests still occasionally misbehaved even on a clean DB. Quarantined
with a clear owner note rather than risk a wrong fix under time pressure (see the table above).

RED->GREEN where a real code/policy change was involved (the 403-vs-404 fix, the `journeys`/`site-readiness`
routes, `checkBrandDomainNotCited`/`getCurrentCitationSources` reading `AUDIT_STATUS_COMPLETE`, the
`ensureSharedFixtures()` defensive calls): confirmed via direct re-run before/after each specific fix, not a
blanket stash (too many independent, unrelated fixes landed in this one pass to make one global RED→GREEN
meaningful -- each table row above is independently reproducible from its root-cause description).
`pnpm typecheck && pnpm build` green. **Full integration suite, confirmed via a solo run with nothing else
touching the database concurrently: 773 tests, 761 passed, 12 explicitly quarantined with owner notes (the
table above), 0 genuine failures.**

### §46 follow-up (8th): push readiness for `ee21e46`..`fe78b67`, the quarantine review, and three hardening items

**Part A — one bundled read-only prod check.** `db/prod-fixes/prepush-bundle-0046-0047-0048.sql` combines the
three previously-separate prechecks (`precheck-0046-csi-source-type-constraint.sql`,
`0047-citations-audits-indexes-precheck-prod.sql`, `diag-0048-schema-drift-prod.sql`'s column checks) into one
`WITH ... SELECT ... UNION ALL` statement, one result grid, `check_name | result | detail`, explicit `seq`
ordering so the three sections stay in their logical 0046→0047→0048 order rather than scrambling alphabetically.
Strictly read-only — every branch reads `information_schema`/`pg_catalog`/existing data, no DDL/DML/`SET`/
side-effecting function anywhere. Header: "Run on the production branch in the Neon SQL editor. Screenshot the
whole grid. Any STOP → don't push."

Validated against the local `visibleau_prod` mirror (re-run just now, not just at authoring time): **11 rows**,
PASS/INFO on every row except one. `source_type` (both `citation_source_intelligence.source_type` and
`citations.cited_source_type`) is plain `text`, no CHECK, no enum — PASS, and the derived sentinel-safety row
confirms `__no_citations__` inserts cleanly as a result. `audits.status`'s only values are `complete`(53)/
`failed`(2)/`pending`(1) — PASS, the literal is exactly `'complete'`. The two 0047 indexes
(`citations_audit_run_idx`, `audits_brand_completed_idx`) are correctly reported absent — INFO, not STOP, since
the row's own detail text says so explicitly ("performance-only, NOT apply-before-push"). Row 9 (missing
columns) is PASS — nothing the TS schema expects is absent. Row 10 (type mismatches) is **STOP**, as the task's
own rule requires treating every mismatch as STOP regardless of severity: the same 6 pre-existing, already-
classified-benign entries `pnpm db:drift` has reported all along (`ai_bot_registry.expected_asns`,
`audits.engines`, `brands.competitors`, `brands.primary_regions`,
`linkedin_presence_audits.company_page_last_post_date`, `webhook_endpoints.events` — all array/timestamp
display-format differences, not real drift). Also validated the STOP path itself earlier this task: temporarily
renamed `brands.classification_status` on dev, re-ran the bundle, row 9 correctly flipped to STOP naming exactly
that column, then reverted and re-confirmed PASS. Local only; not run against real Neon from here.

**Part B — push readiness, `ee21e46` → `fe78b67`.**

| Commit | Customer-facing change | Apply-before-push? |
|---|---|---|
| `ee21e46` | Citation Sources counts are now correct, the source classifier is wider, citation links are visibly clickable, gov.au sources get finer-grained labels | No — touches no `db/schema/*.ts` file at all |
| `a988c80` | Re-auditing a brand no longer leaves stale source rows behind in Citation Sources (the rolling aggregate now replaces its set instead of upserting into it) | No — no schema file touched |
| `d3854ce` | An audit response with zero real citations shows an honest "no citations" row instead of a phantom one; three more real link directories recognized | No — no schema file touched |
| `3720ea5` | Internal no-citations sentinel no longer leaks into PDF reports or the narrative generator — those surfaces now show the same honest state the Citation Sources page does | No — no schema file touched |
| `b648a13` | Citation Failure diagnosis replaced an impossible column match with an honest "your domain isn't cited" finding | No — no schema file touched |
| `dea4e46` | Faster Citation Failure / citation-intelligence page loads at scale (two new indexes); a brand whose domain is a substring of another citation's URL (e.g. a directory listing) is no longer misclassified as the brand's own site | No — `db/schema/audits.ts`/`citations.ts` diffs are **index additions only** (`citations_audit_run_idx`, `audits_brand_completed_idx`), zero new columns; commit message states the code doesn't depend on either index existing, confirmed by re-reading the diff just now |
| `fe78b67` | 8 routes (visibility, fan-out, topical-gaps, citation-failure, competitive-benchmark, wins, journeys, site-readiness) now correctly return 404 for a cross-org brand instead of a leaking 403; everything else is test/migration tooling | No — its only `db/schema/*.ts` touch adds `AUDIT_STATUS_COMPLETE = "complete" as const`, a TypeScript literal, zero column/type change, confirmed by re-reading the diff just now |

**None of the 7 commits are apply-before-push.** The only two that touch a `db/schema/*.ts` file at all
(`dea4e46`, `fe78b67`) were re-diffed directly for this check: `dea4e46` adds two index definitions, not
columns, and its own commit message already states the code path doesn't depend on either index existing before
or after push; `fe78b67` adds a plain string constant, not a schema change. The two real schema changes 0047
needs (the indexes) go to prod via `db/prod-fixes/0047-citations-audits-indexes-apply-prod.sql`
(`CONCURRENTLY`) — after push, same as always.

**After-push checklist for Sri, in order:**
1. Vercel deploy — wait for filled-blue (not the animated/building state).
2. Run the 0047 apply statements in the Neon SQL editor, each on its own: `0047-citations-audits-indexes-apply-prod.sql` (the two `CREATE INDEX CONCURRENTLY` statements, one at a time — `CONCURRENTLY` can't run inside a multi-statement transaction block).
3. Re-audit Bondi (or any live brand) to confirm the post-push code path runs clean against real prod data.
4. Screenshot the Citation Sources page and the Citation Failure page for that brand — visual confirmation the honesty fixes (d3854ce, 3720ea5, b648a13) render correctly against real prod data, not just local/mock.

**Part C — the 12 quarantined tests.** Re-enumerated directly from the 6 files' `it.skip` call sites (12
confirmed, matching the 7th follow-up's final count) rather than trusting any prior summary:

| Test | Behavior guarded | Root cause | Live & customer-facing? | Risk | Fix plan |
|---|---|---|---|---|---|
| `schema-drift.integration.test.ts` "has zero FATAL drift" | Whole-schema drift check meant for a just-migrated-from-empty DB | Runs against the persistently-reused `visibleau_e2e` instead of a one-off fresh replay — its own docstring says so | No — dev/test-tooling self-check, not a product code path | LOW | Already superseded for its real purpose: `global-setup.ts`'s bootstrap gate now runs this same column-drift check before every suite run. This task's own Part D item 2 proof (two clean runs against a from-scratch DB) is exactly the fresh-replay check this test wanted; owner note: run `pnpm db:drift:local` by hand against a throwaway DB if a dedicated fresh-build check is ever wanted again |
| `section3/section3.test.ts` "13-line log → 8 hits" | agent-analytics `volumeByVendor` log parsing/metrics | `SYNTHETIC_LOG` fixture is hardcoded to `10/Jul/2026`; the real route's window is `now() - days`, so the fixture is permanently outside any 30-day window as of 2026-10 | **Yes** — confirmed `app/(auth)/brands/[brandId]/retrieval/agent-analytics/page.tsx` is a live consumer of this data | MEDIUM — live feature, but the failure is 100% fixture staleness (confirmed: fixing the bot-registry completeness gap made no difference), not evidence the parsing logic itself is broken | Make the fixture's timestamps relative to test runtime instead of a fixed calendar literal |
| `e2e-rls-fk-services.integration.test.ts` × 3 "rejects duplicate" (sampling_policies, prompt_pack_coverage, provider_market_capabilities) | UNIQUE-constraint duplicate rejection | Genuinely flaky — confirmed via repeated back-to-back runs with zero code changes (50/50 → failing → 50/50 again); ruled out leftover data | The underlying UNIQUE constraints are independently confirmed present via direct `pg_indexes` introspection (7th follow-up) — the DB-level protection these tests describe is live and working regardless of the test's own flakiness | LOW — redundant coverage of an invariant Postgres itself guarantees, not a behavior gap | Try a fresh connection per test instead of the shared `max: 1` pool, or isolate further, to rule the leak path in or out |
| `e2e-visibility-behavioral.integration.test.ts` × 5 (4 competitive-benchmark + TRACK 1c `comparisonData`) + `e2e-visibility-db.integration.test.ts` × 1 (TRACK 1c `comparisonData`) | A `?competitor=` query-param, `{comparisonData, competitorNarrative, dataAvailableFrom, shareOfVoice, topicalGaps}` response contract | The route no longer implements this contract — it now derives competitors from the brand's own configured list and returns `{competitors, summary, tier}` | **No** — confirmed by reading the actual consumer, `app/(auth)/brands/[brandId]/visibility/page.tsx`'s `BenchmarkData` interface, which matches the CURRENT `{competitors, summary}` shape exactly, and `competitive-benchmark-panel.tsx` has zero references to the old field names | LOW — pure stale-test contract drift, not a live regression | Feature owner rewrites these 6 against the current contract (or deletes them if superseded by other coverage) |
| `retrieval-rls.integration.test.ts` "without setRlsContext" | RLS defaults to zero rows when `app.current_org_id` is never set | Passes standalone and reproduces correctly by hand via `psql`; fails only after two sibling tests in the same file run first against a shared `max: 1` connection — looks like connection/GUC state leakage between tests, not an RLS policy bug | The scenario itself (querying with no org context ever set) doesn't occur in production — the real app always calls `setRlsContext()` before querying; and 2 non-quarantined sibling tests in the same file independently prove cross-org RLS isolation works when context IS set (the actually-exercised path) | MEDIUM — security-adjacent property, but independently proven by the 2 siblings; the failure is test-harness connection reuse, not a policy gap | Try a fresh connection per test or an explicit GUC reset in `beforeEach`. Do NOT touch RLS policy SQL to chase this — no evidence the policy itself is wrong, and this task's own constraint rules out any RLS-adjacent change here |

**Zero HIGH-risk findings** — nothing in this table required a RED→GREEN fix under Part C's own rule. All 12
stay quarantined with owner notes; each `it.skip` comment in the 6 files now also links to this table (annotated
this task).

**Part D — three hardening items, plus two bugs found while proving item 2.**

1. **No `DATABASE_URL` fallback.** `tests/helpers/test-db-url.ts`'s `getTestDatabaseUrl()` now requires
   `TEST_DATABASE_URL` strictly — no `?? DATABASE_URL` fallback. A fallback meant a test's connection target
   silently followed whatever else last set that variable (the app's own `@/db/client`, a different test file's
   `beforeAll`, a stray shell export); removing it means a missing env var now throws one clear, actionable
   error instead of silently inheriting someone else's target. `scripts/db/local-db-guard.ts`'s
   `assertLocalSafeDatabaseUrl()` guard stays regardless, as defence in depth — this change is about the
   *primary* control, not the safety net. Added `.env.test.example` (force-added past the `.env*` gitignore
   pattern, matching this repo's existing convention for `.env*.example` files) documenting every variable the
   "integration" vitest project needs, with `TEST_DATABASE_URL` called out as the one strictly-required,
   no-fallback variable.

2. **`db:migrate:local` baselining, explained and proven.** Every local database this project has ever had
   (`visibleau`, `visibleau_e2e`, `visibleau_prod`, and the throwaway DB created to prove the from-scratch path
   below) had migrations `0000`-`0011` applied by hand via `psql` long before this script's ledger table
   existed — so on first run, the ledger is empty but the schema is already there. `scripts/db/migrate-local.ts`
   now detects this: if the ledger is empty AND `organizations` (created in `0000`) already exists, it
   **baselines** — records every filename through `0011_watery_cerebro.sql` (the last drizzle-kit-generated,
   non-idempotent file) as applied WITHOUT running them — then proceeds normally into the idempotent `0012+`
   range. A genuinely empty database skips baselining and runs `0000` for real.

   Proved both paths directly, just now:
   - **Pre-existing DB** (`visibleau_e2e`, ledger already populated from this task's own prior runs): two
     consecutive `pnpm db:migrate:local` runs, both `0 applied, 45 already applied (skipped)`, zero errors
     (only the expected NOTICE-level "ledger table already exists, skipping" message).
   - **Genuinely fresh DB**: created a throwaway database, ran the script once (`45 applied, 0 already applied`,
     zero hard failures), ran it again (`0 applied, 45 already applied`, zero errors), then ran
     `pnpm db:drift:local` against it as a correctness check, not just an error check — **zero column-level
     FATALs**, only the 5 expected launch-invariant findings every fresh local DB shows (ledger table itself
     shifting the table count by one, the usual policy-count variance, 3 missing seeded `vertical_packs` rows).
     Dropped the throwaway database afterward.

   **Two more bugs surfaced only by testing the genuinely-fresh path, not asked for by the task but found along
   the way:**
   - `db/migrations/0008_brief_luckman.sql`'s 6 `ALTER TABLE "brands" ADD COLUMN` statements duplicate
     `0008_add_brand_classification.sql`'s additions exactly — a from-empty replay hit `42701 duplicate column`.
     This was already a filed, known gap (section 2 above); fixed now by adding `IF NOT EXISTS` to all 6.
   - `db/migrations/0010_baseline-reconcile.sql` has a leading UTF-8 BOM that `readFileSync(path, "utf8")` does
     not strip; Postgres's parser then sees it as the first token and throws `42601 syntax error ... position: 1`
     — `psql -f` silently tolerates this (which is why 12+ prior sessions of hand-running files via `psql` never
     surfaced it), `postgres.js`'s `sql.unsafe()` does not. Fixed by stripping `﻿` after the read.

3. **Cross-org → 404, named per route.** All 8 routes share the same `assertBrandAccess()`/
   `brandAccessErrorResponse()` pair, so there is no per-route logic to diverge — but coverage still had to be
   checked per route, not assumed from the shared implementation. 7 of 8 have a direct, route-level test:
   `visibility`, `fan-out`, `topical-gaps`, `citation-failure`, `competitive-benchmark`, and `wins` each have a
   "returns 404 for cross-org brand" test in `e2e-visibility-behavioral.integration.test.ts`'s "TRACK 1a"
   blocks; `site-readiness` has a strict `expect(res.status).toBe(404)` test in
   `backend-integration.test.ts`'s "§2.2 — Brand Isolation" → "⚠️ BREAK-PROOF: brand lookup also scopes by
   organizationId" block.

   **`journeys` had none — and the 7th follow-up's doc entry claiming it was covered by this same §2.2 block
   was wrong.** Read that block directly: it tests `latest-audit`, `topical-gaps`, `site-readiness`, `tasks`,
   `agent-readiness`, and `brands/{id}` — never `journeys`. The one `journeys`-named block in that file
   ("journeys: Agency+ required") is a subscription-tier gate test (same org, wrong tier → 403), unrelated to
   cross-org access. Added one new test, `backend-integration.test.ts` → "§2.2 — Brand Isolation" →
   "⚠️ journeys: org B user requesting org A brand → 404" (matches the existing sibling tests' pattern, asserts
   the exact 404 rather than their looser `[403, 404]`, since `assertBrandAccess` throws before `assertTier`
   ever runs and there's no legacy pre-fix behavior left to tolerate). RED→GREEN not applicable here in the
   usual sense — the route's behavior was already correct (wired identically to its 7 siblings in `fe78b67`);
   only the missing proof was added, confirmed passing on the first run.

   **Same-org role-restricted → 403 has no route-level coverage for any of the 8 routes.** The only test that
   exercises the `role_restricted` path at all is `s8-governance-db.integration.test.ts`'s "2.1 — assertBrandAccess
   with real org_members data" → "brand_access=[brandA] denies access to brandB (analyst)", and it's partial: it
   calls `assertBrandAccess()` directly (bypassing HTTP and every route entirely), asserts only
   `.rejects.toThrow(BrandAccessDeniedError)`, and never checks `e.reason === "role_restricted"` or any status
   code. No test seeds a same-org member with a restricted `brandAccess` array and hits any of the 8 routes'
   actual handlers. This is a real gap across all 8, not just one — flagged here rather than silently closed:
   adding 8 new route-level 403 tests is a bigger, unverified blast radius than this task's "small hardening"
   scope supports in one pass. Sri to decide whether/when it's worth the dedicated pass.

**One more finding, outside this task's scope: the "unit" vitest project has a large, pre-existing, unrelated
failure backlog.** Every prior follow-up's "green"/"0 genuine failures" claim (including the 7th follow-up's,
above) was always scoped to `vitest run --project=integration` specifically — none of them ever ran
`vitest run --project=unit` or plain `pnpm test` (which runs both projects together) and checked the combined
result. Running the full combined suite for this task's own final verification surfaced **56 failing unit
tests across ~13 files** — none of them in any file this task (or `ee21e46`..`fe78b67`) touched, and the
failures themselves are an unrelated grab-bag with no shared root cause: stale hardcoded counts
(`content-generator.test.ts` expects 13 entries, finds 12; `default-template.seed.test.ts` expects 10/2, finds
12/other), stale source-grep assertions against refactored components (`kanban-status-interaction.test.ts`
expects a literal `if (!canDrag) {...}` string no longer in the file), and a `serviceDb` mock-shape gap in
`@/db/client` mocks that several `tests/unit/api/*.test.ts`/`tests/unit/governance/*.test.ts` files share
(`assertBrandAccess` already called `serviceDb` before `fe78b67` — confirmed via `git show fe78b67~1`, so this
predates this entire commit stack), plus a `rows.map is not a function`/`crawlingVendors is not iterable`
mock-return-shape issue in `tests/unit/agent-analytics-s2/*.test.ts`. Confirmed none of these overlap with this
task's 11 changed files by direct inspection (none of the failing paths are reachable from anything this task
edited). Not fixed here — a pre-existing backlog this size, spanning this many unrelated features, is a
dedicated pass of its own, not "small hardening." Flagged for Sri to decide whether/when to clear it; until
then, `pnpm test`'s plain combined run will keep showing red for reasons that have nothing to do with whatever
commit is actually under review — worth switching CI/local habit to `vitest run --project=integration` for a
trustworthy pre-push signal, with the unit project checked separately.

**Results:** `pnpm typecheck && pnpm build` green (re-run after the new `journeys` test was added). **Integration
suite** (the scope every prior follow-up's green claim has meant, including this one): 774 tests, 762 passed, 12
quarantined, 0 genuine failures — confirmed via a solo run with nothing else touching the database concurrently.
Full counts, including the unrelated pre-existing unit-suite backlog above, in the report-back.

### §46 follow-up (9th, before Sri runs the prod bundle): the type-mismatch check must not STOP on naming-only differences

**The problem.** `266399a`'s bundle validated PASS on everything except one row: "0048: type mismatches", which
STOPped on 6 entries labeled "known-benign array/timestamp display differences" — but the header says "Any
STOP → don't push." A STOP that doesn't mean a real problem either blocks the push for nothing or teaches Sri
to click past STOP, which defeats the gate's entire purpose.

**Part A — what the 6 actually are.** Checked each as `table.column`: Drizzle's declared type
(`col.getSQLType()`), `information_schema.columns.data_type`/`udt_name`, and the authoritative
`format_type(atttypid, atttypmod)` from `pg_attribute` (queried directly against the local `visibleau_prod`
mirror):

| Column | Drizzle declares | `information_schema` | `format_type` (authoritative) | Verdict |
|---|---|---|---|---|
| `ai_bot_registry.expected_asns` | `integer("expected_asns").array()` → `integer[]` | `data_type=ARRAY`, `udt_name=_int4` | `integer[]` | **naming-only** — `information_schema` collapses every array to the literal string `"ARRAY"`, discarding the element type; the real type matches Drizzle exactly |
| `audits.engines` | `text("engines").array()...` → `text[]` | `data_type=ARRAY`, `udt_name=_text` | `text[]` | **naming-only** — same `ARRAY`-collapse artifact |
| `brands.competitors` | `text("competitors").array()...` → `text[]` | `data_type=ARRAY`, `udt_name=_text` | `text[]` | **naming-only** — same artifact |
| `brands.primary_regions` | `text("primary_regions").array()...` → `text[]` | `data_type=ARRAY`, `udt_name=_text` | `text[]` | **naming-only** — same artifact |
| `webhook_endpoints.events` | `text("events").array().notNull()` → `text[]` | `data_type=ARRAY`, `udt_name=_text` | `text[]` | **naming-only** — same artifact |
| `linkedin_presence_audits.company_page_last_post_date` | `timestamp("...", { mode: "date" })`, no `withTimezone` → no time zone | `data_type=timestamp without time zone` | `timestamp without time zone` | **naming-only** — Drizzle's own `getSQLType()` abbreviates this to the short string `"timestamp"` (confirmed by printing it directly); the schema was never declared `withTimezone: true`, so there is no dropped time zone here, only a short-form-vs-canonical spelling difference in the OLD bundle's own expected-type string |

**All 6 are naming-only — zero real mismatches among them.** None involve a dropped time zone, a changed base
type, or a precision/length change; every one is an artifact of either `information_schema`'s `ARRAY`-collapse
or Drizzle's own `"timestamp"` abbreviation. Nothing to fix in the schema or the data for these 6.

**Part B — compare canonical types, in both tools.**

- **Live side**, in the bundle and in `scripts/qa/schema-drift.ts` (shared by `pnpm db:drift` and
  `pnpm db:drift:local`): now reads `format_type(a.atttypid, a.atttypmod)` from `pg_attribute`/`pg_class`/
  `pg_namespace` (`relkind = 'r'`, ordinary tables only — `pg_class` in the `public` schema also holds every
  index, and without that filter their own key-column attributes showed up as bogus "extra columns" on a fake
  table named after the index, e.g. `brands_pkey.id`; caught and fixed while validating this change) instead of
  `information_schema.columns.data_type`/`udt_name`.
- **Expected side**: a new `canonicalPgType()` helper (exported from `schema-drift.ts`, used identically by both
  the bundle's generator and the generic drift tool) takes Drizzle's `col.getSQLType()` — already correct for
  arrays, precision, and `withTimezone` — and fixes the two remaining spelling gaps: collapses `numeric(5, 2)`'s
  comma-space to match `format_type`'s `numeric(5,2)`, and maps the short form `"timestamp"` to the canonical
  `"timestamp without time zone"`. Verified against every column in the live schema: **956/956 match, 0 false
  positives** — this one function resolves all 6 naming-only differences above with no exceptions and no new
  ones introduced anywhere else in the schema.
- **`column_diff`'s comparison** is now a plain `lower(e.expected_type) <> lower(l.live_type)` exact match — the
  old `regexp_replace(...,'\(.*\)','')` precision-stripping is gone, since precision now has to match exactly on
  both canonical sides (a real precision difference is supposed to STOP, per this task's own classification).
- **Row 0, `OVERALL`**: added as the bundle's first row — `PASS` if no other row is `STOP`, else `STOP` with a
  count. The top of the screenshot now answers the question directly without reading all 11 rows.

**Part C — validation (local only).**

- **`visibleau_prod` (the local mirror): OVERALL = PASS, 0 STOP rows.** The type-mismatch row itself: `PASS`,
  `none` — all 6 resolved. Re-ran `pnpm db:drift` (unguarded, pointed at the mirror) the same way: zero
  type-mismatch warnings, confirming the generic tool and the bundle now agree.
- **STOP path, two ways:**
  1. *Organically*, on a genuinely fresh database (`db:migrate:local`'s full replay, a throwaway DB created and
     dropped for this check): the bundle correctly **STOPs** naming exactly `ai_bot_ip_ranges.cidr
     expected=text live=cidr` and `crawler_visit_logs.source_ip expected=text live=inet` — a real, pre-existing
     drift between `db/schema/*.ts` (both declared as `text()`, even though Drizzle has native `cidr()`/`inet()`
     builders) and what migration `0024_p3s1_prod_align_agent_analytics.sql` actually corrects live columns to.
     **Not one of the original 6, not introduced by this task, and not blocking the current push** (none of
     `ee21e46`..`fe78b67` touch either table) — flagged below rather than hidden.
  2. *By explicit construction*, per this task's own suggested examples: on the same throwaway database,
     `ALTER TABLE organizations ALTER COLUMN created_at TYPE timestamp without time zone` (drops a real time
     zone) and `ALTER TABLE brands ALTER COLUMN abn TYPE integer` (a real base-type change) were each applied,
     and the bundle immediately **STOPped, naming both by exact column** alongside the pre-existing `cidr`/`inet`
     finding. Reverted both; re-ran; back to exactly the one pre-existing STOP, confirming the revert was clean
     and complete.
- **`pnpm db:drift:local` agrees with the bundle on all three local databases**: `visibleau_prod` shows 0 type
  mismatches (matching the bundle's PASS); `visibleau_e2e` and `visibleau` (dev) each show exactly the same 2
  pre-existing `cidr`/`inet` mismatches the bundle finds on a fresh replay, nothing more, nothing less.

**One finding surfaced by this validation, outside the 6 and outside this push's scope.**
`ai_bot_ip_ranges.cidr` and `crawler_visit_logs.source_ip` are declared `text()` in `db/schema/*.ts`, but
migration `0024_p3s1_prod_align_agent_analytics.sql` — already merged, already in `db/migrations/` — corrects
both to native `CIDR`/`INET` live, specifically to fix the exact TEXT-instead-of-INET/CIDR class of bug
CLAUDE.md warns about. The local `visibleau_prod` mirror never had 0024 applied (confirmed: neither its
corrective constraint nor its index exist there), so it still shows `text` for both, matching `db/schema/*.ts`
today — meaning **this specific pair is a blind spot in local validation against the mirror**: if real Neon
prod has had 0024 applied (plausible — the migration's own name says "prod align"), Sri's screenshot from the
real bundle run may show this pair as an additional STOP beyond what local validation could reproduce. If it
does: it is a genuine, old, pre-existing drift between the TS schema and the live column type, unrelated to
whether `ee21e46`..`fe78b67` is safe to push (neither table is touched by any of those 7 commits) — the fix,
if Sri wants one, is updating `db/schema/ai-bot-ip-ranges.ts`/`crawler-visit-logs.ts` to use Drizzle's own
`cidr()`/`inet()` column builders instead of `text()`, a type-only change with zero live data impact either way.
Flagged for Sri to decide; not fixed here, and the bundle's header already tells Sri to send the screenshot to
Claude if anything STOPs, which covers this case too.

**Results:** `pnpm typecheck && pnpm build` green. Both throwaway databases created for this validation were
dropped afterward; nothing left behind. New commit (local, unpushed) on top of `266399a`.

### §46 follow-up (10th, after pushing `56316a1`): align `schema.ts` with migration 0024, close the ingest gap, and stop two flickering tests

**Part A — which side is right.** Migration `0024_p3s1_prod_align_agent_analytics.sql` converts
`ai_bot_ip_ranges.cidr` (`TEXT -> CIDR`) and `crawler_visit_logs.source_ip` (`TEXT -> INET`), self-guarded (only
alters if the live column is still `text`). `db/schema/*.ts` never followed: both stayed declared as `text()`.

Inventoried every read/write: `lib/agent-analytics/ip-ranges.ts`'s `checkCidrContainment()` already does
`${sourceIp}::inet <<= cidr::cidr` — native containment, with an explicit cast on both sides, which is exactly
the kind of query a GiST `inet_ops` index serves (migration `0024` already creates
`ai_bot_ip_ranges_cidr_idx ... USING gist (cidr inet_ops)`). `refreshIpRangesForVendor()` writes vendor-published
prefix strings straight through Drizzle's insert — plain string pass-through regardless of column type (below).
`inngest/functions/verify-crawler-hits.ts` reads `crawlerVisitLogs.sourceIp` through Drizzle's typed
`.select()` and treats it as a plain string throughout (`dns.reverse()`, string split/reverse for fcrdns,
cache-key interpolation) — no `LIKE`/`.includes()`/`.startsWith()` pattern-matching on either column anywhere in
the app. **Decisive evidence, not just "almost certainly": migration `0025_p3s1_crawler_logs_dedup.sql`'s own
comment says why its dedup index requires `source_ip` to already be `inet`** —
`COALESCE(source_ip, '0.0.0.0'::inet)` has no implicit `text -> inet` cast, so this index could not exist at all
if the column were still `text`. Confirmed present on `visibleau`/`visibleau_e2e`. **`inet`/`cidr` is correct**,
required by an already-applied, already-depended-upon migration — not a new decision, a correction of a schema
that never caught up.

`db/prod-fixes/diag-0050-cidr-inet-prod.sql`: read-only, shows `format_type` for both columns plus whether the
GiST index / unique constraint / dedup index exist. Validated locally both ways: `text`/absent on the
(deliberately untouched) `visibleau_prod` mirror, `cidr`/`inet`/present on `visibleau_e2e`. Header explains both
readings for Sri. If real Neon prod reads `text`, that's the scenario needing an actual fix there (Sri, by hand,
same as any other hand-written migration — not `drizzle-kit push`); if it already reads `cidr`/`inet`, the diag
is purely confirmatory and this follow-up's `schema.ts` fix is the only change needed.

**Part B — the schema fix, and three things found while proving it.**

`db/schema/ai-bot-ip-ranges.ts`'s `cidr` and `db/schema/crawler-visit-logs.ts`'s `sourceIp` now use Drizzle's
native `cidr()`/`inet()` builders. Checked `node_modules/drizzle-orm/pg-core/columns/{cidr,inet}.js` directly:
both are pure string pass-throughs (no `mapFromDriverValue`/`mapToDriverValue` override, same as `text()`) — a
type-only change, zero runtime behavior difference for any existing read or write.

**Ingest validation** (Part B asked whether every insert passes valid values — it didn't):
- `lib/agent-analytics/ip-ranges.ts`: added `isValidCidr()` (validates the address via `node:net`'s `isIP()`,
  then the prefix length against the detected family). `refreshIpRangesForVendor()` now filters vendor-published
  prefixes through it before hashing/inserting, logging the count and the literal invalid value (vendor
  infrastructure ranges, not PII, so the value itself is safe and useful to log) rather than letting one bad
  entry corrupt the version hash or abort the refresh.
- `lib/agent-analytics/parse-crawler-log.ts`: the log-upload ingest path extracts `sourceIp` from raw,
  unvalidated log lines. Added a `net.isIP()` check at the one place both parsers' output converges
  (`hits.push`) — an invalid IP now discards the hit (same semantics as the pre-existing empty-IP discard),
  counted in a new `discardedInvalidIp` field, logged WITHOUT the raw value (this one really can be a visitor's
  IP). `inngest/functions/parse-crawler-log.ts`'s insert-loop `catch` block, which silently swallowed any insert
  error with zero logging, now logs the error message (never `hit.sourceIp`) — the validation above means this
  should now essentially never fire for a bad IP specifically, but every other DB error it might catch stays
  visible instead of vanishing.
- **Found, not fixed: `app/api/visit/route.ts` sends `sourceIp`/`ingestSource` on its `visit/ingested` event, but
  `inngest/functions/crawler-log-ingest.ts`'s handler never reads or inserts either field** — this ingest path
  has silently never persisted `source_ip` at all, independent of column type and independent of this follow-up.
  Pre-existing, unrelated to the cidr/inet question; flagged for Sri rather than fixed here (wiring it up is a
  behavior change to a live ingest path, a bigger change than "validate what's already being inserted").

**Index**: already exists (`ai_bot_ip_ranges_cidr_idx`, migration 0024) and is already used by the planner —
confirmed with `EXPLAIN (ANALYZE, BUFFERS)` on a 2,000-row synthetic bench (5 vendors × 400 ranges each, seeded
on `visibleau` and dropped after): `Bitmap Index Scan on ai_bot_ip_ranges_cidr_idx` by default (1 buffer hit),
vs. 28 buffer hits with `enable_indexscan`/`enable_bitmapscan` forced off for comparison. No new index proposed —
there's nothing missing to propose.

**Mirror handling.** `pnpm db:migrate:local`'s guard correctly refuses `visibleau_prod` (matches `/prod/i` —
note the task's own suggested name `visibleau_prodmirror` would ALSO match `/prod/i` and get refused the same
way). Per this task's own instruction, did not bypass the guard and did not rename or alter `visibleau_prod`
itself — CLAUDE.md documents exactly two local databases by exactly these names, and that convention shouldn't
go stale for every future follow-up that references it. Instead: `pg_dump`/`pg_restore`'d its current data into
a new database, `visibleau_mirror` (no `/prod/i` substring, passes the guard), then ran `db:migrate:local`
against the copy.

**Two more pre-existing bugs found only by actually doing this** (both were always going to bite the first time
anyone tried to replay these migrations against `visibleau_prod`'s real history, including real Neon prod if
it's ever in the same pre-`0024` state):
1. Migration `0023`'s `CREATE INDEX IF NOT EXISTS ai_bot_ip_ranges_cidr_idx ... USING gist (cidr inet_ops)` fails
   with `42804 ResolveOpClass` (`inet_ops` has no meaning for `text`) when replayed against a database where
   `ai_bot_ip_ranges` already exists with the old `text` column — `CREATE TABLE IF NOT EXISTS` skips table
   creation, but the index statement right after it doesn't know that, and runs unconditionally. Fixed by
   wrapping it in the same self-guard style `0024` already uses elsewhere in this same file: skip if the column
   isn't already `cidr`, since `0024`'s own `ALTER` + its own `CREATE INDEX IF NOT EXISTS` (same name) picks it
   up moments later in the same run, once the column actually is `cidr`.
2. With that fixed, `0024`'s own `ADD CONSTRAINT ... UNIQUE (vendor, cidr, version_hash)` then failed on a real
   duplicate key — **280 duplicate rows out of 1,913** in the copied data. Root cause: without the constraint
   (never applied), `refreshIpRangesForVendor()`'s `.onConflictDoNothing()` had no matching unique index to
   conflict against, so every repeat refresh re-inserted the exact same tuples unchecked. Fixed by adding a
   de-dup step to `0024` itself, right before the `ADD CONSTRAINT` (keeps the earliest `fetched_at` per group) —
   a no-op on `visibleau`/`visibleau_e2e` (already past this file, never re-runs) and on a genuinely fresh
   database (nothing to de-dup), and the actual fix for `visibleau_mirror`'s real data. **This same failure mode
   would hit real Neon prod too**, if prod is still pre-`0024` and has ever had `refreshAllIpRanges()` run
   against it more than once — another reason `diag-0050`'s result matters before anyone runs `0024` for real
   anywhere.

**Drift and bundle, after both fixes**: `pnpm db:drift:local` against `visibleau_mirror` — zero type-mismatch
warnings (only the pre-existing, already-documented launch-invariant and constraint-name-by-name gaps every
local database shows). The bundle, regenerated with the new `cidr`/`inet` canonical types: **`visibleau_mirror`
— OVERALL PASS, 0 STOP**. `visibleau_prod` (untouched, as instructed) now correctly **STOPs** on exactly these 2
columns — expected and consistent with Part A's `diag-0050` finding, not a regression. `visibleau_e2e`/`visibleau`
(dev), which already had the correct live types, dropped their 2 pre-existing WARNs entirely now that `schema.ts`
finally agrees with them.

**Part C — the flickering CLI test, and two more of the identical pattern.**

Identified: `tests/phase2/sprint1/section5-cli-service-integration.test.ts`, all 3 tests in the "CLI real
invocation" describe block, each shelling out via `execSync(\`npx tsx cli/visibleau/index.ts ...\`)`. The
original failure (`AssertionError: expected null to be 1`) is the tell: `e.status` is `null`, not a different
exit code — that's `execSync`'s own timeout/SIGTERM path, not a different validation outcome. **Not a
data/fixture/ordering dependency — a time dependency.** Measured directly: a cold `npx tsx` invocation of this
exact command took **11.8s** standalone (3 more back-to-back runs: 4.1-7.3s, still highly variable) against a
hardcoded 15s `execSync` timeout — almost all of it is `npx`'s own package-resolution/freshness-check overhead,
not the CLI's actual work (the same command via the already-resolved `./node_modules/.bin/tsx` binary: **1.8s**).
Under a full-suite run's added CPU/IO contention from every other concurrently-running file, that 3-11s of
margin can vanish entirely, and `execSync` kills the child.

Fixed by switching to `npx --no-install` (skips the resolution/freshness check entirely — `tsx` is already a
resolved local devDependency, nothing to verify — stable 2.8-3.9s across repeated runs) rather than hardcoding a
`.bin` path directly, which would risk different behavior under `cmd.exe` vs. a POSIX shell on this Windows
environment. Also raised the `execSync` timeout 15s → 25s (test's own `it()` timeout unchanged at 30s) as
defence in depth on top of the real fix.

**Reproduced the SAME root-cause class twice more while proving stability**, both via a plain full-suite
`--project=integration` run (not isolation, where both pass easily): `e2e-visibility-behavioral.integration.test.ts`'s
`beforeAll` (dynamic-imports 7 route handlers + seeds fixtures; 220ms/fast standalone) exceeded vitest's default
10s `hookTimeout` and skipped all 70 of the file's tests; `narrative-delta.integration.test.ts` exceeded the
default 5s `testTimeout` (passes in ~1s/test standalone). Rather than patch each file as it happened to surface
during this follow-up's own proof runs, raised `hookTimeout`/`testTimeout` to 30000 for the whole "integration"
vitest project in `vitest.config.ts` — the same fix shape (more margin for inherently-variable import+DB-round-trip
work under real sequential-suite conditions), applied once, systemically, instead of three separate file-level
patches for what is the same underlying problem.

**3 consecutive `--project=integration` runs, all green** (after both config-level timeout fixes): **774 tests,
762 passed, 12 quarantined, 0 failures — identical on all 3 runs.** A separate, single `pnpm test` (unit +
integration combined) run during this same follow-up surfaced 25 `[vitest-pool]: Failed to start forks worker`
errors — vitest's own worker-pool infrastructure timing out under that heavier combined load, a different,
broader, machine-level contention issue from the one this follow-up fixes, confirmed NOT caused by a connection
leak (`pg_stat_activity` showed 10 connections, nothing abnormal) and confirmed NOT touching the target CLI test
file (it doesn't appear anywhere in that run's failures). Out of scope for this follow-up's "all green" claim,
which is scoped to `--project=integration` — the actual home of the fixed test and the two others of its same
pattern — not the combined suite, whose separate, larger, pre-existing unit-test backlog is already documented
in the 9th follow-up above.

**Results:** `pnpm typecheck && pnpm build` green. `visibleau_mirror` is now a persistent addition (not a
throwaway) — the fully-current local stand-in for prod-type validation going forward; `visibleau_prod` stays
exactly as it was, per this task's own instruction. New commit (local, unpushed) on top of `56316a1`.

### §46 follow-up (11th, after `0b31a94`): never push again, keep migration history honest, and the unpersisted `sourceIp`

**Part A — the push rule, made permanent.** Added to the top of `CLAUDE.md`, above even the database-safety
section: *"Never run `git push`, `vercel`, `neon`, or any command that changes a remote, deploy or prod DB.
Commit locally only; Sri pushes after prod checks. A prompt saying 'after X is pushed' is a precondition to
check, not an instruction to push."* The prior follow-up's own prompt said to run "after the 9-commit stack is
pushed and verified" — ambiguous about whether Claude Code should make that true rather than check it was
already true. It wasn't (`git status -sb` showed `main` 9 commits ahead of `origin/main`), and asking the user
how to proceed got "push now, then proceed" as an in-the-moment answer to a clarifying question — not the same
thing as a durable instruction, and the rule stands regardless. Saved as a standing feedback memory as well,
since the lesson generalizes beyond this one repo.

**The push record.** `git push origin main` ran once, moving `origin/main`/`origin/HEAD` from `3416a26` to
`56316a1` (`ee21e46`..`56316a1`, 9 commits) — a clean fast-forward, confirmed via `git reflog show --all`
(exactly one `update by push` entry). **This went out before `prepush-bundle-0046-0047-0048.sql` had been run
in the Neon SQL editor** — the bundle's own header ("Any STOP → don't push") was never actually honored for
this push. **Confirmed nothing else remote was touched**: `git tag -l` is empty; `git branch -a` shows
`dev/phase1`/`dev/phase2`/`release1` untouched at their existing remote-tracking state; no `vercel`/`neon` CLI
command was run at any point in this session.

**Part B — migration history and prod duplicates.**

**The rule**, now documented here for future follow-ups: *an applied migration may only be edited if the edit
is a guard that's a no-op on every database where the migration already succeeded. Any data or constraint
change goes in a new forward migration.* The reasoning: a database that already ran a migration file
successfully will never run it again (ledger-tracked locally; a one-time `psql -f` event on prod) — editing
that file's *content* changes nothing for a database that's already past it, so the edit is only ever "safe"
in the narrow sense of "irrelevant there." If the edit does something that database-dependent behavior could
actually differ on, it's not a guard, it's a retroactive rewrite of what's claimed to have happened.

**Verdict on `0023`'s edit**: NOT confidently a no-op, reverted. The edit wrapped `CREATE INDEX ... USING gist
(cidr inet_ops)` in a guard that skips if the column isn't already `cidr`. For a database where `0023`
genuinely ran start-to-finish without error (table created fresh, `cidr` type from its own `CREATE TABLE`), the
guard's condition is always true and behavior is identical — a real no-op. But prod's actual history for this
file is unknown and unknowable without access to real prod logs: if `0023` there *partially* executed (table
pre-existed from the `drizzle-kit push` incident CLAUDE.md documents, `CREATE TABLE IF NOT EXISTS` silently
skipped, the unconditional `CREATE INDEX` right after it then threw `42804`), the edit changes a visible error
into a silent skip for that specific history — not a no-op. Reverted to the original (`git checkout 56316a1 --
db/migrations/0023_...sql`) rather than assume the better-case history.

**Verdict on `0024`'s edit**: a clear violation, reverted. Adding a `DELETE` (the de-dup step) to an
already-applied file is a substantive data-modifying change by definition — exactly what the rule says belongs
in a new forward migration instead, not a judgment call. Reverted the same way.

**The natural key, from the ingest code.** `lib/agent-analytics/ip-ranges.ts`'s `refreshIpRangesForVendor()`
looks up existing rows by `vendor` alone (`WHERE vendor = ? AND is_current = true`), and `checkCidrContainment()`
queries by `vendor` + `cidr` together — the old `UNIQUE (vendor, cidr, version_hash)` constraint (migration
`0024`) could never catch a real duplicate because `version_hash` is computed once per whole refresh batch and
differs on every call even when a specific range hasn't changed. Confirmed directly on the untouched
`visibleau_prod` mirror: **1,913 total rows, only 383 distinct `(vendor, cidr)` pairs** — 1,530 excess rows, not
the 280 the (wrong-key) count from the reverted `0024` edit found.

**Forward migration**: `db/migrations/0041_ai_bot_ip_ranges_unique.sql`. De-dupes keyed on `(vendor, cidr)`,
keeping the row with the latest `fetched_at` per key (ties broken by `id`) — confirmed this is the right choice,
not "keep earliest": of the 383 keys, the *latest*-fetched row disagrees with `is_current = true` for 362 of
them, because the vendor's most recent refresh genuinely dropped those ranges — keeping the latest is the only
choice that doesn't resurrect stale state. No FK anywhere references `ai_bot_ip_ranges.id` (checked
`pg_constraint` directly), so the `DELETE` is safe. Drops the old 3-column constraint (a strict, useless subset
of the new one) and adds `ai_bot_ip_ranges_vendor_cidr_unique` as a plain (non-`CONCURRENTLY`) unique index +
constraint — confirmed directly that `CREATE INDEX CONCURRENTLY` cannot share a `sql.unsafe()` call with any
other statement (`25001`, "cannot run inside a transaction block"), so `CONCURRENTLY` is reserved for the real
prod apply path below, where avoiding a table lock under live traffic actually matters; plain is fine locally.
Applied to all three local databases via `pnpm db:migrate:local`: `visibleau_mirror` went from 1,633 rows (the
now-reverted `0024` edit's own incomplete de-dupe) to the correct 383; `visibleau`/`visibleau_e2e` had zero rows
in this table, a no-op. `pnpm db:drift:local` clean on all three afterward (only the same pre-existing,
already-documented launch-invariant/constraint-name gaps every local database already shows).

**Ingest code**: `refreshIpRangesForVendor()`'s insert loop now uses `.onConflictDoUpdate({ target: [vendor,
cidr], set: {...} })`, not `.onConflictDoNothing()`. This is a correctness fix, not a style choice — the
function already sets every one of a vendor's *existing* rows to `isCurrent = false` right before the insert
loop runs; `onConflictDoNothing` would then leave a range that's STILL in the vendor's current list
permanently stuck at `isCurrent = false` after its first refresh, since skipping on conflict means the row
already marked false never gets flipped back. `onConflictDoUpdate` refreshes `sourceUrl`/`versionHash`/
`isCurrent`/`fetchedAt` in place instead.

**`db/prod-fixes/0051-ai-bot-ip-ranges-unique-{precheck,apply,rollback}-prod.sql`** — validated end-to-end on a
throwaway database staged to match the real precondition (restored from a `visibleau_prod` dump, then manually
converted `cidr`'s type to match what Sri would have already done via `diag-0050`'s guidance, since `0051`
assumes that's already done and `STOP`s clearly if it isn't):
- **precheck** (read-only): column type, total vs. distinct-key row counts, the duplicate groups themselves,
  an explicit FK-reference check (`PASS`, none found), and whether either constraint already exists. Run
  against the untouched `visibleau_prod` mirror: correctly reports `text` (migration `0024` never applied
  there) and 1,530 excess rows.
- **apply**: 3 sections, explicitly meant to be pasted into the Neon editor ONE AT A TIME (not run as one
  multi-statement submission) — section 2's `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block,
  and most hosted SQL editors (Neon's included) wrap a single submission in one implicitly. Section 1
  (transaction: a `RAISE EXCEPTION` guard if `cidr` isn't already type `cidr` — "apply 0024 first" — then the
  de-dupe, then dropping the old constraint); section 2 (the `CONCURRENTLY` index, standalone); section 3
  (`ADD CONSTRAINT ... USING INDEX`, instant). Validated all 3 sections as separate `psql -f` invocations
  against the staged throwaway: section 1 removed exactly the predicted 1,530 rows, section 2's index came back
  `indisvalid = true`, the post-check matched every expected value. Also validated the section 1 guard aborts
  cleanly (clear `RAISE EXCEPTION`, full `ROLLBACK`, zero partial damage) against a column still typed `text`.
- **rollback**: drops the constraint first (auto-removes its backing index), then the bare index as a
  fallback for the case where only section 2 ever ran — validated both orderings directly. States plainly that
  the de-dupe itself is not reversible (nothing distinct was lost — the removed rows were exact duplicates of
  what the kept row already has — but there is no "undo" for a `DELETE`); recommends a Neon branch/snapshot
  taken *before* `apply`, not after, if rollback is a real possibility.

All three throwaway databases created for this validation were dropped afterward.

**Is this apply-before-push?** **Yes — for this commit, not for `0b31a94`.** `0b31a94`'s `schema.ts` change
(declaring `cidr()`/`inet()` instead of `text()`) was confirmed type-only with zero runtime difference — not
apply-before-push. This commit's `onConflictDoUpdate({ target: [aiBotIpRanges.vendor, aiBotIpRanges.cidr], ...
})` is different in kind: Drizzle compiles that into `ON CONFLICT (vendor, cidr) DO UPDATE ...`, which requires
a real unique constraint or index matching exactly `(vendor, cidr)` to exist on the live database, or Postgres
throws `42P10` ("no unique or exclusion constraint matching the ON CONFLICT specification") on every single
call. **If this code reaches production before `0051-apply`'s section 3 has run there, every
`refreshIpRangesForVendor()` invocation will fail outright** until it has. `0051-apply` (all 3 sections) must
run on real prod before this commit is deployed, not just before it's pushed.

**Real-DB tests**, added to the existing real-DB suite (`tests/integration/agent-analytics/ip-range-refresh.integration.test.ts`,
which already runs directly against `visibleau` dev): the `(vendor, cidr)` constraint exists and rejects a raw
duplicate insert (`23505`); calling `refreshIpRangesForVendor()` twice — once for the original 2 ranges, once
for those 2 plus a new one — leaves exactly 3 rows, never 5; a stale `isCurrent = false` row from days ago gets
updated in place (not duplicated) when its range reappears in a later refresh, with its `versionHash` changing
and `isCurrent` flipping back to `true`. All 6 tests in the file (3 pre-existing + 3 new) pass against real
Postgres.

**Part C — `sourceIp` never persisted.**

**The flow, traced.** `app/api/visit/route.ts` extracts the client IP from `x-forwarded-for`
(`getClientIp()`) and sends it as `sourceIp` on the `visit/ingested` inngest event, alongside `ingestSource:
"visit_api"`. `inngest/functions/crawler-log-ingest.ts`'s handler destructures only `{ brandId, organizationId
}` from that event and calls `parseVisitEvent({ url, userAgent, referrer, timestamp })` — neither function
reads `sourceIp` or `ingestSource` at all, and the subsequent `.insert(crawlerVisitLogs).values({...})` doesn't
set either field, so they silently take their column defaults (`NULL`, `'visit_api'`). **Every row ingested
through this path has `source_ip = NULL`, unconditionally** — confirmed on local data: `visibleau` dev's 10
`crawler_visit_logs` rows are 100% `ingest_source = 'log_upload'` (the *other* ingest path, in
`inngest/functions/parse-crawler-log.ts`, which does correctly read and insert `sourceIp`); zero `'visit_api'`
rows exist anywhere locally, consistent with the field never having been wired up for that path at all.
`inngest/functions/verify-crawler-hits.ts`'s own query filters `WHERE sourceIp IS NOT NULL` before verifying
anything — so every `visit_api` row is silently excluded from verification, forever, not just unverified.

**Honesty finding and fix.** `components/domain/retrieval/agent-analytics-crawler-card.tsx`'s "Verification
Status" section shows `Verified`/`Unverified`/`Spoofed` counts sourced from
`lib/agent-analytics/metrics.ts`'s `getVerificationRates()`, which filters `WHERE cl.verification_status IS
NOT NULL` — meaning it ALSO only ever counts `log_upload`-sourced rows, silently excluding every `visit_api`
hit from this breakdown entirely, with nothing on the card disclosing that exclusion. A customer sees these
three counts right below the card's own `totalHits` (which DOES include every ingest source, from a different
query entirely) with no visual or textual cue that they cover a different, smaller population — exactly the
kind of claim that reads as "these are IP-verified results" when the real coverage is "log-upload traffic
only, because that's the only traffic with an IP recorded at all." Added a one-line caveat directly under the
"Verification Status" heading: *"Identified by user agent; IP-verified only for hits from uploaded log files.
Real-time visits aren't IP-verified yet."* Render test added (`tests/unit/section4/section4.test.tsx`)
confirming both sentences render.

**Recommendation — not implemented, Sri's call.** Visitor IPs are personal information under the Australian
Privacy Act (APPs 1 and 3 favor collecting no more than what's reasonably necessary for the stated purpose).
The minimal design that makes verification real without over-collecting:
1. **Persist an IP only when the request's own User-Agent already claims to be a known AI crawler**
   (`lookupByUserAgent()`, already used elsewhere) — never for ordinary human visitor traffic, which has no
   verification purpose for an IP to serve in the first place. This is a narrowing of current (accidental)
   behavior, not a loosening: today NO ingest_source correctly stores a `visit_api` IP; this keeps it that way
   for human traffic by design, and fixes it only for the population the feature actually needs.
2. **Verify synchronously at ingest** (call the same `checkCidrContainment()`/`verifyCrawlerHit()` logic
   `verify-crawler-hits.ts` already has, rather than only the deferred batch path `log_upload` currently
   triggers), storing the resulting `verified`/`unverified`/`spoofed` status immediately — the status is the
   datum with lasting analytical value, not the raw IP that produced it.
3. **Retention is already solved, not something new to build.** `inngest/functions/audit-data-retention.ts`
   already runs weekly and already purges every `crawler_visit_logs` row older than 90 days (`purge-crawler-visit-logs`,
   `cutoff90d`) — any IP stored under this design gets deleted as part of that existing job with zero new
   code. If a shorter window than 90 days is wanted specifically for IPs (independent of the rest of the row),
   that would need a small addition; the 90-day row-level purge may just be enough on its own.
4. **Storage/index cost is low either way**: only AI-crawler-claiming UAs would ever get an IP stored (a small
   fraction of total traffic), the containment lookup already has its GiST index on `ai_bot_ip_ranges` (no new
   index needed on `crawler_visit_logs.source_ip` itself), and the real cost is wiring the live `visit_api`
   path into the SAME verification call the batch path already uses, not a new verification mechanism.
5. **Privacy policy**: if adopted, the policy's "what we collect" section needs an explicit line that AI-crawler
   (not human-visitor) request IPs are briefly collected and verified against published bot IP ranges, with
   the retention window stated.

Not implemented — this is a decision for Sri (a stated, deliberate privacy trade-off, not a bug fix), written
up here for that decision.

**Results:** `pnpm typecheck && pnpm build` green. New commit (local, unpushed) on top of `0b31a94` — this one,
per `CLAUDE.md`'s new rule, stays unpushed until Sri says otherwise.

### §46 follow-up (12th): drift check blind spots — the `auth_*` tables, and prod RLS coverage

**Context.** `e47033a`'s bundle ran on real prod on 14 Oct: OVERALL PASS. Its "extra columns in prod" INFO row
listed every column of all 7 `auth_*` tables — not because they're actually extra, but because the drift
generator never saw them as expected at all, so everything about them showed up as unmodelled. Separately,
nothing checked that every org-scoped table in prod actually has RLS enabled, forced, and a policy.

**Part A — the auth tables were already there, just never wired in.** `db/schema/auth.ts` already has a
complete, hand-written Drizzle schema for all 7 tables (`authUsers`, `authSessions`, `authAccounts`,
`authVerifications`, `authOrganizations`, `authMembers`, `authInvitations`). Quoting `lib/auth/server.ts`:

```ts
database: drizzleAdapter(serviceDb, {
  provider: "pg",
  schema: {
    user: authSchema.authUsers,
    session: authSchema.authSessions,
    account: authSchema.authAccounts,
    verification: authSchema.authVerifications,
    organization: authSchema.authOrganizations,
    member: authSchema.authMembers,
    invitation: authSchema.authInvitations,
  },
}),
```

**This file IS better-auth's real, live schema** — the library's `drizzleAdapter` is configured directly
against these exact exports. It is not a hand-maintained copy of something else to keep in sync; there is
nothing else to generate it from. The only gap was that `db/schema/index.ts` — the barrel file every
`getTableConfig()`-based tool (`schema-drift.ts`, the bundle generator) iterates via `Object.values(schema)` —
never had `export * from "./auth";`. One line fixed it; every existing `canonicalPgType()`-based mechanism
covers these 7 tables automatically now, with zero new code.

**After the change**: `pnpm db:drift:local` now checks 74 TS tables (was 67) with zero new WARN/FATAL for any
auth table on any local database. The bundle's "extra columns in prod" row, re-run against `visibleau_mirror`:
only `_local_migrations_applied.filename`/`.applied_at` remain — the local migration-ledger table itself (a
`db:migrate:local`-only artifact that doesn't exist on real Neon, since Sri never runs that tool against prod).
Re-run against the untouched `visibleau_prod` mirror (closer to real prod, no ledger table at all): **the row
reads `none`** — every auth column now matches exactly. **Nothing genuinely unmodelled remains.**

**Local validation**: PASS on `visibleau_mirror` and `visibleau_prod` (modulo the pre-existing, already-documented
`cidr`/`inet` STOP from the 10th/11th follow-ups, unrelated to this change). STOP path: dropped
`auth_users.email_verified` on a throwaway database restored from `visibleau_prod`'s data — both the bundle and
`pnpm db:drift` named it exactly (`auth_users.email_verified: present in TS schema, absent live`); re-added it,
confirmed PASS again; throwaway dropped.

**Part B — RLS coverage check.**

**Org-scoped table derivation**: tables with an `organization_id` column (50, confirmed directly against
`pg_attribute` rather than trusting a source grep — grepping source for "organizationId" turns up false
positives, e.g. several files mention it only in a comment), **plus two tables scoped transitively through a
foreign key, not a direct column**: `citations` (via `audit_id` → `audits.organization_id`, with its own
`EXISTS`-subquery policies) and `organizations` (the org row itself, scoped by `id = current_org_id` directly).
Documented together as `RLS_TRANSITIVE_ORG_TABLES` in `scripts/qa/schema-drift.ts`, and the identical pair
hardcoded into the bundle's `org_scoped_tables` CTE.

**22 documented global exceptions** (`RLS_EXEMPT_GLOBAL_TABLES`, each with a one-line reason in code): the two
named in the task (`ai_bot_registry`, `ai_bot_ip_ranges`) plus 5 `auth_*` tables genuinely scoped per-user or
not at all (`auth_accounts`, `auth_organizations`, `auth_sessions`, `auth_users`, `auth_verifications` — not
`auth_members`/`auth_invitations`, which DO have `organization_id` and DO need the check, and pass it), and 15
platform-wide reference/cache tables with no customer-identifying column at all, confirmed by reading each
one's actual columns directly rather than assuming from table naming (`canary_prompts`, `citability_methods`,
`config_bundle_cache`, `llm_response_cache`, `market_ai_budget_policies`, `metric_quality_gates`,
`processed_webhook_events`, `prompt_pack_coverage`, `prompt_volume_estimates`, `provider_market_capabilities`,
`recommendation_research`, `sampling_policies`, `validation_corpus_results`, `vertical_pack_prompts`,
`vertical_packs`). This list isn't a suppression — the check derives its "needs RLS" set purely from
`organization_id` presence + the transitive pair, so a table here that quietly grew an `organization_id` column
would start failing on its own; a dedicated `exemptTablesNowOrgScoped` check also calls that out by name with a
clearer message than the generic failure would give.

**Check logic** (`checkRlsCoverage()`, `scripts/qa/schema-drift.ts`, called from `checkSchemaDrift()` — FATAL on
failure, same severity as a missing column): for every org-scoped table, `pg_class.relrowsecurity` AND
`relforcerowsecurity` must both be true, AND at least one `pg_policies` row for it must have `qual` or
`with_check` containing the substring `app.current_org_id` — confirmed this correctly recognizes the indirect
`auth_members`/`auth_invitations` policies (an `EXISTS` subquery bridging better-auth's text org id to the
app's own UUID via `organizations.clerk_org_id`, not a direct column comparison) without needing special-case
logic, since the substring match doesn't care how the reference is structured. Also returns `rlsEnabledNoOrgId`
(WARN, not FATAL) — tables with RLS enabled but no `organization_id` at all, for review; this is exactly how a
future "forgot to also add it to the exempt list" slip would surface.

**New bundle rows**: `RLS: tables missing ENABLE/FORCE row-level security` (STOP, named), `RLS: tables missing
a policy referencing app.current_org_id` (STOP, named), `RLS info: tables with RLS enabled but no
organization_id column` (INFO, for review). All three: **PASS/none on every local database** —
`visibleau_mirror`, `visibleau_e2e`, `visibleau`, and the untouched `visibleau_prod` mirror all show complete
RLS coverage already.

**Role check**: a bundle row reads `current_user`'s own `pg_roles` entry (`rolsuper`, `rolbypassrls`) — STOP if
either is true. **How the role name is determined, stated plainly in the row's own detail text**: it isn't —
the app's actual role name lives in Vercel's `DATABASE_URL` env var, never read or guessed here; this check is
only meaningful if Sri runs the bundle in the Neon SQL editor connected AS that same role (Neon's connection
picker allows choosing which role), not the default owner/admin role. A second INFO row lists every
login-capable role's name and flags, so Sri can cross-reference by the name he knows without Claude Code ever
seeing or needing it. Validated both outcomes directly: connected as `postgres` (local superuser) → STOP,
correctly; connected as the project's own existing restricted role `visibleau_app` (confirmed non-superuser,
no `BYPASSRLS`, created by `scripts/db/tier1a-app-role.sql`) → PASS, and the full bundle runs end-to-end under
that role with zero permission errors (RLS correctly hides org-scoped data from it entirely when no
`app.current_org_id` is set — the restricted role working as intended).

**Real-DB tests** (`tests/integration/schema-drift.integration.test.ts`, 4 new tests against real Postgres): a
table with `organization_id` and no RLS at all → `missingEnableOrForce`; RLS enabled+forced but no org policy →
`missingOrgPolicy`; RLS enabled+forced+a policy referencing `app.current_org_id` → clean; RLS enabled with no
`organization_id` → `rlsEnabledNoOrgId`. Also validated the identical STOP→fix→PASS sequence directly against
the bundle SQL itself (not just the TS function) using a scratch table, both for the enable/force and policy
checks.

**Results:** `pnpm typecheck && pnpm build` green. New commit (local, unpushed) on top of `e47033a` — stays
unpushed per `CLAUDE.md`'s rule; Sri re-runs the bundle in Neon and sends a screenshot.

### §46 follow-up (13th): the bundle's role row checks the wrong role — prove which role the live app actually uses

**The bug.** `01dd7b6` added a bundle row checking `current_user`'s `rolsuper`/`rolbypassrls`, validated
locally as `visibleau_app` → PASS and as the local superuser → STOP, and concluded (correctly, for what it
actually measures) that it checks whoever is running the query. In the Neon SQL editor, that's always the
project owner role — never the role Vercel's `DATABASE_URL` or Inngest's `SERVICE_DATABASE_URL` connect as.
The row would have either false-STOPped (Sri running the bundle as the owner role, forever) or — worse —
been misread as proof the app's role is fine, when it never checked the app's role at all.

**Part A — the bundle row, fixed.** Replaced the single `current_user`-checking STOP/PASS row with two INFO
rows, neither capable of setting `OVERALL`:
- Every `LOGIN` role's `rolsuper`/`rolbypassrls`, `neon_superuser` membership (guarded — `neon_superuser`
  doesn't exist on a non-Neon Postgres, confirmed locally: the check returns `n/a` there instead of erroring),
  and which org-scoped tables it **owns** (table ownership bypasses `FORCE ROW LEVEL SECURITY` for the owner
  regardless of any policy — a role that both connects as the app AND owns its tables would defeat the whole
  mechanism silently).
- `current_user` itself, labelled plainly: *"this is the editor/session role, NOT the app's role... Do not
  read a STOP/PASS into this row — it is informational only, by design."*

Both rows state outright that the app's actual role is verified app-side (Part B), not by this bundle.
Validated locally: `visibleau_mirror`'s listing correctly shows `postgres` (superuser, owns every table —
expected, it's the local dev superuser) alongside the project's own existing `visibleau_app`/`rls_test_role`
(both non-superuser, own nothing), and `neon_superuser_member` reads `n/a-role-not-in-this-cluster` for all of
them, as expected locally.

**Part B — the app reports its own role.**

**Found first, before writing anything new**: `docs/ops/neon-vercel-deploy-runbook.md` (written 2026-09-18,
verified during a real production incident, §1/§4.2) already documents that real prod's two connections are
correctly configured today — `DATABASE_URL` → `visibleau_app` (`rolsuper=f`, `rolbypassrls=f`, fully
RLS-enforced) and `SERVICE_DATABASE_URL` → `neondb_owner` (`rolbypassrls=t`, privileged by design for Inngest's
legitimately cross-org background jobs). This is strong, independently-verified corroborating evidence that
the risk this task worried about does **not** currently hold — but a three-week-old manual doc isn't the same
as a live, repeatable, automated proof, which is the actual point of this part.

**`lib/db/role-check.ts`** — `checkDbRole(client)` runs the query the task specified
(`current_user`/`rolsuper`/`rolbypassrls`/guarded `neon_superuser` membership/`current_setting('row_security')`)
against whichever raw `postgres.Sql` connection it's given, and returns the result as plain data (never a
connection string, password, or token — role names and booleans only). `logDbRoleCheck(client, {connection,
expectedPrivileged})` wraps it: logs one structured JSON line via `console.log`/`console.error`, and **never
throws** — a failed check is logged and the function returns `null`, nothing crashes. `expectedPrivileged`
exists because the two app connections have opposite correct answers: the `"app"` connection must NOT be
privileged (privileged there means RLS is silently bypassed for every regular request — `error`-logged if
`super || bypassrls || rowSecurity === "off"`); the `"service"` connection is SUPPOSED to be privileged
(Inngest's legitimate cross-org jobs) — its error case is the opposite, logged if it unexpectedly **isn't**
privileged (which would quietly break those jobs instead).

**Wired into `instrumentation.ts`**, inside the existing `NEXT_RUNTIME === "nodejs"` branch, once per cold
start, fire-and-forget (`.then()`/`.catch()`, never `await`ed at the top level) — a role-check failure at
startup is logged, never blocks boot.

**Admin route**: `GET /api/admin/db-role-check`, gated by a new `isPlatformAdmin()`
(`lib/auth/platform-admin.ts`). **There was no existing platform-admin auth to reuse** — checked directly (no
`PLATFORM_ADMIN`/`isInternal`/`superAdmin` anywhere in the codebase); the org-level "owner"/"admin" roles that
do exist are scoped to a customer's own org, not Sri's access across every org, which is what this route
needs. Built the minimal version instead: `PLATFORM_ADMIN_EMAILS`, a comma-separated allowlist env var, unset
by default — **fails closed**, including for Sri, until he sets it. `isPlatformAdmin()` ignores whatever org
or role the requester's own account has; only allowlist membership grants access. The route returns `404`
(never `403`) for anyone not on it, confirmed clean room via the real `checkDbRole()` results for both
connections as JSON for an allowlisted email.

**Connection inventory** (exactly 2 distinct runtime DB connections exist in this codebase — confirmed by
grepping every `app/`, `lib/`, `inngest/` file for a direct `process.env.DATABASE_URL`/`SERVICE_DATABASE_URL`
read: only `db/client.ts` does; nothing else reads either env var directly, and there is no separate Inngest
connection — every `inngest/functions/*.ts` file imports `serviceDb` from the same `db/client.ts`):

| Connection | Env var | Intended role | Used by |
|---|---|---|---|
| `client`/`db` | `DATABASE_URL` | `visibleau_app` (NOSUPERUSER, NOBYPASSRLS) | Next.js API routes, any org-scoped work via `withRlsContext` |
| `serviceClient`/`serviceDb` | `SERVICE_DATABASE_URL` (falls back to `DATABASE_URL` if unset) | `neondb_owner` (privileged, by design) | Inngest background functions (cron, cleanup, cross-org queries) — there is no separate cron/worker connection; Inngest functions run inside the same deployed Next.js app |

No unpooled/direct-URL runtime connection exists — `DIRECT_URL` is read only by migration/drift tooling
(`drizzle.config.ts`, `scripts/db/migrate-local.ts`, `scripts/qa/schema-drift*.ts`), never at runtime. Worth
noting the `SERVICE_DATABASE_URL ?? DATABASE_URL` fallback as its own small risk: if `SERVICE_DATABASE_URL` is
ever unset in an environment, Inngest's background jobs silently run as the restricted role instead, which
would quietly break anything that legitimately needs to cross orgs — not a bug today, just a latent
footgun worth remembering if `SERVICE_DATABASE_URL` is ever rotated/removed without checking what depends on
the fallback.

**Real-DB tests**: `tests/integration/db-role-check.integration.test.ts` (5 tests against real Postgres) —
`visibleau_app` in the `"app"` slot: no error log; the local superuser in the `"app"` slot: error-logged,
doesn't throw; the local superuser in the `"service"` slot (`expectedPrivileged: true`): no error, privilege is
expected there; `visibleau_app` in the `"service"` slot (expected privileged but isn't): error-logged; a
deliberately-unreachable connection: never throws, logs the failure. `tests/unit/api/admin-db-role-check.test.ts`
(4 tests, mocked): `404` with the allowlist unset (fails closed); `404` for an authenticated real-org owner not
on the allowlist; `404` for no session; `200` with both connections' results for an allowlisted email
(case-insensitive).

**Part C — the runbook, for if the prod app role ever does bypass RLS.** Written as a contingency, not a
correction — Part B's own corroborating evidence (the existing deploy runbook) says real prod is already
correctly configured. If a future `0052-precheck`'s row 1 ever comes back STOP:
1. Confirm (don't assume) via `0052-app-role-precheck-prod.sql` — read-only, checks `visibleau_app`'s
   existence/attributes, its schema/table grants, and critically whether it **owns** any table (ownership
   bypasses `FORCE ROW LEVEL SECURITY` for the owner regardless of policy — a role that both connects as the
   app and owns its tables defeats the mechanism silently).
2. `0052-app-role-apply-prod.sql` creates or re-confirms `visibleau_app` (`LOGIN NOSUPERUSER NOBYPASSRLS
   NOCREATEDB NOCREATEROLE`) **with no password in the file** — Sri sets/rotates it in the Neon console
   separately — then grants it the exact same `USAGE`/`SELECT,INSERT,UPDATE,DELETE`/default-privilege shape
   `scripts/db/tier1a-app-role.sql` already gives the local role, and forces RLS on every RLS-enabled table.
   Explicitly flagged in the file's own header: **migrations and DDL must keep running as the owner role, not
   `visibleau_app`** — this file itself must be run connected as `neondb_owner`, never as the role it's
   creating.
3. Rotate Vercel's `DATABASE_URL` (and `SERVICE_DATABASE_URL`, only if it's ever mistakenly pointed at a
   privileged role — it should stay on `neondb_owner` by design) to `visibleau_app`, redeploy, then re-check
   via Part B: the admin route or a `db_role_check` log line should now show `connection=app, super=false,
   bypassrls=false`.

`0052-app-role-rollback-prod.sql` only reverts the grants (never `DROP ROLE`, which risks orphaning references
mid-use) — explicit warning not to run it while `DATABASE_URL` is still pointed at the role being rolled back,
since that breaks every RLS-enforced request immediately. Does not un-force RLS on any table — forcing it is
never a correctness regression. All three files validated end-to-end on throwaway databases, including the
`FORCE ROW LEVEL SECURITY` loop actually taking effect and the rollback leaving zero remaining grants; dropped
afterward.

**Results:** `pnpm typecheck && pnpm build` green. New commit (local, unpushed) on top of `01dd7b6` — stays
unpushed per `CLAUDE.md`'s rule. After Sri pushes, he opens `/api/admin/db-role-check` on the live site (or
Vercel → Logs, searching `db_role_check`) and sends Claude a screenshot.

### §46 follow-up (14th): auditing every `serviceDb` call site, fencing it with lint, and hardening the platform-admin allowlist

**Why.** §46 follow-up (13th, `c7816d5`) proved `db`/`client` connects as `visibleau_app` (RLS-enforced) and
`serviceDb`/`serviceClient` connects as `neondb_owner` (privileged, bypasses RLS by design for Inngest's
cross-org jobs). That means RLS protects every query on `db` automatically — but **nothing at the database
level protects a query on `serviceDb`**. Every one of its call sites is a potential cross-org leak if it is
reachable from a user request and takes its org/brand id from request input without a membership check.

**Method.** Grepped every `.ts`/`.tsx` file for `serviceDb` (not just `.ts` — an early pass that filtered to
`*.ts` only silently missed 11 real `.tsx` App Router pages, caught only because the new lint rule below fired
on them unexpectedly during validation; re-grepped with `*.{ts,tsx}` and audited those 11 too). **134 files**
reference `serviceDb` as of this follow-up; 30 of those are test files (seeding/assertions against a real test
DB, out of scope for this audit — they don't run in production). The remaining **104 source files** were
audited individually (3 parallel research agents for the bulk, personally re-read for every file called out
below) and grouped by how each one is reachable and where its org/brand id comes from:

| Group | Files | Reachable from a user/HTTP request? | Org/brand id source | Risk |
|---|---|---|---|---|
| `lib/auth/**`, `lib/governance/**` (`access-control.ts`, `record-data-residency.ts`, `feature-flags.ts`, `audit-trail.ts`), `db/client.ts`, `db/seed/**` | 7 | `lib/auth/server.ts`/`current-user.ts` run *during* session resolution itself (nothing to check org against yet); `access-control.ts` **is** the org-check (`assertBrandAccess`'s brand lookup has no `organization_id` in its SQL — the `brand.organizationId !== user.organizationId` check happens in JS right after the fetch, functionally equivalent to a `WHERE` clause); `db/seed/**` only runs via `tsx` scripts | N/A / self | Low |
| `inngest/**` (background functions) | 62 | Only via internal event dispatch (`inngest.send`), never a direct HTTP route | Every sender that was checked derives the event's `organizationId`/`brandId` server-side from the authenticated session or a row already loaded for the caller's own org — not relayed unvalidated from the client | Low, with 2 exceptions below |
| `app/api/webhooks/**` (Stripe) | 1 | Yes, but authenticated by Stripe signature verification, not a user session — there is no "org membership" to check at that layer | Resolved from the webhook payload's own Stripe customer id, looked up server-side | Low (by design) |
| `lib/audit/**`, `lib/sample-audit/**`, `lib/workflow/**`, `lib/scheduling/**`, `lib/onboarding/**`, `lib/platform/**`, `lib/communication/**`, `lib/client-portal/**`, `lib/agent-analytics/**`, `lib/brands/**` | 33 | Indirectly — called by Inngest jobs or by API routes that already resolved org context, never directly from a request | Caller-supplied, already validated upstream in every real caller found | Low, with 1 note below |
| 21 individually-listed `app/api/**/route.ts` files | 21 | Yes, directly | `getCurrentUser()` session, or a brand/org already validated earlier in the same request via `assertBrandAccess()`/`withRlsContext()` | Low, except 1 High (fixed) + 2 Medium (documented) below |
| 10 `.tsx` App Router pages (the gap found via the lint rule) | 10 | Yes, directly (server component render) | Same pattern as the API routes: session (`getCurrentUser()`), or a capability token checked for revocation/expiry before use | Low, except 1 Medium (documented) below |

**High — fixed.** `app/api/admin/backfill-classify/route.ts` gated its POST on `currentUser.role !== "owner"` —
an ordinary per-org role every org's own first user gets by default, not a platform-admin check — while its
`serviceDb` query (`isNull(brands.classification)`) is an intentional **platform-wide** sweep with zero org
filter. Any org owner on the live site could call it and get every org's un-classified brand names back in the
JSON response. Fixed by switching the gate to the new `checkPlatformAdmin()` (Part C) and logging
`admin_access`. RED→GREEN: `tests/integration/admin-backfill-classify.integration.test.ts` seeds 2 real orgs +
2 brands with `classification = NULL`; against the pre-fix code (confirmed via a scratch copy, since the old
gate used `getCurrentUser` rather than `checkPlatformAdmin`) a third org's "owner" got a real `200` with another
org's brand name in the response; against the fix, the same caller gets `404` with nothing leaked, and a real
platform admin still gets the full cross-org sweep (intended).

**Concrete vulnerability — fixed (same unvalidated-request-input shape, not literally an "org id from
request").** `inngest/functions/generate-content-draft.ts` looked up `remediationTasks` by `taskId` alone.
`taskId` is sent in the request body of `app/api/brands/[brandId]/drafts/route.ts`, validated only as
`z.string().uuid()` — never checked to belong to the caller's own brand/org — before being relayed into the
`draft/generate` event. Any caller who obtained another org's real `taskId` (e.g. a guessable sequential
export, a leaked link) could get that task's `title`/`description` pulled into an LLM prompt and stored as a
new draft under their **own** org. Fixed by scoping the lookup to
`and(eq(remediationTasks.id, taskId), eq(remediationTasks.organizationId, orgId), eq(remediationTasks.brandId, brandId))`,
where `orgId`/`brandId` are the event's own fields — which the calling route already derived from the
authenticated session + `assertBrandAccess`, never from the request body. RED→GREEN:
`tests/integration/generate-content-draft-cross-tenant.integration.test.ts` seeds 2 real orgs/brands + one real
task owned by org B. `git stash`-ing the fix and calling the Inngest function's handler directly (its
`createFunction()` return value exposes the handler via `.fn` — `(fn as unknown as {fn: Handler}).fn({event:
{data}})`, a pattern with no prior precedent in this codebase; every other Inngest test only mocks
`inngest.send`) with org A's id + org B's real `taskId` actually inserted a leaked `content_drafts` row
containing org B's secret title into the real test database — confirmed via a direct `SELECT`, then
`git stash pop` to restore the fix: the same call now rejects with `Task not found: <id>` and no leaked row.

**Medium — documented, not code-fixed (per the task's own Medium handling).** All three get an in-file comment
explaining the real limitation, not a falsely-reassuring "this is fine":
- `app/api/organizations/[orgId]/members/accept/route.ts` — the org id IS checked (`member.organizationId !==
  orgId` → 404), so there's no cross-org escalation. But there is no `expiresAt`/TTL check anywhere, despite the
  error message implying one ("Invalid or expired invitation"), and no check that the caller IS the invited
  person — the raw invite token can be replayed indefinitely by anyone who ever had it.
- `app/api/audits/[auditId]/status/route.ts` — zero auth, zero org filter in its `serviceDb` query; the only
  thing gating it is an app-level `metadata.isSample` boolean. Its sibling
  `app/api/sample-audit/[auditId]/status/route.ts` gets the same guarantee from an unforgeable DB-level join
  against the hardcoded `__sample__` org instead — a real guarantee, not a flag that could be wrong.
- `app/(marketing)/sample-audit/result/[id]/page.tsx` — found via the `.tsx` gap. Same `metadata.isSample`-only
  pattern as the route above, but exposes **more**: the full score breakdown plus `brandName`/`brandDomain`,
  not just a status string, if that flag is ever wrong on a real customer audit. Recommend the same
  join-against-sample-org pattern for both; flagged for Sri, not fixed here.

**Inngest payload note (architectural, not currently exploitable).** 11 Inngest functions
(`detect-drift.ts`, `calculate-topical-gaps.ts`, `calculate-share-of-voice.ts`, `simulate-query-fan-out.ts`,
`classify-citation-sources.ts`, `aggregate-visibility-trend.ts`, `render-report-pdf.ts`,
`weekly-digest-cron.ts`, `sample-audit-cleanup.ts`, `bulk-reaudit-orchestrate.ts`,
`classify-on-brand-create.ts`) use the pattern `const bId = eventBrandId ?? current.brandId` — preferring the
event payload's own `brandId`/`organizationId` over the value actually on the loaded DB row when the payload
supplies one. Every current sender of these events is itself already validated (single trusted sender per
event today), so this is not exploitable right now. But it means a future sender bug — or a second sender
added later without the same care — could silently pass a mismatched org/brand id through a legitimate
`auditId` and have it trusted over the DB's own ground truth. Flagged for Sri; recommend always deriving from
the loaded row, or asserting equality instead of falling back.

**Dead code found along the way (not fixed — out of scope, flagged for Sri).** ~12 functions/files with zero
callers anywhere in `app/`, `lib/`, or `inngest/`: `lib/platform/config-bundle.service.ts` (whole class),
`lib/client-portal/permissions.ts`'s `isValidPortalToken`, `lib/onboarding/state-machine.ts`'s
`isFirstTimeUser`, `lib/workflow/progress-summary.ts`'s `getOrgProgressSummary`,
`lib/workflow/workflow-orchestrator.ts`'s `createWorkflowRun`, `lib/workflow/content-generator.ts`'s
`generateContentDraft` (superseded by the Inngest-local function of the same name, audited above),
`lib/workflow/validation-scheduler.ts`'s `scheduleReaudit`, all 4 exports of
`lib/agent-analytics/task-emitter.ts`, `lib/agent-analytics/metrics.ts`'s `get5xxForBots`/`getRobotsViolations`,
`lib/agent-analytics/bot-registry.ts`'s `getRegistryForVendor`,
`lib/communication/alert-composer.ts`'s `sendDriftAlert`/`sendVolatilityAlert`,
`lib/platform/budget-policy.service.ts`'s `getPhase2CostTarget`. None of these import paths needed to be
allowlisted on their own merit — they're covered by their directory's group allowlist regardless — but their
org-scoping was never exercised by a real caller, so "confirmed safe" for them means "confirmed inert," not
"confirmed correct under load."

**Everything else in the 33-file lib/ group and the 62-file inngest/ group**: confirmed Low — either the
org/brand id is session-derived, or (for the handful of pure-helper functions taking a bare `taskId`/`runId`/
`auditId` with no org check inside the function itself) every current caller validates ownership before
calling, which is safe today but is a defense-in-depth gap if a new caller is ever added without the same
care — same shape as the Inngest payload note above, not re-litigated file by file here.

---

**Part B — fenced with a Biome lint rule.** This project has no ESLint config at all — `pnpm lint` runs `biome
check .` — so the task's "ESLint `no-restricted-imports` (or a small custom rule)" was implemented as Biome's
equivalent, `linter.rules.style.noRestrictedImports`, in `biome.json`: banning the named import `serviceDb`
from `@/db/client` everywhere, with the rule's own `message` explaining why and pointing here for the
per-path justifications (Biome's JSON config format has no comment syntax — confirmed empirically, a `//` line
is a hard parse error). Three `overrides` blocks turn the rule back `"off"` for confirmed-safe paths, matching
the groups in Part A's table:
1. Structural: `lib/auth/**`, `lib/governance/**`, `inngest/**`, `db/**`, `scripts/**`, `app/api/webhooks/**`,
   `tests/**`.
2. The 10 narrow `lib/` directories from Part A's third row.
3. The 21 individually-listed `app/api/**/route.ts` files from Part A's fifth row — listed one by one, not as
   a directory wildcard, so a **new** route added later under `app/api/` is NOT silently allowlisted just
   because its neighbours are.
4. The 10 `.tsx` App Router pages from Part A's sixth row (added once the gap was found), listed the same way.

Next.js's `[param]` dynamic-route folder syntax breaks Biome's glob matcher (it reads `[orgId]` as a regex
character class) — every such path in the allowlist is escaped as `\[orgId\]`.

**Failing-fixture proof**: `tests/unit/governance/service-db-lint-fence.test.ts` — writes a real, temporary
fixture file to a non-allowlisted path (`app/_lint-fence-fixture-disallowed/route.ts`), shells out to the real
`biome` binary against it (`execFileSync`, same pattern as the existing CLI-integration tests in
`tests/phase2/sprint1/section5-cli-service-integration.test.ts`), asserts a non-zero exit and the
`lint/style/noRestrictedImports` category in the output, then deletes the fixture in `afterEach` regardless of
outcome — nothing is left in the tree for a normal `pnpm lint` run to trip over. A second test proves the same
import passes cleanly from an allowlisted path (`lib/auth/**`). (`--stdin-file-path` was tried first, to avoid
touching disk at all, but Biome's path-based `overrides` matching didn't fire reliably against stdin input in
this version — a real, cleaned-up temp file is what actually proves the rule.) Both tests run under `pnpm
test`, which CI already runs.

**Lint regression check.** The codebase already fails `pnpm lint` with 435 pre-existing errors / 349 warnings /
272 infos before this follow-up touched anything (confirmed by stashing just `biome.json` and re-running).
After every fix, the new fence, and the full allowlist: **same counts, 435/349/272** — zero new violations
introduced, and a direct check for `lint/style/noRestrictedImports` in the full report returns zero hits
outside the new test's own temporary fixtures.

---

**Part C — `isPlatformAdmin()` hardened.** §46 follow-up (13th) introduced it as a plain email allowlist
(`PLATFORM_ADMIN_EMAILS`) trusting the session's email as-is. Rewrote `lib/auth/platform-admin.ts`:
- Unset/empty `PLATFORM_ADMIN_EMAILS` → nobody is admin, checked **before** querying the DB at all (fails
  closed, already the case, now proven never to issue a query it doesn't need to).
- The session only gives a `userId`; the email itself is re-read directly from `auth_users.email`/
  `email_verified` via `serviceDb` — never trusted from the client or the session object — and matching
  requires `email_verified = true`.
- Both the DB email and every allowlist entry are `.trim().toLowerCase()`'d before comparing — case and
  whitespace differences never cause a false negative or positive.
- Exact match only (`Set.has`) — no wildcard, no domain suffix matching.
- `checkPlatformAdmin()` returns `{ allowed, userId }`; every admin route logs
  `console.log(JSON.stringify({ event: "admin_access", userId, route, allowed }))` — `userId` only, the email
  itself is never logged. Wired into both `/api/admin/db-role-check` and the newly-fixed
  `/api/admin/backfill-classify`.

**Tests** (`tests/unit/auth/platform-admin.test.ts`, 9 tests): no session; unset env fails closed and never
even calls `serviceDb.select` (asserted directly); verified + allowlisted → allowed; verified with case/
whitespace differences on **both** sides → still allowed; **unverified** email on the allowlist → NOT allowed
(the actual hardening this follow-up adds); verified but not on the allowlist → not allowed; no matching
`auth_users` row → not allowed; a prefix-only allowlist entry never matches as a domain wildcard; the
`isPlatformAdmin()` boolean wrapper. `tests/unit/api/admin-db-role-check.test.ts` (3 tests, rewritten against
the new `checkPlatformAdmin()` interface) additionally confirms the logged JSON never contains an `@`
character, for both the allowed and not-allowed cases.

**For Sri — how to enable it in production.** In Vercel → the project → Settings → Environment Variables
(Production), add `PLATFORM_ADMIN_EMAILS` with his verified Vunnara login email (comma-separate if more than
one address is ever needed), then redeploy — the env var is read at request time, so it takes effect on the
next deploy, not retroactively on already-running instances. Until that's set, every admin route 404s for
everyone, Sri included — that's the fail-closed default working as intended, not a bug to chase.

**Results:** `pnpm typecheck` green, `pnpm build` green, `pnpm lint` at the same pre-existing 435/349/272
baseline with zero new `noRestrictedImports` hits outside the fence's own cleaned-up test fixtures. New commit
(local, unpushed) on top of `c7816d5` — stays unpushed per `CLAUDE.md`'s rule.

### §46 follow-up (15th): the three documented-not-fixed auth gaps, Inngest trusting the row instead of the payload, and the fence gating the real repo

**Previous commit.** `78a08d9` (the 14th follow-up above) — confirmed still unpushed:
`git log origin/main..main` lists it among 5 local-only commits, none pushed.

**Part A — `app/api/organizations/[orgId]/members/accept/route.ts` hardened.** Before: `serviceDb`, no
expiry column existed at all, no caller-identity check, `409` on reuse. After: moved to `db` +
`withRlsContext(orgId, ...)` (RLS now scopes the SELECT itself, not just a JS comparison — kept the explicit
`organizationId !== orgId` check too, as defence in depth); added `expires_at` (migration 0042, backfilled
`invited_at + 7 days` for existing rows, `NOT NULL`); the invite route now sets a real 7-day expiry.
Caller-identity: the invite is created by resolving an email to an **existing** `users` row at invite-send
time (`members/invite/route.ts`) and storing that row's `userId` on the invite — comparing `currentUser.id ===
member.userId` is a strictly more precise version of "signed-in email equals invite email" (compares the
actual account, never needs to store or log an email on this route at all) — plus the signed-in account's own
`auth_users.email_verified` must be `true` (same source as `checkPlatformAdmin()`), closing the gap where an
attacker who registered under the invited email before ever proving they own that inbox could otherwise still
pass the identity check. **Residual risk not closed here** (out of this route's scope): the email→user lookup
at `members/invite` time itself has no squatting defence — flagged for Sri.
Wrong user → `403` ("This invite was sent to a different email address", address never revealed). Expired or
already-used → `410` ("...Ask your organization admin to send a new one."). Atomicity: the final `UPDATE`'s
`WHERE` re-checks `accepted_at IS NULL` inside the same RLS transaction as the read — a double-submit's loser
gets zero affected rows, not a second "success" (its exact response is `404` or `410` depending on whether its
own `SELECT` ran before or after the winner's `UPDATE` cleared `invitation_token` — both are safe, neither
duplicates a membership).
**Token guessability**: `nanoid(21)` from the default 64-symbol alphabet — ~126 bits of entropy, confirmed not
sequential/guessable, no fix needed.
**Tests** (`tests/integration/members-accept.integration.test.ts`, real DB, 6 tests): wrong user, expired,
reused, unverified email, double-submit race (exactly one acceptance recorded), happy path. RED→GREEN: against
the pre-fix route (`git stash`), 4 of 6 failed for exactly the 4 new protections (identity, expiry, the
409→410 normalisation, verified-email); the other 2 (race, happy path) already passed under the old code for
unrelated reasons (Postgres's own per-statement row locking, and ordinary successful acceptance), confirmed
and documented rather than claimed as new coverage.
**Aside, found while reading the schema**: better-auth's own organization plugin already ships a
fully-modelled `auth_invitations` table (`email`, `status`, `expires_at`, `inviter_id`) — completely unused by
this app's actual invite flow, which has its own parallel `org_members.invitation_token` mechanism instead.
Not migrated to it here (out of scope, a bigger architectural change); noted for Sri as a real duplication.

**Part B — sample-audit read endpoints.** `app/api/audits/[auditId]/status/route.ts`: **checked and confirmed
dead code** — no frontend caller anywhere in this repo (`audit-running.tsx` polls `/api/audits/[auditId]`
directly, not `.../status`; the sample-audit running page polls the sibling route below) — but a dead route is
still a live, publicly-reachable endpoint, so it got the same fix as its sibling rather than being left as-is.
`app/api/sample-audit/[auditId]/status/route.ts`: this is the one actually polled every 3s by
`sample-audit/running/page.tsx` while a sample audit runs — carries the real public traffic, previously had
zero rate limiting despite being fully public. `app/(marketing)/sample-audit/result/[id]/page.tsx`: public,
server-rendered, viewed once per completed sample audit.
Defence in depth added to all three: (1) DB-level join against the hardcoded `__sample__` org (the two status
routes already had or now have it; the result page didn't and now does) kept alongside the app-level
`metadata.isSample` check as a redundant secondary guard — a real customer audit can't pass both checks even if
one were ever buggy; (2) minimal field allow-list — the result page was passing its **entire** server-selected
row, including the full `metadata` JSONB blob, to the client component via `JSON.parse(JSON.stringify(audit))`
(which launders the type to `any`, silently defeating `SampleResultView`'s own narrower `AuditResult` prop
type and confirmed, by reading that component, to never actually read `metadata` at all) — replaced with an
explicit object literal matching exactly the 10 fields the view uses; the string-label `scoreSentiment`/
`scoreContext` columns (as opposed to their `*Numeric` siblings, which the view renders) are no longer even
selected from the DB; (3) IDs confirmed unguessable (`defaultRandom()` UUIDs); (4) rate limiting — added
`checkSampleAuditReadRateLimit()` to `lib/sample-audit/rate-limit.ts`, a second, much more generous limiter
(60/min per IP, same Redis client/fail-open-when-unconfigured behaviour as the existing 3/24h creation
limiter, which would have broken normal 3-second polling if reused directly) — applied to all three. A Server
Component page can't set a `429` status directly (no route handler there), so the result page renders an
inline "Too many requests" message instead when rate-limited.
**Tests** (`tests/integration/sample-audit-read-endpoints.integration.test.ts`, real DB, 6 tests): a real
non-sample audit ID → `404` on both API routes and `notFound()` on the page; the sample audit ID → `200`/`
{status: "complete"}` on the routes, and only the 10 allow-listed fields (no `metadata`) reach the page's
client component, confirmed by inspecting the rendered element's own props directly. RED→GREEN: against the
pre-fix code, the field-allow-list test failed exactly as predicted (`metadata`, `scoreSentiment`,
`scoreContext` all present in the old output); the `404`-on-real-audit tests already passed under the old code
too (the app-level `isSample` check alone was already sufficient against **today's** actual data — the fix is
closing a structural/defence-in-depth gap, not a flag that's currently wrong on any real row), documented
honestly rather than over-claimed.

**Part C — Inngest functions now derive org/brand from the row, not the payload.** Re-audited the "11
functions" the 14th follow-up counted: **3 were false positives** from an unescaped regex in that audit
(`eventBrandId|brandId ?? ` — the bare `?` characters were read as regex quantifiers, not literal text) —
`weekly-digest-cron.ts` and `sample-audit-cleanup.ts` are cron-triggered with no external event payload to
distrust at all, and `classify-on-brand-create.ts` only ever receives a bare `brandId` with no competing org
claim to reconcile against. Corrected count: **8 real files** needed the fix.

Added `lib/governance/inngest-scope-guard.ts`'s `loadScopedOrAbort()`: loads the entity by its own id, treats
the row's own `organizationId`/`brandId` as the only truth, and if the event payload also claims one AND it
disagrees, logs `inngest_scope_mismatch { fn, entityId }` at error level and aborts — no email/token/secret in
the log, confirmed by a dedicated unit test.

| Function | Trigger | Old behaviour | Fix |
|---|---|---|---|
| `detect-drift.ts` | `audit.complete` | `eventBrandId ?? current.brandId` | loads `audits` by `auditId`, uses its own `brandId`/`organizationId` |
| `calculate-topical-gaps.ts` | `audit.complete` | same pattern | same fix |
| `calculate-share-of-voice.ts` | `audit.complete` | same pattern | same fix |
| `simulate-query-fan-out.ts` | `audit.complete` | same pattern | same fix |
| `classify-citation-sources.ts` | `audit.complete` | same pattern | same fix |
| `aggregate-visibility-trend.ts` | `audit.complete` | same pattern | same fix |
| `render-report-pdf.ts` | `report/generated` | didn't even read `generatedReports.organizationId`/`brandId` — trusted the event outright, no fallback at all | select now includes the report's own org/brand; `loadScopedOrAbort` validates before either is used |
| `bulk-reaudit-orchestrate.ts` | `bulk/reaudit.requested` | used the event's `organizationId` directly for every `withRlsContext` call keyed by `operationId` | loads `bulk_operations` by `operationId` first, uses **its** `organizationId` for every subsequent write |

**Sender trace** (task's explicit ask): every one of the 6 `audit.complete` senders already derives its
`organizationId`/`brandId` from the audit row it just completed, server-side, never from request input —
unchanged by this fix, just no longer the ONLY thing standing between a bad payload and a bad write.
`render-report-pdf.ts`'s sole sender, `generate-narrative-report.ts`, is itself another Inngest function
(job-to-job, no HTTP path). `bulk-reaudit-orchestrate.ts`'s sender, `app/api/agency/bulk-reaudit/route.ts`,
already validates every `brandId` against the authenticated org's own brands before sending — genuinely
careful today, but the fix means a future, less careful sender (or a replay) no longer gets to silently
operate under the wrong org.

**Tests**: `tests/unit/governance/inngest-scope-guard.test.ts` (7 tests) — the helper itself: passes through
on agreement or no claim at all; aborts + logs on an org mismatch; aborts + logs on a brand mismatch (only
when the row's own `brandId` isn't null); never logs the actual org/brand values, only `fn`/`entityId`; a
missing row returns `null` without logging (not every "not found" is a mismatch). Real-DB RED→GREEN
(`tests/integration/inngest-scope-guard-abort.integration.test.ts`, 2 tests) on the two most differently-shaped
functions:
- `detect-drift.ts`: a same-org, **wrong-brand** payload (a real decoy brand's real prior audit, in the same
  org) — chosen deliberately over a wrong-org payload, because a wrong org alone is already caught by RLS on
  the "previous audit" lookup *by accident*, which wouldn't have distinguished old from new code. Against the
  pre-fix function, this reached all the way to `inngest.send("drift.detected", ...)` (observed failing with
  `ECONNREFUSED` trying to reach a local Inngest dev server — proof it got past computing and persisting a
  cross-brand drift comparison first); against the fix, it aborts before any read of the decoy audit.
- `bulk-reaudit-orchestrate.ts`: a wrong-org payload for a real `operationId` — pre-fix, failed with a
  `completed`/`skipped`/`failed` result object (not the abort shape) and would have proceeded to create
  audits; post-fix, aborts with no audits created and the operation's `status` never leaves `pending`.

**Part D — the fence proven against the real repo, not just a fixture.** The 14th follow-up's
`noRestrictedImports` proof only ever ran against temporary fixture files in a throwaway directory. Added
`tests/unit/governance/service-db-fence-whole-repo.test.ts`: runs `biome check .` (the real binary, the real
config, the whole tree) and asserts zero `noRestrictedImports` hits — this passes today. A second test proves
it actually catches a regression: creates a brand-new file under `app/` (scanned by `files.includes`, not
matched by any override group) containing a disallowed `serviceDb` import, re-checks, confirms a hit, deletes
the file.
**A real bug found and fixed building this**: `biome check .`'s `--max-diagnostics` defaults to 20 — with a
~1000-diagnostic pre-existing baseline, a genuinely new hit on a file that doesn't happen to sort into the
first 20 printed is silently truncated away, not reported as zero. Confirmed directly (checking the injected
file in isolation caught it; checking the whole repo without the flag did not) and fixed by passing
`--max-diagnostics=5000`.
**A real race found and fixed building this**: the first version of this test mutated `middleware.ts` in
place (write → check → restore in a `finally`). That raced with a full-suite `pnpm test` run already running
in the background from earlier validation in this same follow-up, and left `middleware.ts` genuinely corrupted
on disk (confirmed: both processes read/wrote the same shared, git-tracked path at overlapping times).
Restored via `git checkout -- middleware.ts`; the test itself was redesigned to create its own brand-new file
instead of mutating any existing one, which has no shared state to race on regardless of what else is running.
**Confirmed this runs in `pnpm test`**: `pnpm test` is exactly what `.github/workflows/ci.yml`'s `test` job
already runs — no changes needed there. `followup-unit-suite-role-403-and-ci.md` (referenced in this task as
the source of "the CI being added") does not exist anywhere in this repo as of this follow-up — whatever CI
changes it describes haven't landed yet, so there's nothing to additionally wire this into; it runs today via
the existing `test` job and will keep running under any future CI step that also invokes `pnpm test`, unless
that future change specifically excludes this file.

**Regressions found and fixed while validating (both from this follow-up's own earlier edits, not
pre-existing)**:
1. The explanatory comment added to `lib/auth/server.ts`'s self-seeded owner-row insert pushed `acceptedAt:`
   more than 500 characters past `.insert(orgMembers)`, past the character budget
   `tests/integration/governance/s8-governance-db.integration.test.ts`'s own source-regex assertion allows —
   moved the comment above the `.insert()` call entirely instead of inside the `.values({...})` object.
2. `tests/integration/section2/_harness.ts` connects to a third, separate local database
   (`visibleau_test`, hardcoded, distinct from both `visibleau` and `visibleau_e2e`) that migration 0042 had
   never been applied to — applied it there too (it was also missing 0041, applied as part of the same catch-up).
Both caught by running the full integration suite, not just the files directly touched — exactly the kind of
gap a RED→GREEN proof on an individual file can't see.

**Results:** `pnpm typecheck` green, `pnpm build` green, `pnpm lint` at 432/349/272 — *below* the 435/349/272
baseline (an incidental net improvement from reformatting touched files), zero `noRestrictedImports` hits.
Full suite green: unit 227/239 files (12 pre-existing, unrelated flakes — same set as every prior follow-up's
final run, confirmed by name); integration 55/55 files, 792/804 tests, 12 skipped, 0 failures. New commit
(local, unpushed) on top of `78a08d9` — stays unpushed per `CLAUDE.md`'s rule.

### §46 follow-up (16th): final pre-push verification + one ordered runbook

Read-only investigation of `7ecef68`'s own open questions, before Sri pushes 6 local commits
(`0b31a94`..`7ecef68`). No code defect found that needed fixing; one real product gap found and
documented (not fixed — out of this follow-up's scope). Two deliverables required a new commit
regardless: the regenerated prepush bundle and this section's own improved `0053` precheck.

**A1 — `middleware.ts` integrity.** `git diff 78a08d9..7ecef68 -- middleware.ts` is empty; `git
status` shows only the two pre-existing, unrelated untracked `public/` build artifacts. The race
documented in the 15th follow-up's own Part D never made it into a commit — confirmed clean.

**A2 — `expires_at` semantics.** Migration 0042 adds it as `NOT NULL`, backfilled
`COALESCE(invited_at, updated_at, now()) + interval '7 days'` for every existing row — there is no
`NULL` case for the accept route to handle, by construction. `members/accept/route.ts:83` already
checks `member.expiresAt.getTime() < Date.now()` → `410` ("...Ask your organization admin to send
a new one"), which correctly treats any backfilled row whose 7-day window has already passed as
expired, exactly the rule this question asked for. Code and migration already agreed; the one gap
was visibility — `db/prod-fixes/0053-org-members-invite-expiry-precheck-prod.sql` only showed
`pending_invite_rows`, not how many of those are about to start 410ing. Added
`already_expired_pending_rows` (same backfill formula, compared against `now()`) so Sri sees the
actionable number before applying `0053` to prod.

**A3 — two invite systems? A bigger finding than expected.** `members/invite/route.ts` requires an
**existing** `users` row for the target email (`404 "User not found"` otherwise) — genuinely
unregistered people cannot be invited through it at all. better-auth's `organization()` plugin is
configured with `auth_invitations`/`auth_members` wired into its schema mapping (`lib/auth/
server.ts`), but a repo-wide search for `createInvitation`/`acceptInvitation`/`rejectInvitation`/
`cancelInvitation` found **zero callers anywhere** — that flow is structurally present (the schema
mapping exists because the plugin requires it) but never invoked by any app code. More
significantly: **the custom flow's own token never reaches the invited person either.**
`members/invite/route.ts` returns `{ id, token }` in its JSON response, and
`components/domain/governance/invite-form.tsx` (the only frontend caller) reads that response only
to clear its own form and refresh the pending-members list — the `token` itself is never
displayed, copied, or emailed to anyone. There is no email-sending code anywhere in the invite
route (no `sendEmail`, no `inngest.send` for a notification event). **Net effect: as shipped, no
one — registered or not — can currently complete the accept flow this and the 15th follow-up just
hardened**, because the only people who ever see a real token are the inviting admin's own
Network tab. This is a pre-existing product gap, not a regression from either follow-up's
security work, and fixing it (email delivery, or migrating to better-auth's native invitation flow
which already has the right `expires_at`/`status`/`email` shape) is a feature decision for Sri,
not a "defect" this read-only investigation fixes itself.

**A4 — rate limiter backend.** `lib/sample-audit/rate-limit.ts` is Redis-backed via
`@upstash/ratelimit` + `@upstash/redis` for both the existing 3/24h creation limiter and the new
60/min read limiter — never in-memory; when Upstash isn't configured it fails **open** (allows
everything) rather than falling back to a per-instance `Map`, so there's no partially-working
in-memory state to worry about on Vercel's multi-instance serverless runtime either way.
`UPSTASH_REDIS_REST_URL`/`_TOKEN` are present in the local `.env.prod` reference file — Claude
cannot confirm from here whether those values are actually synced into Vercel's live Production
environment variables (that needs the Vercel dashboard); if they're not, every request simply
passes through unlimited today, same fail-open behaviour, not a crash.

**Part B — bundle regenerated.** New file
`db/prod-fixes/prepush-bundle-0046-0047-0048-0051-0053.sql` (old one kept, not deleted, as
historical record): added `('org_members', 'expires_at', 'timestamp with time zone', true)` to
`expected_columns` (the existing generic "0048: missing columns" check, row 9, now also catches
this automatically), plus two new explicit, by-name rows so `0051` and `0053` are each individually
visible in the grid rather than buried inside row 9's aggregate: row 17 checks
`ai_bot_ip_ranges_vendor_cidr_unique` exists by name; row 18 filters `column_diff` to
`org_members.expires_at` specifically. **Validated locally against real Postgres**: wrapped in a
transaction that drops both the constraint and the column, ran the bundle (`OVERALL: STOP`, 3 STOP
rows — the two explicit ones plus row 9's generic catch of the same missing column), then forced a
rollback and confirmed both are back via a direct follow-up query — proving STOP without ever
actually leaving dev modified. A second, un-transacted run against the real current dev state
confirms `OVERALL: PASS`.

**Part C — one runbook.** `docs/ops/push-runbook-2026-10.md` (full text delivered in the
report-back) — 10 numbered steps, each naming one exact file path to paste into the Neon SQL
editor on the production branch, the expected result, and explicit **⏸ STOP** points (screenshot
to Claude) before `0051`'s apply, before the push itself (bundle must read `OVERALL: PASS`), after
the `db_role_check` log search, and after the Bondi re-audit. Step 10 covers rollback: Vercel's
"Promote to Production" on the prior deployment for an application-level rollback, plus which of
the `0051`/`0053` rollback files are safe to run and in what order if the schema itself needs
reverting.

**Results:** `pnpm typecheck` green, `pnpm build` green. `git log origin/main..main --oneline`
still lists all 6 commits as unpushed, including this follow-up's own new one on top of `7ecef68`.

### §46 follow-up (17th): the rate limiter was a silent no-op in production (no Upstash env vars) — stop fail-open, protect cost-incurring endpoints

**Context.** Sri confirmed on 15 Oct that Vercel → Production has **no `UPSTASH_*` env vars at
all**. Every "fail open when unconfigured" branch the 15th follow-up wrote (and the 16th's own
report-back repeated at face value) was therefore live and firing in production the whole time —
every rate limit on this app's public endpoints has been a no-op.

**Part A — inventory.**

Env vars read: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (`lib/sample-audit/rate-limit.ts`'s
`getRedisConfig()`) — no `KV_REST_API_URL`/`_TOKEN` alias exists anywhere in the codebase (confirmed
by a repo-wide search, zero hits).

Call-site table (full detail, including file:line citations, in the research hand-back this
section is drawn from):

| Route/action | Public? | Cost? | Limiter today |
|---|---|---|---|
| `POST /api/sample-audit` (create) | Yes | **Yes — the only one.** Up to ~100 real OpenAI/Perplexity calls per audit (2 engines × 10 prompts × 5 runs for the free tier the sample org always uses) | `checkSampleAuditRateLimit`, 3/24h — **fails open today** |
| `GET /api/sample-audit/[id]/status` | Yes | No (reads `audits.status` only) | `checkSampleAuditReadRateLimit`, 60/min — fails open (acceptable, no cost) |
| `GET /api/audits/[id]/status` | Yes (confirmed dead/unreferenced by any frontend, still a live endpoint) | No | same read limiter — fails open (acceptable, no cost) |
| `GET /sample-audit/result/[id]` (page) | Yes | No | same read limiter — fails open (acceptable, no cost) |
| `GET /api/badge` | Yes (`Access-Control-Allow-Origin: *`) | No (DB read only) | **A second, independent** inline Upstash client, 100/hour/IP — same env vars, same fail-open bug, never shared with the module above |
| `POST /api/visit` | Yes | No (DB insert + Inngest enqueue only) | Informal in-process `Map` (200 req/60s/IP) — per-instance on serverless, same ineffectiveness class as better-auth's default below, not Redis-related |
| `GET /api/client-portal/verify/[token]` | Yes | No | None at all — acceptable, no cost, gated by a long random token |
| `POST /api/audits` (real, authenticated audit creation) | No (session required) | **Yes**, same LLM fan-out shape as sample audits, tier-scaled | **None** — only `BudgetPolicyService`'s dollar-cap estimate, whose own enforcement failure is swallowed as non-fatal unless the message is exactly `"Budget exceeded"`. Flagged for Sri; a paying customer's own account, not an anonymous denial-of-wallet vector, so out of this follow-up's explicit scope (public endpoints + auth) |

**Auth limiter finding.** `lib/auth/server.ts`'s `betterAuth({...})` config sets no `rateLimit` or
`secondaryStorage` option at all. better-auth's own default
(`node_modules/better-auth/dist/context/create-context.mjs:162-167`):
```
enabled: options.rateLimit?.enabled ?? isProduction,       // true in prod
storage: options.rateLimit?.storage || (options.secondaryStorage ? "secondary-storage" : "memory")
```
So login/signup brute-force limiting **is enabled** in production, but storage defaults to an
**in-memory `Map`** (`dist/api/rate-limiter/index.mjs:7`) because no `secondaryStorage` is
configured — per-instance on Vercel's serverless runtime, resets on every cold start, doesn't share
state across concurrent instances. Not fixed in this follow-up (the task's explicit Part C scope is
public, cost-incurring endpoints) — flagged for Sri as the same class of problem, worth its own
follow-up: configuring `secondaryStorage` (e.g. the same Redis, once added) would fix it for free.

**Unprotected cost endpoints**: exactly one — `POST /api/sample-audit`, already covered above (it
does have a limiter, just a fail-open one before this follow-up). No other public route triggers a
paid call with zero limiter at all.

**Bonus finding, flagged not fixed (out of this follow-up's scope — a cost-estimation bug, not a
rate-limiting one)**: `lib/sample-audit/config.ts` declares the sample audit as 1 engine / 5
prompts / ~$0.10, matching the marketing copy — but `lib/sample-audit/run.ts` never actually passes
that config into `runAuditInline`, which independently derives the real workload (2 engines × 10
prompts × 5 runs ≈ 100 calls, ~20x larger). The only cost check scoped to "sample audit" validates a
number 20x smaller than what runs; the only check that sees the real number uses a generic $5
platform-wide ceiling, not a sample-audit-specific one. This means even a correctly-fail-closed-by-IP
limiter still allows ~20x the advertised cost per allowed request — flagged for Sri as a real,
separate bug worth its own follow-up.

**Part B — no more silent fail-open.**
`getRateLimiterBackend()` (new export in `lib/sample-audit/rate-limit.ts`) is now the one shared
source of truth for "is Redis configured" — `app/api/badge/route.ts`'s previously-separate inline
Upstash client now reads it too, so there's exactly one place this can be wrong, not two.
`instrumentation.ts` logs `rate_limiter_disabled { reason: "missing_env", namesChecked: [...] }` at
`error` level once per cold start, **production only** (local/CI running without Redis is expected,
not worth alerting on) — never the env values themselves. `GET /api/admin/db-role-check` (already
platform-admin-gated) now also returns `{ rateLimiter: "upstash" | "disabled" }` alongside the
existing role-check fields, so Sri can check on demand without digging through logs.
**Tests**: `tests/unit/instrumentation.test.ts` (4 tests) — logs only in production when disabled;
silent when configured; silent outside production; never logs a URL/value, only the names checked.
`tests/unit/api/admin-db-role-check.test.ts` (2 new tests) — reports each backend state correctly.

**Part C — fail closed where it costs money.**
New table `rate_limit_counters` (migration 0043 + `db/prod-fixes/0054-rate-limit-counters-{precheck,apply,rollback}-prod.sql`,
**flagged apply-before-push** — the fallback code reads/writes it unconditionally once the Redis
path is unavailable, so deploying before this table exists would 42P01 every sample-audit-creation
request the moment Redis isn't configured, which is exactly the state production is in right now).
Global/platform-wide, no `organization_id` (added to `RLS_EXEMPT_GLOBAL_TABLES` in
`scripts/qa/schema-drift.ts`, which also needed its `EXPECTED_TABLES` launch-invariant default
bumped 74→75 — that specific check is `it.skip`'d/quarantined already, pre-existing and unrelated,
so nothing active broke, but the default should still be accurate).

`lib/governance/pg-rate-limit.ts`'s `checkPostgresRateLimit()` is the fallback: one upsert per
request (`bucket_key` already encodes the floored window, so `ON CONFLICT (bucket_key) DO UPDATE
SET count = count + 1` *is* the fixed-window counter — no separate rollover logic, no read-then-write
race). IPs are SHA-256 hashed with a salt from `RATE_LIMIT_IP_SALT` before ever touching disk
(Privacy Act 1988 (Cth), APP 11) — a missing salt still produces a safe, non-reversible hash (logged
once as a warning, never blocks the request); the salt is defence in depth against cross-deployment
correlation, not secrecy from the caller themselves, who already knows their own IP. Cleanup is a
daily delete added to the existing `sample-audit-cleanup` cron (no per-row TTL column — Postgres has
none natively, and a daily sweep is cheap for a table this small).

`checkSampleAuditRateLimit()` (guards the one cost-incurring public route) now falls back to this
when Redis is unconfigured, keeping the same 3/24h budget, instead of returning `{allowed: true}`
unconditionally. `POST /api/sample-audit` returns `429` with a friendly message and a `Retry-After`
header computed from whichever backend actually served the check. `checkSampleAuditReadRateLimit()`
(the non-cost status/polling limiter) and `/api/badge` (non-cost) both stay fail-open, per the
task's own framing — justified per-row in Part A's table above.

**Tests** (`tests/integration/rate-limit-fallback.integration.test.ts`, real DB, 6 tests):
`getRateLimiterBackend()` correctly reports `"disabled"` in this test environment (`.env.test.local`
sets `UPSTASH_REDIS_REST_URL=http://localhost:6379`, the exact placeholder the code already treats
as unconfigured — no env manipulation needed to exercise the same gap found live in prod); the
Postgres counter allows up to `max` then denies the next request; a new window allows again; two
IPs get independent counters; the stored `bucket_key` never contains the raw IP; and
`checkSampleAuditRateLimit()` end-to-end allows 3 then denies the 4th with a positive, bounded
`retryAfterSeconds`. RED→GREEN: stashing just the `lib/sample-audit/rate-limit.ts` fix reproduces
exactly the live prod bug — `[true, true, true, true]` instead of `[true, true, true, false]` on
the 4th request — then the fix restores `false`.

**Part D — Upstash setup for Sri.**
1. Vercel dashboard → the project → **Storage** tab → **Marketplace Database Providers** →
   **Upstash** → create a Redis database (the free tier is enough for this app's volume — 3
   requests/24h/IP on the one cost-incurring limiter, 60/min/IP on the read one).
2. Connect it to the Production environment when prompted (and Preview/Development too, if you
   want rate limiting locally without the Postgres fallback — optional, the fallback already
   covers local/CI correctly).
3. **Verify the exact env var names it creates** before assuming anything — Vercel's Marketplace
   integrations have changed naming conventions over time (the older "Vercel KV" product used
   `KV_REST_API_URL`/`KV_REST_API_TOKEN`; this codebase has no alias for that name). Check Vercel →
   Settings → Environment Variables after connecting.
4. If the names are exactly `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — matching
   `RATE_LIMITER_ENV_NAMES` in `lib/sample-audit/rate-limit.ts` — nothing else to do, redeploy and
   skip to step 6. If they're named anything else (e.g. `KV_REST_API_URL`/`_TOKEN`), send Claude
   the exact names and ask for an alias to be added to `getRedisConfig()` before redeploying.
5. (Optional, recommended) Also add `RATE_LIMIT_IP_SALT` — any random string — to Production env
   vars, so the Postgres fallback's IP hashing (still active as a safety net even once Redis is
   configured, since Redis could always go down independently) uses a real secret instead of the
   logged-once default placeholder.
6. **Verify**: redeploy, then either check `GET /api/admin/db-role-check` (platform-admin only)
   shows `"rateLimiter": "upstash"`, or check Vercel Logs for the **absence** of a
   `rate_limiter_disabled` line on the next cold start.

**Results:** `pnpm typecheck` green, `pnpm build` green. New commit (local, unpushed) on top of
`99f549f` — stays unpushed per `CLAUDE.md`'s rule.

### §46 follow-up (18th): Upstash is provisioned, but Vercel's Marketplace integration names the env vars differently than the code expected

**Context.** Same follow-up as the 17th, resent with an update: at 21:16 on 15 Oct, Sri provisioned
Redis — Upstash for Redis (`vunnara-ratelimit`, free plan, `syd1`) via Vercel's Marketplace,
connected to Production + Preview. It created `KV_REST_API_URL`, `KV_REST_API_TOKEN`,
`KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, and `REDIS_URL` — **not**
`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, which is all the 17th follow-up's code read.
Builds on that follow-up's commit (`43ba76d`) rather than redoing it — the base Part A–D work (the
inventory, the startup log, the admin field, the Postgres fallback) already exists; this follow-up
is specifically the alias gap the 17th's own Part D docs predicted ("if they're named anything
else... send Claude the exact names").

**`Redis.fromEnv()` already has this fallback built in** — confirmed by reading
`node_modules/.pnpm/@upstash+redis@1.38.0/node_modules/@upstash/redis/nodejs.js:5706-5722`:
```js
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
...
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
```
But this codebase never called `Redis.fromEnv()` — `lib/sample-audit/rate-limit.ts` always built
`new Redis({url, token})` from its own `getRedisConfig()`, which read `UPSTASH_REDIS_REST_URL`/
`_TOKEN` only, with no fallback. `getRedisConfig()` now does the same fallback explicitly (checks
`UPSTASH_REDIS_REST_URL`/`_TOKEN` first, falls back to `KV_REST_API_URL`/`_TOKEN`, returns a
`source: "upstash" | "kv"` alongside the url/token) — explicit rather than relying on a library
default that could change, per the task's own instruction.

**Deliberately never read**: `KV_REST_API_READ_ONLY_TOKEN` (the limiter needs write access — a
read-only token can't execute the `INCR`/`SET`-shaped Lua script the sliding-window limiter runs)
and `KV_URL`/`REDIS_URL` (TCP `rediss://` connection strings with embedded credentials — this app's
Redis client, `@upstash/redis`, is an HTTP REST client, it doesn't take a connection string at
all). A dedicated test (`tests/unit/sample-audit/rate-limit.test.ts`) proves both: setting
`KV_REST_API_READ_ONLY_TOKEN` alone never resolves a config; setting `KV_URL`/`REDIS_URL` alone
never resolves one either.

`RATE_LIMITER_ENV_NAMES` grew from 2 entries to 4 (`UPSTASH_REDIS_REST_URL`, `_TOKEN`,
`KV_REST_API_URL`, `_TOKEN`) — the startup log's `namesChecked` and the real export now agree (the
17th follow-up's `instrumentation.test.ts` had been asserting against its own mocked copy of this
constant, which could have silently drifted from the real one; now mirrors it explicitly, named
`MOCKED_ENV_NAMES`, so a future drift would show up as a failing assertion). `RateLimiterBackend`
grew from `"upstash" | "disabled"` to `"upstash" | "kv" | "disabled"` — `GET
/api/admin/db-role-check`'s `rateLimiter` field and the startup log's conditional both report the
new 3-way state; the value itself is still never logged, only which name resolved.

`.env.example` gained a new Rate Limiting section (`KV_REST_API_URL`/`_TOKEN` alongside
`UPSTASH_REDIS_REST_URL`/`_TOKEN`, both empty, with a comment pointing at `getRedisConfig()`).
`.env.production.example`'s existing Upstash section now shows both pairs too, with the same
"never set `KV_REST_API_READ_ONLY_TOKEN`/`KV_URL`/`REDIS_URL` for this" warning inline.

**Tests**: `tests/unit/sample-audit/rate-limit.test.ts` (7 tests, new) — `UPSTASH_*` wins when both
are set; falls back to `KV_REST_API_*` when `UPSTASH_*` is unset; falls back when `UPSTASH_*` is
the localhost test placeholder; reports `"disabled"` when neither pair exists; the read-only token
alone never resolves a config; `KV_URL`/`REDIS_URL` alone never resolve a config;
`RATE_LIMITER_ENV_NAMES` lists exactly the 4 names actually read. Plus one new case each in the
17th follow-up's `admin-db-role-check.test.ts` (reports `"kv"` correctly) and
`instrumentation.test.ts` (mock mirrors the real 4-name constant instead of a hardcoded 2-name
copy).

**Part D — now verification, not setup** (Upstash is already provisioned): after this commit is
pushed and deployed, confirm either `GET /api/admin/db-role-check` (platform-admin only) shows
`"rateLimiter": "kv"` (the expected value, since Vercel created `KV_REST_API_*`, not
`UPSTASH_REDIS_REST_*`), or check Vercel Logs for the **absence** of a `rate_limiter_disabled` line
on the next cold start. If it still shows `"disabled"`, double check the exact env var names in
Vercel → Settings → Environment Variables match `KV_REST_API_URL`/`KV_REST_API_TOKEN` exactly (not
truncated or renamed by the integration differently than expected) and that they're attached to the
Production environment specifically, not just Preview.

**Results:** `pnpm typecheck` green, `pnpm build` green, `pnpm lint` unchanged at 430/349/272, zero
`noRestrictedImports` hits. New commit (local, unpushed) on top of `43ba76d`.

### §46 follow-up (19th): restating `43ba76d` for Sri, splitting prod SQL into one-run files, tracking the env example files

**Part A — `43ba76d` restated.**

| Route/action | Public? | Cost? | Before | After |
|---|---|---|---|---|
| `POST /api/sample-audit` (create) | Yes | **Yes** — ~100 real OpenAI/Perplexity calls/audit | Fail-open (silent no-op, no `UPSTASH_*` in prod) | Fails closed via Postgres fallback; `429` + `Retry-After` |
| `GET /api/sample-audit/[id]/status`, `GET /api/audits/[id]/status`, `/sample-audit/result/[id]` | Yes | No | Fail-open | Unchanged — no cost to protect, fail-open stays justified |
| `GET /api/badge` | Yes | No | A second, independent fail-open limiter, same missing-env bug | Consolidated onto the one shared `getRedisConfig()`; still fail-open (no cost) |
| `POST /api/audits` (real, authenticated) | No | Yes, same LLM shape, tier-scaled | No limiter at all, only a dollar-cap estimate | Unchanged — flagged for Sri, a paying customer's own account, out of scope |

**Auth limiter**: better-auth's own rate limiter is enabled in production by default
(`isProduction` — true) but defaults to **in-memory storage** (`dist/context/create-context.mjs:162-167`,
`dist/api/rate-limiter/index.mjs:7`) because `lib/auth/server.ts` sets no `secondaryStorage` — per-instance
on Vercel serverless, doesn't survive a cold start or share state across concurrent instances. Not fixed
(out of scope), flagged for a future follow-up.

**Unprotected cost endpoint**: `POST /api/sample-audit` was the only one — now protected per above.

**Migration added**: `0043_rate_limit_counters.sql` — **apply-before-push**. `lib/governance/pg-rate-limit.ts`
reads/writes the table unconditionally once the fallback path is reached (any time Redis is
unreachable, not just "unconfigured" — a brief Vercel/Upstash outage would also trigger it); deploying
first would 42P01. No `DEFAULT` needed on its `NOT NULL` columns, unlike `0053`'s lesson — this is a
**brand-new** table with no pre-existing writer to protect; the only code that will ever insert into it
is the new `checkPostgresRateLimit()`, part of this same deploy, which always supplies every required
column itself.

**Part B — one-run files for the one prerequisite (0054).**

Split the previous single combined apply file into the one-run-per-editor-submission shape already
established by Sri's own `0051-run*`/`0053-run*` files:

| Order | File | Role |
|---|---|---|
| 1 | `db/prod-fixes/0054-rate-limit-counters-precheck-prod.sql` | Read-only — confirms the table is missing |
| 2 | `db/prod-fixes/0054-rate-limit-counters-run1-apply.sql` | One transaction — creates the table, its `UNIQUE` constraint, and its index (plain DDL, no `CONCURRENTLY` needed — the table starts empty) |
| 3 | `db/prod-fixes/0054-rate-limit-counters-run2-post-check.sql` | Read-only — confirms table/constraint/index all present |
| 4 | `db/prod-fixes/prepush-bundle-0046-0047-0048-0051-0053-0054.sql` | Must show `OVERALL: PASS` |
| 5 | `git push` (Sri) |  |

`0054-rate-limit-counters-rollback-prod.sql` unchanged in content, header updated to reference the
new run1/run2 names.

**Bundle regenerated**: new file `prepush-bundle-0046-0047-0048-0051-0053-0054.sql` (both prior bundles
kept as historical record) adds a new `rate_limit_counters_check` CTE and an explicit row 19 — `STOP`
unless the table, its unique constraint, and its index all exist. **Validated locally**: a transaction
dropping the table and running the bundle inside it shows `OVERALL: STOP` (1 STOP row, the new one),
rolled back cleanly; confirmed the table still exists afterward; a normal run against the real current
state shows `OVERALL: PASS`.

**Part C — the env example files, tracked.**

Read both files in full before touching anything. `.env.example`'s 27 variable names (`NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`,
`NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`,
`NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR`, `DATABASE_URL`,
`DIRECT_URL`, `NEON_REGION`, `SUPABASE_STORAGE_REGION`, `STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `INNGEST_EVENT_KEY`,
`INNGEST_SIGNING_KEY`, `RESEND_API_KEY`, the 6 `FREE_TIER_ENABLED_*` flags, `LLM_MODE`,
`UPSTASH_REDIS_REST_URL`/`_TOKEN`, `KV_REST_API_URL`/`_TOKEN`, `NEXT_PUBLIC_POSTHOG_KEY`,
`NEXT_PUBLIC_POSTHOG_HOST`) and `.env.production.example`'s (the same auth/db/billing/LLM/Inngest/email/
analytics/rate-limit/app set, plus `SENTRY_*`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, the 9
`STRIPE_PRICE_*` ids, 4 real LLM provider key names, `RESEND_FROM_EMAIL`, the 4 `LLM_ENGINE_*_ENABLED`
toggles) are **every** value either empty, a literal `...`/`<placeholder>`/`[ref]`/`[pass]`/`[prod-ref]`
token, or a non-secret public identifier that was already there before this follow-up touched either
file: `NEXT_PUBLIC_APP_URL`/`BETTER_AUTH_URL` (the company's own public domain), `SENTRY_ORG`/
`SENTRY_PROJECT` (slugs, not credentials), and `RESEND_FROM_EMAIL=noreply@visibleau.com` (a generic
transactional-email sender address, shown to every customer who receives a password-reset email — not
a private credential, the same class of "real but not secret" value as the domain itself). No real key,
token, password, or connection string with embedded credentials anywhere in either file. Confirmed clean.

`.gitignore`'s `.env*` line already carried its own comment — `"# env files (can opt-in for committing if
needed)"` — exactly the escape hatch used: added `!.env.example` and `!.env.production.example`
immediately after it. Both files now show as trackable.

**Results:** `pnpm typecheck` green, `pnpm build` green. New commit (local, unpushed) on top of
`6a3ce37`.

### §46 follow-up (20th, Phase 1 of "insufficient data"): a zero-mention audit is a real measurement, not a fabricated low score — the scorer, the CI, the audit page, and the Accuracy relabel

**Context.** The read-only diagnosis of Bondi Audit #19 found one root gap: a dimension computed from
zero brand-mention rows collapses to the numeric score `0`, then gets stored, blended, CI'd and
displayed as if it were a real, measured low score — plus two independent bugs (the Sentiment card's
hardcoded-green truthy check; the Competitor card's hardcoded self-only row) and one mislabel (Accuracy
actually measures citation rate). This follow-up is Phase 1: the scorer/composite/CI contract, the
audit page, the Accuracy relabel, and a read-only prod scan for #19 itself. Phase 2 (separate follow-up)
threads the same contract through every other surface — listed at the end of this section.

**Part 0 — prod scan.** `db/prod-fixes/diag-0055-audit19-mention-scan.sql`. Read-only, one statement
(a `WITH` chain ending in one `SELECT`), PRODUCTION-branch header, resolves Bondi by `brands.name` and
its latest + previous `audits.status = 'complete'` rows by `completed_at` — no id hardcoded beyond the
brand. Per engine, per audit: `citations` rows where `is_branded_prompt IS NOT TRUE AND run_number = 1`,
the stored `brand_mentioned` count, and a raw regex scan of `response_snippet` (`~* 'bondi\s*plumbing'`
or the brand's own domain stem, `\b`-anchored) — plus up to 3 `left(response_snippet, 160)` excerpts,
latest audit only, where the raw scan matched but `brand_mentioned` is false. Documented caveat:
`response_snippet` is itself truncated to 500 characters at write time (both runners), so this can only
ever disprove a false "0% is genuine" claim, never fully confirm one. **Validated locally** against the
local `visibleau_prod` mirror's one real audit (real "Bondi Plumbing" row, 0 stored mentions, 0 raw-scan
matches — consistent) and, in a rolled-back transaction, against a synthetic inserted row reading
*"a local Bondi-based plumbing outfit (trading as Bondi  Plumbing in some listings)"* — correctly
flagged as a raw-scan match with `brand_mentioned = false`, confirming the regex and the excerpt
extraction both work before handing this to Sri.

**Part 1 — the insufficient-data contract.** New `lib/scoring/dimension-result.ts`: one exported type,
`DimensionResult = { status: "scored"; value; ci } | { status: "insufficient_data"; reason:
"no_mentions" }`, and one helper, `resolveDimension(value, ci, mentionRowCount, { alwaysScored? })`.
Frequency passes `alwaysScored: true` (0 mentions out of N calls is itself a real measurement); Position,
Sentiment, Context and Accuracy ("Source citation" — Part 3) go `insufficient_data` whenever
`mentionRowCount === 0`. Confirmed via `lib/audit/organic-citations.ts`'s own `selectOrganicCitations`
that these four currently move in exact lockstep (one shared `mentionedCount` gate — `positions`/
`sentiments`/`contexts` are pushed in the same `if (o.brandMentioned)` branch, never independently
null-filtered), so today's real data only ever produces two composite states — but `resolveComposite`
is written generally (keyed per-dimension, not a single boolean) so a future independent per-dimension
failure mode is handled correctly without a redesign.

**Composite rule chosen**: `resolveComposite(dims, weights)` — 0 mentions (only Frequency scored) →
`basis: "frequency_only"`, composite = Frequency's own value/CI, `weightsUsed: { frequency: 1 }`.
Otherwise → `basis: "weighted"`, blends every scored dimension with its weight renormalised to sum to 1
over the scored subset (a no-op when all 5 are scored — `DIMENSION_WEIGHTS` unchanged). Chosen over
excluding Frequency-only audits from the composite entirely (would hide a real, meaningful 0% from the
headline) and over a fixed "treat missing as average" rule (fabricates data exactly as `NO MOCK DATA`
forbids). Read-time derivation (the audit page computes `distinctMentionedCount` itself from `citations`
at render time, never from a stored flag) means historical audits render correctly immediately, no
backfill. Unit-tested exhaustively in `tests/unit/scoring/dimension-result.test.ts` — `resolveDimension`
(0 mentions, some mentions, `alwaysScored` both ways) and `resolveComposite` (0 mentions, all 5 scored,
a genuine partial subset with renormalised weights, composite never itself `insufficient_data`).

**Part 2 — honest CIs.** `lib/scoring/wilson.ts` gains `wilsonCIFromScore(score, sampleSize)`: treats a
mean 0-100 label score as an empirical proportion and applies the same Wilson correction `wilsonCI`
already used for Frequency/Accuracy — documented in its own comment as a pragmatic adaptation (Position/
Sentiment/Context aren't literal Bernoulli trials), not a textbook proportion CI, since it never
collapses to zero width at a 0/100 boundary for any `n > 0`, which is the property that actually matters
here. `lib/scoring/dimension-ci.ts`'s `computeDimensionCIs` (the write-time function — still called by
both audit runners, unchanged signature) now uses `wilsonCIFromScore` for Position/Sentiment/Context
(replacing the Wald/normal-approximation `symmetricCI`, which was exactly zero-width at score = 0 or 100
for ANY sample size — the direct cause of the page's old "95% CI: 0.0-0.0"), and for the composite: at 0
mention rows, Frequency's own Wilson interval (not a blend of zero-width Wald ones); otherwise, the same
`DIMENSION_WEIGHTS`-weighted blend of each (now-Wilson) dimension's own CI bounds that produced the
composite's point estimate. Composite isn't a true proportion either way, so no proportion-CI formula
applies to it directly — this weighted-blend approach was chosen over the other two sanctioned options
(a per-response bootstrap; showing no CI for a blended score) for determinism and testability; documented
as the simplest of the three, not necessarily the most statistically rigorous. The **audit page**
independently recomputes every dimension's CI at read time from `distinctMentionedCount`/
`distinctSampleCount`/`distinctAccWithSourcesCount` (fresh `citations` queries, organic + `run_number =
1`) rather than trusting the stored `confidenceIntervals` column, so historical audits (scored by the
pre-Wilson write path) also render honest CIs with no backfill. Tested in `tests/unit/scoring/
wilson.test.ts` (score = 0/100 at small n never zero-width, across n ∈ {1,5,40,200,10000}) and
`tests/unit/scoring/dimension-ci.test.ts` (same boundary proof through `computeDimensionCIs`, plus the
frequency-only-composite-equals-Frequency's-own-CI case and the weighted-blend arithmetic).

**Part 3 — Accuracy → "Source citation".** Display-only: the DB column (`score_accuracy`), the internal
key (`accuracy` in `DIMENSION_WEIGHTS`/`DimensionKey`), and the function name (`accuracyDimensionScore`)
are all unchanged — only user-facing copy changed, to "Source citation" (short) / "Source citation — how
often answers that mention you cite a source" (with room). Every site relabelled: the audit page's
breakdown card; `lib/pdf/render.tsx` (exec-summary dims array, dimCard, methodology paragraph);
`components/domain/landing/dimensions.tsx` (marketing copy); `components/domain/action-center/
dimension-group.tsx` (label map); `app/(auth)/agency/reports/pdf-builder/page.tsx` (×2 chart arrays +
methodology paragraph); `app/(marketing)/about/page.tsx`; `lib/exports/sarif.ts`/`junit.ts`/`gha.ts`
(rule/testcase/annotation display names, via a new internal `DIM_DISPLAY_NAMES` map — `ruleId`/`dim`
keys unchanged); `components/domain/audit/audit-results-rich.tsx`; `app/client-portal/[inviteToken]/
page.tsx`; `app/(marketing)/sample-audit/result/[id]/sample-result-view.tsx`; `app/(auth)/audits/
compare/page.tsx`; `app/(auth)/verticals/[packId]/page.tsx` (3 bullets); `app/api/agency/bulk-export/
route.ts` (CSV header). Left alone, confirmed out of scope: `lib/recommendations/triggers.ts`'s internal
`dimension: "accuracy"` tag (Phase 2 fixes the rule's actual firing logic, not this label);
`lib/methodology/methods.ts` (no dimension-labelled copy there at all) — flagged but not fixed:
`app/(marketing)/methodology/page.tsx:77` renders a method's raw `dimension` value as a lowercase badge
for all 5 dimensions uniformly, including `accuracy`; a label-mapping layer there is a separate, small
follow-up if Sri wants it. Re-grepped the whole repo afterward for `Accuracy`/`Factual correctness`/
`factual` case-insensitively — zero remaining display-copy hits.

**Part 4 — the audit page.** Breakdown cards: an `insufficient_data` dimension now renders "N/A" (neutral
colour, `aria-label="Not mentioned — insufficient data"`) with a "Not mentioned" line in place of the bar
+ CI, and its weight label reads "excluded" instead of a percentage; Frequency is never affected. Headline:
`basis: "frequency_only"` shows "Not mentioned in any of N answers across 4 engines"; a genuine partial
blend (not reachable with today's data, but handled) shows "Based on X of 5 dimensions"; the CI line is
never degenerate again. Sentiment card: same `insufficient_data` check as the grid, same `dimensionColor()`
value-band function the grid uses (success ≥ 70 / warning ≥ 40 / danger below / neutral if insufficient)
— the hardcoded `var(--success)` is gone. Competitor card: real per-competitor mention counts, computed
by running `brands.competitors`' names through the exact same `detectBrandMention()` the brand's own
count uses, against this audit's organic `response_snippet` text — not a separate/looser check; empty
`brands.competitors` now shows "No competitors configured yet." + a link to `/brands/[id]`, never the old
hardcoded one-row "#1 you" list. Per-engine performance: unchanged (a real measurement regardless of
mentions).

**Render-tested against real seeded rows** (⚠️ dev/test DB, never prod) in `tests/integration/
audit-page-insufficient-data.integration.test.ts` — three real brands/audits (zero mentions; 3-of-12
partial mentions; fully mentioned with a real configured competitor named in one response), the actual
page component called directly and rendered via `react-dom/server`'s `renderToStaticMarkup`, asserting on
the real rendered text. This caught one real bug before it shipped: `distinctMentionedCount`/
`distinctAccWithSourcesCount` come back from `SUM(CASE ...)` as **strings**, not numbers (Postgres
bigint, surfaced as a string by the driver to avoid precision loss) — `mentionRowCount === 0` against the
string `"0"` is always false, which silently made every dimension read as "scored" with a `NaN` CI
instead of `insufficient_data`. Fixed by coercing both with `Number(...)` once, at destructure. Also
caught, in the test fixtures themselves: `client.json(value)` must be used for a `jsonb` column insert,
not `JSON.stringify(value)` — the latter double-encodes, landing as the jsonb **string** `"[]"` rather
than the array `[]`, which then fails `jsonb_array_length()` with "cannot get array length of a scalar".

**Migration: no.** Every part of this follow-up is read-time derivation or display-only — no schema
change, no backfill, confirmed safe for currently-live code per this task's own constraint.

**Surfaces Phase 2 must still thread this contract through** (from the diagnosis's blast-radius scan —
~25 files beyond the audit page, all inheriting the same "0.00 treated as a real score" gap via a truthy
check or `?? 0`): Brand Overview sparkline + KPI tile; the PDF report and its SARIF/JUnit/GitHub-Actions
exports (a zero-mention audit can fail a real CI gate today); Drift Alerts (composite drift has no
CI-overlap gate at all — a zero-mention audit vs. a real prior score triggers an unconditional false
`significant_drop`); the Agency and Portfolio dashboards (Avg Composite KPI, Top Movers); the Wins Feed
and `visibility_trends` averages (zero-mention audits quietly deflate org-wide averages and can produce
false "win" narratives); Action Center / recommendation triggers (Phase 2 also covers making "confirmed"
data-driven — see its own follow-up); Autopilot lift tracking ("80 → 0 (−80.0)"); the external client
portal; the public embeddable score badge; the public pre-signup sample-audit page (arguably the highest-
visibility instance — a red "0/100" shown to prospects before they've even signed up); the Health Check
panel; the GA4 event push; the audit-complete and weekly-digest emails; outbound webhooks (currently
latent — the event payload isn't enriched with the score yet, but would reactivate this the moment it is).

**Results:** `pnpm typecheck` green, `pnpm build` green. `tests/unit/scoring` (10 files) + the new
`tests/integration/audit-page-insufficient-data.integration.test.ts`: 61/61 passing. New commit (local,
unpushed) on top of `fbde095`.

### §46 follow-up (Phase 3, Part B)

**Context.** `citations.response_snippet` holds only the first 500 characters of each LLM answer — both
runners already run detection/scoring on the FULL `result.response` and truncate only at insert time
(`lib/audit/run-audit-inline.ts` `runOneCall`, `inngest/functions/run-audit.ts` `cite-*` step), but nothing
durable kept the full text for human review. Its only other copy, `llm_response_cache.response`, is a
48h-TTL, cross-tenant cache row — not a source of truth. Sri's decision: store the full answer permanently.

**Schema.** `db/migrations/0045_citations_response_text.sql`: `ALTER TABLE citations ADD COLUMN IF NOT
EXISTS response_text text;` — **nullable, no DEFAULT**, deliberately: historical rows never captured the
full text, so there is no honest backfill value; NULL means "not captured", never a fabricated or
snippet-copied stand-in. `db/schema/citations.ts:42` `responseText: text("response_text")`. Applied to the
two LOCAL databases only (`visibleau`, `visibleau_e2e`, both `localhost`, through
`scripts/db/local-db-guard.ts`, ledger row recorded in `_local_migrations_applied`); verified in both via
`information_schema.columns`: `data_type = text`, `is_nullable = YES`, `column_default = NULL`.
**Prod-fix files** (numbered `0057` — prod-fix `0044` = csi top_domains, `0056` = `is_cache_hit`):
`db/prod-fixes/0057-run1-precheck.sql` (read-only: column present? + citations row count),
`0057-run2-apply.sql` (one transaction; nullable + no default is metadata-only, no table rewrite — same
reasoning as 0056), `0057-run3-post-check.sql` (present, `is_nullable = YES`, `column_default` NULL,
`has_column_privilege('visibleau_app', ...)` INSERT + SELECT, same shape as 0056-run3),
`0057-rollback.sql` (app code first or the next audit/page view 42703s; unlike 0056's boolean, dropping
this column **destroys** every captured full answer — the file carries a `\copy` backup hint).

**Writers.** `lib/audit/run-audit-inline.ts:166` and `inngest/functions/run-audit.ts:216`:
`responseText: result.response` alongside the unchanged `responseSnippet: result.response.slice(0, 500)`
(list UIs and `lib/audit/dedupe-responses.ts`'s replay dedup still key on the snippet). **Cache hits need
no special-casing** — confirmed by reading `lib/llm/cache.ts`: `setCached()` stores the impl's untruncated
`output.response` (e.g. `anthropic-impl.ts`'s `result.text`), and `getCached()` returns `hit.response`
as-is with `isCacheHit: true`, so `result.response` is the full text on both paths.

**Responses tab.** `app/(auth)/audits/[auditId]/page.tsx:329` selects `citations.responseText`; the
render (`:1407`) delegates to a new minimal client component, `components/domain/audit/
response-answer-text.tsx` (nothing collapsible existed on this page to reuse). With `response_text`: the
FULL answer is always in the markup (SSR + in-page search see it), answers over 500 chars are visually
clamped until "Show full answer" / "Show less". With NULL: the stored snippet plus *"Stored excerpt (up to
the first 500 characters) — full answer not stored for audits run before this feature existed."* — no
hardcoded date that could drift, and never presented as the full answer.

**Competitor card.** Same file, `:232`/`:250`: text source order is now `response_text` → LLM cache
(`getCached`, only called when `response_text` is NULL) → `response_snippet`. A new audit never touches
the cache at all; the cache fallback remains only for pre-0045 rows still inside its 48h TTL.

**Size estimate.** Measured, not guessed: the local `visibleau_prod` mirror's 1,636
`llm_response_cache` rows average **2,638 chars** (median 2,132, max 13,606), and 9,047 of its 9,240
`response_snippet`s (98%) sit exactly at the 500-char cap — i.e. today's snippet keeps ~1/5 of a typical
answer. A paid-tier audit is 4 engines × 10 prompts × 5 runs = **200 rows** (`lib/llm/tier-engines.ts`;
free = 2 × 10 × 5 = 100; real audits in the mirror: median 192 rows) → ~200 × 2.6 KB ≈ **~0.5 MB raw per
paid audit** (~0.26 MB free), ≈ 0.5 GB per 1,000 paid audits. Postgres TOAST compresses automatically
(pglz by default) once a row exceeds ~2 KB, compressing the largest attributes first and moving them out
of line if still large; English prose typically compresses ~2×, so expect roughly **0.25–0.3 MB on disk
per paid audit**. Rows under the ~2 KB threshold stay inline, uncompressed. Compression is per value, not
cross-row: runs 2–5 are byte-identical cache replays of run 1 (task SSS), so ~4/5 of these bytes are
duplicates — a later dedup (store once per (audit, engine, prompt)) would cut this ~5×, not needed now.

**Diag files.** `db/prod-fixes/diag-0055-audit19-mention-scan.sql`: brand now resolved by literal
`WHERE id = '54b58fce-98f9-4749-ae25-9e541c0f874a'` (was `name = 'Bondi Plumbing'`; names aren't unique),
nothing else changed. **Flagged, not fixed (out of this part's scope):** its domain-stem branch uses
`'\b' || stem || '\b'` — in Postgres ARE regex `\b` is a *backspace* escape, not a word boundary
(verified locally: `'call bondiplumbing today' ~* '\bbondiplumbing\b'` = `f`, with `\y` = `t`), so that
branch can never match; only its `bondi\s*plumbing` branch is live. New
`db/prod-fixes/diag-0058-fulltext-mention-scan.sql` (read-only, PRODUCTION branch, pinned to the same
brand id, latest 2 completed audits, organic + `run_number = 1`): per engine/audit — `response_text`
presence + min/avg/max length, stored `brand_mentioned` count, raw brand scan (`bondi\s*plumbing` OR
`\y`-anchored domain stem) and a separate, looser `\ybondi\y` count, both over `COALESCE(response_text,
response_snippet)` (fallback rows counted in `scanned_snippet_only_rows`), and up to 3 `left(..., 200)`
excerpts where a raw scan matched but `brand_mentioned` is false. **Validated locally**, not against the
pinned id — `54b58fce-…` does not exist in the local mirror (its Bondi Plumbing is `0f531803-…`, and the
mirror has no `response_text` column yet): (a) on the mirror, read-only transaction, scratch copy with that
id and a `NULL::text AS response_text` shim — runs clean, 4 engines × 10 rows, all snippet-fallback, 0/0/0
(consistent with diag-0055 on the same rows); (b) on `visibleau_e2e`, seeded and cleaned up — a name past
char 500, a stem-only `bondiplumbing`, a "Bondi Beach"-only row, a `run_number = 2` row and a NULL
historical row all produce exactly the expected per-column counts.

**Tests.** New `tests/integration/citations-response-text.integration.test.ts` (real DB, seeded via raw
`postgres()` on `getTestDatabaseUrl()`): the REAL `runAuditInline()` (MockLLM, wrapped to append a long
tail) writes `response_text` = the full untruncated answer, snippet = its first 500 chars (RED without the
writer: `expected null not to be null`); the Responses tab renders text past char 500 for a new row and the
snippet + "not stored" note (no "Show full answer") for a NULL row; the Competitor card counts a competitor
named only past char 500 of `response_text`, ignores a decoy competitor planted in a warm cache row for the
same (prompt, model), and `getCached` (spied, not replaced) is never called for that row — while a NULL row
still falls back to it.

**Migration: yes** — `0045` locally / `0057` prod-fix, nullable text, no default, nothing beyond that.

**Results:** `npx tsc --noEmit -p tsconfig.json` green. New `tests/integration/
citations-response-text.integration.test.ts` 5/5; with `tests/unit/audit` + `tests/phase2/sprint4/
invisible-brand-scoring.integration.test.ts`: 105/105 passing. Left in the working tree, uncommitted.
