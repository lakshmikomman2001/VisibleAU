# VisibleAU — Diagnose & fix: checkout.session.completed webhook TIMES OUT (tier never updates)
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**

## Symptom (progress + new bug)
Signature verification is now FIXED — early webhooks (`charge.succeeded`, `invoice.finalized`) return
**[200]**. But then the handler hangs:
```
[ERROR] Failed to POST: Post ".../api/webhooks/stripe": context deadline exceeded
        (Client.Timeout exceeded while awaiting headers)
```
The `checkout.session.completed` event (which updates the org tier) TIMES OUT, so the tier never flips
to 'growth' (billing page stuck on Free, "Welcome to Free!"). The UI also shows "Loading…", consistent
with a hung request. This is a CODE bug in the checkout-completed handler — something blocks/never
resolves.

## STEP 0 — Read the checkout.session.completed handler + trace what blocks
```bash
# The handler that processes checkout.session.completed (updates tier):
cat lib/stripe/webhook-handlers/checkout-completed.ts 2>/dev/null || \
  find . -path "*webhook*" -name "*checkout*" -not -path "*/node_modules/*" -exec cat {} \;

# The route that dispatches events — does it AWAIT slow work inline before responding? (Best practice:
# respond 200 fast, do heavy work async. If it awaits a long chain before returning, it times out.)
cat app/api/webhooks/stripe/route.ts

# Look for blocking/slow operations in the handler chain:
grep -rnE "await|fetch\(|stripe\.|db\.|drizzle|resend|sendEmail|sleep|setTimeout|retry|while|for \(" lib/stripe/webhook-handlers/checkout-completed.ts 2>/dev/null
```
Identify the cause. Common ones for a webhook hang:
- (A) The handler makes an OUTBOUND call that hangs (e.g. a Stripe API call, an email via Resend, an
  external fetch) with no timeout — in dev this can block forever if a key is missing/invalid or the
  service is unreachable.
- (B) A DB query/transaction that never returns (lock, missing await, connection pool exhausted, or an
  RLS/permission wait).
- (C) The route AWAITS the full heavy handler before sending the 200 (so any slowness = timeout). Stripe
  expects a fast 2xx; heavy work should be deferred (e.g. enqueue to Inngest / run after responding).
- (D) An infinite loop / unresolved promise / missing `await` that leaves the request open.
- (E) A dependency that's mocked/absent in dev (Resend, Inngest, an analytics call) blocking the path.

## STEP 1 — Pin the exact blocking line
Add targeted logging (temporary) OR reason from the code: which awaited call in
`checkout-completed.ts` (and anything it calls) is the one that doesn't return? Check especially:
- Any `await stripe.xxx.retrieve(...)` (needs network + valid key),
- Any `await resend.emails.send(...)` / email send (RESEND_API_KEY may be stub in dev → can hang or
  throw),
- Any `await inngest.send(...)` (if Inngest isn't running locally, does this block? — operator's local
  Inngest is NOT running / has a sync issue),
- Any DB write that might block.
Report the specific call that hangs.

## STEP 2 — Fix
Depending on cause:
- **If (C) — route awaits heavy work:** restructure so the route VERIFIES the signature, does the
  minimal critical update (set tier) quickly, and DEFERS non-critical work (emails, analytics,
  Inngest fan-out) so the 200 returns fast. The tier update itself should be a quick DB write.
- **If (A/E) — a hanging outbound call (email/Inngest/Stripe) with no timeout:** make it non-blocking
  (fire-and-forget with error catch) or add a timeout, so a missing/stub dev key can't hang the
  webhook. The TIER UPDATE must not depend on these side-effects completing.
- **If (B/D) — DB/await bug:** fix the missing await / unbounded query / loop.
Core requirement: **`checkout.session.completed` must update the org tier and return 2xx quickly**,
without depending on optional side-effects (email, analytics, Inngest) that may be slow/absent in dev.
Idempotency: ensure re-delivery of the same event doesn't double-process (Stripe retries).

## STEP 3 — Verify the tier-update logic itself is correct
Even once it doesn't hang, confirm the handler actually maps the Stripe price/subscription → the right
tier and updates the correct org:
- How does it find the org from the checkout session? (client_reference_id? customer metadata?
  subscription metadata?) Confirm that linkage is set at checkout-creation time
  (lib/.../billing/checkout route) and read correctly here.
- How does it map the purchased price ID → tier 'growth'? (reverse of the price-map.) Confirm Growth's
  price id maps to tier 'growth'.
Report both linkages.

## STEP 4 — Operator retry steps
1. Restart via START-DEV.bat (copies .env.dev → .env.local, restarts).
2. Ensure `stripe listen` running (same whsec_).
3. Fastest re-test of JUST this handler: `stripe trigger checkout.session.completed` — but note a raw
   trigger may lack the real org linkage (client_reference_id), so it may 200 without updating a real
   org. To test the REAL tier flip for free1, redo the upgrade from /pricing with card 4242 4242 4242
   4242 (carries free1's linkage).
4. Watch `stripe listen`: `checkout.session.completed` should now return **[200]** with NO timeout.
5. Verify:
   `SELECT o.tier FROM organizations o JOIN users u ON u.organization_id=o.id WHERE u.email='free1@test.visibleau.dev';`
   → expect 'growth'.
6. Reload /settings/billing → should show Growth, and the success banner should read "Welcome to
   Growth" (if it still says Free after tier='growth', that's a separate success-copy bug — report it).

## Constraints
- The fix must make the webhook respond fast and reliably; tier update must not hinge on optional
  side-effects that are slow/missing in dev.
- Preserve signature verification (already working) and raw-body reading.
- Keep it idempotent against Stripe retries.
- Report: the exact blocking cause, the fix, the org-linkage + price→tier mapping, and the retry result.
