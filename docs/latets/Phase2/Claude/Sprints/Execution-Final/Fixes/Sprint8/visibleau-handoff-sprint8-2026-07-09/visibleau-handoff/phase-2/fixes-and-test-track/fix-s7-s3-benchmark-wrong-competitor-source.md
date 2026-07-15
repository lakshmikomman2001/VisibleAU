# Claude Code — FIX (S3 benchmark, follow-up): the un-stubbed card compares vs a SOV domain (mbav.com.au), not the configured competitors — and shows only ONE

The CPR-01 "Coming soon" stub is FIXED (the card now renders real data — good). But it's comparing against the WRONG
source and showing only ONE competitor:
- On screen: "Competitive Benchmark — vs **mbav.com.au** / You 0.0% vs 4.8% / Gap -4.8%". But mbav.com.au is NOT one of
  Metropolitan's competitors — it's a domain from the Share-of-Voice list (the fix used "first competitor from SOV data").
- Canon (LLD 30/242/245): the benchmark runs "for each **`brands.competitors`** domain" — the CONFIGURED competitor set
  (fallonsolutions, hipages, jimsplumbing, mremergency), the SAME set the Discovery comparisons screen correctly shows.
- Canon (LLD 277/284): **per-competitor** head-to-head — "Select the latest comparison **per competitor×engine** —
  `DISTINCT ON (competitor_domain, engine)`". So it must show ALL configured competitors, not a single SOV domain.

The right data ALREADY EXISTS: comparison_prompt_results has 16 rows across the 4 configured competitors × 4 engines
(they render on /discovery/comparisons). The S3 benchmark should read THOSE (per configured competitor, latest audit),
not grab a SOV domain.

Env: Windows repo `C:\startup\VisibleAU\src\`. LOCAL PROD `visibleau_prod`. Never real prod. Brand: Metropolitan
418f321f-2489-4560-aaa9-895728580465. Configured competitors: fallonsolutions.com.au, hipages.com.au, jimsplumbing.net.au,
mremergency.com.au.

## STEP 1 — Confirm the wrong-source wiring
```bash
# The page's benchmark fetch — it's using SOV's first competitor, not brands.competitors:
grep -n "competitor\|shareOfVoice\|SOV\|sov\|first\|brands.competitors\|competitor=" "app/(auth)/brands/[brandId]/visibility/page.tsx"
# The competitive-benchmark route — does it take a single ?competitor= param, or aggregate all?
cat app/api/brands/[brandId]/competitive-benchmark/route.ts | head -60
# Confirm the configured competitors:
psql "$PROD_URL" -c "SELECT competitors FROM brands WHERE id='418f321f-2489-4560-aaa9-895728580465';"
# Confirm comparison_prompt_results has the 4 configured competitors (latest audit):
psql "$PROD_URL" -c "SELECT competitor_domain, count(*) FROM comparison_prompt_results WHERE brand_id='418f321f-2489-4560-aaa9-895728580465' GROUP BY competitor_domain ORDER BY 1;"
```
Report: (a) is the page passing SOV's first domain as ?competitor=? (b) does the route only handle one competitor, or can
it return per-competitor? (c) confirm the 4 configured competitors are the ones in comparison_prompt_results (they should
be — Discovery shows them).

## STEP 2 — FIX: benchmark against the CONFIGURED competitors (all of them), from comparison_prompt_results, latest audit
- The S3 benchmark should read **comparison_prompt_results** for the brand, scoped to the **latest audit**, aggregated
  **per configured competitor** (brands.competitors) — NOT a SOV-derived domain, NOT a single competitor.
- Per canon (LLD 284): `DISTINCT ON (competitor_domain, engine) ... ORDER BY competitor_domain, engine, run_at DESC` (or
  scope to the latest audit_id), then aggregate per competitor (win/loss/inconclusive counts, or the win-rate the S3
  benchmark card presents — match the card's intended shape from the prototype: "share of voice, owned topics, and win
  rate per competitor", proto 1862/2099).
- Render **all** configured competitors that have comparison rows — so the card shows the same 4 competitors as the
  Discovery screen (fallonsolutions/hipages/jimsplumbing/mremergency), each with its head-to-head, not "vs mbav.com.au".
- Drop the "first competitor from SOV data" logic — that's the bug. Competitors come from brands.competitors (or
  equivalently, the DISTINCT competitor_domain values in comparison_prompt_results for the latest audit, which ARE the
  configured competitors).

## STEP 3 — Verify on screen
Reload `/brands/418f321f.../visibility`, scroll to Competitive Benchmark:
- It shows the **configured competitors** (fallonsolutions, hipages, jimsplumbing, mremergency) — NOT mbav.com.au.
- **Per-competitor** — all of them (or at least all that have comparison rows), not just one.
- The win/loss/gap numbers are consistent with the Discovery comparisons screen (same comparison_prompt_results, latest
  audit — e.g. Metropolitan's overall 8W/6L/2I picture, or per-competitor breakdowns that reconcile with the Discovery
  cards).
Report what it shows (paste the competitors + numbers).

## STEP 4 — Report + guard
- STEP 1: confirmed the SOV-first-domain wiring.
- STEP 2: the fix (per configured competitor from comparison_prompt_results, latest audit).
- STEP 3: on screen — configured competitors, per-competitor, reconciles with Discovery.
- Update the guard/test: the competitive-benchmark must compare against brands.competitors (the configured set), NOT a
  SOV domain — assert the benchmark's competitor_domain values are a subset of brands.competitors; re-break: point it at
  SOV's first domain → the "competitor is configured" assertion fails. And assert it's per-competitor (>1 when multiple
  competitors have rows).

## Constraints
- Competitors = brands.competitors (configured set), per canon (LLD 30/242/245) — the same set Discovery uses. NOT SOV
  domains. mbav.com.au is the bug.
- Per-competitor (LLD 277/284: DISTINCT ON competitor_domain, engine), latest audit only — show all configured
  competitors with rows, not one.
- Read comparison_prompt_results (the data already exists, 4 competitors × 4 engines) — don't re-derive from SOV.
- Verify on the Visibility screen; reconcile with the Discovery comparisons screen. Local prod, never real prod. LLD
  v8.70 / §6U.4 / §14 / proto 1862,2099 win.

## NOTE
Follow-up on finding #7: the CPR-01 stub is fixed (real data renders — good) but the card compares against
"mbav.com.au", a Share-of-Voice-surfaced domain, NOT one of the configured competitors (fallonsolutions/hipages/
jimsplumbing/mremergency), and shows only ONE. Canon (LLD 30/242/245) says the benchmark runs per brands.competitors (the
configured set Discovery correctly uses); LLD 277/284 says per-competitor (DISTINCT ON competitor_domain, engine, latest
audit). The right data already exists in comparison_prompt_results (16 rows, 4 competitors × 4 engines). Fix: drop the
"first SOV competitor" logic; aggregate comparison_prompt_results per configured competitor, latest audit, render all of
them. Verify on the Visibility screen that it shows the 4 configured competitors (not mbav.com.au) and reconciles with the
Discovery comparisons screen. Guard: benchmark competitors must be a subset of brands.competitors, and >1.
