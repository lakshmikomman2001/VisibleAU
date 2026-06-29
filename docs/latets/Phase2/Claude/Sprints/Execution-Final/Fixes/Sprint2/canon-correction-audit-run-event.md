# Claude Code — CANON CORRECTION (docs only, no source): replace the wrong `audit/start` contract

This closes the root cause of the `audit/start` saga. Four Inngest functions inherited a dead-event bug because
the **canon itself specified the wrong event name.** Ground truth (now proven in code + on real data):

- **TRUE contract:** the audit runner listens on **`audit.run`** (dot), payload **`{ auditId }`**, and an `audits`
  ROW must be created BEFORE the event/run. The working path (`POST /api/audits`) does exactly this, and all four
  functions were fixed to match it (create audit row → `runAuditInline(auditId)`).
- **WRONG, in canon:** the LLDs and several docs say the event is **`audit/start`** (slash) and describe functions
  "firing `audit/start`" — which nothing listens for. This is the spec error that propagated into every consumer.

**This is a DOCUMENTATION-ONLY task. Do NOT modify any source files** — the code is already correct. The goal is
to make canon match the verified implementation so a future rebuild does not reintroduce the bug.

The string `audit/start` appears in **13 .md files** (~30 occurrences in the Phase 2 LLD, ~15 in the Phase 1 LLD,
plus scattered references). Do NOT blind find-replace — some are inside historical CHANGELOG/CONFLICT entries that
document *what happened* and should be annotated, not silently rewritten. Tier the work:

---

## TIER 1 — Spec-of-record (MUST fix precisely; these get rebuilt from)
These are the authoritative contracts. Correct the event name AND state the full pattern (audit row → `audit.run`
+ `{ auditId }`):

**`phase-2/01-lld/visibleau-phase2-7layer-lld-v8.69.md`** and **`phase-1/02-lld/visibleau-phase1-7layer-lld.md`**
(the same content appears in both — fix both consistently):
- The `triggerValidationReaudit` skeleton + QUOTA NOTE block (Phase 2 LLD ~lines 8227–8265; Phase 1 LLD
  ~7479–7517). Every `'audit/start'` → the correct pattern. The skeleton comment "fires 'audit/start'" must become
  "creates an audit row (getNextAuditNumber, triggered_by) then runs via `runAuditInline(auditId)` (or sends
  `'audit.run'` with `{ auditId }`)". Keep the quota gate language intact — only the event/firing mechanism is
  wrong.
- The CONFLICT D-05 entry (Phase 2 ~3804–3806; Phase 1 ~3143–3145). This currently states the FALSE canon:
  *"Phase 1 canonical: audit/start fires run-audit.ts + technical-audit-run.ts in parallel"*. This is the line
  that caused the whole bug. **Correct it** to the true contract (`audit.run` + `{ auditId }` + audit row first),
  and ADD a dated correction note explaining the prior text was wrong and that four functions
  (trigger-validation-reaudit, audit-schedules-cron, schedule-workflow-runs, bulk-reaudit-orchestrate) were fixed
  to match `audit.run`. (Annotate, don't erase the history — same convention as other CONFLICT fixes.)
- The QUOTA-NOTE / D-05 references at Phase 2 ~1325, ~2155–2167, ~3762; Phase 1 ~664, ~1494–1506, ~3101. Where
  these say "fire 'audit/start'", correct to the real firing mechanism. The quota REQUIREMENT itself stays —
  checkQuota before any audit firing is still locked; only "audit/start" as the event is wrong.

**`phase-1/01-foundational/visibleau-foundations-v1.12.md`** and
**`phase-1/01-foundational/visibleau-architecture-overview-v1.6.md`**:
- Wherever the event flow / Inngest event catalog names `audit/start`, correct to `audit.run` + note the
  audit-row-first requirement. These are foundational references rebuilds lean on — get them right.

## TIER 2 — Sprint prompts (correct the contract; lighter touch)
`phase-2/03-sprint-prompts/visibleau-p2-sprint-2-prompt.md`, `...-sprint-3-prompt.md`, `...-sprint-7-prompt.md`,
`phase-1/04-sprint-prompts/sri-visibleau-sprint-7/9/10-prompt.md`:
- These are historical build instructions. Where they instruct firing `audit/start`, correct the event name to
  `audit.run` + `{ auditId }` so anyone re-running them builds it right. A brief inline note ("corrected from
  audit/start — see D-05") is enough; no need to restructure the prompts.

## TIER 3 — Runbooks / enhancement docs (annotate)
`phase-1/07-fixes-billing-agency/visibleau-cron-fires-schedule-runbook.md`,
`...schedule-time-of-day-enhancement.md`, `...-RECONCILED.md`:
- These describe operational behaviour. Add a correction note at the relevant spot: the schedule cron was firing a
  dead `audit/start`; it now creates an audit row and runs via `audit.run`/`runAuditInline`. Don't rewrite the
  whole runbook — annotate so it's accurate.

---

## EXACT REPLACEMENT CONTRACT (use this wording for the corrected spec)
Wherever the canonical mechanism is described, it should read (adapt phrasing to context):

> **Audit firing contract:** To run an audit, create an `audits` row first (`getNextAuditNumber(orgId, tx)` in a
> transaction, set `triggered_by` + metadata), then either call `runAuditInline(auditId)` (synchronous — used by
> the re-audit, schedule cron, workflow scheduler, and bulk re-audit) OR send the Inngest event **`audit.run`**
> with payload **`{ auditId }`** (the listener in `run-audit.ts`). The event name is **`audit.run`** (dot), NOT
> `audit/start`. `checkQuota(orgId, brandId)` MUST gate every audit firing (Sprint 9 rule) — unchanged.

## INVARIANTS — do not violate
- **DOCS ONLY.** No source file changes. The four functions are already correct; this only aligns canon to them.
- Do NOT blind find-replace. Spec lines (Tier 1) get the full corrected contract; historical CHANGELOG/CONFLICT
  entries get annotated with a dated correction, preserving the record of what happened (house style).
- Do NOT weaken any quota language — `checkQuota` before audit firing stays locked everywhere. Only the event
  name / firing mechanism (`audit/start` → audit-row + `audit.run`/`runAuditInline`) is being corrected.
- Keep both LLDs consistent with each other (the D-05 / skeleton / QUOTA-NOTE content is duplicated across them).
- Bump the Phase 2 LLD version header + add a CHANGELOG entry for this canon correction (it's a real spec change),
  per the existing versioning convention. Note the prototype is unchanged (no prototype edit).

## VERIFY
1. The TRUE contract is now stated in both LLDs' D-05 entry, the triggerValidationReaudit skeleton/QUOTA-NOTE, and
   Foundations/Architecture event catalog: `audit.run` + `{ auditId }` + audit-row-first.
2. No spec-of-record location still presents `audit/start` as the correct/canonical event (historical entries may
   reference it ONLY within an annotated "this was wrong, corrected to audit.run" note).
3. `grep -rn "audit/start" phase-2/01-lld phase-1/02-lld phase-1/01-foundational` → any remaining hits are inside
   explicit correction/CHANGELOG annotations, not live contracts. (Report the remaining lines + confirm each is an
   annotation, not a live spec.)
4. Tier 2 sprint prompts: instructions corrected to `audit.run`.
5. LLD version header bumped + CHANGELOG entry added describing the audit/start → audit.run canon correction and
   listing the four functions it affected.

## REPORT
- Per tier: which files/lines you changed and how (corrected contract vs annotation).
- The exact corrected wording used for the D-05 entry + the skeleton/QUOTA-NOTE.
- `grep -rn "audit/start"` result across the spec-of-record files, with confirmation that any survivors are
  annotations not live contracts.
- The new LLD version number + CHANGELOG entry text.
- Confirm: docs only (no source touched), quota language preserved, both LLDs consistent.
