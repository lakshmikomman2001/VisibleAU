# VisibleAU Phase 2 — SPRINT 1 PROMPT: GATE 2 FINDINGS (PASS 2 — fresh angle)
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: visibleau-p2-sprint-1-prompt.md **v1.1** (Platform Foundation)
# Canon used: visibleau-phase2-v8_65-complete-REVIEWED-r2 (LLD v8.65, 9,192 lines)
# Pass-1 angle: fidelity-to-LLD + correctness rules + template conformance (findings S1-01..05).
# Pass-2 angle (this doc): INTERNAL SELF-CONSISTENCY — the prompt checked against ITSELF
#   (cross-reference integrity, file/identifier/count consistency across all sections) plus
#   GREP EXECUTABILITY (every embedded §12 check actually run, not eyeballed). Edits are
#   exactly where this kind of drift appears, so v1.1's 45 new lines were the focus.

---

## 1. VERDICT — **PASS-WITH-FIXES** (one LOW-MOD item; otherwise clean)

Two things were done here: (a) confirm the v1.1 fixes for pass-1 findings S1-01..05 actually
landed correctly (not just trust the changelog), and (b) a genuinely different audit angle.

**(a) v1.1 fixes — ALL VERIFIED CORRECTLY APPLIED:**
- **S1-01 (marker) — mitigated, works.** §0.3 now runs
  `grep -cE "ATTRIBUTION CORRECT(ED IN CROSS-REVIEW|ION)"` expecting ≥1. I confirmed this
  regex matches the r2 canon's actual marker `ATTRIBUTION CORRECTION` → the §0.3 STOP-check
  no longer blocks the build. The note that Sri may still reconcile the two copies to one
  marker is retained. Good.
- **S1-02 (service count + tree) — applied.** §1 now reads "6 platform services … and quality
  gate (… §6.6)"; the §4 `lib/platform/` tree now contains `quality-gate.service.ts`; this is
  consistent with §6.6, §10 ("the 6 services"), and the §11 test list. Verified.
- **S1-03 (MI-01 idempotency) — applied AND executable.** A MIGRATION IDEMPOTENCY block was
  added after the §5 intro; §5.3 says write every index as `CREATE [UNIQUE] INDEX IF NOT
  EXISTS`; §5.4 says precede the policy with `DROP POLICY IF EXISTS "org_isolation" ON
  audit_cost_snapshots;`; and §12 gained three greps. The LLD anchor it cites (~8642–8652) is
  accurate — MI-01 is at LLD line 8645. Verified.
- **S1-04 (provider matrix) — applied, exactly as requested.** §5.5 now carries the full
  4-row × (4 booleans + max_fan_out) matrix inline and explicitly flags **anthropic
  `supports_citations=FALSE`**, with a dedicated §12 grep. Verified against LLD 4917–4920.
- **S1-05 (anchors) — applied.** The header now states line numbers are navigational/
  approximate. Verified.

**(b) Fresh-angle (internal consistency + grep executability) — essentially clean:**
- **Cross-references:** every internal `§N`/`§N.M` reference in the prompt resolves to a real
  section (checked all of §0,0.3,0.4,4,5,5.1–5.5,6,6.0–6.6,7,8,10,11,12,14 against the actual
  header set 0–14). No dangling references. `§8626`/`§8642` are correctly used as LLD line
  anchors, not section refs.
- **File/identifier consistency:** the §4 tree (7 schema + 6 services + types + 4 CLI + 6
  tests) matches §6 (all six services specified, incl. the `.registry.ts` naming for the
  provider one), §11 (all six tests), and §12 (greps). No built-but-untreed file, none
  treed-but-unspecified, none tested-but-absent. (S1-02's gap is fully closed.)
- **Counts:** "7 tables", "6 platform services", "4 providers" are consistent everywhere; the
  §6.5 ObservabilityService event list is **17 events, byte-identical to the LLD set** (diff
  empty) — no event lost in the v1.1 editing.
- **Grep executability:** I built a migration + seed exactly as §5 specifies and ran all seven
  §12 greps verbatim. Results: G1 `CREATE TABLE (IF NOT EXISTS )?(7 names)`=7 ✓; G2 `CREATE
  TABLE IF NOT EXISTS`=7 ✓; G3 `CREATE [UNIQUE] INDEX IF NOT EXISTS`=3 (≥3) ✓; G4 `DROP POLICY
  IF EXISTS`=1 (≥1) ✓; G5 `ADD COLUMN IF NOT EXISTS`=4 ✓; G6 `ON DELETE (CASCADE|SET NULL)`=2
  ✓; G7 anthropic-citations-false trap=1 (≥1) ✓. All regexes are syntactically valid and
  return their claimed counts.

It is PASS-WITH-FIXES only because of S1P2-01 below (a real internal inconsistency carried
over from v1.0, surfaced by this angle), plus one optional LOW hardening note.

---

## 2. NEW FINDINGS (pass 2)

### S1P2-01 — [LOW-MOD] Phase 1 wiring target is named two different ways
- **Internal inconsistency:** §0.2 ("Files to have open") lists the Phase 1 file as
  **`lib/audit/runner.ts`**. But every place the prompt actually specifies the pre-flight
  wiring names it **`run-audit.ts`**: the §5 sampling design note ("Phase 1 `run-audit.ts`
  always uses runsPerPrompt=5"), §6.2 ("**Caller:** `run-audit.ts` calls `estimate()`"), §8
  ("`run-audit.ts` calls `BudgetPolicyService.estimate()` pre-flight"), and §10 step 4 ("Wire
  the services into the EXISTING Phase 1 `run-audit.ts`"). The string `lib/audit/runner.ts`
  appears **once, in §0.2, and nowhere else**.
- **What I checked:** grep of the prompt (5 `run-audit.ts` hits across §5/§6.2/§8/§10 vs 1
  `lib/audit/runner.ts` hit in §0.2); the LLD's canonical name is `run-audit.ts` (LLD line
  5004: "CALLER: run-audit.ts calls estimate()"). `refresh-audit.ts` is named consistently
  everywhere (§0.2, §5.1, §6.2, §8, §10) — only the pre-flight target diverges.
- **Why it matters:** the trickiest part of this backend sprint is modifying *existing* Phase
  1 files. §0.2 sends the builder to open one filename; the build steps then modify a
  differently-named file, with no statement that they are the same artifact. A builder could
  open/modify the wrong (or a non-existent) file.
- **Required fix:** align §0.2 to name **`run-audit.ts`** (alongside `refresh-audit.ts`, which
  is already there) — the actual files the sprint modifies. If `lib/audit/runner.ts` is a
  genuinely distinct Phase 1 library that the `run-audit.ts` Inngest function calls, state that
  relationship explicitly in §0.2 so the two names are reconciled. No LLD change; this is a
  prompt-internal naming fix (v1.2).

### S1P2-02 — [LOW / optional hardening] §10 paste-block omits the MI-01 idempotency callout
- **Observation:** §0 instructs the operator to "paste §10 into a fresh Claude Code session,"
  and §10 step 1 already enumerates specific migration must-dos ("copy … exactly, including the
  `config_bundle_one_active` partial unique index and the two FK ON DELETE rules"). It does
  **not** restate the MI-01 idempotency requirement (`CREATE TABLE/INDEX IF NOT EXISTS`, `DROP
  POLICY IF EXISTS`) that v1.1 just added in §5. It is covered indirectly — §10 points to §5
  (which §0 says Claude Code follows) and tells Claude Code to run the §12 greps (which would
  fail loudly if idempotency were skipped) — so this is not a correctness gap, only a
  self-containment one against playbook §3.10.
- **Optional fix:** add a clause to §10 step 1, e.g. "make the migration re-runnable per MI-01:
  `CREATE TABLE/INDEX IF NOT EXISTS` and `DROP POLICY IF EXISTS` before the policy." Brings the
  paste-block to parity with the other migration callouts it already lists. Not required for a
  correct build.

---

## 3. RULINGS (unchanged from pass 1; v1.1 made no change to either)

- **J1 (RLS posture): CONFIRM.** `audit_cost_snapshots` RLS-enabled (USING + WITH CHECK on
  `organization_id`); the 6 config tables RLS-disabled per the `citability_methods` /
  `validation_corpus_results` precedent (LLD 8729). Matches the LLD RLS spec; 36 new − 6 config
  = 30 tenant tables.
- **J2 (QualityGateService in Sprint 1): CONFIRM.** Writer of `audits.quality_status` (added
  this sprint), reads `metric_quality_gates` (seeded this sprint), invoked by the Sprint 1
  `refresh-audit.ts` wiring. Now correctly present in the §4 tree (S1-02 fix).

---

## 4. CLEAN (verified this pass — not manufacturing findings)

- All five pass-1 fixes (S1-01..05) verified correctly applied, including the either-marker
  regex actually matching the r2 canon and all new §12 greps actually executing.
- Internal `§`-reference integrity: every reference resolves; no dangling section. ✓
- File/identifier consistency across §4 tree / §6 specs / §10 steps / §11 tests / §12 greps:
  complete, no orphans either direction. ✓
- Numeric consistency (7 tables / 6 services / 4 providers / 4 ALTER columns) across the whole
  prompt; §6.5 = 17 ObservabilityService events, identical to the LLD. ✓
- §12 grep battery: all 7 greps syntactically valid and returning the claimed counts against a
  prompt-faithful migration + seed. ✓
- §7 CLI commands (validate/coverage/diff) ↔ §4 CLI files (index + 3 commands). ✓
- §14 handoff (Sprint 2 owns tables 29–31: remediation_tasks, workflow_runs, content_drafts)
  matches the master-plan table-ownership map. ✓
- MI-01 LLD anchor (~8642–8652) accurate (spec at LLD 8645). ✓

---

## 5. NEXT STEP

Two prompt-internal fixes, no LLD change required:
- Apply **S1P2-01** (align the §0.2 Phase 1 filename to `run-audit.ts`, or reconcile the two
  names) — LOW-MOD, the one item worth a v1.2 bump.
- Optionally apply **S1P2-02** (restate MI-01 in §10) — LOW.

With S1P2-01 applied and S1-01's marker reconciled at the canon level (still Sri's call), the
Sprint 1 prompt is ready to feed to Claude Code. This was a near-clean pass: the v1.1 revision
correctly absorbed every pass-1 finding, and the fresh internal-consistency angle surfaced only
one real (low-mod) naming inconsistency.

— End of SPRINT1-FINDINGS-PASS2.md
