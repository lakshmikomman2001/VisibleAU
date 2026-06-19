# VisibleAU Phase 2 — SPRINT 1 PROMPT: GATE 2 FINDINGS
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: visibleau-p2-sprint-1-prompt.md v1.0 (Platform Foundation)
# Canon used: visibleau-phase2-v8_65-complete-REVIEWED-r2 (LLD v8.65, 9,192 lines)
# Method: derived each check from the LLD directly; every cited line was opened, not trusted.

---

## 1. VERDICT — **PASS-WITH-FIXES**

The prompt is a faithful, high-quality translation of the LLD Sprint 1 section. Schema
fidelity is essentially perfect (all 7 tables + the audits ALTER reproduced verbatim,
including both FK ON DELETE rules and the partial unique index), the correctness rules are
enforced in spec + pitfalls + greps, the seeds and CLI match the LLD, and both builder
judgement calls (J1, J2) are correct. No HIGH defect exists in how the prompt reflects the
LLD's schema or logic.

It is PASS-WITH-FIXES, not PASS, because of five items below. **S1-01 is blocking** but is
NOT a prompt-logic defect — it is a marker-string mismatch introduced by the reviewer-side
r2 reconstruction of the lost REVIEWED bundle (see the finding; it is escalated to Sri, not
charged against the builder). S1-02 and S1-03 are genuine MODERATE prompt gaps; S1-04 is
LOW-MOD; S1-05 is informational.

---

## 2. FINDINGS

### S1-01 — [HIGH / BLOCKING] Attribution-marker grep will halt Claude Code
**Root cause: reviewer-side (lost-artifact reconstruction) — ESCALATED TO SRI, not a builder defect.**
- **Claim in the prompt:** §0.3 (and §0.3's STOP rule) tells Claude Code to run
  `grep -c "ATTRIBUTION CORRECTED IN CROSS-REVIEW" visibleau-7layer-lld.md` and expect `1`,
  else STOP with a "stale LLD" error. The Playbook §0 and the Reviewer Handoff §A1 use the
  same marker string.
- **What I checked:** the canonical LLD on record is the r2 reconstruction
  (`visibleau-phase2-v8_65-complete-REVIEWED-r2`). Its attribution marker reads
  **`ATTRIBUTION CORRECTION`** (LLD changelog, the v8.65 entry; and `ATTRIBUTION CORRECTION (r2)`
  in the bundled handoff) — `grep -c "ATTRIBUTION CORRECTED IN CROSS-REVIEW"` returns **0**.
- **Why it happened:** the original `…-REVIEWED.zip` (the builder's canon, which used the
  string `ATTRIBUTION CORRECTED IN CROSS-REVIEW`) was lost; the reviewer chat rebuilt it as
  r2 and chose a different marker string. The prompt is internally CONSISTENT with the
  builder's canon; the divergence is entirely on the r2 side.
- **Required fix (Sri's call — reviewer must not edit the LLD):** reconcile the marker so the
  three governance docs and the LLD agree. **Recommended:** align the canonical LLD's marker
  to **`ATTRIBUTION CORRECTED IN CROSS-REVIEW`** (the string the prompt, Playbook, and Handoff
  already standardise on — lowest blast radius, since only the r2 LLD diverges). Then §0.3
  passes unchanged. Alternative: change the marker in prompt §0.3 + Playbook §0 + Handoff §A1
  to `ATTRIBUTION CORRECTION` — three edits vs one, not preferred.

### S1-02 — [MODERATE] QualityGateService missing from the §4 tree; service count says 5, not 6
- **Claim in the prompt:** §1 states "**5** platform services (§6)" and lists five (Config,
  Budget, Sampling, Provider, Observability — QualityGate not named). The §4 PROJECT STRUCTURE
  tree under `lib/platform/` lists six files (the five services + `types.ts`) but **omits
  `quality-gate.service.ts`**. Yet §6.6 specifies QualityGateService and says "Place in
  `lib/platform/quality-gate.service.ts`," §10 step 3 lists "the **6** services in §6 …
  QualityGate," and the §4 tree already lists its test (`quality-gate.integration.test.ts`).
- **What I checked:** prompt §1, §4, §6.6, §10; grep confirms `quality-gate.service.ts`
  appears 0× in the §4 tree and 1× total (only §6.6). The audits ALTER (LLD 4964–4978, prompt
  cites 4960–4978) names QualityGateService as the writer of `quality_status`, so it IS built
  this sprint.
- **Why it matters:** Playbook §4.1 bans built files that are absent from the structure tree
  (the "Z1 disease"); the 5-vs-6 count is an internal contradiction. Because the LLD's "New
  services" block lists only five formal class signatures (QualityGate is described in prose
  only — see J2), it is *more* important, not less, that the prompt's own tree names it.
- **Required fix:** add `quality-gate.service.ts // §6.6` to the §4 `lib/platform/` tree, and
  change §1 to "**6** platform services" (or "5 services + QualityGateService"). No LLD change.

### S1-03 — [MODERATE] Migration idempotency (LLD MI-01, v8.29) only partially applied
- **Claim in the prompt:** §5.2 correctly uses `ADD COLUMN IF NOT EXISTS` on the audits ALTER
  (4×). But §5.1 (7 `CREATE TABLE`), §5.3 (the `config_bundle_one_active` unique index + the
  two `audit_cost_snapshots` btree indexes), and §5.4 (the `audit_cost_snapshots` RLS policy)
  are written as plain `CREATE TABLE` / `CREATE INDEX` / `CREATE POLICY`. Grep: `CREATE TABLE
  IF NOT EXISTS` = 0, `CREATE INDEX IF NOT EXISTS` = 0, `DROP POLICY IF EXISTS` = 0, and the
  prompt never mentions idempotency / MI-01 / re-run.
- **What I checked:** the LLD RLS-spec section (r2 ~8629) carries the **MI-01 fix (v8.29)**:
  the Phase 2 migration mixes idempotent ALTERs with non-idempotent statements, so a CI retry
  or resumed partial deploy crashes. It mandates making the **whole** migration re-runnable —
  `CREATE TABLE IF NOT EXISTS` (all 37 tables), `CREATE INDEX IF NOT EXISTS` (all 35 indexes),
  and — since Postgres has no `CREATE POLICY IF NOT EXISTS` — `DROP POLICY IF EXISTS "<name>"
  ON <table>;` before each `CREATE POLICY`. Sprint 1's migration creates 7 of those tables,
  the partial unique index, and the `org_isolation` policy on `audit_cost_snapshots`, so MI-01
  applies here. This section is inside Sprint 1's own context pack (master plan §8: "8626–8812
  RLS spec").
- **Required fix:** in §5.1 specify `CREATE TABLE IF NOT EXISTS` for all 7 tables; in §5.3
  specify `CREATE UNIQUE INDEX IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`; in §5.4 specify
  `DROP POLICY IF EXISTS "org_isolation" ON audit_cost_snapshots;` before the `CREATE POLICY`.
  Add a §12 grep, e.g. `grep -c "CREATE TABLE IF NOT EXISTS" db/migrations/*sprint1*.sql → 7`.
  Cite LLD MI-01 (v8.29). No LLD change.

### S1-04 — [LOW-MOD] Provider seed: per-row capability booleans under-specified
- **Claim in the prompt:** §5.5 lists the four AU_EN providers with their fan-out numbers
  (openai 12, anthropic 10, google 12, perplexity 8) and perplexity `supports_query_fan_out=
  false`, then says "**Use the documented capability flags per row** (LLD 4908–4916)." It does
  not reproduce the other three booleans (`supports_web_retrieval`, `supports_citations`,
  `supports_location_context`) per provider. Grep: `supports_citations` appears 0× in the prompt.
- **What I checked:** LLD seed block (r2 4917–4920). The positional booleans are
  web_retrieval / citations / location / fan_out:
  - openai/gpt-4o = true, true, true, true (fan-out 12)
  - **anthropic/claude-3-5-sonnet = true, FALSE, true, true (fan-out 10)** ← only row with citations=false
  - google/gemini-1.5-pro = true, true, true, true (fan-out 12)
  - perplexity/pplx-70b-online = true, true, true, FALSE (fan-out 8)
  All four columns DEFAULT false. The trap: `anthropic.supports_citations = false` is easy to
  miss, and "use the documented flags" leaves Claude Code to interpret rather than copy.
- **Why it matters:** Playbook §4.2 (verbatim over paraphrase) and §9.3 (paraphrased values
  that drift). A wrong `supports_citations` on anthropic would silently mis-route citation-
  dependent provider selection in later sprints.
- **Required fix:** reproduce the full 4-row × (4 booleans + max_fan_out) matrix inline in
  §5.5 (call out anthropic citations=false explicitly). No LLD change.

### S1-05 — [LOW / informational] Exact LLD line citations run +3 vs the r2 canon
- **Claim in the prompt:** §5.1 etc. cite exact lines, e.g. "config_bundle_cache (LLD 4777)",
  range "4760–5082".
- **What I checked:** in r2, `CREATE TABLE config_bundle_cache` is at line **4780** (+3); the
  Sprint 1 section header is at 4763; all anchors are uniformly +3 because the r2 changelog
  annotation added 3 net lines above the schema region. The citations were correct against the
  builder's canon.
- **Why it's only informational:** the Handoff and Playbook both instruct "open every cited
  line; the LLD wins," and §10 already writes "lines ~4760–5082" with a tilde. No build impact.
- **Optional fix:** when S1-01's marker is reconciled, either bump the exact anchors +3 or
  tilde-qualify them. Not required for correctness.

---

## 3. RULINGS ON THE TWO JUDGEMENT CALLS

- **J1 (RLS posture): CONFIRM — the prompt is correct.** The LLD RLS spec (r2 ~8629) lists
  **`audit_cost_snapshots` as the first of the 30 tenant tables requiring RLS** (FOR ALL,
  USING + WITH CHECK), and states global/seed tables stay RLS-DISABLED — precedent
  `citability_methods` + `validation_corpus_results` (LLD 8729). The prompt's posture (6
  config tables RLS-disabled with a documented header reason; `audit_cost_snapshots`
  RLS-enabled with USING + WITH CHECK on `organization_id`) matches the spec exactly. Math
  checks: 36 new tables − 6 global config = 30 tenant tables = the LLD's count.

- **J2 (QualityGateService in Sprint 1): CONFIRM — it belongs here.** The audits ALTER (added
  this sprint) names QualityGateService as the writer of `quality_status` (LLD 4970), it reads
  `metric_quality_gates` (seeded this sprint), and it is invoked by the Sprint 1
  `refresh-audit.ts` wiring. The LLD's "New services" block defines only five formal class
  signatures and describes QualityGateService in prose only, so §6.6 reasonably derives
  `evaluate(auditId)` from that prose — which is exactly why S1-02 (put it in the §4 tree)
  should be applied.

---

## 4. CLEAN (verified against the LLD — no issue; not manufacturing findings)

- **C1 schema fidelity:** all 7 tables + audits ALTER reproduce column names/types/defaults/
  constraints verbatim; `config_bundle_one_active` partial unique index present; FK ON DELETE
  CASCADE (audit_id) and SET NULL (budget_policy_id) both correct; `quality_status` DEFAULT
  'pending' with the 4-value enum. ✓
- **C2 correctness rules:** `subscriptions.tier` (not `organizations.tier`) appears in the
  §0.4 spec, the §13 pitfall, AND the §12 grep (the five `organizations.tier` hits are all
  negative/forbidding references). TIER_ENGINES governs engine counts and `max_models_per_audit`
  is correctly framed as a ceiling, not the Free=2 allowlist. The two sample knobs
  (`max_repeated_samples`/runsPerPrompt=5 vs `minimum_repeated_samples`=3) are disambiguated in
  §5.1 and §13. ✓
- **C3 seed values:** accuracy (5,2), composite (3,2), perplexity fan-out 8 with
  `supports_query_fan_out=false` — all match LLD 4863–4871 / 4917–4920. (See S1-04 re the other
  booleans.) ✓
- **C4 CLI + wiring:** `config:validate|coverage|diff` match LLD 5072–5076 verbatim; services
  wire into existing `run-audit.ts` (pre-flight `estimate()` + hard-stop) and `refresh-audit.ts`
  (`record()` + `QualityGateService.evaluate()`); Phase 1 scoring unchanged, guarded by
  `phase1-unchanged.regression.test.ts`. ✓
- **Types + events:** §6.0 reproduces all five interfaces (AuditParams, CostEstimate,
  BudgetPolicy, EnforcementResult, QualityLabel) verbatim; §6.5 lists all 17 ObservabilityService
  events. The two label systems are kept distinct and correct — `audits.quality_status`
  (pending/sufficient/insufficient/partial, QualityGateService) vs `QualityLabel`
  (Confirmed/Likely/Hypothesis/Insufficient data, SamplingPolicyService). ✓
- **C5 template/depth:** sections 0–14 + CHANGELOG all present; zero banned phrases
  ("implement similarly"/"etc."). The 458-line length is **below** the Playbook §3 ~900-line
  floor, but that floor is calibrated for UI-bearing sprints carrying §6U; Sprint 1 has no UI,
  no Inngest functions, and no API routes, so the absence of §6U/§7-8/§9 is correct and the
  lean length is acceptable — **not bounced on length**. (Applying S1-02/03/04 will naturally
  add the missing detail.) No §4.7 OPEN-QUESTIONS block is needed (Sprint 1 raised no
  ambiguities; master-plan Q1–Q4 do not touch Sprint 1). ✓
- **C7 nothing dropped:** the Executive Weekly AI Brief (LLD 4839–4857) is correctly NOT in
  Sprint 1 — the LLD itself defers it to Sprint 4 with no Sprint 1 schema impact. No other
  build-relevant Sprint 1 item is missing. ✓

---

## 5. NEXT STEP (per Reviewer Handoff §D)

Builder applies S1-02, S1-03, S1-04 (and optionally S1-05), bumps the prompt to **v1.1** with
a changelog entry, and only then is Sprint 1 ready to feed to Claude Code. **S1-01 must be
resolved by Sri first** (marker reconciliation — recommended: align the canonical LLD marker
to `ATTRIBUTION CORRECTED IN CROSS-REVIEW`), since until then Claude Code's §0.3 check halts
the build regardless of prompt quality.

— End of SPRINT1-FINDINGS.md
