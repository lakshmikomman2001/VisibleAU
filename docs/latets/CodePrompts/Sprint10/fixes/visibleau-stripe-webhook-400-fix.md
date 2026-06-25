# VisibleAU — Diagnose & fix: Stripe webhook returns 400 (signature verification failing)
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
Symptom: a real test payment succeeded on Stripe (charge.succeeded, checkout.session.completed,
customer.subscription.created all fired), but EVERY `POST /api/webhooks/stripe` returned **[400]**, so
the org tier never updated (billing page still shows Free, message wrongly says "Welcome to Free!").
A 400 on every webhook almost always = signature verification failing → usually a
`STRIPE_WEBHOOK_SECRET` mismatch or the app not restarted after setting it.

## Known facts
- `stripe listen` is forwarding with signing secret:
  `whsec_3d884e35f5a712e85ed71e8ad18be604d64343704b9b4e590c806e2cabc06955`
- The app's webhook route is `app/api/webhooks/stripe/route.ts`; signature verify is in
  `lib/stripe/verify-webhook.ts` using `stripe.webhooks.constructEvent(rawBody, sig, SECRET)`.
- Operator set `STRIPE_WEBHOOK_SECRET` in `.env.dev` but may not have restarted `pnpm dev`, or the
  value may not match exactly.

## STEP 0 — Diagnose (run all, report)
```bash
# 1. What secret does .env.dev actually have? (compare to the whsec_ above, char-for-char)
grep -nE "STRIPE_WEBHOOK_SECRET" .env.dev
# Does it EXACTLY equal whsec_3d884e35f5a712e85ed71e8ad18be604d64343704b9b4e590c806e2cabc06955 ?
# Report: match / mismatch / blank / truncated.

# 2. Which env var does the code actually read for the webhook secret?
grep -rnE "STRIPE_WEBHOOK_SECRET|webhookSecret|constructEvent|signing" lib/stripe app/api/webhooks | head

# 3. The route — is it reading the RAW body correctly? (constructEvent needs the raw, unparsed body.
#    If the body is parsed/transformed, signature verification fails with 400 even if the secret is
#    right. In Next.js App Router, must use await req.text() — NOT req.json().)
sed -n '1,60p' app/api/webhooks/stripe/route.ts

# 4. The verify helper:
cat lib/stripe/verify-webhook.ts

# 5. Is .env.dev even the env file pnpm dev loads? Check how env is loaded (some setups use .env.local
#    or .env, not .env.dev — if pnpm dev doesn't load .env.dev, the secret is effectively unset):
grep -nE "dotenv|env\.dev|\.env\.local|NODE_ENV|env-cmd|dotenv-cli" package.json next.config.* 2>/dev/null
cat .env 2>/dev/null | grep -c STRIPE_WEBHOOK_SECRET ; cat .env.local 2>/dev/null | grep -c STRIPE_WEBHOOK_SECRET
```
Report which of these is the cause:
- (A) secret in .env.dev doesn't match the stripe listen whsec_ → fix the value;
- (B) secret matches but pnpm dev wasn't restarted → restart;
- (C) the app loads a DIFFERENT env file (.env.local/.env) than .env.dev → the secret must go there, or
      pnpm dev must be configured to load .env.dev;
- (D) the route uses req.json()/parsed body instead of the raw body → signature can't verify → fix to
      read raw body (await req.text()) before constructEvent;
- (E) reads a different env var name than STRIPE_WEBHOOK_SECRET.

## STEP 1 — Fix the identified cause
- **If (A):** set STRIPE_WEBHOOK_SECRET in .env.dev to EXACTLY
  `whsec_3d884e35f5a712e85ed71e8ad18be604d64343704b9b4e590c806e2cabc06955` (no quotes, no trailing
  space/newline). 
- **If (C):** put the secret in the env file the app actually loads (or align the dev script to load
  .env.dev). Report which file.
- **If (D):** fix the route to read the raw body: in App Router, `const body = await req.text();` then
  `stripe.webhooks.constructEvent(body, sig, secret)`. Ensure no middleware/bodyParser is consuming it.
  (This is a real code bug if present — do NOT just blame config.)
- **If (E):** align the env var name.
- Do NOT print the full secret in output beyond confirming match; it's a webhook secret (lower
  sensitivity than the API key, but still).

## STEP 2 — Operator must restart pnpm dev
After any .env change, the dev server MUST be restarted (env doesn't hot-reload). Note this in the
report. (Claude Code cannot restart the operator's terminal.)

## STEP 3 — Re-test guidance (for the operator)
Provide the exact retry steps:
1. Ensure `stripe listen --forward-to localhost:3000/api/webhooks/stripe` is running (note: if it was
   restarted, it prints a NEW whsec_ — must re-sync .env.dev + restart again).
2. `pnpm dev` restarted.
3. Trigger a fresh test: either re-run the upgrade from /pricing, OR use the CLI to replay/trigger:
   `stripe trigger checkout.session.completed` (sends a test event without going through checkout).
4. Watch for `POST /api/webhooks/stripe [200]` (was [400]).
5. Confirm tier:
   `SELECT o.tier FROM organizations o JOIN users u ON u.organization_id=o.id WHERE u.email='free1@test.visibleau.dev';`
   → expect 'growth'.

## STEP 4 — Also flag (do not necessarily fix now)
The success page showed "Welcome to Free!" after a Growth purchase — because the tier never updated
(webhook 400) AND/OR the success message derives the plan name incorrectly. Once webhooks return 200
and tier→growth, re-check the success copy reads "Welcome to Growth". If it STILL says the wrong plan
after tier updates correctly, that's a separate copy bug in the success handler — report it.

## Constraints
- Find the REAL cause (could be config OR a raw-body code bug) — don't assume it's just the secret.
- If it's the raw-body bug (D), that's a genuine code fix, not a config tweak.
- Report cause + fix + the exact operator retry steps.
