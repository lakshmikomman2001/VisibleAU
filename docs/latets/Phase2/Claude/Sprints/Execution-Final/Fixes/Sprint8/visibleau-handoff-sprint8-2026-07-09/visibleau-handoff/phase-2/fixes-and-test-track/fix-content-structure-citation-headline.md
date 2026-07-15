# Claude Code — FIX (Content Structure, Finding 1): citation_probability is buried in the per-page cards — add the full-width HEADLINE per §6U.4 (+ verify threshold colors + the 0-words homepage row)

The Content Structure screen (`/brands/[id]/retrieval/content-structure`) shows citation_probability as a small stat in
each per-page card (0% / 22% / 45% in the card corners). But §6U.4 requires it as the **full-width HEADLINE** — "How
likely is this page to be cited by AI? X% ↑ +12%" with green/amber/red bands — and §13 explicitly lists "burying
citation_probability_score in a table" as an ANTI-PATTERN. Add the headline above the per-page cards. Then verify the
threshold colors (Finding 2) and whether the 0-words homepage row is real or a failed crawl (Finding 3).

Env: Windows repo `C:\startup\VisibleAU\src\`. App on LOCAL PROD `visibleau_prod`. Never real prod. Brand: Metropolitan
418f321f-2489-4560-aaa9-895728580465.

## Finding 1 — WHY it's a bug (canon)
§6U.4 (prompt 337-341): "**The citation_probability_score is the HEADLINE** (LLD 5260): 'How likely is this page to be
cited by AI? **73% ↑ +12%**' with the **≥0.70 green / 0.40–0.69 amber / <0.40 red** badge — **do NOT bury it in a
table.**" + "the headline score stays **full-width**." §13 anti-pattern: "Burying citation_probability_score in a table."
The screen currently has NO headline — citation prob is a card-corner stat (the buried-in-cards = the anti-pattern).

## STEP 1 — Confirm the screen's current structure + what data is available for the headline
```bash
cat "app/(auth)/brands/[brandId]/retrieval/content-structure/page.tsx"
grep -rn "citation_probability\|citationProbability\|headline\|avgCitation\|Citation prob\|ContentStructureCard" "app/(auth)/brands/[brandId]/retrieval/content-structure/page.tsx" components/domain/retrieval/ app/api/brands/[brandId]/content-structure/route.ts | head
```
Report: (a) the current layout (per-page cards, no headline); (b) what citation-probability data the API returns —
per-page values AND is there a site-level aggregate? NOTE the hub already shows "Avg Citation Prob 34%" (a site
aggregate via retrieval-scorer §6.5), so an aggregate exists.

## STEP 2 — Resolve the headline's SUBJECT (per-page "this page" vs site aggregate) — small canon reconciliation
§6U.4's headline text says "How likely is **this page**" (singular) — but the screen audits MULTIPLE pages. Reconcile:
- **Preferred (matches the spec's "this page" + trend):** the headline shows the **Entity Home / primary page's**
  citation probability (the canonical page — /about here, 45%), OR the **highest/representative page**, as the featured
  "how likely is THIS page to be cited" with its trend. The per-page cards below show all pages.
- **Acceptable alternative:** if there's no single "primary page" concept, the headline shows the **site-level
  aggregate** ("How likely are your pages to be cited by AI? 34%") — but then the copy shifts from "this page" to "your
  pages" to stay honest. Do NOT show a fake per-page number as if site-wide.
Report which subject you use + why (the spec's "this page" framing suggests the primary/entity-home page; confirm what
data supports it). Pick the one the available data honestly supports.

## STEP 3 — Build the full-width HEADLINE (above the per-page cards)
Add a prominent, full-width headline component at the top of content-structure/page.tsx, per §6U.4:
- **Copy:** "How likely is this page to be cited by AI?" (or "your pages" if aggregate — per STEP 2) + the **X%** large.
- **Trend** (if available): "↑ +12%" (the week-over-week change — the content_structure_audits row tracks
  freshness/format change week to week per §0.5; if no trend data yet, omit the ↑ rather than fake it).
- **Bands (Finding 2 — the exact thresholds):** **≥0.70 (70%) green · 0.40–0.69 (40–69%) amber · <0.40 (40%) red.**
  Apply as the headline badge/color.
- **Full-width** (§6U.4 line 341: "the headline score stays full-width"); the per-page cards stay
  `grid-cols-1 md:grid-cols-2` BELOW it.
- Keep the per-page cards (format/freshness/capsule/passages) — they're correct; the headline goes ABOVE them.

## STEP 4 (Finding 2) — verify the threshold COLORS match §6U.4 bands
The bands are ≥0.70 green / 0.40–0.69 amber / <0.40 red — apply to BOTH the new headline AND the per-page card citation %:
```bash
grep -rn "0.70\|0.40\|70\|40\|green\|amber\|red\|danger\|warning\|success\|citation.*color\|colorFor" components/domain/retrieval/*content* components/domain/retrieval/*citation* | head
```
- On screen, confirm: 45% (0.45) → **amber**; 22% (0.22) → **red** (<0.40 — currently may not look distinctly red);
  a ≥70% page → green. Fix the per-page card colors if they don't match the bands (22% must be red, not amber).
Report: the headline + per-page % both use ≥0.70 green / 0.40–0.69 amber / <0.40 red; 22% renders red.

## STEP 5 (Finding 3) — is the homepage "unknown / 0 words / 0% / Capsule 0/4" row REAL or a failed crawl?
```bash
psql "$PROD_URL" -c "SELECT page_url, content_format_detected, word_count, citation_probability_score, answer_capsule_score, optimal_passage_count FROM content_structure_audits WHERE brand_id='418f321f-2489-4560-aaa9-895728580465' ORDER BY page_url;"
```
- The homepage row shows content_format='unknown', 0 words, 0% citation, Capsule 0/4 — is that a REAL crawl (the
  homepage genuinely has no detectable content structure — e.g. a thin/JS-rendered landing page), or an EMPTY/FAILED
  crawl row (the crawler couldn't fetch/parse it, so everything defaulted to 0)?
- Check: does the crawler log show the homepage was fetched successfully? Is word_count=0 because the page is JS-rendered
  (crawler got no text) or because the row was never populated?
Report: is the 0-words homepage a real result or a failed/empty crawl? If failed (couldn't fetch/parse) → that's a
crawler gap to note (the homepage isn't being audited properly); if real (thin/JS page) → it's honest data, leave it.
Do NOT fix blindly — report which.

## STEP 6 — Verify on screen
Reload `/brands/418f321f.../retrieval/content-structure`:
- A **full-width citation-probability HEADLINE** sits above the per-page cards ("How likely is this page to be cited by
  AI? X%" with the green/amber/red band + trend if available).
- The per-page cards remain below (format/freshness/capsule/passages).
- 22% renders red, 45% amber (the bands).
Report: headline present + full-width; bands correct; per-page cards intact.

## STEP 7 — Report
- Finding 1: the full-width citation headline added above the cards per §6U.4 (not buried); the subject (STEP 2:
  this-page/primary vs aggregate) + why.
- Finding 2: threshold colors verified/fixed (≥0.70 green / 0.40–0.69 amber / <0.40 red; 22% red).
- Finding 3: the 0-words homepage row — real crawl or failed (reported, not blind-fixed).
- Add a test: assert the headline renders the citation probability prominently (not only in cards) + the band thresholds
  (0.22→red, 0.45→amber, 0.72→green) — re-break: remove the headline → fail.

## Constraints
- §6U.4: citation_probability is the FULL-WIDTH HEADLINE ("How likely is this page to be cited by AI? X%"), NOT buried in
  the per-page cards (the §13 anti-pattern). Add the headline above; keep the per-page cards below.
- Bands EXACT: ≥0.70 green / 0.40–0.69 amber / <0.40 red — on the headline AND per-page %.
- STEP 2 (headline subject) + STEP 5 (homepage row) — reconcile/report honestly; don't fake a per-page number as
  site-wide, don't blind-fix the 0-words row. Report and decide.
- Verify on screen. Local prod, never real prod. LLD v8.70 / §6U.4 / LLD 5260 / §13 win.

## NOTE
Finding 1 is a confirmed §13 anti-pattern + §6U.4 violation: citation_probability_score is shown as a small per-page
card-corner stat, but §6U.4 requires it as the FULL-WIDTH HEADLINE ("How likely is this page to be cited by AI? 73% ↑
+12%" with ≥0.70 green / 0.40–0.69 amber / <0.40 red) and §13 explicitly forbids burying it. Add the headline above the
per-page cards (resolve STEP 2: the spec says "this page" — likely the primary/entity-home page, or the site aggregate
with honest "your pages" copy). Fold in Finding 2 (verify the band colors — 22% must be red, not amber) and Finding 3
(is the homepage unknown/0-words/0% row a real crawl or a failed/empty one — report, don't blind-fix). This is the third
canon-prominence finding of the retrieval pass (depth-card, entity-home display, now the citation headline) — the build
rendered the data right but not the headline placement the LLD specifies.
