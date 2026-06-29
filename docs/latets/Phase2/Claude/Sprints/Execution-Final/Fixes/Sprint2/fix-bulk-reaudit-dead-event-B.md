# Claude Code — FIX: agency bulk re-audit is quadruply broken (B) — sequential `runAuditInline`

This is the LAST of the four `audit/start` dead-event functions. `bulk-reaudit-orchestrate.ts` (the agency
"re-audit all brands" action) has **never worked since it was built.** Diagnosis found FOUR compounding bugs:

1. **Dead event** — emits `"audit/start"` (slash) per brand; the real audit runner listens on `"audit.run"` (dot)
   with `{ auditId }`. The events go nowhere.
2. **No audit row created** — sends a bare `{ brandId, organizationId, triggeredBy, bulkOperationId }` payload; no
   `audits` row exists, so even with the right event the runner would crash (no auditId to look up).
3. **No quota gate** — the bulk fan-out bypasses `checkQuota` entirely. An agency clicking "re-audit all brands"
   could blow through audit limits / cost with no guard.
4. **Field-name mismatch** — the API route (`app/api/agency/bulk-reaudit/route.ts`) sends **`operationId`**, but
   the function destructures **`bulkOperationId`** → always `undefined` → the mark-running / mark-complete steps
   update NOTHING (they can't find the bulk-operation row).

**DECISION (Sri): SEQUENTIAL execution** — re-audit brands one at a time via `runAuditInline`, quota-checked per
brand. Safe by construction (can't blow limits or fan out uncontrolled); slower for large agencies is acceptable
since this feature is dormant. Do NOT do concurrent `audit.run` fan-out.

The fix reuses the SAME proven pattern as `trigger-validation-reaudit.ts` and the just-fixed
`audit-schedules-cron.ts` / `schedule-workflow-runs.ts` (create audit row → `runAuditInline`), applied per brand
in a loop, plus fixes the quota gap and the field mismatch.

> **Investigate-first. Report before applying.** Read:
> - `inngest/functions/bulk-reaudit-orchestrate.ts` — current structure: how it iterates brands, the dead
>   `inngest.send(brandIds.map(...))`, the mark-running/mark-complete steps, and which field it destructures
>   (`bulkOperationId`).
> - `app/api/agency/bulk-reaudit/route.ts` — confirm the field it ACTUALLY sends (`operationId`?) and the
>   bulk-operation row it creates (table name, id column, status columns). This is the source of the mismatch.
> - The bulk-operation tracking table (whatever stores the bulk op + per-brand progress) — its schema, so
>   mark-running/mark-complete update the right row by the right id.
> - `trigger-validation-reaudit.ts` + `audit-schedules-cron.ts` (already fixed) — the canonical pattern to copy:
>   `getNextAuditNumber(orgId, tx)` → create `audits` row (triggered_by + metadata link) in a transaction →
>   `runAuditInline(auditId)`. And `checkQuota(orgId, brandId)` as the gate.
> Report: the field mismatch (what API sends vs what function reads), the bulk-op table/columns, and confirm the
> per-brand loop structure — then apply.

---

## THE FIX

### 1. Fix the field-name mismatch (Bug 4) — pick ONE canonical name
- Align the function and the API route on a single field. Either rename the function's destructure to
  **`operationId`** (to match what the route sends) OR rename the route's payload to `bulkOperationId` — whichever
  is less invasive. **Report which you chose.** After this, mark-running / mark-complete must successfully find
  and update the bulk-operation row (verify the id actually resolves, not `undefined`).

### 2. Per brand, sequentially (Bugs 1 + 2 + 3):
For each brandId in the bulk operation, in sequence (not a concurrent fan-out):
- **Quota gate (Bug 3):** call `checkQuota(orgId, brandId)` BEFORE auditing that brand. If over quota, do NOT
  audit that brand — record it as skipped/deferred in the bulk-op progress (mirror the
  `markReauditDeferred('quota_exceeded')` spirit: never silently drop; surface it in the bulk result). Continue to
  the next brand. (Per-brand quota is the whole point of sequential — one over-quota brand must not abort the rest
  or blow the limit.)
- **Create audit row (Bug 2):** in a transaction, `getNextAuditNumber(orgId, tx)` → insert `audits` row with
  `triggered_by: 'bulk_reaudit'` (match existing audits.triggered_by enum — report the value used) and metadata
  linking to the bulk operation (e.g. `{ bulkOperationId }`) + the brand.
- **Run the audit (Bug 1):** `runAuditInline(auditId)` — synchronous, one brand at a time. Remove the dead
  `audit/start` emit entirely.
- **Update per-brand progress** on the bulk-operation row as each brand completes/fails/skips, so mark-running →
  mark-complete reflect reality across the sequence.

### 3. Bulk-operation bookkeeping
- mark-running at the start, per-brand progress as the loop runs, mark-complete when all brands are done (with a
  summary: N audited, M skipped-over-quota, K failed). These steps must now actually update the row (Bug 4 fixed).
- Use Inngest steps appropriately so the sequence is replay-safe (each brand's create+run can be its own step, or
  a step per brand — match the existing function's step granularity where sensible).

## INVARIANTS — do not violate
- **Sequential only** — `runAuditInline` per brand, one at a time. NO concurrent `audit.run` fan-out. (Sri's
  decision; the whole risk being mitigated is uncontrolled fan-out / quota blowout.)
- `audit.run` (dot) + `{ auditId }` is the contract; an audit ROW must exist before any audit runs. Never emit
  `audit/start` again.
- **`checkQuota` per brand is now MANDATORY** — this was the missing gate; every audit-firing path goes through it
  (Sprint 9 rule). Over-quota brands are skipped+recorded, never silently dropped, never abort the batch.
- Match the audit-row creation EXACTLY as the reaudit / schedules fixes do (`getNextAuditNumber`, transaction,
  `triggered_by`, metadata link) — consistency across all four audit-firing paths.
- Do NOT change the audit pipeline, scoring, or `runAuditInline` — reuse as-is. Do NOT regress the three
  already-fixed functions.
- One canonical field name end-to-end (route ↔ function) — no more `operationId`/`bulkOperationId` divergence.

## VERIFY
This feature is dormant (likely no prior successful runs), so exercise it deliberately:
1. From the agency bulk page (`app/(auth)/agency/bulk/page.tsx`) or by POSTing to `app/api/agency/bulk-reaudit/
   route.ts`, kick off a bulk re-audit across ≥2 brands (include Bondi + one other agency brand).
2. Confirm the API creates a bulk-operation row and the function receives the matching id (NOT undefined — Bug 4):
   ```bash
   psql "$DATABASE_URL" -c "SELECT * FROM <bulk_operation_table> ORDER BY created_at DESC LIMIT 1;"
   ```
   (use the real table name from investigation). The row's status should progress running → complete (not stay
   stuck because the id was undefined).
3. Inngest Runs: `bulk-reaudit-orchestrate` runs → for EACH brand: quota checked → audit row created →
   `runAuditInline` runs → completes, sequentially. No `audit/start` events. Each brand's audit appears and
   completes one after another.
4. DB confirms audits actually ran per brand:
   ```bash
   psql "$DATABASE_URL" -c "SELECT id, brand_id, triggered_by, status, audit_number, created_at FROM audits WHERE triggered_by = 'bulk_reaudit' ORDER BY created_at DESC LIMIT 5;"
   ```
   → one `triggered_by='bulk_reaudit'`, `status='complete'` row per audited brand.
5. Quota-skip path (if testable): force one brand over quota → it's skipped + recorded in the bulk result, the
   batch continues for the others, limit not exceeded.
6. No dead emit remains: `grep -rn "audit/start" inngest/functions/bulk-reaudit-orchestrate.ts` → empty. And
   confirm `grep -rn "audit/start" inngest/` is now EMPTY across ALL functions (this was the last emitter).
7. Full suite green; only the known pre-existing `audit_cost_snapshots` red — no new failures.

## REPORT
- The field mismatch resolved (what API sent vs function read; which name you standardized on) + proof the id now
  resolves (mark-running/complete actually update the row).
- Per-brand pattern: quota gate added, audit-row creation (`triggered_by='bulk_reaudit'` + metadata), sequential
  `runAuditInline`, dead emit removed.
- Behavioural proof: bulk run across ≥2 brands → bulk-op row progresses running→complete → one
  `triggered_by='bulk_reaudit'` audit per brand at `status='complete'`, fired sequentially. Quota-skip behaviour
  if exercised.
- **Confirm `grep -rn "audit/start" inngest/` is EMPTY** — all four functions now clean (this closes the saga).
- Confirm invariants: sequential only, `audit.run`+`{auditId}`, audit row before run, per-brand quota mandatory,
  consistent field name, three prior fixes not regressed. Suite green.

## NOTE — the saga is closed after this
With (B) fixed, all four functions that inherited the canonical `audit/start` bug are corrected:
trigger-validation-reaudit ✅, audit-schedules-cron ✅, schedule-workflow-runs ✅, bulk-reaudit-orchestrate (this).
The remaining loose end is the LLD/canon correction (the `audit/start` references that caused all four) — that's
a separate doc-hygiene prompt, not a code change.
