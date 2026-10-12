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
