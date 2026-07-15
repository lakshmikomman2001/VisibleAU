# VisibleAU — Harden Stripe webhook handlers: make multi-write events atomic (use tx, avoid the deadlock)
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
Production-grade follow-up to the deadlock fix. NOT urgent; do carefully.

## Background (read before touching anything)
Earlier we fixed a deadlock: the webhook route wrapped handlers in `db.transaction()`, but the handlers
used the GLOBAL `db` instead of the transaction's `tx`, and the pool was `max:1` → the handler waited
forever for a 2nd connection the transaction already held. The fix REMOVED the transaction wrapper and
set pool `max:10`. That stopped the deadlock, BUT now multi-write handlers
(`checkout.session.completed`, `subscription.updated`, etc.) run their several writes (update
`organizations.tier`, record/clear subscription fields, mark `processed_webhook_events`, etc.) WITHOUT
a transaction — so a mid-handler failure can leave a half-applied billing state (e.g. tier updated but
subscription row not, or vice versa).

Goal: restore ATOMICITY **without reintroducing the deadlock**. The deadlock was caused by handlers
ignoring `tx`, NOT by transactions themselves. The codebase already uses transactions correctly
elsewhere (e.g. `POST /api/audits` wraps `getNextAuditNumber()` + insert — see foundations: "race-safe
under concurrent audit creation"). Bring the webhook handlers up to that same standard.

## STEP 0 — Map the current state (report before changing)
```bash
# The route (post-fix): confirm transaction was removed, pool is max:10:
cat app/api/webhooks/stripe/route.ts
grep -nE "max:|pool|postgres\(|drizzle\(" db/client.ts

# Each handler's writes — list every db.xxx call per handler so we know what must be atomic together:
for f in lib/stripe/webhook-handlers/*.ts; do echo "=== $f ==="; grep -nE "db\.(insert|update|delete|transaction)|\.set\(|processedWebhookEvents|organizations|subscription" "$f"; done

# The idempotency table + how it's checked/written:
sed -n '1,40p' lib/stripe/webhook-handlers/processed-webhook-events.ts 2>/dev/null
grep -rnE "processedWebhookEvents|processed_webhook_events|stripeEventId|onConflict" lib/stripe app/api/webhooks | head
```
Report, per handler: which writes happen, and whether they should be one atomic unit (tier + subscription
fields + processed-event marker = yes, atomic together).

## STEP 1 — Pattern: transactional handlers that USE tx (the deadlock-avoidance is here)
Refactor so each handler that does >1 write runs them in a SINGLE transaction, and EVERY db call inside
uses the transaction handle `tx` (NOT the global `db`). This is the crucial difference from the code
that deadlocked.

Recommended shape — route owns the transaction, passes `tx` to the handler, handler uses ONLY `tx`:
```ts
// route.ts (after verifying signature + reading raw body):
await db.transaction(async (tx) => {
  // idempotency check INSIDE the tx so the marker + writes commit together:
  const already = await tx.query.processedWebhookEvents.findFirst({
    where: eq(processedWebhookEvents.stripeEventId, event.id),
  });
  if (already) return; // replay — no-op

  switch (event.type) {
    case "checkout.session.completed": await handleCheckoutCompleted(event, tx); break;
    case "customer.subscription.updated": await handleSubscriptionUpdated(event, tx); break;
    // ...other cases
  }

  // mark processed LAST, inside the same tx → atomic with the handler's writes:
  await tx.insert(processedWebhookEvents)
    .values({ stripeEventId: event.id, type: event.type })
    .onConflictDoNothing();
});
```
And each handler signature becomes `(event, tx)` and uses `tx.update(...)`, `tx.insert(...)` everywhere
— NEVER the global `db`. Search each handler and confirm ZERO references to the global `db` remain
inside the transactional path.

### Deadlock-avoidance requirements (MANDATORY — this is why the original broke)
- Pool MUST stay `max:10` (or higher) — do NOT revert to `max:1`. A transaction holds ONE connection;
  if any code inside reaches for a second (via global `db`), it can starve under load. Keeping the pool
  >1 AND using `tx` exclusively inside removes both failure modes.
- Inside the transaction, do NOT call anything that acquires a separate `db` connection (no global-`db`
  helper, no nested service that opens its own connection). If a helper must run inside, it has to
  accept and use `tx`.
- Keep the transaction SHORT and DB-only. Do NOT put slow/outbound work (email/Resend, Inngest sends,
  Stripe API calls, analytics) INSIDE the transaction — those caused/would-cause the 30s hang and also
  hold the connection too long. Move side-effects to AFTER the transaction commits (fire-and-forget,
  error-caught), so the tx commits fast and the 200 returns quickly.

## STEP 2 — Idempotency must remain correct (canon requires replay-safety)
Canon (Sprint 10 lines 40-41, 1150-1172): webhooks are "replay-safe via `processed_webhook_events`".
Ensure after refactor:
- The idempotency check AND the processed-event insert are INSIDE the same transaction as the handler
  writes → a replay can't partially re-apply, and a failure rolls back the marker too (so Stripe's retry
  re-processes cleanly rather than being wrongly skipped).
- `onConflictDoNothing` (or equivalent) on `stripeEventId` still guards concurrent duplicate deliveries.
- Confirm the unique constraint on `processed_webhook_events.stripeEventId` exists.

## STEP 3 — Verify (dev)
```bash
# No global db inside transactional handlers:
for f in lib/stripe/webhook-handlers/*.ts; do echo "=== $f ==="; grep -nE "\bdb\." "$f"; done
# Expect: handlers reference tx, NOT db, inside the transactional path. Flag any remaining `db.` calls.

# Pool still >1:
grep -nE "max:" db/client.ts   # must be >1
```
Then a runtime test (operator):
1. START-DEV.bat (loads env, restarts). `stripe listen` running.
2. Redo an upgrade from /pricing with 4242 4242 4242 4242 (or `stripe trigger checkout.session.completed`).
3. Confirm: `checkout.session.completed` returns **[200] fast** (NO 30s, no deadlock).
4. Tier updates: SELECT o.tier ... WHERE u.email='free1@test.visibleau.dev' → expected tier.
5. Replay-safety: in the stripe listen dashboard or via `stripe events resend <evt_id>`, re-deliver the
   SAME event → handler should no-op (idempotent), tier unchanged, no error, still [200].
6. (Optional) Simulate a mid-handler failure (temporarily throw after the tier update but before the
   subscription write) → confirm the WHOLE thing rolls back (tier NOT changed), proving atomicity. Revert
   the temporary throw after.

## STEP 4 — Report
- Per-handler list of writes + confirmation they're now atomic via `tx`.
- The route + handler diffs (transaction restored, handlers use tx, side-effects moved AFTER commit).
- Confirmation pool stayed max:10 and NO global `db` remains inside the transactional path (the specific
  thing that caused the original deadlock).
- Idempotency: check + marker inside the tx, unique constraint present.
- Runtime test results: fast [200], tier updates, replay no-ops, (optional) rollback-on-failure proven.

## Constraints
- MUST NOT reintroduce the deadlock: pool stays >1, handlers use ONLY `tx` inside the transaction, no
  separate-connection calls inside.
- Side-effects (email/Inngest/Stripe/analytics) go AFTER commit, never inside the tx.
- Preserve signature verification + raw-body reading (already working).
- Preserve/strengthen idempotency (replay-safe) per canon.
- Keep transactions short (DB-only) so the webhook returns 200 quickly.
