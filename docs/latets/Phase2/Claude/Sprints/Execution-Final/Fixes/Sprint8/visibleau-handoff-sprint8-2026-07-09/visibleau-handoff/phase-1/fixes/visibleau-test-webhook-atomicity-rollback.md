# VisibleAU — Prove webhook atomicity: temporary mid-handler throw → confirm full rollback
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
This TEMPORARILY injects a failure into the checkout-completed handler to PROVE the transaction rolls
back all writes on failure (true atomicity), then REMOVES it. Dev only.

## ⚠️⚠️ CRITICAL — THIS ADDS A TEMPORARY THROW THAT BREAKS CHECKOUT. IT MUST BE REMOVED AFTER THE TEST.
The throw makes EVERY checkout.session.completed FAIL on purpose. If left in, all real upgrades break.
STEP 4 removes it. Do NOT end the task with the throw still in place. Confirm removal explicitly.

## The test logic
The hardened handler does multiple writes in one transaction (e.g. `tx.insert(subscriptions)` +
`tx.update(organizations).set({ tier }))`. We inject a throw AFTER at least one write but before the
handler completes. If the transaction is truly atomic, the failure rolls back ALL writes → the org tier
does NOT change. If the tier changes despite the throw, the writes aren't really transactional.

## STEP 0 — Locate the writes in checkout-completed
```bash
cat lib/stripe/webhook-handlers/checkout-completed.ts
```
Identify the order of writes (the tier update and the subscription upsert). Pick an injection point
AFTER one write has executed but before the function returns — ideally BETWEEN the two writes, so one
has happened and we prove it gets rolled back.

## STEP 1 — Inject a TEMPORARY throw (clearly marked for removal)
Add, between the writes (or after the first write), a clearly-tagged temporary throw:
```ts
// ===== TEMPORARY ATOMICITY TEST — REMOVE AFTER TEST (visibleau-test-webhook-atomicity-rollback) =====
throw new Error("ATOMICITY_TEST: forced mid-handler failure — REMOVE THIS LINE");
// ====================================================================================================
```
Place it so at least one `tx.update`/`tx.insert` has already run before it. Use the EXACT marker
comment above so it's grep-findable for removal. Report the file + line where you injected it.

## STEP 2 — Tell the operator to run the test
Provide these steps for the operator (Claude Code can't drive the browser/restart):
1. Restart: `START-DEV.bat` (loads the changed handler).
2. Ensure `stripe listen --forward-to localhost:3000/api/webhooks/stripe` is running.
3. Pick a Free org to test with — e.g. reset one to free first:
   ```sql
   UPDATE organizations o SET tier='free' FROM users u
   WHERE u.organization_id=o.id AND u.email='free2@test.visibleau.dev';
   ```
   (Confirm it's 'free' before the test.)
4. Trigger checkout.session.completed for that org — EITHER redo the upgrade from /pricing with card
   4242 4242 4242 4242 (carries the org linkage), OR if `stripe trigger` can target the org, use that.
   (The real /pricing upgrade is most reliable for hitting THIS org's handler with metadata.)
5. EXPECTED RESULT (the proof):
   - `stripe listen` shows the webhook returning an ERROR (500) for checkout.session.completed.
   - The org tier is STILL 'free' — the partial write (whichever ran before the throw) was ROLLED BACK.
   Verify:
   ```sql
   SELECT o.tier FROM organizations o JOIN users u ON u.organization_id=o.id
   WHERE u.email='free2@test.visibleau.dev';
   -- MUST still be 'free' → atomicity PROVEN.
   ```
   Also confirm the subscription row was NOT created (or not left half-written):
   ```sql
   SELECT s.* FROM subscriptions s JOIN organizations o ON o.id=s.organization_id
   JOIN users u ON u.organization_id=o.id WHERE u.email='free2@test.visibleau.dev';
   -- expect no new/partial subscription row from this failed attempt.
   ```
   And confirm the processed-event marker was NOT written (so Stripe's retry will reprocess cleanly):
   ```sql
   -- (optional) check processed_webhook_events does NOT contain this event id, since the whole tx
   -- rolled back including the marker.
   ```
   INTERPRETATION:
   - tier still 'free' + no partial subscription + no marker  → ATOMICITY PROVEN (rollback works).
   - tier changed to 'growth' despite the throw → NOT atomic; the writes aren't really in the tx → FLAG.

## STEP 3 — Have the operator report back the result
Wait for the operator to report: did the tier stay 'free' (pass) or change (fail)?

## STEP 4 — ⚠️ REMOVE THE TEMPORARY THROW (MANDATORY)
After the operator confirms the result, REMOVE the injected throw and its marker comments so checkout
works again:
```bash
grep -rn "ATOMICITY_TEST\|visibleau-test-webhook-atomicity-rollback" lib/stripe/webhook-handlers/
```
Delete the throw + the two marker comment lines. Re-confirm it's gone:
```bash
grep -rn "ATOMICITY_TEST" lib/stripe/ || echo "Clean — throw removed."
```
Then remind the operator to restart `START-DEV.bat` again so the WORKING handler is loaded, and to do
one final normal upgrade to confirm checkout works again (tier flips to growth as normal).

## STEP 5 — Report
- Where the throw was injected (file + line).
- The operator's test result (tier stayed free = pass / changed = fail).
- Confirmation the throw + markers were REMOVED (grep shows clean).
- Reminder: operator must restart + do one normal upgrade to confirm checkout restored.

## Constraints
- The throw is TEMPORARY and MUST be removed in STEP 4 — do not leave it. End state: handler restored.
- Inject AFTER at least one write so the rollback is actually being tested.
- Dev only. Don't touch other handlers.
- If the operator reports the tier CHANGED despite the throw, that's a real atomicity failure — report
  it clearly (the writes aren't transactional); the fix would be ensuring all writes use the same tx.
