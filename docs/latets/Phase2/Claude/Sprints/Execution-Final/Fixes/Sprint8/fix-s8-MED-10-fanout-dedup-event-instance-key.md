# FIX S8-MED-10 — Fanout webhook dedup is keyed on event TYPE, not event INSTANCE → drops legitimate repeat events (F19)

## Severity: MEDIUM (real webhook delivery loss: the 2nd+ event of any type to an org+endpoint is silently dropped; fails the canon-specified idempotency contract)

## The finding (from the S8 finale verification)
`fanout-webhooks.ts:56–68` dedups deliveries with:
```
WHERE endpointId = X AND event = Y AND organizationId = Z    -- no event-id, no time window
```
So after the FIRST `hallucination.acknowledged` delivery for an org+endpoint (success OR failure),
EVERY future `hallucination/acknowledged` event for that same org+endpoint is matched against the
old row and dropped as `{ deduped: true }` — the customer never receives the 2nd, 3rd, … Nth event
of that type. This conflates "the SAME event being retried" (should dedup) with "a NEW event of the
same type" (should deliver).

## Canon — the required key includes the internal EVENT ID
S8 prompt §8.1 (RETRY/IDEMPOTENCY) specifies verbatim:
> dedup via `webhook_deliveries` (the existing delivery log; **endpointId + the internal event id /
> an idempotency key**) so a replay is a no-op, and wrap each endpoint POST in its own `step.run()`.

So the dedup key must be **`endpointId + internal_event_id`** (the specific event INSTANCE), NOT
`endpointId + event_type`. This is what makes a RETRY of the same event a no-op while DISTINCT
events of the same type still deliver. The current implementation dropped the event-id from the key
— that is the bug. (This is an S8 §8.1 deliverable, not out-of-scope pre-existing code.)

## Task

### Step 1 — Inspect the dedup query + what identifies an event instance
```bash
cd c:/startup/VisibleAU/src
sed -n '40,90p' inngest/functions/fanout-webhooks.ts
# What unique id does the incoming Inngest event carry? (event.id, a ctx id, or a payload field)
grep -n "event.id\|ctx.event\|runId\|event.data\|idempotency\|eventId\|internal.*id" inngest/functions/fanout-webhooks.ts
# The webhook_deliveries schema — is there a column to store the event instance id?
grep -n "eventId\|event_id\|idempotency\|correlation\|internalEventId" db/schema/*.ts | grep -i webhook
psql "$PROD" -c "\d webhook_deliveries"
```
Identify the stable per-event-instance id available at fanout time. Inngest provides `event.id`
(and step run ids); the internal emit can also carry an id in `event.data` (e.g. the audit id,
incident id, or a generated idempotency key). Pick the one that is UNIQUE per emitted event and
STABLE across Inngest retries of that same event (so a retry matches, a new event does not).

### Step 2 — Add an event-instance id column if none exists
If `webhook_deliveries` has no column for the event instance id / idempotency key, add one
(migration, MI-01 idempotent, BOTH DBs) — e.g. `internal_event_id TEXT` (or reuse an existing
correlation column if present). Index `(endpoint_id, internal_event_id)` for the dedup lookup.

### Step 3 — Re-key the dedup query
Change the dedup check to:
```
WHERE endpointId = X AND internal_event_id = <this event's instance id>
```
(endpoint + event-instance). Remove `event = Y` as the dedup discriminator (event TYPE is not an
identity). Keep organizationId only as a scoping filter if needed for RLS, not as the dedup key.
Store `internal_event_id` on every `webhook_deliveries` row written, so the next retry of THAT event
finds THIS row (no-op) but a new event does not.

Behaviour after fix:
- **Retry of the same event** (same instance id) → finds the existing delivery row → no-op (no
  double-POST). ✓ canon "replay is a no-op".
- **A new event of the same type** (different instance id) → no matching row → delivers. ✓ (fixes
  the drop).

### Step 4 — Preserve the per-endpoint step.run isolation
Confirm each endpoint POST is still wrapped in its own `step.run()` (§8.1) so a partial multi-endpoint
failure replays only the un-delivered endpoints. Do not regress that while changing the dedup key.

## Verify
```bash
grep -n "internal_event_id\|endpointId\|deduped\|step.run" inngest/functions/fanout-webhooks.ts
```
Behavioural test (mock or real):
1. Fire event instance A to endpoint E → 1 delivery row (internal_event_id=A).
2. Retry event instance A (Inngest replay) → still 1 row for A (no double-POST). ✓
3. Fire a DIFFERENT event instance B of the SAME type to endpoint E → a NEW delivery row
   (internal_event_id=B) → delivered, NOT dropped. ✓  (This is the F19 regression case.)
Confirm the migration (Step 2) is on BOTH `visibleau` and `visibleau_prod`.

## Constraints
- The dedup key is the event INSTANCE id (endpoint + internal_event_id), never the event TYPE.
- The chosen id MUST be stable across Inngest retries of the same event and unique across distinct
  events (verify which id property holds — event.id vs a payload id).
- Migration MI-01 idempotent, applied + verified on BOTH DBs (the recurring dev/prod discipline).
- Keep the per-endpoint `step.run()` isolation.
- Do not alter the slash→dot EVENT_NAME_MAP (verified correct in the finale) or the 5 event wirings.

## Report back (paste inline)
1. The current dedup query + which event-instance id is available/stable at fanout time.
2. Whether a column was added (migration) or an existing one reused; the new dedup query.
3. The behavioural test result: retry-of-A = no-op; new-B-same-type = delivered (the F19 fix).
4. Confirmation the migration is on both DBs and step.run isolation is intact.
