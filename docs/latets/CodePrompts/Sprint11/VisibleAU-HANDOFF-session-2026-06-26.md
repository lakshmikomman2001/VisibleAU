## 6a. SESSION LOG — 26 Jun 2026: Sprint 11 landing manual-test → 3 sample-audit bugs found + fixed

**This session's headline: manual-tested the Sprint 11 Landing v2 (`/`) and the sample-audit conversion
path in an incognito (logged-out) window — the landing passed, but testing the "Try a free sample audit"
flow end-to-end surfaced THREE real bugs, all now fixed and re-verified on the rendered screen.** Sprint
11 build is otherwise in good shape (all 9 landing sections render, correct nav, 4 pricing cards, no Lorem
ipsum). The three bugs all sat on the **public sample-audit conversion path** — the single highest-value
marketing surface — and none were caught by the existing unit/E2E suite.

**Landing v2 verified PASS (logged-out, incognito):** `/` correctly serves the v2 marketing page (no
redirect, no stale Sprint-1 landing). All 9 §6 sections present in order: Header (nav = Pricing ·
Methodology · About + Sign in + Get started), Hero (with AU trust badges), How it works (tier-aware copy),
Engines (4 + "coming soon"), Verticals (3 cards), What's measured (5 dims in 25/25/20/15/15 order),
Pricing teaser (exactly 4 cards — Starter A$99 / Growth A$299 / Agency A$499 / Agency Pro A$1,499 +
Enterprise "Contact us" text, NOT a 5th card), Testimonials (honest early-access framing), FAQ (8 Qs),
Footer. No Lorem ipsum.

### Bug 1 — Sample-audit status polling redirected to `/sign-in` (public page → auth-gated endpoint)
- **Symptom:** logged-out visitor runs sample audit → running page sticks at 4% forever. Dev log shows
  every status poll redirected: `GET /sign-in?redirectTo=%2Fapi%2Faudits%2F<id>%2Fstatus` (hundreds, every
  2s). Not slow mock data — a redirect loop.
- **Root cause (Sprint 3 × Sprint 10 seam):** Sprint 10 wired the PUBLIC sample-audit running page to poll
  the EXISTING Sprint 3 status route `/api/audits/[id]/status`, but that route was built for logged-in
  dashboard users (`getCurrentUser() + setRlsContext()`, cross-org → 404). With no session (the visitor is
  unauthenticated by design — sample audits attach to the synthetic `slug='sample'` org, not a user org),
  the auth gate redirected every poll to `/sign-in`, so the page never read a status payload.
- **Fix:** added a SEPARATE public status endpoint (`/api/sample-audit/.../status`) in the same
  public-exemption bucket as `POST /api/sample-audit`, scoped HARD to `organizations.slug='sample'` (404 for
  any non-sample audit — the slug filter is the security boundary, preventing an IDOR leak of real customers'
  audit status). Pointed the running page at it. The protected Sprint 3 dashboard route was left untouched.
- **Verified:** poll now returns `GET /api/sample-audit/<id>/status 200` (JSON), not a sign-in redirect.

### Bug 2 — Sample audit failed instantly: "No prompts available." (empty `primaryRegions`)
- **Symptom:** with Bug 1 fixed, the real status became visible: audit fails immediately at 0% ("Audit
  failed. Please try again."), 0 citations written.
- **Root cause (Sprint 5 × Sprint 10 seam):** `runSampleAudit()` (`lib/sample-audit/run.ts`) created the
  sample brand with **no `primaryRegions`** (defaults to `[]`). It runs inline (`runAuditInline`, NOT
  Inngest) → `getAuditPrompts()` → for the tradies/au pack the top-ranked prompts are all
  `{location}`-templated, and `expandPrompt()` returns `[]` for any `{location}` prompt when locations is
  empty. So every prompt expanded to nothing → the `prompts.length === 0` guard set `status='failed'`,
  `metadata.error="No prompts available."` before any LLM call. (NOT the slug/migration or Inngest
  hypotheses — both ruled out by DB evidence: slug column + sample org both exist.)
- **Fix:** added a default `primaryRegions` to the sample brand insert in `lib/sample-audit/run.ts` so
  `{location}` prompts expand.
- **⚠️ LOCKED-FACT CORRECTION (caught in review):** Claude Code's investigation proposed the default
  `["AU:Sydney", "AU:Melbourne", "AU:Brisbane"]` — **INVALID.** `primaryRegions` is `STATE:Suburb` (8 AU
  states NSW/VIC/QLD/WA/SA/TAS/ACT/NT), regex `/^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$/`. `"AU"` is the
  COUNTRY `regionEnum`, NOT a state — `"AU:Sydney"` fails the Zod regex. Corrected to
  **`["NSW:Sydney", "VIC:Melbourne", "QLD:Brisbane"]`** (renders cleanly: `formatLocation('NSW:Sydney')` →
  `'Sydney, NSW'`). Had the `AU:` default shipped, it would have traded one bug for a validation throw /
  malformed regions. *This is exactly why the two-chat relay exists: the builder nailed the WHERE; the
  reviewer caught that the WHAT violated a locked fact.*
- **Verified:** sample audit now runs to completion; cap held at 1 engine × 5 prompts (did NOT balloon ×3
  from the 3 default regions — confirmed by the result-page cap copy).

### Bug 3 — Sample result showed "88.5 out of 10" (wrong score-scale label + unrounded)
- **Symptom:** completed sample result headline read **"Overall AI Visibility Score: 88.5 — out of 10"** —
  mathematically impossible. Dimension cards showed bare decimals (100.0, 84.0, …).
- **Root cause:** `scoreComposite` and all 5 dimensions are **0–100** (Sprint 3 §32). The VALUE 88.5 was
  correct (the weighted composite); the LABEL "out of 10" was wrong. The built `SampleResultView` diverged
  from the canonical HI3 spec (Sprint 10 ~1081–1089: headline = `Math.round(scoreComposite)` under "Sample
  composite score"; dimensions = `Math.round(score)/100`). Likely confusion with the SEPARATE 0–10
  `score_of_10` entity score (`brand_entity_scores.score_of_10`, a Phase 2 concept) — wrongly applied "/10"
  to the 0–100 composite.
- **Fix (presentation only — no scoring math touched):** headline → `Math.round(scoreComposite)` = **89**
  under "Sample composite score"; dimension cards → `Math.round(score)/100` (e.g. 100/100, 84/100, 50/100).
- **Verified:** headline now "89" / "Sample composite score"; cards show /100 with score-based colour
  coding (Context 50/100 in amber, rest green). Hand-check: `100×.25 + 84×.25 + 100×.20 + 50×.15 + 100×.15
  = 88.5 → 89` — confirms the 25/25/20/15/15 weights apply correctly in the real pipeline.

### ⚠️ TEST-COVERAGE GAP (the recurring lesson — worth acting on)
All three bugs were on the **public sample-audit conversion path**, yet the S1–S10 unit + E2E suite was
green. Why each was missed:
- The sample-audit E2E (`sample-audit.spec.ts`) was scoped to **"CTA href only"** (IJ2) — it never runs the
  flow end-to-end logged-OUT, so it never hit the auth redirect (Bug 1) or the empty-prompt failure (Bug 2).
- Other audit tests seed brands **with** `primaryRegions`, so the empty-regions path (Bug 2) was never
  exercised.
- The scoring unit tests assert the composite **value** (0–100), never the sample page's **label** — so
  "out of 10" (Bug 3) sailed through.
- General: "tests pass" ≠ "works on the rendered screen for a logged-out visitor." The highest-value public
  surface had the **thinnest** coverage. **Recommended follow-ups:** (a) a logged-OUT sample-audit E2E that
  asserts the poll returns 200 JSON (not a sign-in redirect) and the run completes; (b) a unit test that
  `runSampleAudit` produces a brand whose prompts expand to ≥1 and ≤ the 5-prompt cap; (c) an RTL/E2E
  assertion that the sample result renders the composite as an integer with "/100"/"out of 100", never
  "out of 10".

### STILL OPEN from this session (low priority)
- **FAQ copy-consistency (unconfirmed):** the landing "How it works" says *"Free: 100 calls × 2 engines."*
  Need to cross-check against the FAQ "How much does it cost?" / "How long does an audit take?" answers (and
  the free-tier `TIER_RUNS_FREE=3` × 2 engines × 10 prompts reality) to confirm the "100 calls" free-tier
  figure isn't stale. The sample-result CTA copy ("1 AI engine and 5 prompts … full audits use 4 engines
  and up to 50 prompts") is CORRECT (C3-locked cap) — only the free-TIER figure needs verifying. Resume:
  expand those two FAQ accordions and compare.
- **Rest of Sprint 11 not yet manually tested:** Methodology page (`/methodology`, 47 citability methods),
  About, 404/500 pages, robots.txt + sitemap.xml (build-time generated — run `pnpm build` to verify),
  OG image + canonical URL (`NEXT_PUBLIC_APP_URL` — localhost in dev, must be `https://visibleau.com` in
  prod), and mobile (no horizontal scroll <375px). These are separate Sprint 11 acceptance criteria, not
  part of "Landing v2".

### Fix-prompt artifacts produced this session (in case of re-apply / audit)
- `visibleau-fix-sample-audit-status-auth-redirect.md` (Bug 1)
- `visibleau-investigate-sample-audit-failure.md` (Bug 2 — diagnosis) → `visibleau-fix-sample-audit-no-prompts.md` (Bug 2 — fix)
- `visibleau-fix-sample-result-score-scale.md` (Bug 3)
