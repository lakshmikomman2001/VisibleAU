# VisibleAU Phase 2 — REVIEWER HANDOFF: SPRINT 1 PROMPT (Gate 2)
# Date: June 2026 | Written by: the BUILDER chat (original chat)
# Reviewing: visibleau-p2-sprint-1-prompt.md v1.0 (Platform Foundation)

YOUR ROLE. Independent reviewer of a SPRINT PROMPT before it is fed to Claude Code to
build ~4 weeks of Phase 2 work. The builder wrote this prompt from the LLD; your job is to
catch anything that would make Claude Code build the wrong thing. Derive your own view from
the LLD first, then compare — never accept a cited line number without opening it.
Respond in English only (Telugu only if Sri explicitly asks).

NOTE ON PROCESS: there is no separate master-plan Gate 1 ruling in front of you — Sri has
chosen to review prompt-by-prompt directly. That is fine; just apply the checks below to
this prompt on its own merits against the LLD.

---

## SECTION A — VERIFY INPUTS (run BEFORE reviewing; STOP on failure)

You should have TWO zips from Sri:

A1. visibleau-phase2-v8.65-complete-REVIEWED.zip (canon)
    • grep -m1 "^# Version:" visibleau-7layer-lld.md → "# Version: 8.65 | Date: June 2026"
    • grep -c "ATTRIBUTION CORRECTED IN CROSS-REVIEW" visibleau-7layer-lld.md → 1
      (without this marker the LLD is stale — STOP)
    • Read the bundled handoff's Section D (locked facts) and F (do-not-fix) — binding.

A2. visibleau-p2-sprint1-review-bundle.zip (under review)
    • visibleau-p2-sprint-1-prompt.md (v1.0) — the deliverable
    • visibleau-p2-SPRINT-PROMPT-PLAYBOOK-v1.0.md — the standard (§3 template, §4 specs,
      §7 reviewer checklist, §9 anti-patterns)
    • SPRINT-MASTER-PLAN.md — context: Sprint 1 owns tables 1–7, 0 Inngest functions,
      no UI; §7 of the plan is the shared conventions block this prompt must echo.

---

## SECTION B — WHAT SPRINT 1 IS (so you can judge scope)
Platform Foundation: backend-only guardrails (cost/quality/config) that every later sprint
depends on. 7 new tables (config_bundle_cache, market_ai_budget_policies, sampling_policies,
metric_quality_gates, prompt_pack_coverage, provider_market_capabilities,
audit_cost_snapshots) + a nullable `audits` ALTER; 6 services; 2 mandatory seeds; a config
CLI. No UI, no new Inngest functions, no API routes. LLD authority: lines 4760–5082.

---

## SECTION C — GATE 2 CHECKS (your task)

C1. SCHEMA FIDELITY (the highest-value check). For each of the 7 tables and the audits
    ALTER, open the LLD definition (anchors are in the prompt §5) and confirm the prompt
    reproduces column names, types, defaults, and constraints EXACTLY — no drift, no
    omission, no invented column. Specifically verify:
    • config_bundle_cache: the partial unique index `config_bundle_one_active … WHERE
      is_active = true` is present (LLD 4790).
    • market_ai_budget_policies: max_models_per_audit DEFAULT 4, max_repeated_samples
      DEFAULT 5, max_fan_out_sub_queries DEFAULT 12 (LLD 4799–4811).
    • audit_cost_snapshots: audit_id ON DELETE CASCADE; budget_policy_id ON DELETE SET
      NULL (LLD 4940, 4953).
    • audits ALTER: all 4 columns, quality_status DEFAULT 'pending' (LLD 4960–4964).

C2. THE CORRECTNESS RULES. Confirm the prompt enforces:
    • subscriptions.tier (NOT organizations.tier) for all budget/quality reads (LLD
      4992–4995) — in the spec, the pitfalls, AND a verification grep.
    • TIER_ENGINES governs engine counts; max_models_per_audit is a ceiling, not the
      Free=2 allowlist (LLD 4799–4806). No hardcoded engine list.
    • the two sample knobs are disambiguated: runsPerPrompt=5 (Phase 1, unchangeable) vs
      minimum_repeated_samples=3 (Phase 2 aggregation) (LLD 4807, 4815).
    • both seeds (metric_quality_gates 7 rows; provider_market_capabilities 4 rows) are
      mandatory and match the LLD enumerations (LLD 4851–4861, 4908–4916).

C3. SEED VALUES. Spot-check 3–4 seed rows against the LLD: e.g. accuracy(5,2),
    composite(3,2); perplexity supports_query_fan_out=false with fan-out 8.

C4. CLI + WIRING. config:validate/coverage/diff match LLD 5076–5082; the services wire
    into EXISTING run-audit.ts (pre-flight estimate + hard-stop) and refresh-audit.ts
    (record + QualityGateService.evaluate) without changing Phase 1 scoring.

C5. TEMPLATE + DEPTH (Playbook §3, §4). All sections 0–14 present; no unspecified files
    ("implement similarly" is banned, §9.1); verification greps (§12) runnable; Claude
    Code block (§10) self-contained.

C6. JUDGEMENT CALLS — the builder flagged two; rule on each:
    • J1 (RLS, prompt §5.4): the 6 global config tables are RLS-DISABLED (no
      organization_id; precedent = citability_methods, LLD ~8726), only
      audit_cost_snapshots is RLS-ENABLED. Confirm or correct against the LLD RLS spec
      (§8626).
    • J2 (QualityGateService scope): the builder placed it in Sprint 1 because the audits
      ALTER names it as the writer of quality_status (LLD 4965). Confirm it belongs here.

C7. ANYTHING MISSING from the LLD Sprint 1 section (4760–5082) that the prompt omits —
    e.g. the Executive Weekly AI Brief note (LLD 4834–4849) is correctly deferred to
    Sprint 4 (it says so); confirm nothing build-relevant to Sprint 1 was dropped.

---

## SECTION D — FINDINGS FORMAT (send back)
Produce SPRINT1-FINDINGS.md:
1. Verdict: PASS / PASS-WITH-FIXES / FAIL.
2. Numbered findings S1-01, S1-02, … : severity (HIGH/MOD/LOW), the claim in the prompt,
   the LLD line you checked, the required fix.
3. Rulings on J1 and J2 (one line each).
4. A clean pass is valid — do not manufacture findings; say "clean" where clean.
Zip it for Sri. The builder applies fixes, bumps the prompt to v1.1 with a changelog note,
and only then is Sprint 1 ready to feed to Claude Code.

## SECTION E — WHAT YOU MUST NOT DO
• Do not edit the prompt, LLD, prototype, or plan — findings go back through Sri.
• Do not generate Sprint 2 (builder's job).
• Do not bump any version; a genuine LLD gap is escalated to Sri, not patched here.
• Do not re-litigate handoff §F do-not-fix items.

— End of reviewer handoff. Run Section A, then Gate 2 per Section C.
