# VisibleAU — Add Stripe test-mode keys to .env.dev (placeholders; operator fills real values)
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
Scope: ONLY `.env.dev` (+ `.env.example` if present). No code changes.

## What to do
The operator has created a Stripe **test-mode** account and will paste the real key values
themselves (the secret key must NOT be requested in chat or written by you). Your job is to make sure
`.env.dev` has the correct Stripe env var LINES present and clearly marked, so the operator just fills
the right-hand side locally.

## STEP 0 — Check current state (report)
```bash
grep -nE "STRIPE_SECRET_KEY|NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY|STRIPE_WEBHOOK_SECRET|STRIPE_PRICE_" .env.dev
ls .env.example 2>/dev/null && grep -nE "STRIPE_" .env.example
```
Report which Stripe lines already exist in `.env.dev` and whether they're blank, stubbed, or already
filled. **Do NOT print full secret values** if any real key is already present — just report
"present (sk_test_… redacted)" or "blank/stub".

## STEP 1 — Ensure these exact lines exist in `.env.dev`
If a line is missing, add it. If it exists but is blank/stub, leave a clear placeholder. Use this
EXACT block (keys + the 9 price IDs the price-map expects). Do NOT invent or fabricate any values —
use the literal placeholder text shown so the operator knows what to replace:

```
# --- Stripe (TEST MODE — replace <...> with your test-mode values; never commit real keys) ---
STRIPE_SECRET_KEY=<PASTE_sk_test_KEY_HERE>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<PASTE_pk_test_KEY_HERE>
STRIPE_WEBHOOK_SECRET=<PASTE_whsec_FROM_stripe_listen_HERE>
# Price IDs (test mode, AUD, GST-inclusive amounts) — fill after creating products:
STRIPE_PRICE_STARTER_MONTHLY=<price_id>
STRIPE_PRICE_STARTER_ANNUAL=<price_id>
STRIPE_PRICE_GROWTH_MONTHLY=<price_id>
STRIPE_PRICE_GROWTH_ANNUAL=<price_id>
STRIPE_PRICE_AGENCY_MONTHLY=<price_id>
STRIPE_PRICE_AGENCY_ANNUAL=<price_id>
STRIPE_PRICE_AGENCY_PRO_MONTHLY=<price_id>
STRIPE_PRICE_AGENCY_PRO_ANNUAL=<price_id>
STRIPE_PRICE_ONE_OFF_AUDIT=<price_id>
```
Rules:
- If any of these lines ALREADY contain a real value (e.g. an existing `sk_test_…`), DO NOT overwrite
  it — leave it as-is and report that it was already set.
- Only add missing lines / set placeholders for blank ones.
- Preserve the rest of `.env.dev` untouched (don't reorder or delete other vars).

## STEP 2 — Confirm .env.dev is gitignored (safety)
```bash
grep -nE "\.env\.dev|\.env\*|\.env" .gitignore
git check-ignore .env.dev && echo "OK: .env.dev is gitignored" || echo "WARNING: .env.dev NOT gitignored"
```
If `.env.dev` is NOT gitignored, FLAG it loudly (a real secret would be at risk of being committed) —
but do not modify .gitignore without telling the operator; just report it.

## Constraints
- Touch ONLY `.env.dev` (and read-only check `.env.example` / `.gitignore`).
- NEVER request, generate, guess, or write actual key values — placeholders only.
- Do not echo any existing real secret value in your output (redact to `sk_test_…`).
- No app/code changes.

## Verification / report
1. Show the final Stripe block in `.env.dev` (with placeholders or "already set / redacted" — never a
   full real secret).
2. Report the gitignore check result.
3. Remind the operator: after pasting real values, **restart `pnpm dev`** for them to take effect
   (env changes don't hot-reload). `STRIPE_WEBHOOK_SECRET` stays a placeholder until `stripe listen`
   is run (it prints the `whsec_`).
