# VisibleAU — FIX PROMPT: Methodology page cites fabricated/misattributed research (data-integrity)

**Phase/Sprint:** Phase 1, Sprint 11 (`/methodology`) + the operator-authored `lib/methodology/methods.ts`.
**Severity: HIGH — brand-existential.** The methodology page is the one surface whose entire purpose is
"we cite REAL research with REAL effect sizes." It currently attributes specific effect-size deltas to
papers that do not contain those numbers, and cites a FUTURE conference ("AutoGEO, ICLR 2026"). This is
the exact snake-oil VisibleAU positions against, and violates the locked no-fabricated-data principle.

> This is a DATA + COPY fix, not a rendering fix. The page SHELL is correct (top-10 + "Show all" +
> citations block all render). The problem is the *content* in `methods.ts` and the intro/citations copy.

---

## WHAT'S WRONG (confirmed by source-checking, 26 Jun 2026)

- The intro says: *"Based on 47 citability methods drawn from peer-reviewed research at Princeton (KDD
  2024), AutoGEO (ICLR 2026), and industry studies by Tinuiti and SE Ranking."*
- **"AutoGEO, ICLR 2026" is impossible** — ICLR 2026 is a future conference; nothing is peer-reviewed-
  published there yet. No "AutoGEO" paper was found. → must be removed.
- The per-method deltas (+12% FAQ Schema → "Princeton KDD 2024", +0.8 position "Concise Authoritative
  Copy" → "Princeton KDD 2024", etc.) **do not appear in the cited papers.** The real Princeton GEO paper
  (Aggarwal et al., KDD 2024, arxiv.org/abs/2311.09735) reports method-level numbers for *its* methods
  (Cite Sources / Statistics Addition / Quotation Addition / Fluency Optimization) on *its* metrics
  (Position-Adjusted Word Count / Subjective Impression) — NOT "+12% for FAQ Schema". Attaching invented
  numbers to a real paper is worse than an obviously-fake citation: it's believable and checkable, and a
  prospect/journalist/researcher who checks will find it false.
- The numbers were placeholder data (the spec marked `methods.ts` operator-authored / "Sri populates"; it
  was filled with plausible-looking stand-ins, not sourced findings).

## THE FIX — two coordinated changes (data file + page copy)

### Part A — Replace `lib/methodology/methods.ts`
Replace the file with the rebuilt, source-backed version provided alongside this prompt
(`methods.ts`). It:
- keeps the existing `CitabilityMethod` schema (IL3) exactly — no type change;
- contains ~12 methods, each with an effect size that **appears in a real, linked source**, or is
  **explicitly labelled a correlation / directional finding** (not a causal lift);
- adds a `getMethodsData()` helper returning `{ all, total, top10 }`.

Copy that file's contents into `lib/methodology/methods.ts` verbatim. (If the page currently imports a
differently-named export, keep the page's import working — see Part B; do not rename without updating the
page.)

Key honesty distinctions encoded in the data (preserve them if you edit):
- **GEO paper numbers are RELATIVE improvements on GEO-bench metrics** — phrased "(GEO-bench)", not as
  universal real-world lifts.
- **Ahrefs 75K-brand numbers are CORRELATIONS (r-values), not lifts** — phrased "correlates with" /
  "strongest correlate (r≈0.74)". The study itself warns improving the metric won't automatically boost
  visibility.
- **Ranges where the source gives a range** ("+30–40%"), not fake-precise single numbers.

### Part B — Correct the page intro + research-citations to match
In `app/.../methodology/page.tsx` (and any sub-components like the intro `<p>` and `<ResearchCitations />`):

1. **Intro paragraph — remove the false claims.** Replace the current
   *"Based on 47 citability methods drawn from peer-reviewed research at Princeton (KDD 2024), AutoGEO
   (ICLR 2026), and industry studies by Tinuiti and SE Ranking. Here are the top 10 by impact."*
   with copy that is true to the data, e.g.:
   > "Our recommendations draw on published research into how AI engines choose what to cite — including
   > the Princeton GEO study (KDD 2024), Ahrefs' 75,000-brand AI visibility benchmark, and large-scale
   > citation analyses from SE Ranking, BrightEdge and others. Below are {top10.length} of the
   > highest-impact methods; effect sizes are reported as measured by each source (some are correlations,
   > not guaranteed lifts)."
   - **Do NOT hardcode "47".** Use `{total}` / `{top10.length}` from `getMethodsData()`. If the array has
     12 methods, the page must say 12 — never claim a count the data doesn't have. (If you WANT to say
     "based on N methods", N must equal `CITABILITY_METHODS.length`.)
   - The "(some are correlations, not guaranteed lifts)" clause is REQUIRED — it's the honest framing that
     makes the page defensible and on-brand.

2. **"Show all N methods" trigger** — label it `Show all ${total} methods` (computed), not "Show all 47".
   If there are ≤10 methods, hide the Collapsible entirely (nothing to expand).

3. **`<ResearchCitations />`** — replace the four hardcoded entries (which included the impossible "AutoGEO
   ICLR 2026") with the real sources actually used in the data. Minimum set, with links:
   - Aggarwal et al., "GEO: Generative Engine Optimization", KDD 2024 (Princeton) — https://arxiv.org/abs/2311.09735
   - Ahrefs Q1-2026 AI Search Benchmark (75,000 brands) — https://ahrefs.com/blog/ai-brand-visibility-correlations/
   - SE Ranking 2025 ChatGPT citation study (~129K domains)
   - BrightEdge structured-data / FAQ citation research
   (Onely, Zyppy, AirOps may be listed too — match whatever `citation` values appear in the final
   `methods.ts` so every on-page citation maps to a real source.) **Remove "AutoGEO ICLR 2026" entirely.**

4. **Wire the data accessor.** Ensure the page calls `getMethodsData()` (or maps the existing call to the
   new helper) so `top10`, `total`, and the "show all" slice all come from the single source of truth.

---

## CONSTRAINTS
- **No fabricated or misattributed numbers.** Every effect size on the page must trace to a real source
  (the `citationUrl`), or be labelled a correlation/directional finding. This is the locked
  no-fabricated-data principle applied to the most visible research surface.
- **Correlations ≠ causal lifts.** Keep the "correlates with" / r-value framing for the Ahrefs findings;
  do not silently convert them to "+X%".
- **Count honesty:** the page's method count must equal `CITABILITY_METHODS.length`. No hardcoded "47"
  unless the array actually has 47 sourced methods.
- **Schema unchanged** (IL3 `CitabilityMethod`). Public route, no auth. `buildMetadata` unchanged.
- **It is acceptable to ship FEWER, honest methods** (≈12) rather than 47 invented ones. Authoring more is
  a later content task and requires a real source per method.
- No new dependency, no DB change, no route change.

---

## VERIFICATION (must pass)
```bash
# 1. The impossible/future citation is gone everywhere:
grep -rniE "AutoGEO|ICLR 2026" app/ lib/methodology/ components/ 2>/dev/null   # → 0 matches

# 2. No hardcoded "47" in the page copy (count must come from the data):
grep -rnE "47 (method|citab)|all 47|Show all 47" app/ components/ 2>/dev/null   # → 0 matches
grep -rnE "getMethodsData|\.length|total|top10" app/**/methodology/page.tsx 2>/dev/null  # → present (dynamic count)

# 3. Every method's citation maps to a real linked source (spot-check the data file):
grep -cE "citationUrl:" lib/methodology/methods.ts            # → equals (or near) the number of methods
grep -nE "arxiv.org/abs/2311.09735|ahrefs.com/blog/ai-brand-visibility|foglift.io|leapd.ai|superlines.io|businesswire" lib/methodology/methods.ts  # → real URLs present

# 4. The honest-framing clause is present in the intro:
grep -rniE "correlation|not guaranteed|as measured" app/**/methodology/ components/ 2>/dev/null  # → present

# 5. GEO numbers are labelled as GEO-bench / relative, Ahrefs as correlations:
grep -nE "GEO-bench|correlate|r≈|r=" lib/methodology/methods.ts   # → present
```

### Manual test (re-view in incognito)
1. `localhost:3000/methodology` (incognito).
2. **Intro no longer says "47" or "AutoGEO ICLR 2026"** — it states the real count and the honest
   "correlations, not guaranteed lifts" caveat.
3. **Each method card's number is sourced** — click through a citation link (e.g. the GEO arxiv link, the
   Ahrefs 75K-brand link) and confirm the page it points to actually supports the claim.
4. **"Show all N methods"** shows the correct N (or is absent if ≤10 methods).
5. **Research Citations block** lists only real sources; no future-conference entry.
6. **Cross-check 2–3 numbers against the linked source** — e.g. GEO "+30–40%" appears in the arxiv paper;
   YouTube "r≈0.74" appears in the Ahrefs 75K-brand post. They should match.

---

## NOTE FOR THE OPERATOR (Sri) — content decisions you may want to make
- **Keep it conservative.** ~12 honestly-sourced methods beats 47 invented ones, and "fewer but real" is
  itself an on-brand statement for a product built on intellectual honesty. You can expand later, one
  sourced method at a time.
- **If you want to keep "47" as a number,** you must author 47 methods each with a real source — that's a
  genuine research/writing task; until then the page should state the real count.
- **The GEO domain-variance point is a gift for your positioning** — the Princeton paper explicitly found
  method effectiveness varies by domain (citations help factual queries; statistics help Law/Government).
  Consider a one-line honesty note on the page: "effectiveness varies by industry and query type" — it's
  true, it's cited, and it reinforces the CI/honesty stance that differentiates VisibleAU.
- **"Tinuiti" citation:** the prior page cited "Tinuiti" but I could not confirm a specific Tinuiti AI-
  citation study with the numbers shown. If you have the real Tinuiti source, add it back with the real
  finding; otherwise it's been dropped in favour of sources I could verify (SE Ranking, BrightEdge,
  Ahrefs, Onely).

## NOTE FOR THE REVIEWER (not for Claude Code)
Root: `methods.ts` was operator-authored placeholder data (spec deferred population to Sri), filled with
plausible numbers + real-sounding citations, including an impossible future-conference cite. The page shell
(Sprint 11) was correct. Fix replaces the data with source-backed findings and corrects the page copy to
match. Test-coverage gap to consider: a content lint/test that fails if any methodology number lacks a
`citationUrl`, and an assertion that the page's method-count text equals `CITABILITY_METHODS.length`.
