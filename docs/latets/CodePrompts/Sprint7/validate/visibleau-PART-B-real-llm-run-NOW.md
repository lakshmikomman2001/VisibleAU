# VisibleAU — PART B: REAL-LLM end-to-end validation (Sprints 1–7) — RUN NOW
# Starts from the verified post-fix state (Part A isolation already passed; FLAG 1 done + verified;
#   ABN bypass in skip mode; test brand created). This is the real-money run: ~US$3.50 for the full
#   audit + ~0.1¢ for one Suggest-Rewrite click. Run ONCE, in PROD mode, against a real brand.
# Records defects — does NOT fix them in this run. Report PASS/FAIL per feature with the value seen.

╔═══════════════════════════════════════════════════════════════════════════════╗
║ KNOWN-EXPECTED THIS RUN (not bugs — don't flag as failures):                    ║
║ • ABN scores 0/3 "check temporarily unavailable — verification pending" — bypass ║
║   is in skip mode pending the ABR GUID. The brand-entity /10 and composite read  ║
║   ~3 points lower than the eventual real number for any brand that would verify.  ║
║ • Wikipedia AU likely 0/3 for an SMB (correct real result, not a defect).        ║
╚═══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════
B0 — Pre-flight (confirm verified state + prod; quick, no full re-audit of isolation)
═══════════════════════════════════════════════════════════════════════════════

> Part A isolation already passed and the ABN fixes are verified, so just CONFIRM (don't re-audit):
> 1. Switch to PROD mode (the `START-PROD.bat` → `.env.prod` → `.env.local` path). App reports PROD on
>    the prod DB (visibleau_prod).
> 2. `LLM_MODE=real` in effect; the 4 provider keys present (set/unset only, no values); Inngest
>    prod worker up (or inline-execution fallback active).
> 3. `ABN_LOOKUP_BYPASS=skip` is set in prod (expected for this run — ABN stays 0/3 pending).
> 4. Budget ceiling (<US$3.50) + tier quota in place; one "Run Audit" = one quota slot firing BOTH
>    audits via `audit/start`.
> **Report GO/NO-GO.** If NO-GO, stop and list what's missing.

═══════════════════════════════════════════════════════════════════════════════
B1 — Use the real test brand (already created)
═══════════════════════════════════════════════════════════════════════════════

> The brand exists from the ABN verification: **Asset Plumbing Solutions** ·
> assetplumbingsolutions.com.au · abn 58110395714 (Agency-tier org). Confirm it's present in the brand
> list with correct tier badges and its abn still populated. If for any reason it's gone, recreate it
> with those exact fields. (No LLM cost yet.)

═══════════════════════════════════════════════════════════════════════════════
B2 — Run the audit (real LLM calls + real crawl)
═══════════════════════════════════════════════════════════════════════════════

> Click "Run Audit" ONCE. Confirm the single `audit/start` event fires BOTH:
>  • `run-audit.ts` — multidim audit, ~200 real calls across OpenAI/Anthropic/Gemini/Perplexity;
>  • `technical-audit-run.ts` — real Playwright crawl of assetplumbingsolutions.com.au (homepage +
>    up to 7 priority pages).
> Watch Inngest to completion; note any errored/retried step. Confirm both complete, the Resend
> completion email summarizes both, ONE quota slot consumed (not two), spend < US$3.50.
> **Report:** both audits completed, Inngest step outcomes, email sent, approximate spend.

═══════════════════════════════════════════════════════════════════════════════
B3 — Verify EVERY Sprint 1–7 feature against the live prod audit
═══════════════════════════════════════════════════════════════════════════════

> Open each real page (grep the route), confirm LIVE data (not a fixture/EmptyState). PASS/FAIL with
> the concrete value seen:
> - [ ] **RLS (S1):** a second org cannot read this brand's audit (isolation holds in prod).
> - [ ] **Multidim (S2/S3):** per-engine results across all 4 engines with real citations; scores
>       populated (no nulls where data exists); confirm REAL mode (not mock) was used.
> - [ ] **UI (S4):** brand list + audit-list row (multidim primary + "+ technical audit" badge, both
>       completed).
> - [ ] **Vertical pack (S5):** the assigned pack's prompts/context were used for this brand.
> - [ ] **Action Center (S6):** recommendations generated from the audit; each carries the
>       explainability fields and, where applicable, citability method evidence-links (the 47-methods
>       data surfaces here — no standalone citability page in S7; `/methodology` is a deferred stub).
> - [ ] **Technical overview (S7):** 8-dim drill-down + 5-cat rollup; composite /100; Authority% =
>       scoreBrandEntity/10; Technical% includes scoreSignals.
> - [ ] **Robots/AI-crawler:** 27 bots / 3 tiers; CDN-block detection if applicable.
> - [ ] **llms.txt:** depth-scored output.
> - [ ] **Schema audit:** richness /16 + the honest "zero measurable impact on ChatGPT/Claude/
>       Perplexity/Gemini" reality-check copy.
> - [ ] **SSR check:** per-page table (homepage + priority pages) from `content.ssr`; status card
>       dynamic from `pagesChecked`; scoring still homepage-derived.
> - [ ] **Answer capsules:** question list from `content.questions[]` with Has/Needs badges; **click
>       "Suggest Rewrite" on one needs-capsule question → confirm a real ~20–25 word capsule returns
>       inline** (closes the parked D4 functional check; haiku, ~0.1¢).
> - [ ] **Signals:** negative-signals + prompt-injection rows with `detail`; /6 HEALTH score (6=clean,
>       0=many) reads correctly on real data. (Note the parked V2b dedup + V4 copy items may still show
>       — flag if seen, but they're known/non-blocking.)
> - [ ] **Brand & Entity:** 4 sources; AU TLD (.com.au → 2/2) and the directory aggregate reflect real
>       lookups; **ABN expected 0/3 "pending" (skip mode — KNOWN, not a defect)**; Wikipedia likely 0/3
>       (correct for an SMB). Total /10 will read low by ~3 because ABN is bypassed.
>
> **Report:** a PASS/FAIL table for every line, each with the observed value (e.g. "Schema 11/16",
> "Signals 2/6", "AU TLD 2/2", "ABN 0/3 pending"). For any FAIL, capture error + route + live-data-vs-
> render. Do NOT fix in this run.

═══════════════════════════════════════════════════════════════════════════════
B4 — Summary
═══════════════════════════════════════════════════════════════════════════════

> One end-to-end report: B0 GO/NO-GO; brand used (Asset Plumbing Solutions); approximate total spend;
> quota consumed; the full PASS/FAIL feature table (with values); a defects list ordered by severity
> (scoring/security first) with route + symptom — separating NEW defects from the KNOWN parked items
> (ABN skip 0/3, Signals V2b/V4). End with an explicit statement: is the live prod pipeline end-to-end
> healthy across Sprints 1–7, with ABN being the only intentionally-stubbed piece?

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **Costs ~US$3.50** — one prod brand, run once, not in a loop.
- **Interpreting the composite:** it'll read low because ABN contributes 0 in skip mode. For any brand
  that would verify, mentally add up to 3 to the Authority dimension. The RE-ENABLE run gives the real
  number (0/3 → 3/3) once your GUID arrives.
- **Two parked Signals items** (V2b site-wide injection dedup, V4 "max of 6" copy) may surface in B3 —
  they're known/non-blocking; the prompt tells Claude Code to flag-not-fix them.
- **This is NOT the canon acceptance gate.** Sprint 7 acceptance = 50-site corpus + Spearman > 0.7
  (`tests/corpus/run-corpus.ts`), a separate script that proves scores are MEANINGFUL. This proves the
  pipeline WORKS end-to-end on real data.
- This run closes the parked **Answer Capsules Suggest-Rewrite click-test** (the B3 line).
