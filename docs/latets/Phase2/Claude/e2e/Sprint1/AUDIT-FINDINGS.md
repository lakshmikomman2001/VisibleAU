# Phase 2 Sprint 1 E2E Tests — Clean Audit (Gate-2) Findings

**Audited:** the 15-file E2E suite for Phase 2 Sprint 1 (Platform Foundation).
**Against:** LLD v8.65 (verbatim re-read of the schema DDL ≈4771–4978, the platform-services
block ≈4980–5082, and the seed matrices) + Sprint 1 prompt v1.1.
**Method:** re-read each canonical section from disk and diffed every test assertion against it —
no reliance on memory or the prior summary.

**Verdict:** 4 conflicts found, **all fixed** in place. 4 advisory notes (not conflicts — things
the build/wiring must satisfy, already flagged inline + in the README). The remaining ~95% of the
suite matched canon exactly (the 7-table DDL, FK ON DELETE rules, RLS posture, the 7 quality-gate
thresholds, and the full 4-provider matrix including both boolean traps all verified correct).

---

## Pass 2 (latest run) — focus: the surfaces pass 1 didn't verify verbatim

Re-audited with fresh eyes, targeting what pass 1 hadn't checked line-by-line: the DDL for the
three remaining tables (`sampling_policies`, `metric_quality_gates`, `prompt_pack_coverage`) and the
harness/introspection mechanics. Also reviewed the Phase 2 prototype — confirmed **not implicated**:
Sprint 1 ships no UI, so no test depends on it.

**Result: no new canon conflicts.** An automated cross-check of every column name inserted by the
fixtures/tests against the verbatim DDL window (LLD 4760–4978) passed for **all 7 Phase 2 tables** —
the three previously-unchecked tables match column-for-column, and the metric-gate 7-row seed
(`composite` 3·2 and `citation_source` 5·2 included) is confirmed against the LLD verbatim. The only
names not in the Phase 2 DDL are the four Phase 1 `audits` columns the fixtures infer
(`brand_id`, `total_cost_usd`, `prompts_count`, `total_calls`) — the standing A-03 advisory, not a
conflict.

Two **harness robustness** issues were found and fixed:

- **F-05 · LOW · fragile FK introspection** (`schema-and-migration.e2e.test.ts`). The static
  ON-DELETE check compared `pg_constraint.conkey` to a hand-built `ARRAY[...]`, which can yield a
  false failure on array type/representation. Rewritten as a robust join
  (`JOIN pg_attribute … a.attnum = ANY(c.conkey) … a.attname = $column`). (The behavioural
  `fk-ondelete.e2e.test.ts` already covers the rule the strong way; this just hardens the static check.)
- **F-06 · LOW · experimental `fs.globSync`** (`_harness/test-db.ts`). Migration discovery used
  Node 22's experimental `globSync`, which breaks on older runtimes. Replaced with portable
  `readdirSync(MIGRATION_DIR).filter(/sprint1.*\.sql$/)`.

A-03 was sharpened: if `audits.brand_id` is NOT NULL in the Phase 1 schema, `insertAudit()` needs a
brand fixture — call out explicitly when wiring.

---

## Conflicts found and fixed (pass 1)

### F-01 · HIGH · `record()` unit mismatch — `budget-policy.service.e2e.test.ts`
**Canon (LLD ≈5009 + snapshot writer ≈4929):** `record()` "is called by refresh-audit.ts after
audit completion **with actual totalCostUsd**", and the writer computes
`actualCostCents: Math.round(audit.totalCostUsd * 100 / 0.65)`. So `record(auditId, actual)` takes
**USD dollars** and converts to AUD cents internally.
**Conflict:** the test passed already-converted **cents** (`record(id, 200)`, `record(id, 77)`) and
asserted on them. Against a correct implementation that treats the arg as USD, `200` would store
`round(200*100/0.65)=30769`, so the test would fail (or, worse, pass against a wrong build).
**Fix:** pass USD — `record(id, 1.30)` and assert `actual_cost_cents === round(1.30*100/0.65) === 200`;
the sample-skip case uses `record(id, 0.5)`.

### F-02 · HIGH · tier-divergence test: real bug + wrong layer — `budget-policy.service.e2e.test.ts`
**Canon (LLD ≈5006 caller):** `estimate({ ..., engineCount: TIER_ENGINES[tier].length })` — the
**caller (run-audit.ts) resolves the tier and passes `engineCount` in**. Plus
`market_ai_budget_policies` has `UNIQUE(market_code, segment, use_case)`.
**Conflict (two parts):**
1. The control helper inserted a *second* budget policy with the same `(AU_EN, smb, visibility)`
   tuple → guaranteed `UNIQUE` violation at runtime.
2. Because `engineCount` is supplied by the caller, the "reads `subscriptions.tier` not
   `organizations.tier`" decision happens in the **caller**, not inside `estimate()`. The
   service-level test could not prove it via `engineCount`, and comparing two different
   `engineCount` params proved nothing.
**Fix:** removed the duplicate-policy control. The service test now asserts only what `estimate()`
owns — a well-formed `CostEstimate` (`maxAllowedCents` = policy ceiling, `withinBudget` consistent,
`policyId` set), that cost scales with `engineCount`, and that `withinBudget` flips false under a
tight ceiling. The tier-source-of-truth proof was **moved to `phase1-unchanged.regression`** (which
drives run-audit, the layer that does the `audits→organizations→subscriptions` join), added as an
explicit adversarial case (`organizations.tier='free'` vs `subscriptions.tier='growth'` → run must
size for 4 engines, not 2).

### F-03 · MEDIUM · vacuous `config_digest` test — `config-bundle.service.e2e.test.ts`
**Conflict:** the test inserted two bundles with a *manually set, identical* `config_digest='X'`
and asserted they were equal — i.e. it asserted my own literal, exercising nothing about the
service's digest computation.
**Fix:** replaced with a `get()` round-trip that asserts the resolved bundle carries a **non-empty**
`config_digest` (it is `NOT NULL` and a stable hash of `resolved_config` per §6.1). The hash
algorithm itself is an impl detail; the change-detection behaviour is exercised end-to-end by the
`config:diff` path in `config-cli.e2e.test.ts`.

### F-04 · LOW · fragile `insertOrganization` SQL — `_harness/fixtures.ts`
**Conflict:** the optional `tier` column was spliced in with an inline conditional `sql` fragment
(`${tier !== null ? sql\`, tier\` : sql\`\`}`) — brittle and easy to mis-evaluate.
**Fix:** two explicit code paths; `tier` is now optional and omitted entirely when not provided
(so the helper works whether or not `organizations` carries a legacy `tier` column).

---

## Advisory notes (not conflicts — the build/wiring must satisfy these)

- **A-01 · `activate()` and `QualityGateService` are prompt-level additions.** The LLD "New
  services" class block (≈4983–5074) lists ConfigBundle/Budget/Sampling/Provider/Observability but
  **omits** `ConfigBundleService.activate()` and `QualityGateService` entirely. Both are mandated by
  the *prompt* (§5.1/§6.1 for `activate`; §6.6 + the audits-ALTER writer comment for QualityGate) —
  the sprint authority — so the tests assume them correctly. Flagging because the build must add
  both, and `activate(id)` must set the target bundle active *and* deactivate siblings in one
  transaction (it cannot assume the row is already active).
- **A-02 · `estimate()` policy-tuple resolution is underspecified.** Which `(market_code, segment,
  use_case)` row `estimate()` resolves for a given audit is not pinned down in the LLD. The test
  seeds `AU_EN/smb/visibility`; if the build resolves a different segment/use_case, seed to match
  (noted inline in the test).
- **A-03 · `audits`-table assumptions (RLS + columns).** If the Phase 1 `audits` table carries RLS
  like `audit_cost_snapshots`, the fixture `insertAudit()` (raw connection, no org context) may need
  a `withOrgContext` wrapper. Also, `insertAudit()` infers Phase 1 columns
  (`brand_id`, `total_cost_usd`, `prompts_count`, `total_calls`, `quality_status`); if `brand_id` is
  NOT NULL, add a brand fixture. Flagged at README seam #6.
- **A-04 · `ValidationResult` / `Provider` shapes are assumptions.** The LLD defines these "as
  needed"; the tests assume `{ valid: boolean }` and `{ providerKey }`. Adjust if the repo differs.

---

## What was re-verified as correct (no change needed)
7 tables created with exact column defaults (`max_models_per_audit=4`, `max_repeated_samples=5`, all
provider booleans + `is_enabled` default false); the `config_bundle_one_active` partial unique index;
the audits ALTER (4 nullable columns, `quality_status` default `'pending'`); both FK ON DELETE rules
(`audit_id` CASCADE, `budget_policy_id` SET NULL — v8.28); RLS enabled on `audit_cost_snapshots`,
disabled on the 6 config tables; MI-01 idempotency; the 7 metric-gate thresholds
(`frequency/sentiment/position/context` 10·2, `accuracy/citation_source` 5·2, `composite` 3·2); and
the full provider matrix including the two traps (`anthropic.supports_citations=false`,
`perplexity.supports_query_fan_out=false`) with `max_fan_out` 12/10/12/8.

*Version caveat unchanged: audited against v8.65 / S1 v1.1. If you hand me v8.68 / S1 v1.5 I'll
re-diff Sprint 1 and re-pin anything that moved.*
