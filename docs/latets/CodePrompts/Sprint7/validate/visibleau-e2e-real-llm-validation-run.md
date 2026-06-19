# VisibleAU — End-to-end REAL-LLM validation run (Sprints 1–7) — Claude Code prompt
# Purpose: create ONE real brand, run the full audit with REAL LLM calls + a real crawl, and verify
#   every Sprint 1–7 feature end-to-end against live data. This is a guided MANUAL validation run,
#   not an automated test suite (see the boxed note — real LLM calls must NOT live in CI).
# Pins to: CLAUDE.md + the Sprint 1–7 prompts. Uses the 4 LLM providers already configured
#   (OpenAI / Anthropic / Gemini / Perplexity) + the ABN Lookup + Playwright crawler.

╔═══════════════════════════════════════════════════════════════════════════════╗
║ READ FIRST — why this is a manual run, not a test-suite addition                ║
║ • Real LLM calls cost money (~US$3–3.50 per full audit: ~200 multidim calls +   ║
║   the Playwright crawl) and are NON-DETERMINISTIC. They must NEVER be wired into ║
║   the automated test suite / CI — that would be flaky and burn budget on every   ║
║   run. The repo already has a **Mock LLM Mode** (Sprint 2) for automated tests.  ║
║ • So: the automated `tests/unit/**` + `tests/integration/**` stay on MOCK mode   ║
║   (don't change them here). THIS prompt is a one-shot REAL-API validation you    ║
║   run by hand against a staging/dev brand to confirm the live pipeline works.    ║
║ • If you want an automated end-to-end test too, that's a SEPARATE deliverable    ║
║   using mocked LLM responses — ask for it separately; do not add real calls.     ║
╚═══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════
PRE-FLIGHT (confirm before spending any API budget)
═══════════════════════════════════════════════════════════════════════════════

> Before running anything that costs money, verify the environment and report status:
> 1. **Env / keys present** (do NOT print secret values — just confirm set/unset): the 4 provider
>    keys (OpenAI, Anthropic, Gemini, Perplexity), `ABN_LOOKUP_GUID`, the DB URL, Inngest, and the
>    model selections used by the central model-selector (`getLLMService()`). Confirm the app is NOT
>    forced into Mock LLM Mode for this run (real mode on).
> 2. **Services up:** dev server, Inngest dev/worker, and the Postgres DB reachable; RLS enabled on
>    tenant tables (`technical_audits`, `brand_entity_scores`) per canon.
> 3. **Cost guardrail:** confirm the per-audit budget ceiling (<US$3.50) and the tier quota are in
>    place, and that ONE "Run Audit" click = one quota slot firing BOTH `run-audit.ts` (multidim) and
>    `technical-audit-run.ts` (crawl) via the `audit/start` event.
> **Report a GO / NO-GO.** If any key/service is missing, STOP and list what's needed — do not
> attempt the run.

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — Create a real brand (exercises Sprints 1, 4, 5)
═══════════════════════════════════════════════════════════════════════════════

> Through the real UI (not a seed), as an Agency-tier org:
> 1. **Sign up / sign in** (Better Auth) and confirm the org + RLS context is set (S1).
> 2. **Create a brand** for a real AU site with a genuine entity footprint so each dimension has
>    something to find — recommend a real AU business with a `.com.au` domain, an ABN, and likely
>    directory presence (e.g. a mid-size AU tradie or allied-health practice; pick one you're happy to
>    spend ~US$3.50 auditing). Record the brand's domain + ABN.
> 3. **Assign an AU vertical pack** (S5) if the flow requires it; confirm the brand lands in the
>    brand list (S4) with the right tier badges.
> **Report:** the brand created, its domain/ABN, and that it appears in the UI with no console/RLS
> errors. (No LLM cost yet.)

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Run the audit with REAL LLM calls + real crawl (Sprints 2, 3, 6, 7)
═══════════════════════════════════════════════════════════════════════════════

> 1. Click **"Run Audit"** once. Confirm the single `audit/start` event fires BOTH:
>    - `run-audit.ts` — the **multidimensional audit** (~200 real calls across OpenAI/Anthropic/
>      Gemini/Perplexity), and
>    - `technical-audit-run.ts` — the **technical audit** (real Playwright crawl of the live site:
>      homepage + up to 7 priority pages per the SSR-per-page addendum).
> 2. Watch the Inngest run to completion; note any step that errors or retries. Confirm both audits
>    complete independently and the **audit-completion email** (Resend) summarizes both.
> 3. Confirm ONE tier-quota slot was consumed (not two) and the run stayed within the <US$3.50 budget
>    (report the approximate spend if observable).
> **Report:** both audits completed, the Inngest step outcomes, the email sent, the quota/cost.

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — Verify EVERY Sprint 1–7 feature against the live audit data
═══════════════════════════════════════════════════════════════════════════════

> For each, load the real page (grep for the actual route) and confirm it renders LIVE data from this
> brand's latest audit (not a fixture, not an EmptyState). Mark PASS/FAIL per line with what you saw:
>
> **Auth & foundation (S1)**
> - [ ] Org/auth/RLS: a second org cannot read this brand's audit (RLS isolation holds).
>
> **Multidimensional audit + scoring (S2, S3)**
> - [ ] The multidim audit produced per-engine results across all 4 engines with real citations.
> - [ ] Multidimensional scores populated (no nulls where data exists); mock-mode NOT active.
>
> **UI layer (S4)**
> - [ ] Brand list shows this brand; the audit-list row shows the multidim audit as primary with a
>       "+ technical audit" badge (both completed).
>
> **AU vertical packs (S5)**
> - [ ] The assigned vertical pack's prompts/context were used for this brand.
>
> **Action Center (S6)**
> - [ ] Recommendations generated from the audit; each carries the explainability fields and (where
>       applicable) **citability method evidence-links** (the 47-methods data surfaces here — this is
>       where citability lives in Sprint 7, not a standalone page).
>
> **Technical audit — the 8 dimensions + rollup (S7)**
> - [ ] `/technical-audit` overview: 8-dim drill-down + 5-category rollup; composite /100 computed;
>       Authority% = scoreBrandEntity/10, Technical% includes scoreSignals, etc.
> - [ ] **Robots/AI-crawler** page: 27 bots across 3 tiers; CDN-block detection if applicable.
> - [ ] **llms.txt generator**: depth-scored output.
> - [ ] **Schema audit**: richness /16 + the honest "zero measurable impact on ChatGPT/Claude/
>       Perplexity/Gemini" reality-check copy.
> - [ ] **SSR check**: per-page table (homepage + priority pages) from `content.ssr`; status card
>       dynamic from `pagesChecked`; scoring still homepage-derived.
> - [ ] **Answer capsules**: question list from `content.questions[]` with Has/Needs badges; **click
>       "Suggest Rewrite" on one needs-capsule question and confirm a real ~20–25 word capsule returns
>       inline** (this is the one remaining live functional check from the D4 review — haiku, ~0.1¢).
> - [ ] **Signals**: negative-signals + prompt-injection rows with `detail`; /6 health score (6=clean,
>       0=many) — confirm a flagged brand reads low and the score polarity is health-correct.
> - [ ] **Brand & Entity**: 4 sources (ABN/Wikipedia/TLD/Directory = 3/3/2/2 = /10) from the real ABN
>       Lookup + Wikipedia + TLD + directory aggregate; the AU directory list reflects real lookups.
>
> **Report:** a PASS/FAIL table for every line above, each with the concrete value observed (e.g.
> "Schema 11/16", "Signals 2/6", "ABN verified ✓ 0/3→3/3"). For any FAIL, capture the error + the
> route + whether it's a live-data issue vs a render bug — do NOT fix in this run; just record it.

═══════════════════════════════════════════════════════════════════════════════
STEP 4 — Summary
═══════════════════════════════════════════════════════════════════════════════

> Produce a single end-to-end report:
> - GO/NO-GO pre-flight result; brand used; total approximate API spend; quota consumed.
> - The full PASS/FAIL feature table (Step 3).
> - A defects list (anything that rendered wrong, errored, or read stale) with route + symptom —
>   ordered by severity, scoring/security issues first. No fixes applied in this run.
> - An explicit statement of whether the real pipeline is end-to-end healthy across Sprints 1–7.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **This run costs real money** (~US$3.50 for the full audit + a fraction of a cent for the one
  Suggest-Rewrite click). Do it against a dev/staging brand, once — not in a loop.
- **Pick a real AU brand with a genuine footprint** (real ABN, .com.au, likely on hipages/YPAU) so
  Brand & Entity and the directories actually score something — auditing a bare site will show lots
  of 0s and tell you less.
- **This is NOT the canon acceptance gate.** Sprint 7's formal acceptance is the **50-site corpus +
  Spearman > 0.7** (`tests/corpus/run-corpus.ts`) — a separate script. This E2E run proves the live
  pipeline *works*; the corpus run proves the scores are *meaningful*. Consider running the corpus
  script separately when you're validating scoring quality.
- **For an automated E2E** (CI-safe), ask separately — it must use Mock LLM Mode (Sprint 2), not real
  calls. I can write that as its own prompt.
- This also closes the parked **Answer Capsules "Suggest Rewrite" click-test** (it's Step 3's
  answer-capsules line).
