# VisibleAU — REMOVE the temporary atomicity-test throw (restore checkout)
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
The atomicity rollback test PASSED (webhook returned 500, tier stayed 'free' — rollback proven). Now
remove the temporary throw so checkout works again.

## ⚠️ Context
A temporary throw was injected at `lib/stripe/webhook-handlers/checkout-completed.ts` (~line 88-90,
between `tx.insert(subscriptions)` and `tx.update(organizations)`) tagged with the marker
`ATOMICITY_TEST` / `visibleau-test-webhook-atomicity-rollback`. It makes EVERY
checkout.session.completed fail with 500. It MUST be removed now.

## STEP 1 — Find it
```bash
grep -rn "ATOMICITY_TEST\|visibleau-test-webhook-atomicity-rollback" lib/stripe/webhook-handlers/
```

## STEP 2 — Remove it
Delete the throw line AND its two marker comment lines (the opening `// ===== TEMPORARY ATOMICITY TEST
… =====` and the closing `// ===== … =====`), so the handler flows directly from the
`tx.insert(subscriptions)` to the `tx.update(organizations)` as it did before the test. Show the diff
(the lines removed) and the surrounding code after removal to confirm the handler is intact (both writes
still present, in order, inside the tx).

## STEP 3 — Confirm clean
```bash
grep -rn "ATOMICITY_TEST\|visibleau-test-webhook-atomicity-rollback" lib/stripe/ && echo "STILL PRESENT — remove it" || echo "Clean — throw removed."
# Typecheck to confirm nothing left dangling:
npx tsc --noEmit 2>&1 | head -5 || pnpm typecheck 2>&1 | head -5
```
Expect "Clean — throw removed." and a clean typecheck.

## STEP 4 — Report + operator restore steps
Report: confirmation the throw + markers are gone, the handler is intact (both writes present in the
tx), and typecheck is clean. Then tell the operator to:
1. Restart `START-DEV.bat` (load the restored handler).
2. Do ONE normal upgrade to confirm checkout works again: reset an org to free
   (`UPDATE organizations o SET tier='free' FROM users u WHERE u.organization_id=o.id AND u.email='free4@test.visibleau.dev';`),
   then /pricing → Growth → card 4242 4242 4242 4242 → Subscribe.
3. Confirm: `stripe listen` shows `checkout.session.completed [200]` (NOT 500), and the tier flips to
   'growth' — proving checkout is fully restored.

## Constraints
- Remove ONLY the test throw + its marker comments. Change nothing else in the handler.
- The two real writes (subscription insert + org tier update) must remain, in order, inside the tx.
- Confirm via grep that NO trace of ATOMICITY_TEST remains anywhere under lib/stripe/.
