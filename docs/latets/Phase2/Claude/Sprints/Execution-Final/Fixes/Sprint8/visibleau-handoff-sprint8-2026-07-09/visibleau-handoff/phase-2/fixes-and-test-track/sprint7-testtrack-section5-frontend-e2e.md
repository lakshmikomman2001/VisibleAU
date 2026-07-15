# Claude Code — S7 §11 test track — SECTION 5 of 5 (FINAL build section): FRONTEND E2E (Discovery screens + the S3 benchmark render-proof)

Section-by-section: SECTIONS 1-4 DONE (Backend Unit 20 / Backend Integration ~62 / Walk guards 70 invariants / Frontend
Unit 17). This is SECTION 5 — FRONTEND E2E (Playwright): browser specs mirroring the manual walk, each asserting a walk
finding at the BROWSER level. THE MARQUEE: the S3 Competitive Benchmark render-proof — the s3-benchmark test was HOLLOW
(passed while the screen showed "Coming soon" because it tested the route, not the render); only a browser test that
LOADS the Visibility screen and asserts the benchmark card shows real configured-competitor data closes that gap. Harness
EXISTS (from S6: tests/e2e/, signInAsTestUser auto-signin, serviceDb seed, .env.test.local, sprint6/ specs) — just add
specs. After this + QA, S7's track is complete.

Env: Windows repo `C:\startup\VisibleAU\src\`. E2E on DEV DB `visibleau` (.env.test.local). Never prod. tests/e2e/sprint7/.
Run: `npx playwright test tests/e2e/sprint7/` (or a sprint7 config like sprint2-6).

## STEP 1 — Match the S6 E2E pattern + set up the S7 seed
```bash
cat tests/e2e/sprint6/*.spec.ts | head -50    # the seed→auto-signin→goto→assert pattern
cat tests/e2e/helpers/db.ts ; cat tests/e2e/helpers/auth.ts
```
Seed (beforeAll / fixture) for a test brand (Agency tier so Discovery is visible; tradies; with competitors):
- brand + org + Agency subscription + competitors (≥2, e.g. fallonsolutions.com.au, hipages.com.au).
- conversation_journeys: the 3 tradies template rows should already seed (§5.5) — confirm they're there for the brand's
  vertical.
- **comparison_prompt_results**: seed rows for the configured competitors × engines for a "latest audit" — INCLUDING at
  least one **brand_won = null** (inconclusive) row (to prove the neutral card renders) and wins/losses. This is what the
  comparisons screen + the S3 benchmark read.
Clean up in afterAll.

## STEP 2 — The 4 specs (each mirrors a walk finding at the browser level):

### sprint7/discovery-hub.spec.ts — /brands/{id}/discovery
- The 2 sub-tiles render: **Conversational Journeys** + **Competitor Comparisons**, both with View→ links that navigate.
- The **Discovery badge is CYAN, not orange** (Finding 2 — assert the badge/accent uses the cyan token; e.g. computed
  color is the cyan #06b6d4 family, not orange). The route resolves 200 (not the nav-orphan 404).
- Reachable via the brand-page Discovery TILE (Finding 1 — optionally: from the brand page, the Discovery tile is visible
  and clicking it lands on /discovery).

### sprint7/journeys.spec.ts — /discovery/journeys (Agency+)
- The **3 pre-built tradies templates** are listed (Service Discovery / Emergency Booking / Competitor Comparison — or
  the seeded names), with stage + turn count (Finding 3 — the §5.5 seed showing).
- The empty-state (no cloned journeys) copy is the canonical **"clone a pre-built"** (NOT "via the API") (Finding 4).
- Agency+ gate: as Agency the screen renders (don't break that).

### sprint7/comparisons.spec.ts — /discovery/comparisons (Growth+)
- **Verdict cards render** per competitor, per engine (Win/Loss/Inconclusive).
- **The INCONCLUSIVE card (null brand_won) renders as a neutral card, NOT a crash / NOT "Lost"** (Finding 7's edge case +
  LLD 288 — the seeded null row must show as Inconclusive/Draw). This is the browser-level version of the unit test.
- The summary counts (W/L/Inconclusive) render.

### sprint7/s3-benchmark.spec.ts — /brands/{id}/visibility (THE MARQUEE — the render-proof)
- Scroll to the **Competitive Benchmark** card (bottom of Visibility).
- It shows **real head-to-head data**, NOT "Coming soon" (Finding 7a — the stub is gone on the RENDERED screen; this is
  the assertion the hollow integration test could not make).
- It shows the **CONFIGURED competitors** (fallonsolutions/hipages — brands.competitors), NOT a SOV domain like
  mbav.com.au (Finding 7b — assert the competitor domains shown are the seeded configured competitors).
- **Per-competitor** (more than one), and the overall summary (W/L/Draw) is present.
- (Reconciliation, if feasible in one spec: the summary numbers on /visibility match the summary on
  /discovery/comparisons — both read the same comparison_prompt_results, latest audit. This is the two-views-reconcile
  proof that finally closed Finding #7 manually.)
Re-break sanity: if the page were reverted to data={null}, this spec would see "Coming soon" and FAIL — the exact catch
the hollow test missed.

## STEP 3 — Run + report, then STOP
```bash
npx playwright test tests/e2e/sprint7/
```
- The 4 specs pass (seed → auto-signin → goto → assert). Per screen what's asserted.
- THE MARQUEE: s3-benchmark.spec asserts the benchmark renders configured-competitor data (not "Coming soon", not mbav) —
  the render-proof that closes the hollow-test gap.
- Note any real-data limitation (none expected — comparison_prompt_results is seedable, unlike the CDN live-probe).
- E2E green; count. This is the FE E2E phase (built for S6, now S7).
STOP — do NOT start QA yet. Report, and QA (§12 grep script) is the last phase.

## Constraints
- FRONTEND E2E ONLY (the 4 Discovery/Visibility screen specs). Add to the EXISTING harness — don't rebuild config/auth.
- Mirror sprint6's pattern (serviceDb seed → auto-signin test → goto → assert DOM). Clean up seeds in afterAll.
- Seed a brand_won=null row so the INCONCLUSIVE card is asserted at the browser level (LLD 288).
- THE S3 BENCHMARK SPEC is the marquee — it must assert the RENDERED card shows configured-competitor data (not "Coming
  soon", not a SOV domain). This is the browser-level catch the hollow integration test couldn't make (it passed while
  the screen was stubbed). Assert the rendered result, reconcile with the comparisons screen if feasible.
- DEV DB `visibleau` (.env.test.local), never prod. LLD v8.70 / §6U / §14 win.

## NOTE
Section 5 of 5 (final build section) — FRONTEND E2E: 4 Playwright specs mirroring the manual walk. discovery-hub (2 tiles
+ CYAN not orange + reachable), journeys (3 tradies templates + "clone a pre-built" copy), comparisons (verdict cards +
the null→neutral INCONCLUSIVE card at browser level), and THE MARQUEE s3-benchmark (the Competitive Benchmark card on
/visibility shows real CONFIGURED-competitor data — not "Coming soon", not the mbav SOV domain — reconciling with the
Discovery comparisons screen). The s3-benchmark spec is the render-proof that closes the hollow-test gap: the integration
test PASSED while the screen showed "Coming soon" because it tested the route not the render; only this browser spec
catches that. Harness exists (S6) — seed via serviceDb (incl. a brand_won=null row + configured competitors), auto-signin,
assert, clean up. STOP after Section 5 and report; QA (§12 grep script) is the final phase, then the S7 track matches
S2-S6 structure.
