# VisibleAU — Write the 9 Stripe test price IDs into .env.dev
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
Scope: ONLY the 9 `STRIPE_PRICE_*` lines in `.env.dev`. No code changes. (Price IDs are NOT secrets.)

## What to do
The operator created 9 Stripe TEST-MODE products and collected their price IDs. Set each of the 9
`STRIPE_PRICE_*` vars in `.env.dev` to the exact value below, replacing any `<price_id>` placeholder.

## STEP 1 — Set these exact values in `.env.dev`
```
STRIPE_PRICE_STARTER_MONTHLY=price_1TlpJfLeNriTNrK7UWOxdThh
STRIPE_PRICE_STARTER_ANNUAL=price_1TlpLxLeNriTNrK7K6VHMgJj
STRIPE_PRICE_GROWTH_MONTHLY=price_1TlpNGLeNriTNrK7OYptYSMD
STRIPE_PRICE_GROWTH_ANNUAL=price_1TlpPeLeNriTNrK7skDnXzmD
STRIPE_PRICE_AGENCY_MONTHLY=price_1TlpQaLeNriTNrK7fumc9pu7
STRIPE_PRICE_AGENCY_ANNUAL=price_1TlpRGLeNriTNrK7PMZc5V9O
STRIPE_PRICE_AGENCY_PRO_MONTHLY=price_1TlpSFLeNriTNrK7PmfCHeHR
STRIPE_PRICE_AGENCY_PRO_ANNUAL=price_1TlpT7LeNriTNrK7wGWBdo8I
STRIPE_PRICE_ONE_OFF_AUDIT=price_1TlpUuLeNriTNrK7UOainKbw
```

Rules:
- Replace ONLY these 9 lines. If a line already exists (placeholder or value), overwrite its value
  with the one above. If a line is missing, add it under the existing Stripe block.
- Do NOT touch `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, or
  any other variable. Do not reorder or delete anything else.
- Do NOT print the secret KEY value from the file in your output (redact if you must reference it).

## STEP 2 — Verify
```bash
# All 9 mapped to real price_ values:
grep -nE "STRIPE_PRICE_.*=price_1Tlp" .env.dev    # → 9 matches
# No leftover placeholders:
grep -nE "STRIPE_PRICE_.*=<price_id>|STRIPE_PRICE_.*=$" .env.dev   # → 0 matches
# Sanity: the two keys are still present (do NOT print their values):
grep -cE "STRIPE_SECRET_KEY=sk_test|NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test" .env.dev  # → 2
```

## STEP 3 — Report + reminder
Report: the 9 price vars now set (price ids are fine to show), the verification grep results, and
confirm the keys + webhook-secret lines were untouched. Then remind the operator:
- **Restart `pnpm dev`** so the new `STRIPE_PRICE_*` values load.
- `STRIPE_WEBHOOK_SECRET` is STILL a placeholder — it's the last missing piece. It comes from running
  `stripe listen --forward-to localhost:3000/api/webhooks/stripe` (prints a `whsec_`), which needs the
  Stripe CLI. (Operator is deciding CLI vs dashboard-webhook approach separately.)

## Constraints
- Only the 9 `STRIPE_PRICE_*` lines in `.env.dev`. No code, no other env vars.
- These price IDs are test-mode and non-secret — safe to write and echo.
