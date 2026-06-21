# VisibleAU — Two-mode check + REAL-LLM E2E validation (Sprints 1–7) · REAL BRAND
# SUPERSEDES the earlier E2E prompts. Anchored to a real, verified AU brand.
# Setup (Sri's): two modes (dev/prod) + two databases; shared API + frontend. "Switch to prod" →
#   prod DB + REAL LLM calls. Dev → mock/safe.
# Run PART A first (no API spend). Only if A is GREEN, run PART B (real prod data, ~US$3.50).

╔═══════════════════════════════════════════════════════════════════════════════╗
║ TEST BRAND (verified real AU business — use exactly this):                       ║
║   • Name:    Asset Plumbing Solutions                                            ║
║   • Domain:  assetplumbingsolutions.com.au                                       ║
║   • ABN:     58 110 395 714                                                      ║
║   • Why it fits: real .com.au; ABN verified on the ABR + the NSW govt supplier   ║
║     registry (buy.nsw); 21+ yrs operating; Sydney/NSW; licensed (185041C) — so   ║
║     ABN Lookup, AU TLD, and the directory aggregate all have something real to    ║
║     find. (Wikipedia presence is unlikely → expect Wikipedia AU to score 0/3,    ║
║     which is the correct real result for an SMB, not a bug.)                     ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║ WHY PART A: a dev/prod split sharing the API + frontend is where mode leaks hide  ║
║ (dev writing to prod, prod on dev, real LLM calls in dev, shared Inngest queue).  ║
║ Part A confirms isolation BEFORE spending money. It changes nothing, calls no     ║
║ paid API — inspect & report only. Real LLM calls must NEVER be in the automated   ║
║ test suite/CI (those stay on Mock LLM Mode, Sprint 2). This is a MANUAL run.      ║
╚═══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════
PART A — Verify dev/prod mode isolation (run first · no API spend · read-only)
═══════════════════════════════════════════════════════════════════════════════

> Do NOT switch to prod or call any paid API in Part A. Inspect and REPORT.
> 1. **Mode switch mechanism:** find and state exactly how dev↔prod is selected (env var, CLI flag,
>    `.env.dev`/`.env.prod`, runtime toggle) and the single source of truth the app reads for mode.
> 2. **DB isolation:** dev and prod use SEPARATE connection strings; no code path lets one mode
>    read/write the other's DB; migrations target each independently; RLS enabled on tenant tables in
>    BOTH modes. Report how the active DB URL is chosen.
> 3. **Real-LLM gating (cost guard):** real LLM calls (multidim `run-audit.ts`, the answer-capsule
>    haiku, any other provider call) fire ONLY in prod; dev is GUARANTEED Mock LLM Mode (Sprint 2).
>    Show the branch/flag. Flag any path where dev could hit a real provider.
> 4. **Inngest/queue isolation:** dev and prod use separate Inngest environments/event keys so a dev
>    `audit/start` cannot fire against prod data (or vice versa). Flag a shared queue.
> 5. **Secret scoping:** prod keys + `ABN_LOOKUP_GUID` load only in prod; no secret values printed
>    (set/unset only).
> 6. **Mode visibility:** the running app makes the active mode/DB obvious. If not, recommend a small
>    indicator (don't build it now).
> **PART A REPORT:** GREEN/RED verdict, the switch mechanism stated, points 2–6 each OK/FLAG with the
> file cited. If RED/FLAG, STOP and list the fix — do NOT proceed to Part B. Apply no fixes here.

═══════════════════════════════════════════════════════════════════════════════
PART B — REAL-LLM end-to-end validation in PROD mode (only if Part A is GREEN)
═══════════════════════════════════════════════════════════════════════════════

> Proceed only if Part A is GREEN. Uses prod DB + real LLM calls (~US$3.50 for the full audit +
> ~0.1¢ for one Suggest-Rewrite click). Run ONCE.
>
> **B0 — Pre-flight (prod).** Switch to prod via the Part-A mechanism. Confirm: app reports PROD on
> the prod DB; the 4 provider keys + `ABN_LOOKUP_GUID` present (set/unset only); Inngest prod worker
> up; per-audit budget ceiling (<US$3.50) + tier quota in place. Report GO/NO-GO; if NO-GO, stop.
>
> **B1 — Create the brand (S1, S4, S5).** Through the real UI as an Agency-tier org: sign in (Better
> Auth, org + RLS context set), then create the brand:
>   • Name: **Asset Plumbing Solutions** · Domain: **assetplumbingsolutions.com.au** · ABN: **58 110
>     395 714**.
> Assign an AU vertical pack (Trades/Plumbing) if the flow requires it. Confirm it appears in the
> brand list with correct Agency-tier badges, no console/RLS errors. (No LLM cost yet.)
>
> **B2 — Run the audit (S2, S3, S6, S7).** Click "Run Audit" ONCE. Confirm the single `audit/start`
> event fires BOTH `run-audit.ts` (multidim, ~200 real calls across OpenAI/Anthropic/Gemini/
> Perplexity) AND `technical-audit-run.ts` (real Playwright crawl of assetplumbingsolutions.com.au:
> homepage + up to 7 priority pages). Watch Inngest to completion; note errored/retried steps.
> Confirm both complete, the Resend completion email summarizes both, ONE quota slot consumed, spend
> < US$3.50. Report outcomes + approximate spend.
>
> **B3 — Verify EVERY Sprint 1–7 feature against the live prod audit.** Open each real page (grep the
> route), confirm LIVE data (not a fixture/EmptyState). Mark PASS/FAIL with the concrete value seen:
> - [ ] **RLS (S1):** a second org cannot read this brand's audit (isolation holds in prod).
> - [ ] **Multidim (S2/S3):** per-engine results across all 4 engines with real citations; scores
>       populated (no nulls where data exists); real mode (not mock) confirmed.
> - [ ] **UI (S4):** brand list + audit-list row (multidim primary + "+ technical audit" badge).
> - [ ] **Vertical pack (S5):** the assigned pack's prompts/context were used.
> - [ ] **Action Center (S6):** recommendations generated; explainability fields present; citability
>       method evidence-links where applicable (47-methods data surfaces here — no standalone
>       citability page in S7; `/methodology` is a deferred stub).
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
>       inline** (closes the parked D4 functional check).
> - [ ] **Signals:** negative-signals + prompt-injection rows with `detail`; /6 HEALTH score (6=clean,
>       0=many) reads correctly on real data.
> - [ ] **Brand & Entity:** 4 sources (ABN/Wikipedia/TLD/Directory = 3/3/2/2 = /10) from the real ABN
>       Lookup (expect ABN **58 110 395 714** to verify → 3/3), AU TLD (.com.au → 2/2), Wikipedia
>       (likely 0/3 — correct for an SMB), and the AU directory aggregate reflecting real lookups
>       (hipages/Yellow Pages AU/ServiceSeeking/Word of Mouth).
>
> **B4 — Report.** One summary: Part A verdict, B0 GO/NO-GO, brand used (Asset Plumbing Solutions),
> approximate total spend, quota consumed, the full PASS/FAIL feature table (each with the observed
> value, e.g. "Schema 11/16", "Signals 2/6", "ABN 3/3", "AU TLD 2/2"), and a defects list ordered by
> severity (scoring/security first) with route + symptom. Record defects — do NOT fix in this run.
> End with an explicit statement: is the live prod pipeline end-to-end healthy across Sprints 1–7?

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **Brand provenance:** Asset Plumbing Solutions' ABN (58 110 395 714) is verified on the ABR and the
  NSW government supplier registry (buy.nsw), and the `.com.au` domain is live with a real Sydney
  address + plumbing licence — so the audit hits real ABN/TLD/directory data. It's a public business
  site; you're crawling it once for a legitimate audit test. If you'd rather use your own/client site,
  just swap the three fields in B1.
- **Expected real results** (so a low number isn't mistaken for a bug): ABN should verify (3/3), AU
  TLD passes (2/2), Wikipedia likely 0/3 (SMBs rarely have entries — correct), directories depend on
  actual listings. A composite that isn't perfect is the point — you're validating the pipeline reads
  real signals, not that this brand scores well.
- **Costs real money** (~US$3.50). Prod brand, run once, not in a loop.
- **Not the canon acceptance gate:** that's the 50-site corpus + Spearman > 0.7
  (`tests/corpus/run-corpus.ts`). This proves the pipeline WORKS; the corpus proves scores are
  MEANINGFUL.
- **Automated CI E2E** = separate, mock-mode only (never real calls). Ask if you want it.
- Closes the parked **Answer Capsules Suggest-Rewrite click-test** (the B3 line).
