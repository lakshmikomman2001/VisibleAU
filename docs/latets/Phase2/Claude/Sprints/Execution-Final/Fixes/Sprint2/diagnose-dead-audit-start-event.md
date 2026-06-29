# Claude Code — DIAGNOSE (report-first, NO fixes yet): the dead `audit/start` event in 3 more functions

While testing the Sprint 2 re-audit→lift loop, we found `triggerValidationReaudit` emitted `"audit/start"` but the
audit runner listens on `"audit.run"` — so the event went nowhere (the re-audit never fired). That was fixed for
the reaudit. BUT the same dead-event pattern was flagged in THREE other functions:
- `inngest/functions/schedule-workflow-runs.ts` (Phase 2 workflow runs — fires scheduled audits)
- `inngest/functions/bulk-reaudit-orchestrate.ts` (agency bulk re-audit action)
- `inngest/functions/audit-schedules-cron.ts` (**Phase 1 scheduled-audits cron**)

**This is potentially serious and bigger than Sprint 2.** If `audit-schedules-cron.ts` has the identical bug, then
**Phase 1 scheduled recurring audits may not be firing in production at all** — silently, with no error (the cron
runs, emits a dead event, nothing audits). Same risk for agency bulk re-audit. This is a SHIPPED Phase 1 feature.

Compounding the risk: the bug appears to be **baked into the LLD canon itself.** LLD line ~3805 states *"Phase 1
canonical: audit/start fires run-audit.ts + technical-audit-run.ts in parallel"* — i.e. canon says the event name
is `audit/start`. But the runner actually listens on `audit.run`. So either the LLD is wrong about the name, or
the audit functions were built with the wrong listener — and every function canon told to "fire audit/start"
inherited the same dead wiring. We need ground truth from the real repo.

**DIAGNOSE ONLY. Report findings. Do NOT change any source until Sri reviews the diagnosis + decides the fix.**
This is a report-first investigation because the blast radius (is prod scheduled-auditing broken?) must be
understood before touching anything — and because the same fix may need to apply in several places consistently.

---

## STEP 1 — Establish the ground truth: what event does the audit runner ACTUALLY listen on?
```bash
# What event(s) trigger the real audit run? (the function we KNOW works via POST /api/audits)
grep -rnE "createFunction|event:|'audit/|\"audit/|'audit\.|\"audit\.|audit\.run|audit/start|audit/run" inngest/functions/run-audit*.ts inngest/functions/*audit*.ts lib/audit/ --include=*.ts | head -40
# The canonical "this works" path — how does POST /api/audits invoke the audit?
grep -rnE "inngest.send|'audit|\"audit|auditId|audit\.run|audit/run" app/api/audits/route.ts --include=*.ts
```
Report: the EXACT event string the working audit runner listens on (`audit.run`? `audit/run`? something else),
and what payload it expects (does it require a pre-created `{ auditId }`, like the reaudit fix established?).

## STEP 2 — For EACH of the 3 suspect functions, confirm whether its emit is actually dead
For each file, find what it emits and compare to STEP 1's ground truth:
```bash
for f in schedule-workflow-runs bulk-reaudit-orchestrate audit-schedules-cron; do
  echo "===== inngest/functions/$f.ts ====="
  grep -nE "inngest.send|'audit/start'|\"audit/start\"|'audit\.run'|\"audit\.run\"|'audit/run'|auditId|checkQuota|createAudit|insert.*audits" "inngest/functions/$f.ts" 2>/dev/null
done
```
For each function, report:
- (a) What event name it emits (`audit/start`? something else?).
- (b) Does that name MATCH the working listener from STEP 1, or is it dead?
- (c) Does it create an audit ROW first (like the working path needs), or send a bare `{ brandId, orgId, ... }`
  payload (which would crash the runner even with the right event name — Bug B from the reaudit)?
- (d) Is there a `checkQuota` gate before the emit (canon requires it for any audit-firing path)?

## STEP 3 — Assess the BLAST RADIUS (the important question)
For each function, determine what's actually broken in practice:
- **`audit-schedules-cron.ts`** — this is the Phase 1 scheduled-audits cron. If its event is dead:
  → **Are scheduled recurring audits firing in production at all?** Check: does anything ELSE pick up the slack
    (a different event, a direct call), or is the dead emit the only path? Look for whether `audit_schedules`
    rows would ever actually produce an audit. This is the highest-priority question — a silent prod gap.
  → Check the git history / blame on this file if easy: was it ever working, or dead since written?
- **`bulk-reaudit-orchestrate.ts`** — the agency bulk re-audit. If dead: agencies clicking "re-audit all brands"
  get nothing. Confirm whether this is wired to a real UI action (so users can hit it) or dormant.
- **`schedule-workflow-runs.ts`** — Phase 2 workflow runs. Confirm whether it's registered + invoked, and
  whether its audit-firing is dead.

For each: classify as **(i) genuinely dead in prod** (real breakage), **(ii) dead but feature is dormant/not yet
wired to a user action** (latent), or **(iii) actually fine — has a different working path** (false alarm).

## STEP 4 — Confirm whether the LLD canon is the root cause
```bash
# How many places does canon say 'audit/start' (the apparently-wrong name)?
grep -rn "audit/start" . --include=*.md --include=*.ts 2>/dev/null | wc -l
grep -rn "audit/start" . --include=*.ts 2>/dev/null    # the code occurrences specifically
```
Report: is `audit/start` the consistent name across canon + code (suggesting the LISTENER is what's wrong — i.e.
`runAudit` should listen on `audit/start` and the reaudit "fix" actually diverged), OR is `audit.run` the real
working name and `audit/start` a canon error propagated into multiple functions? This determines whether the
correct fix is "fix the emitters to use `audit.run`" (what the reaudit fix did) or "fix the listener + canon to
`audit/start`" — they're mutually exclusive and we must pick the RIGHT one repo-wide.

> NOTE: the reaudit fix made the emitter match `runAudit`'s actual `audit.run` listener AND added audit-row
> creation + `runAuditInline`. If `audit.run` is confirmed as the true working contract (STEP 1), then the other
> three should follow the SAME pattern. But CONFIRM that first — do not assume the reaudit fix chose the right
> side without verifying `runAudit` genuinely listens on `audit.run` and that POST /api/audits uses that path
> successfully.

## REPORT (no fixes — for Sri to decide)
1. **Ground truth:** the exact event name the working audit runner listens on + the payload it needs (auditId?).
2. **Per function** (schedule-workflow-runs / bulk-reaudit-orchestrate / audit-schedules-cron): the emitted event,
   whether it's dead, whether it creates an audit row, whether it gates on quota.
3. **Blast radius:** for each, is it (i) genuinely broken in prod, (ii) latent/dormant, or (iii) fine? Especially:
   **is Phase 1 scheduled auditing actually firing, or silently dead?**
4. **Canon verdict:** is `audit.run` the true contract (so canon's `audit/start` is wrong everywhere), or is
   `audit/start` correct and the listener wrong? Which side is right, repo-wide?
5. **Proposed fix direction** (for Sri to approve, NOT applied): the consistent pattern to apply to whichever
   functions are genuinely broken — almost certainly the same shape as the reaudit fix (correct event name +
   create audit row + runAuditInline/correct payload + quota gate), but stated explicitly per function.
6. **Canon edit needed:** which LLD lines (~3805, ~8227, ~8242, the `audit/start` references) need correcting so
   the next rebuild doesn't reintroduce the bug.
