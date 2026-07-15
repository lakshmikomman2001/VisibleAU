# VisibleAU — Install Stripe CLI + create 9 test prices + write IDs to .env.dev
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo (must be the SAME WSL
environment where you will run `stripe login`).**

## ⚠️ OPERATOR MUST DO THIS FIRST (interactive — cannot be automated)
Before this prompt's create-commands will work, the operator must authenticate the Stripe CLI:
```
stripe login
```
…open the printed URL, approve the pairing code in the browser, linking the CLI to their TEST-MODE
sandbox. **Do NOT proceed past STEP 1 until `stripe config --list` confirms an authenticated account.**
(Claude Code cannot perform this browser approval.)

---

## STEP 1 — Install the Stripe CLI (if not already installed) + verify auth
```bash
# Is it already installed?
stripe --version 2>/dev/null || echo "NOT INSTALLED"
```
If NOT installed, install for Debian/Ubuntu (WSL):
```bash
curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee /etc/apt/sources.list.d/stripe.list
sudo apt update && sudo apt install -y stripe
stripe --version
```
Then verify the operator is authenticated (this is the gate — STOP if it fails):
```bash
stripe config --list 2>&1 | head    # expect an account/key entry, not an auth error
```
If this shows NO authenticated account → STOP and tell the operator to run `stripe login` first.
Do not attempt the create commands without auth (they will fail).

Also CONFIRM you're in TEST mode (the create commands must NOT hit a live account):
```bash
stripe config --list 2>&1 | grep -iE "test_mode|live" 
```
If there is any doubt the linked account is the test/sandbox one, STOP and ask the operator to confirm.

## STEP 2 — Create the 9 prices (cents AUD, GST-inclusive)
Run each; CAPTURE the returned `id` (price_...) for each. (`stripe prices create` with inline
`product_data[name]` creates the product + price together.)
```bash
stripe prices create -d "unit_amount=9900"    -d "currency=aud" -d "recurring[interval]=month" -d "product_data[name]=VisibleAU Starter (Monthly)"
stripe prices create -d "unit_amount=99000"   -d "currency=aud" -d "recurring[interval]=year"  -d "product_data[name]=VisibleAU Starter (Annual)"
stripe prices create -d "unit_amount=29900"   -d "currency=aud" -d "recurring[interval]=month" -d "product_data[name]=VisibleAU Growth (Monthly)"
stripe prices create -d "unit_amount=299000"  -d "currency=aud" -d "recurring[interval]=year"  -d "product_data[name]=VisibleAU Growth (Annual)"
stripe prices create -d "unit_amount=49900"   -d "currency=aud" -d "recurring[interval]=month" -d "product_data[name]=VisibleAU Agency (Monthly)"
stripe prices create -d "unit_amount=499000"  -d "currency=aud" -d "recurring[interval]=year"  -d "product_data[name]=VisibleAU Agency (Annual)"
stripe prices create -d "unit_amount=149900"  -d "currency=aud" -d "recurring[interval]=month" -d "product_data[name]=VisibleAU Agency Pro (Monthly)"
stripe prices create -d "unit_amount=1499000" -d "currency=aud" -d "recurring[interval]=year"  -d "product_data[name]=VisibleAU Agency Pro (Annual)"
stripe prices create -d "unit_amount=29900"   -d "currency=aud" -d "product_data[name]=VisibleAU Single Audit (One-off)"
```
Notes:
- The LAST one (one-off audit) has NO `recurring[interval]` — that makes it a one-time price. Correct.
- Amounts are cents (A$99 = 9900). Do not change them.
- If any command errors with an auth/permission message → STOP (the operator isn't logged in / wrong
  account). If it errors on syntax, report the exact stderr.

## STEP 3 — Write the price IDs into .env.dev (map in THIS order)
Take the 9 returned `price_...` ids IN THE ORDER created and set them in `.env.dev`, replacing the
existing `<price_id>` placeholders:
```
STRIPE_PRICE_STARTER_MONTHLY=<id from cmd 1>
STRIPE_PRICE_STARTER_ANNUAL=<id from cmd 2>
STRIPE_PRICE_GROWTH_MONTHLY=<id from cmd 3>
STRIPE_PRICE_GROWTH_ANNUAL=<id from cmd 4>
STRIPE_PRICE_AGENCY_MONTHLY=<id from cmd 5>
STRIPE_PRICE_AGENCY_ANNUAL=<id from cmd 6>
STRIPE_PRICE_AGENCY_PRO_MONTHLY=<id from cmd 7>
STRIPE_PRICE_AGENCY_PRO_ANNUAL=<id from cmd 8>
STRIPE_PRICE_ONE_OFF_AUDIT=<id from cmd 9>
```
Rules:
- Edit ONLY these 9 lines in `.env.dev`. Do NOT touch `STRIPE_SECRET_KEY`,
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, or any other var.
- price_ ids are NOT secrets (safe to write), but still don't print the secret KEY values from the
  file in your output.
- Preserve the rest of the file.

## STEP 4 — Verify
```bash
# All 9 price vars now have a price_ value (no placeholders left):
grep -nE "STRIPE_PRICE_.*=price_" .env.dev   # → 9 matches
grep -nE "STRIPE_PRICE_.*=<price_id>" .env.dev  # → 0 matches (no leftover placeholders)

# Cross-check the created prices exist in the account (count + amounts):
stripe prices list --limit 20 2>&1 | grep -E "id|unit_amount|interval" | head -40
```
Confirm 9 prices exist with the right amounts/intervals, and `.env.dev` has all 9 ids mapped.

## STEP 5 — Report + next-step reminder
Report: CLI version, auth confirmation (test mode), the 9 created price ids mapped to their env vars
(price ids are fine to show), and the verification grep results. Then remind the operator:
- **Restart `pnpm dev`** so the new `STRIPE_PRICE_*` values load.
- `STRIPE_WEBHOOK_SECRET` is still a placeholder — next run:
  `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, copy the printed `whsec_` into
  `.env.dev`, restart again. THEN the first test payment (card 4242 4242 4242 4242).

## Constraints
- Do NOT run `stripe login` for the operator (you can't) — only verify auth exists.
- Do NOT create live-mode anything — confirm test mode first.
- Touch only the 9 `STRIPE_PRICE_*` lines in `.env.dev`. No code changes.
- If auth is missing or the account might be live, STOP and report rather than guessing.
