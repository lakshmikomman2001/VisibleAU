# VisibleAU — Document Index

> ⚠️ **STALENESS NOTICE (added 13 May 2026 — second-pass-fix audit N16):**
> This file was last fully refreshed on 9 May 2026 against the pre-conflict-resolution document set. The post-conflict-resolution bundle (12 May 2026) and the second-pass-fix bundle (13 May 2026) introduced new file names, version numbers, and structure. **For the current canonical truth, use these sources instead:**
> - `README.md` at the bundle root — bundle contents + latest versions table
> - `HANDOFF.md` at the bundle root — new-Claude-chat briefing
> - `CLAUDE.md` at the bundle root — design doc Claude Code auto-loads
>
> Specific staleness this file contains: (a) Foundations listed as v1.7 — current is v1.10; (b) sprint prompts shown as combined `sri-visibleau-sprints-1-3.md` v1.10 — bundle has 12 separate sprint files (v1.1 → v2.1); (c) prototype "41-screen ... Round 20" — current is 44 screens; (d) "Last updated: 9 May 2026 (Round 32)" — bundle is dated 13 May 2026 after second-pass-fix.
>
> Until this doc is fully refreshed (an operator-side task; estimate ~30 min), treat the README + HANDOFF + CLAUDE.md as the authoritative entry points.

---

**Last updated:** 9 May 2026 (Round 32 fixes applied — all 9 conflicts resolved across 6 test docs per Sri's Option A on two-axis scenarios. All 16 doc-set members at current canonical versions. **Doc work complete; Sprint 1 build is the next move.**)
**Purpose:** Single entry point for the VisibleAU document set. Tells readers which docs are current canonical truth, which are time-locked history, and how the pieces fit together.

> **TL;DR — if you're new to this project:** Read these 5 files in order: `HANDOFF.md` (15-min orientation, current canonical state) → `sri-geo-aeo-prd-v1.md` (what we're building) → `sri-visibleau-architecture-overview.md` (high-level how) → `sri-visibleau-foundations.md` (engineering specifics) → individual sprint prompts at `03-sprint-prompts/sri-visibleau-sprint-N-prompt.md` (N=1 first; the bundle has 12 separate sprint files, not a combined "sprints-1-3" file). The prototype `visibleau-prototype.jsx` is visual ground truth. Everything else is supporting material.

---

## Reading-order rule

Every file in this corpus falls into one of three categories:

1. **Canonical** — current truth. If two docs disagree, canonical wins.
2. **Test/QA spec** — derived from canonical; describes how to verify a sprint shipped correctly.
3. **History** — time-locked record (audit reports, marketing exploration, earlier vertical research). Statements in history docs were true *at the date stamped*; they are not retroactively updated when canonical changes. **Do not follow instructions in history files for current work.**

This index lists every file in the `/mnt/user-data/outputs/` working directory by category.

---

## 1. Canonical product & engineering docs (current truth)

These define what's being built and how. If you're picking up a sprint or running an audit, start here.

| File | Version | Date | What it covers | Read it when… |
|---|---|---|---|---|
| `sri-geo-aeo-prd-v1.md` | **v1.14** | 9 May 2026 | Product requirements: market, competitor analysis (Tier 5 OSS landscape + Hall AU competitor in tier table + §7 comparison), pain points, pricing tiers + **§7.6** pricing model open question, GTM, roadmap (v1.1 + v1.2 sub-roadmaps), **§8.7** OSS components strategy, **§8.8** OSS-derived feature roadmap insertions with realistic re-implementation effort, **§16** OSS-layer reference strategy (Auriti reclassified reference-only after Round 25; ATTRIBUTIONS.md sprint deliverable matrix + Auriti-8-vs-Foglift-5 UX decision documented in Round 26). Section ordering ascending. | Pre-build, GTM planning, marketing copy, pricing-page work |
| `sri-visibleau-architecture-overview.md` | **v1.3** | 9 May 2026 | High-level system architecture: regions, multi-tenancy, data residency, cost model, failure modes | Architecture decisions, deployment planning, capacity estimates |
| `sri-visibleau-foundations.md` | **v1.7** | 9 May 2026 | Tech stack lock, folder structure, schema (organizations, users, brands, audits, citations, recommendations), conventions | Every sprint — Claude Code reads this with every Sprint prompt |
| `sri-visibleau-sprints-1-3.md` | **v1.10** | 9 May 2026 | Build-ready Claude Code prompts for Sprints 1, 2, 3 (auth + brand CRUD, audit creation, multi-engine scoring) | Currently building Sprint 1; Sprint 2/3 prompts ready when you reach them |
| `sri-visibleau-multi-region-phase-2.md` | v1.0 | 4 May 2026 | Phase 2 multi-region playbook (per-region DBs, deployments) — 3-6 month project, only do once revenue justifies | Long-term planning; not v1 |
| `visibleau-prototype.jsx` | (current — Round 20) | 9 May 2026 | 41-screen interactive prototype across all 12 sprints. Visual ground truth for UI. Babel-validated JSX | UI implementation in any sprint; design reference |

### Why canonical docs are at multiple version numbers

- PRD jumped from v1.6 → v1.7 in Round 19 (pricing terminology, sample-vs-free, engine roadmap)
- Foundations jumped from v1.6 → v1.7 in Round 19 (4 schema column additions)
- Architecture jumped from v1.2 → v1.3 in Round 19 (tier-aware model strategy)
- Sprints 1-3 jumped from v1.9 → v1.10 in Round 19 (numeric companion writes)
- Multi-region Phase 2 has stayed at v1.0 since 4 May (no audit round has touched it; it's deferred work)

Sprint test docs (next section) were independently versioned in Round 20 to propagate Round 19 changes.

---

## 2. Sprint test & QA specifications

Each sprint has up to five companion docs. Test docs are *derived* from canonical — when canonical changes, test docs need a propagation pass.

### Sprint 1 (foundation: auth, brand CRUD, dashboard shell)

| File | Version | Date | Purpose |
|---|---|---|---|
| `sri-visibleau-sprint-1-tests.md` | v1.3 | 7 May 2026 | Vitest backend integration tests for Sprint 1 |
| `sri-visibleau-sprint-1-e2e-tests.md` | v1.1 | 7 May 2026 | Playwright browser E2E tests for Sprint 1 (full suite, 6 spec files) |
| `sri-visibleau-sprint-1-qa-validation.md` | v1.2 | 8 May 2026 | Manual checklist (18 features) — human walkthrough |
| `sri-visibleau-sprint-1-claude-code-qa.md` | v1.1 | 8 May 2026 | Claude Code prompt to build per-feature isolated test runners (`.bat` + `.sh` scripts) |

### Sprint 2 (audit creation, single-engine, mock LLM)

| File | Version | Date | Purpose |
|---|---|---|---|
| `sri-visibleau-sprint-2-e2e-tests.md` | **v1.2** | 9 May 2026 | Playwright E2E for Sprint 2 audit flow + mock scenario routing via `audits.metadata` JSONB plumbing |

### Sprint 3 (4 engines, multidimensional scoring, confidence intervals)

| File | Version | Date | Purpose |
|---|---|---|---|
| `sri-visibleau-sprint-3-backend-tests.md` | **v1.2** | 9 May 2026 | Vitest backend tests for Sprint 3 — multi-engine, scoring, CIs, brand metrics |
| `sri-visibleau-sprint-3-frontend-e2e-tests.md` | **v1.2** | 9 May 2026 | Playwright E2E for the rich audit results screen |
| `sri-visibleau-sprint-3-qa-validation.md` | v1.0 | 8 May 2026 | Manual QA checklist — full Sprint 3 acceptance |
| `sri-visibleau-sprint-3-claude-code-qa.md` | **v1.2** | 9 May 2026 | Claude Code prompt for per-feature UI runners with **mocked** LLMs (deterministic, ~$0/run) |
| `sri-visibleau-sprint-3-staging-qa.md` | **v1.1** | 9 May 2026 | Claude Code prompt for per-feature UI runners with **real** LLMs (~US$8-12/full suite — staging acceptance only) |

### Sprints 4-12 (no engineering specs yet; only prototype screens)

The prototype includes 30 screens for Sprints 4-12 (Round 18-19 expansion). Engineering specs for these sprints have not been written. When you reach Sprint 4, the next deliverable is `sri-visibleau-sprints-4-6.md` (or similar) following the Sprints 1-3 prompt pattern.

---

## 3. Audit history (time-locked, not actionable)

All audit reports are records of conflict-resolution passes. They describe what was true *at the date stamped*. Statements like "audits.metadata is a Sprint 2 add-on column" were true in Round 16 but became false in Round 19 when the column was promoted to canonical schema.

**Do not act on instructions in audit history files for current work.** They're useful for understanding decision history, not for current building.

| File | Date | Conflicts | Notes |
|---|---|---|---|
| `sri-visibleau-conflict-audit.md` | 6 May 2026 | 11 | Round 1 (titled differently). Original cross-doc audit. |
| `sri-visibleau-deep-audit-round-2.md` | 6 May 2026 | 8 | Schema gaps, multi-tenancy, currency mismatches |
| `sri-visibleau-deep-audit-round-3.md` | 6 May 2026 | 11 | Pgenum, deletedAt, auth response policy |
| `sri-visibleau-deep-audit-round-4.md` | 6 May 2026 | 9 | Test doc audit. **Note:** Round 4 fixes were not applied initially — they were eventually applied in Round 6 (see Round 6 doc) |
| `sri-visibleau-deep-audit-round-5.md` | 6 May 2026 | 7 | Tier/Region/Vertical type exports, totalCostUsd column |
| `sri-visibleau-deep-audit-round-6.md` | 6 May 2026 | 12 (3 new + 9 deferred from Round 4) | Cleanup pass |
| **Rounds 7-8** | — | (22 prototype audit conflicts) | **No standalone files.** Conflicts were applied directly to the prototype during creation; later round cumulative tables credit them as "rounds 7-8: prototype audit" without a saved report. |
| `sri-visibleau-deep-audit-round-9.md` | 7 May 2026 | 10 | Sprint↔Prototype alignment |
| `sri-visibleau-deep-audit-round-10.md` | 7 May 2026 | 7 | Round 9 ripple effects (schema columns added but consumers not all updated) |
| `sri-visibleau-deep-audit-round-11.md` | 7 May 2026 | 10 | E2E↔Sprint↔Prototype alignment |
| `sri-visibleau-deep-audit-round-12.md` | 7 May 2026 | 7 | QA doc alignment |
| `sri-visibleau-deep-audit-round-13.md` | 8 May 2026 | 5 | QA doc clean audit |
| `sri-visibleau-deep-audit-round-14.md` | 8 May 2026 | 8 | Claude Code QA doc |
| `sri-visibleau-deep-audit-round-15.md` | 8 May 2026 | 6 | Sprint 2 E2E doc (MSW→mock LLMService rewrite) |
| `sri-visibleau-deep-audit-round-16.md` | 8 May 2026 | 5 | Sprint 3 backend tests doc |
| `sri-visibleau-deep-audit-round-17.md` | 8 May 2026 | 4 | Sprint 3 frontend E2E doc |
| `sri-visibleau-deep-audit-round-18.md` | 8 May 2026 | 6 | Sprint 3 QA doc |
| `sri-visibleau-deep-audit-round-19.md` | 9 May 2026 | 8 | Full corpus re-audit (parallel-execution audit) |
| `sri-visibleau-deep-audit-round-20.md` | 9 May 2026 | 7 | Round 19 propagation audit |
| `sri-visibleau-deep-audit-round-21.md` | 9 May 2026 | 0 | Index pass — no new conflicts; deliverable is the index |
| `sri-visibleau-deep-audit-round-22.md` | 9 May 2026 | 5 (roadmap additions) | External-source gap analysis (Selfmademillennials AI SEO Trends 2026 article); 3 features added to v1.1 roadmap, 2 to v1.2; PRD bumped v1.7 → v1.8. Differs from prior rounds: additions, not internal conflict fixes. |
| `sri-visibleau-deep-audit-round-23.md` | 9 May 2026 | 1 missed competitor + 9 OSS repos catalogued + 1 new PRD section | Proper GitHub + AU startup competitive scan (after Sri pushed back on a sloppy Round 23-precursor claim). Found Hall Technologies (Sydney, Blackbird-backed) — most direct AU competitor missed in PRD v1.0-v1.8. Catalogued 9 OSS repos (danishashko, getcito, gego, etc.) and added §3 Tier 5 OSS landscape. Added new §8.6 OSS components strategy. PRD bumped v1.8 → v1.9. |
| `sri-visibleau-deep-audit-round-24.md` | 9 May 2026 | 27 features extracted + 9 priority adoptions + 3 new PRD sections | Deep README + source read of 7 OSS repos (danishashko, getcito, Auriti-Labs, ngstcf, gego, Optim👀, Foglift, claude-seo). Critical finding: Auriti-Labs/geo-optimizer-skill matured to v4.6.0 (1189 tests, 47 citability methods, 8 scoring categories, 27 AI bots, MCP server, GitHub Action) — strategic recommendation: **adopt as direct dependency** instead of re-implementing 4-6 weeks of audit-side work. New PRD sections: §13 OSS dependency strategy, §6.5 pricing model open question (flat-rate vs token-based experiment), §3.1 OSS-derived feature roadmap (16 v1.0 + 7 v1.1 + 4 v1.2 features). PRD bumped v1.9 → v1.10. |
| `sri-visibleau-deep-audit-round-25.md` | 9 May 2026 | 1 strategic reversal + 10 effort-estimate corrections + 1 new validation gate | **Production-readiness reality check on Auriti-Labs after Sri pushed back on Round 24's dependency recommendation.** Found: zero independent user validation (all issues by maintainer, in Italian); 2 total discussions (one bot-flavoured); no third-party reviews/tutorials/blog posts; no external PRs; the 1,189 tests are all mocked (not integration-tested); the 9.8/10 self-rating is marketing dressed up as engineering certification; star count inconsistent (16/59/150/395 across page renders). Reversed Round 24: Auriti reclassified reference-only, not dependency. §13 rewritten end-to-end (~17K chars): 'OSS-layer reference strategy'; 11 OSS sources catalogued; 37 killer features retained on roadmap (Sprint 7+8 effort revised from ~1 day to ~22 days); validation gate added (50-site Spearman correlation > 0.7 required for any future dependency promotion). Process learning: discount self-rated quality scores; ask 'tested against what?'; default to reference-only Option B when OSS validation is uncertain. PRD bumped v1.10 → v1.11. |
| `sri-visibleau-deep-audit-round-26.md` | 9 May 2026 | 9 internal-consistency conflicts + 4 gap fixes | **Deep internal consistency audit** after Sri asked 'find any gaps or conflicts in the design document'. Rapid Rounds 22-25 additions accumulated structural conflicts: §13 number collision (original Success Metrics + new OSS strategy → OSS renumbered §16); §6.5 misnumbered as Personas-sub but is pricing-topic → §7.6; §3.1 misnumbered as Competitors-sub but is feature-roadmap → §8.8; §8.6 / §8.5 reverse order → §8.6 OSS components renumbered §8.7; stale '27 features' in §16 intro → 37; Sprint 11 vs Sprint 12 launch (5 instances) → Sprint 12; Exec Summary 6 engines + Positioning 5 → 4 v1 engines; §4.5 line 987 tier-engines (Round 19 leftover) corrected; Trust Stack vs E-E-A-T anti-pattern reconciled. 4 gap fixes: Hall in §7 tier comparison, validation corpus cross-doc note, ATTRIBUTIONS.md sprint deliverable matrix, Auriti-8 vs Foglift-5 UX decision. Sections now in ascending order physically and numerically. PRD bumped v1.11 → v1.12. |
| `sri-visibleau-deep-audit-round-27.md` | 9 May 2026 | 10 PRD-internal conflicts identified (audit-only; fixes pending) | Round 27 found 10 conflicts Round 26 missed: §16 physical-vs-numerical placement, 4 invalid section refs (§10A, §10D, §11F, §6C are pain-point IDs not section refs), pricing-table cells contradict engine roadmap disclaimer (Round 19 leftover), TikTok Sprint 12 vs v1.1 Month 8, Sprint 13/14 don't exist in §11 plan, §11 Sprint 7+8 cells don't reflect §8.8/§16 expanded scope, duplicate Out-of-scope headings in §16, Trust Stack reconciliation as table row is semantic mismatch. Process learning: each new search pattern finds new issues; audit cycle converges on "issues are increasingly subtle." Sri elected to defer fixes pending Round 28 prototype audit. |
| `sri-visibleau-deep-audit-round-28.md` + `sri-visibleau-deep-audit-round-28-fixes.md` | 9 May 2026 | 14 prototype-vs-PRD conflicts identified AND FIXED | First cross-doc audit (prototype vs PRD). Round 28-audit found 14 conflicts: 12 missing v1.0 features added in Rounds 22-26 not yet in prototype (Sprint 7 robots.txt + AI bots + CDN crawler + AI discovery + Schema richness + llms.txt depth + AU Brand & Entity + 47 citability methods; Sprint 8 SARIF/JUnit/GHA + confidence labels Confirmed/Likely/Hypothesis + webhook integrations; Sprint 11/12 README badge + demo data); 2 fixture-data inconsistencies (5 different per-audit cost numbers across prototype; vertical pack counts below PRD §11 spec); 3 stale anti-patterns + AU specifics (v1.3 anti-patterns missing, Word of Mouth missing, sample audit time inconsistent). Round 28-fixes applied all 14: 3 new Sprint 7 screens (RobotsTxtCrawlerConfig, BrandEntityAudit, CitabilityMethodsReference), inline upgrades to 5 existing screens (LlmsTxtGenerator depth scoring + AI discovery, SchemaAuditor richness, AuditResultsRich export formats, DriftAlerts delivery channels, MethodologyPage badge preview), data updates (12 anti-patterns + Word of Mouth + vertical-pack counts + Sample audit time + Confirmed/Likely/Hypothesis labels + standardised costs). Final prototype: 4,245 lines / 238,964 chars / 44 screens (was 41) / Babel-validated. PRD bumped v1.12 → v1.13. |
| `sri-visibleau-deep-audit-round-29.md` + `sri-visibleau-deep-audit-round-29-fixes.md` | 9 May 2026 | 8 sprint conflicts + 10 PRD-internal conflicts + 6 cross-doc additions = 24 total fixes across three passes | **Three-pass sweep** addressing sprint prompt drift (Sri asked for sprint audit), then catching up Round 27 PRD-internal fixes (which had been pending since Round 27 audit), then propagating v1.11+ strategic posture to Foundations + Architecture (Rounds 26-28 carryover gap). **Pass 1 (Sprints v1.10→v1.11, 8 conflicts):** Sprint 1 Stripe products engines 6/6/8→4 v1, acceptance math 5+1=5→4+1=5, Sprint 2 cost $0.05→$0.005-0.01/call, Sprint 3 commodified=25 canonical, Sprint 2 enum +tiktok forward-compat, Sprint 1 README +ATTRIBUTIONS forward-ref, Sprint 3 5-real-domains seed 50-site corpus, Sprint 3 Wilson CI vs categorical disambiguation. **Pass 2 (PRD v1.13→v1.14, 10 conflicts):** §16 physically moved before Appendix A; invalid section refs §10A/§6C/§10D/§11F resolved to pain-point IDs or §8.5; pricing table cells 6/6/8→4 v1; TikTok Sprint 12→v1.1 Month 8; Sprint 13/14→v1.1 Month 4-6; §11 Sprint 7+8 cells expanded with §8.8/§16 scope; duplicate Out-of-scope heading disambiguated; Trust Stack reconciliation reformatted. **Pass 3 (cross-doc, 6 additions):** Foundations v1.8 + Architecture v1.4 each gained "v1.11+ strategic posture references" sections forward-referencing OSS reference strategy, 50-site validation corpus, ATTRIBUTIONS.md, Sprint 7/8 expanded scope, engine roadmap. Foundations also fixes commodified=0→25 in scoreContextNumeric schema comment. All four canonical docs now structurally clean + strategically aligned. Cumulative internal-conflict count: 197. |
| `sri-visibleau-deep-audit-round-30.md` + `sri-visibleau-deep-audit-round-30-fixes.md` | 9 May 2026 | 6 inverse-alignment conflicts identified AND FIXED + Sprint 4 prompt drafted | **Sri asked "one more clean audit on Sprint Claude Code prompts."** Round 30 used a new search axis — inverse alignment (where Architecture/Foundations promise functionality Sprint 1-3 don't deliver) — and found 6 conflicts. **The two genuine substantive finds:** (a) Architecture v1.4 promised `lib/llm/model-selector.ts` "planned Sprint 3" but Sprint 3 didn't deliver — without it, Agency Pro A$1,499/mo customers would get same model quality as Free; (b) Foundations v1.9 promised Sprint 2 LLM_MODE=mock with `mockScenario` metadata but Sprint 2 didn't deliver — local dev would burn real API tokens. Plus 4 mechanical fixes: 3 lib folders missing from Foundations tree (region/feature-flags/brands); prototype AuditRunning still showed Sprint 2 single-engine status; Sprint 3 invalid PRD §4.6 reference; prototype landing "Real data in 3 minutes" undershoots actual flow times. **All 6 fixed:** Foundations v1.8→v1.9 (lib tree + metadata schema comment + latent Round 29 changelog bug repaired); Sprints v1.11→v1.12 (Sprint 3 Step 1.5 IMPLEMENT TIER-AWARE MODEL SELECTOR with full PRIMARY_MODELS + DERIVED_TASK_MODELS mappings; Sprint 2 step 1 LLM_MODE=mock with 4 scenarios; §4.6→§4.5 dead link); Prototype refreshed (AuditRunning 4-engine reality + landing 90s Sample Audit). **Then drafted Sprint 4 Claude Code prompt v1.0** (~370 lines, 19 KB) covering 11 prototype screens — dashboard, brands CRUD + setup wizard, audit running/results-basic/rich/list/compare, portfolio overview. PDF+CSV+JSON exports in Sprint 4; SARIF/JUnit/GHA stubbed for Sprint 8. Acceptance criteria checklist with ~30 items. Audit cycle convergence note: 13→10→14→24→6 conflicts per round — decreasing trend = doc set has converged. Recommended next: Sri starts Sprint 1 build in Claude Code. |
| `sri-visibleau-deep-audit-round-31.md` + `sri-visibleau-deep-audit-round-31-fixes.md` | 9 May 2026 | 8 backend test-doc conflicts identified AND FIXED | Sri asked: "find out if any conflicts in the end to end tests for backend." Round 31 audited the 3 backend-relevant test docs (Sprint 1 E2E, Sprint 2 E2E, Sprint 3 Backend Tests) against current canonical and found 8 conflicts: 5 substantive (C1 mock scenario names diverged from canonical 4 — tests WILL break against v1.12 impl; C2 Sprint 3 backend has ZERO model-selector test coverage despite Round 30 adding the dispatcher; C3 Sprint 2 cost budget $0.50 5x looser than v1.12 $0.10 spec; C4 Sprint 3 backend assumes multi-engine mocks but Sprint 2 only built ChatGPT mock; C5 mock fixture architecture mismatch — test docs use `lib/llm/mock-impl.ts` single TS class, Sprints v1.12 spec uses `lib/llm/mock-responses/<engine>/<scenario>.json` JSON fixtures) + 3 minor (C6 stale cross-doc version refs, C7 6-scenarios vs canonical 4, C8 old `engineering-foundations.md` filename). All 8 FIXED in same session: Sprint 1 E2E v1.1→v1.2 (3 fixes: filename + version + changelog), Sprint 2 E2E v1.2→v1.3 (18 fixes: full mock-architecture rewrite to JSON fixtures + scenario renames + budget tightening), Sprint 3 Backend v1.2→v1.3 (10 fixes: scenario renames + comprehensive `model-selector.test.ts` block with 30+ test cases covering 72 tier×engine×task combinations + multi-engine mock prerequisite + version bumps). Sri's selection on Conflict 5: JSON fixtures architecture canonical. Cumulative internal-conflict count: 211. |
| `sri-visibleau-deep-audit-round-32.md` + `sri-visibleau-deep-audit-round-32-fixes.md` | 9 May 2026 | 9 test-doc conflicts identified AND FIXED across 6 test docs | Per Sri's selection ("fix all 9; Option A on Conflict 1; stop auditing after"), all 9 Round 32 conflicts applied. **Sprint 3 Frontend E2E v1.2→v1.3** (11 fixes — biggest: full Section 2 rewrite to JSON fixtures architecture + Option A scenario consolidation + 4 straggler comments + acceptance criteria + Notes-for-Sri paragraph). **Sprint 3 Claude Code QA v1.2→v1.3** (10 fixes — mirror-image: scenarios list rewrite + JSON fixtures + model-selector boundary as acceptance criterion). **Sprint 1 Tests v1.3→v1.4** (mechanical only — no LLM tests). **Sprint 1 QA Validation v1.2→v1.3** (mechanical only). **Sprint 1 Claude Code QA v1.1→v1.2** (C3 filename + version + changelog). **Sprint 3 Staging QA v1.1→v1.2** (C3 filename + C4 cross-doc refs). Sprint 3 QA Validation v1.0 NOT MODIFIED — Round 32 verified its 8 `brand_mentioned` references are correct PostgreSQL column refs to `citations.brand_mentioned` boolean (Foundations canonical), NOT obsolete scenario names. Option A trade-off accepted: `high_visibility` → `happy_path`; `mixed_visibility` dropped; per-engine variance now handled via fixture authoring (weaker brand-mention language in Gemini/Perplexity happy_path fixtures). Forward-trigger note for revisiting Option C if future releases need explicit per-engine asymmetry. Cumulative internal-conflict count: **220** (all fixed). **Audit cadence complete; Sprint 1 build is unblocked.** |

**Cumulative total: 163 internal conflicts identified and resolved across 21 active fix rounds (154 from rounds 1-20 + 9 from Round 26). Plus 5 roadmap features added in Round 22 (external-source gap analysis), 1 major missed competitor + 9 OSS repos + 1 new PRD strategic section added in Round 23 (proper GitHub competitive scan), 27 features extracted + 9 priority adoptions + 3 new PRD sections in Round 24 (deep OSS read), 1 strategic reversal + 10 effort-estimate corrections + 1 new validation gate in Round 25 (Auriti production-readiness check), and 9 internal-consistency fixes + 4 gap fixes in Round 26 (deep PRD audit).** (Numbering goes to 26: Round 21 was structural, Rounds 22-23 were external-source-driven, Round 24 was deep OSS architecture analysis, Round 25 was strategic reversal, Round 26 was internal-consistency catch-up sweep after the rapid Rounds 22-25 additions.)

### Time-locked statements likely to mislead a fresh reader

The audit history contains some statements that, taken out of context, could lead someone to make wrong decisions today. The most important:

| History file | Statement | Why it's now wrong | Where to look instead |
|---|---|---|---|
| Round 16 (8 May) | "audits.metadata is a Sprint 2 dependency that needs a migration" | Round 19 promoted it to canonical — Sprint 1 ships it | Foundations v1.7 |
| Round 18 (8 May) | "confidence_intervals is a Sprint 3 migration add-on" | Same — Round 19 promoted to canonical | Foundations v1.7 |
| Rounds 5, 16 | "Stop here, ship Sprint 1, return to audits later" | Sound advice at the time, still good — but the corpus has continued evolving since | Round 19/20 are subsequent valuable passes |
| Round 6 | "Round 4 findings still pending" | Were applied in Round 6 itself; the deferred fixes are no longer pending | Round 6 body confirms application |

---

## 4. Marketing & GTM artifacts (separate from engineering corpus)

These are auxiliary outputs from earlier exploration work. They predate the engineering audit cycle and aren't part of the canonical/test split.

| File | Purpose |
|---|---|
| `sri-visibleau-daily-read.md` | 3-5 min morning read; messaging conviction-builder |
| `sri-visibleau-50-agency-target-list.md` | Beta outreach target list (50 AU agencies) |
| `sri-visibleau-cold-outreach-templates.md` | Email templates for agency outreach |
| `sri-visibleau-free-audit-template.md` | Template for delivering a free audit as a GTM lead magnet |
| `sri-visibleau-linkedin-posts.md` | LinkedIn content drafts |
| `sri-prelaunch-guide.md` | Pre-launch checklist (general; pre-dates the launch-checklist prototype screen) |

---

## 5. Pre-VisibleAU exploration (historical research)

These predate the VisibleAU pivot and are kept for context. Not actionable for current build.

| File | Purpose |
|---|---|
| `sri-master-research-document.md` | Initial vertical/market research |
| `sri-deep-vertical-analysis-v2.md` | Deep dive into 10 verticals |
| `sri-vertical-pain-points.md` | Pain-point analysis by vertical |
| `sri-product-recommendation-v1.md` | Initial product recommendation pre-VisibleAU |
| `sri-final-shortlist-5.md`, `sri-top-10-research-candidates.md`, `sri-shortlist-validation.md` | Shortlist narrowing trail |
| `sri-90day-market-mastery-curriculum.md`, `sri-market-curriculum-1-2hr-version.md` | Self-education plan |
| `sri-validation-plan-14day.md` | Validation plan template |
| `sri-real-revenue-reality-check.md`, `sri-growth-tiered-niche-research.md` | Revenue reality checks |
| `sri-geo-aeo-final-research.md`, `sri-geo-aeo-community-research.md` | GEO/AEO domain research that fed into PRD |
| `signly-*` (3 files) | Earlier project (Signly) — predates VisibleAU. Different project entirely; kept for reference only. |

---

## 6. Distribution packages

| File | Contents | Use when |
|---|---|---|
| `visibleau-package.zip` | Full project bundle (~37 files) — last built 8 May 2026 | Hand-off to a new contributor; backup |
| `visibleau-sprint-3-package.zip` | Sprint 3-only bundle (5 docs + README) — last built 8 May 2026 | Sharing just the Sprint 3 layer |

**Note:** Both zips are stale relative to Round 19/20 changes. If you need a current bundle, ask Claude to rebuild.

---

## 7. Cross-doc dependency map

```
                    PRD v1.14 (what)
                         |
          +--------------+--------------+
          |                             |
Architecture v1.4 (high-level how)   Foundations v1.9 (engineering how)
                                         |
                          +--------------+--------------+
                          |              |              |
                  Sprints 1-3 v1.12   Multi-region    Prototype.jsx
                  (build prompts)     Phase 2 v1.0    (UI ground truth)
                          |
          +---------------+---------------+
          |               |               |
   Sprint 1 tests   Sprint 2 E2E    Sprint 3 (5 docs)
   (4 docs)         (1 doc)         backend, FE E2E,
                                    QA, mocked QA, staging QA
```

**Rule:** when canonical changes (PRD, Architecture, Foundations, Sprints 1-3), test docs that reference the changed section need a propagation pass. That's what Round 20 was for after Round 19's canonical changes.

---

## 8. What "current" means (as of 9 May 2026)

- **In-flight build:** Sri is building Sprint 1 in Claude Code on a separate machine, parallel to ongoing research/design/audit work in this Claude.ai session.
- **Last canonical change:** Round 30 (9 May 2026) — Foundations v1.8→v1.9 + Sprints v1.11→v1.12 + Prototype refresh fixed 6 inverse-alignment conflicts (lib tree gap, model-selector promise, mock-LLM promise, AuditRunning stale copy, §4.6 dead link, landing copy honesty). Sprint 4 Claude Code prompt drafted v1.0 (NEW file). PRD v1.14 + Architecture v1.4 unchanged. Previous: PRD v1.14 (9 May 2026, Round 27+29 three-pass sweep). — deep internal consistency audit fixed 9 conflicts + 4 gaps accumulated during rapid Rounds 22-25 additions. Section renumberings: §13→§16 (OSS reference strategy, was colliding with original §13 Success Metrics), §6.5→§7.6 (pricing, moved physically to follow §7), §3.1→§8.8 (feature roadmap, moved physically to follow §8.7), §8.6→§8.7 (OSS components, moved physically to follow §8.5). Other fixes: Sprint 11 launch → Sprint 12 launch (5 instances), Executive Summary 6 engines → 4 v1 engines, §4.5 line 987 tier-gated engines corrected (Round 19 leftover), Trust Stack vs E-E-A-T anti-pattern reconciliation, Hall added to §7 tier comparison, ATTRIBUTIONS.md sprint deliverable matrix, Auriti-8 vs Foglift-5 UX decision documented. PRD structural integrity restored. Earlier same-day changes: PRD v1.11 (Round 25 reference-only reversal); v1.10 (Round 24 dependency recommendation); v1.9 (Round 23 OSS landscape).
- **Last propagation pass:** Round 20 (test docs + prototype updated to match Round 19).
- **Open work for Sprint 1 build:** None blocking. All Round 19 schema additions are forward-compatible with Sprint 1 scope.
- **Next likely build phase:** Sprint 2 — once Sprint 1 lands. Sprint 2 should be straightforward because Round 20 cleared the metadata-column ambiguity.
- **Next likely audit candidate:** Sprint 4 spec when written, or a real-build audit pass once Sprint 1 ships and reveals what the spec missed.
