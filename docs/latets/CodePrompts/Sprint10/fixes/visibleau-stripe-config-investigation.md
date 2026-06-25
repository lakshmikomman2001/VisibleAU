# VisibleAU — Investigation ONLY: report the real Stripe config (env names, webhook path, price-map)
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
**Read-only. Change nothing. Report the actual values so the operator can set up Stripe test mode
correctly (without guessing paths/names).**

## Why
The operator is setting up Stripe test mode from scratch and needs the EXACT config the built app
expects: the webhook endpoint path, every Stripe env var name, and the price-map keys. (We recently
learned the Inngest endpoint was `/api/webhooks/inngest`, not the assumed `/api/inngest` — so do NOT
assume Stripe's path either; find it.)

## Tasks — run each, paste raw output, then summarise

```bash
# 1. The Stripe webhook endpoint — what's the ACTUAL route path?
find app -path '*stripe*' -name 'route.ts' ; find app -path '*webhook*' -name 'route.ts'
grep -rnE "stripe|webhook" app --include=route.ts -l

# 2. EVERY Stripe-related env var the code reads:
grep -rnE "process\.env\.(STRIPE_|NEXT_PUBLIC_STRIPE_)" lib app | sort -u

# 3. The price-map — what tier/billing → price-ID env keys does it expect?
cat lib/stripe/price-map.ts 2>/dev/null || grep -rnE "STRIPE_PRICE" lib app

# 4. The webhook handler — which event types does it handle, and how does it verify signatures?
ls lib/stripe/webhook-handlers/ 2>/dev/null
grep -rnE "checkout.session.completed|customer.subscription|invoice\.|verifyWebhook|constructEvent|STRIPE_WEBHOOK_SECRET" lib/stripe app | head -20

# 5. The checkout + portal routes (paths the UI calls):
grep -rnE "billing/checkout|billing/portal|billing/downgrade|createCheckoutSession|createPortalSession" app lib | head

# 6. Upstash (sample-audit rate-limit) env, since Part 2 of the test runbook needs it:
grep -rnE "UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN|SAMPLE_AUDIT" lib app .env.dev | sort -u

# 7. The audit-status spelling in the webhook path (the 'complete' vs 'completed' footgun):
grep -rnE "status.{0,4}'completed'|'completed'.{0,4}status" lib/stripe app/api/webhooks 2>/dev/null
```

## Output — a short config sheet the operator can act on:
1. **Stripe webhook endpoint path** (e.g. `/api/webhooks/stripe` or whatever it actually is) — so
   `stripe listen --forward-to localhost:3000/<that-path>` is correct.
2. **Full list of Stripe env var names** (secret key, publishable key, webhook secret, every
   `STRIPE_PRICE_*`) — so the operator knows exactly what to put in `.env.dev`.
3. **Price-map table:** which env key maps to which tier+billing (Growth monthly → `STRIPE_PRICE_...`,
   etc.) — so the operator creates the right products in Stripe.
4. **Webhook events handled** + how signatures are verified (confirms `STRIPE_WEBHOOK_SECRET` usage).
5. **Checkout/portal/downgrade route paths** the UI hits.
6. **Upstash + sample-audit env names** (for the runbook's sample-audit test).
7. **Any `'completed'` audit-status typo** in the webhook path (flag it; do not fix here).

Change nothing. Report only.
