# VisibleAU — Verify (read-only): no global `db.` leaked into webhook handlers + pool stays max:10
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
**Read-only. Change nothing.** Confirms the transactional-hardening refactor didn't leave the deadlock
hazard behind.

## Why
The Stripe webhook deadlock was caused by handlers using the GLOBAL `db` instead of the transaction
handle `tx` while the pool was `max:1`. The fix made handlers use `tx` exclusively and set pool
`max:10`. This verification confirms BOTH guarantees still hold so the deadlock can't recur.

## Checks — run all, report results

```bash
# 1. Any global `db.` usage INSIDE the webhook handlers? (Should be NONE inside the transactional path —
#    handlers must use `tx`, not `db`.)
for f in lib/stripe/webhook-handlers/*.ts; do
  echo "=== $f ===";
  grep -nE "\bdb\." "$f" || echo "  (clean — no db. references)";
done

# 2. The route — confirm it owns the transaction and passes tx to handlers (not calling handlers with
#    global db):
grep -nE "db\.transaction|tx\)|handleCheckout|handleSubscription|handleInvoice|processedWebhookEvents" app/api/webhooks/stripe/route.ts

# 3. Pool size — must be >1 (not reverted to the max:1 that caused the deadlock):
grep -nE "max:" db/client.ts

# 4. Do the handler function SIGNATURES accept a tx param? (Confirms they're written to receive the
#    transaction, not reach for global db.)
grep -nE "export (async )?function handle|=> \{|WebhookTx|tx:" lib/stripe/webhook-handlers/*.ts | head -30

# 5. The shared tx type (should exist, matching the lib/audit/numbering.ts pattern):
cat lib/stripe/webhook-handlers/types.ts 2>/dev/null || echo "types.ts not found — check where WebhookTx is defined"
```

## What to report
- **Check 1 result:** for EACH handler file, state "clean" or list any `db.` references found. IMPORTANT
  nuance: a `db.` reference is only a HAZARD if it's inside the transactional execution path (a query/
  write that would acquire a second connection during the tx). An import, a type-only reference, or code
  outside the `tx` callback may be acceptable — but flag ANY `db.` found and say whether it's inside the
  tx path (hazard) or not (ok). Ideally handlers reference ONLY `tx`.
- **Check 2:** confirm the route wraps handler dispatch in `db.transaction(async (tx) => …)` and passes
  `tx` into each handler.
- **Check 3:** the exact `max:` value (must be >1).
- **Check 4:** confirm handler signatures take a `tx` parameter.
- **Check 5:** confirm the shared `WebhookTx` type exists.
- **Verdict:** PASS if (handlers use tx only inside the tx path) AND (route passes tx) AND (pool >1).
  FAIL/FLAG if any `db.` is inside a transactional path or pool is 1.

## Constraints
- Read-only — make NO changes. This is a verification pass only.
- If something looks wrong (a `db.` inside the tx path, or pool=1), REPORT it precisely (file + line)
  but do not fix in this pass — the operator will decide.
