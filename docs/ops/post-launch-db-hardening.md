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
