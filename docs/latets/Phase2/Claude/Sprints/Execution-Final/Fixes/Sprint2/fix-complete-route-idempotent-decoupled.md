# Claude Code — FIX: complete route is non-atomic → permanent kanban desync. Make it idempotent + decouple the event (Option 2+3)

**Confirmed root cause** (diagnosis verdict A): `app/api/brands/[brandId]/tasks/[id]/complete/route.ts` wraps TWO
independent operations in one try/catch:
1. `updateTaskStatus(id, "complete")` — **commits to DB (irreversible)**
2. `inngest.send({ name: "task/completed", ... })` — **fallible network call**

When (2) fails (prod has a stub `INNGEST_EVENT_KEY` without `INNGEST_DEV=1`, so `inngest.send()` hits Inngest Cloud
with an invalid key and throws), the route returns 400 — but the DB is ALREADY `complete`. The optimistic kanban
reverts the card to Review. Now: **DB = `complete`, UI = `ready_for_review`** (permanent desync). Every retry hits
the transition guard → "Cannot transition from 'complete' to 'complete'" → reverts again → card stuck in Review
forever. (Masked in dev because Inngest was running there, so step 2 never threw.)

**Sri's chosen fix: Option 2 + Option 3 (NOT fire-and-forget).** Two parts:
- **Option 2 — decouple the event with LOUD logging (never swallow).** Separate `inngest.send()` from the DB
  commit so a send failure does NOT 400/revert the UI — but log it loudly and surface it as recoverable, so a
  missing re-audit is DETECTABLE, never silent.
- **Option 3 — make completion IDEMPOTENT.** "Already complete" → treat as success (200 + ensure the event
  fired/re-fire), NOT a 400. This self-heals the desync: the stuck-in-Review task completes on the next click and
  fires its re-audit.

> ⚠️ **DO NOT use `inngest.send({...}).catch(() => {})` (the swallowed fire-and-forget).** That fixes the 400 but
> SILENTLY breaks the re-audit/lift loop — the exact silent-event-failure class we just spent this session killing
> in the audit/start saga. The event failure must be LOGGED and visible, never swallowed.

> **Investigate-first. Confirm the route + the transition guard before changing.** Read:
> - `app/api/brands/[brandId]/tasks/[id]/complete/route.ts` — the non-atomic try/catch (lines ~26-37).
> - `lib/workflow/task-manager.ts` — `updateTaskStatus()` + the status transition validation that throws "Cannot
>   transition from X to Y". This is where the idempotency guard (Option 3) goes. Canonical enum:
>   `open|in_progress|ready_for_review|complete|wont_fix`.
> - The kanban's optimistic-update + error-revert logic (`task-kanban.tsx`) — confirm it reverts on non-2xx (so a
>   200 with a warning flag does NOT revert).
> - The `task/completed` emit contract: `inngest.send({ name: 'task/completed', data: { taskId, brandId, orgId } })`
>   (LLD ~8226).
> Report the route shape, the transition-guard logic, and the kanban revert condition — then apply.

---

## THE FIX

### Part 1 (Option 3) — idempotent completion in `task-manager.ts`
In `updateTaskStatus()` (or the completion-specific path), when the target is `complete`:
- If the task is **already `complete`**, do NOT throw "cannot transition from complete to complete." Treat it as a
  **successful no-op**: return the task (already complete) as success. (Idempotency — completing a complete task is
  fine. Same spirit as the existing duplicate-task idempotency guard, LLD ~822.)
- Other invalid transitions (e.g. `open` → `complete` skipping steps, IF the state machine forbids that) keep their
  existing validation — only the `complete` → `complete` case becomes a no-op success, not an error.
- This means: the stuck-in-Review task (DB already `complete`) will, on the next "→ Done" click, get a SUCCESS
  (not a 400), and the route proceeds to (re-)emit the event — self-healing the desync.

### Part 2 (Option 2) — decouple the event in the complete route
Rewrite the route so DB commit and event emission are independent, with the event failure LOGGED, not swallowed,
and not causing a 400:
```typescript
// 1. Complete the task (idempotent now — "already complete" returns success, not a throw)
const updated = await updateTaskStatus(id, "complete");

// 2. Emit the re-audit event — SEPARATE try/catch. DB is source of truth; a send failure
//    must NOT 400 or revert the UI, but it MUST be logged loudly (never swallowed silently).
let reauditQueued = true;
try {
  await inngest.send({ name: "task/completed", data: { taskId: id, brandId, orgId } });
} catch (e) {
  reauditQueued = false;
  logger.error("Task completed but task/completed event failed to emit — re-audit NOT triggered", {
    taskId: id, brandId, error: e instanceof Error ? e.message : String(e),
  });
  // Do NOT rethrow. Do NOT return 400. The task IS complete (DB truth).
}

// 3. Return 200 with a flag the UI can use to show "completed; validation re-audit pending/failed"
return NextResponse.json({ ...updated, reauditQueued });
```
- The DB update is the source of truth → if it succeeds (or was already complete), return **200**, never 400.
- A failed `inngest.send()` is **logged at error level with the taskId** so it's findable/alertable, and surfaced
  via `reauditQueued: false` — NOT silently dropped.
- (Optional, if cheap) the UI may show a subtle "re-audit pending — will retry" note when `reauditQueued` is false;
  not required for the fix, but don't show a hard error.

### Part 3 — kanban revert condition
Confirm the kanban only reverts the optimistic update on a **non-2xx** response. With the route now returning 200
(even when the event failed), the card stays in Done and does NOT revert. If the kanban currently reverts on
anything other than HTTP failure, adjust so a 200-with-`reauditQueued:false` does NOT revert (the task IS done).

## INVARIANTS — do not violate
- **Never swallow the event failure** (`.catch(() => {})` is forbidden). It must be logged loudly + surfaced via a
  flag. A missing re-audit must be detectable, not silent. (This is the audit/start lesson — don't reintroduce a
  silent event-drop.)
- DB is source of truth: task complete → 200, regardless of event delivery. Event delivery is best-effort but
  VISIBLE.
- Idempotency: `complete` → `complete` is a no-op SUCCESS, not a 400. Other invalid transitions keep existing
  validation.
- `task/completed` event contract unchanged: `{ taskId, brandId, orgId }`. `remediation_tasks.status='complete'`
  (no -d) spelling preserved.
- Do NOT change the audit/start fixes, the re-audit function, or the three status spellings. This is the complete
  route + task-manager guard + kanban revert only.

## VERIFY — reproduce the desync, then prove it's fixed
1. **Reproduce the original** (before deploying the fix, to confirm the mechanism): with Inngest NOT reachable
   (stub key, no INNGEST_DEV), complete a `ready_for_review` task → confirm the OLD behaviour was 400 + revert.
   (Skip if already confirmed — diagnosis established this.)
2. **After fix — self-heal the stuck task:** the Sydney Plumbing task `6f8f26d8-...` (DB=`complete`, UI=Review).
   Click "→ Done" on it. With the idempotency fix, it should now **succeed (200)**, the card moves to Done, and the
   route (re-)emits `task/completed`. No more "complete to complete" error.
   ```bash
   psql "$PROD_DATABASE_URL" -c "SELECT id, status FROM remediation_tasks WHERE id='6f8f26d8-3dc9-4ac8-945b-7e7ea87c722a';"
   ```
   (status `complete`, and the card now sits in Done — desync resolved.)
3. **Event-failure path (Inngest down):** with Inngest unreachable, complete a fresh `ready_for_review` task →
   route returns **200** (NOT 400), card stays in **Done** (no revert), and the server LOG shows the loud
   "event failed to emit — re-audit NOT triggered" error with the taskId. `reauditQueued: false` in the response.
   The task is `complete` in DB. (Proves: no desync, no silent drop, failure is visible.)
4. **Event-success path (Inngest up):** start the Inngest dev server (`START-INNGEST.bat` + `INNGEST_DEV=1`,
   synced), complete a fresh task → 200, card in Done, `task/completed` fires, `trigger-validation-reaudit` runs
   (Inngest Runs), `reauditQueued: true`. The full loop works when Inngest is reachable.
5. **Idempotent re-click:** click "→ Done" on an already-Done task → 200 no-op (not a 400), no error banner.
6. Suite green; only the known pre-existing `audit_cost_snapshots` red.

## REPORT
- The route shape + transition-guard logic found; the kanban revert condition.
- Part 1: the idempotency guard added (complete→complete = no-op success); confirm other transitions unchanged.
- Part 2: the decoupled event with loud logging + `reauditQueued` flag (confirm NOT swallowed).
- Part 3: kanban no longer reverts on 200-with-failed-event.
- **Behavioural proof:** the stuck Sydney Plumbing task self-heals (→Done succeeds, card moves, desync gone);
  event-failure path returns 200 + logs loudly + no revert + reauditQueued:false; event-success path fires the
  re-audit; idempotent re-click is a no-op 200.
- Confirm invariants: event failure logged not swallowed, DB-is-truth 200, idempotent complete, event contract +
  status spelling unchanged, audit/start fixes untouched. Suite green.

## NOTE — this also explains the prod-vs-dev gap
The bug was masked in dev (Inngest running → step 2 never threw). It only surfaced in prod because the env has a
stub Inngest key without INNGEST_DEV. After this fix, completion is resilient to Inngest being unreachable — which
is exactly the prod condition you hit. (Separately, for real prod go-live you still need valid Inngest Cloud
keys + a deployed serve endpoint so re-audits actually fire — this fix makes completion not BREAK when they're
absent, but the re-audit only runs when Inngest is reachable.)
