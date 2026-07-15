# VisibleAU — Investigation ONLY: report the exact AUD tier prices for Stripe test-product setup
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
**Read-only. Change nothing. Just report the canonical prices so the operator can create matching
Stripe test products.**

## Why
The operator is creating Stripe test-mode products and wants them to mirror the REAL AUD tier pricing
(so the checkout flow + GST display are realistic). Report the exact amounts per tier + billing
interval from the canonical source.

## Tasks — run, paste raw output, then summarise

```bash
# 1. The tier definitions (prices, intervals, AUD amounts):
cat lib/pricing/tiers.ts

# 2. The one-off audit price (may be separate from the tier table):
grep -rnE "one.?off|ONE_OFF|oneOff|299|single audit|payg|pay.?as" lib/pricing lib/stripe app | head

# 3. How GST is applied (to confirm whether the stored price is GST-inclusive or exclusive):
cat lib/pricing/gst.ts 2>/dev/null || grep -rnE "gst|GST|inc.?gst|ex.?gst|0\.1|10%" lib/pricing | head

# 4. Annual pricing — is it a discount (e.g. 10×monthly, or 2 months free), or an explicit amount?
grep -rnE "annual|yearly|12|10 \*|months free|discount" lib/pricing/tiers.ts | head
```

## Output — a clean table the operator can use to create Stripe products:
For EACH tier (free / starter / growth / agency / agency_pro / enterprise) report:
- **Monthly price** (AUD amount, and whether that figure is GST-inclusive or GST-exclusive)
- **Annual price** (AUD amount; note if it's a discount vs 12× monthly)
- **The one-off audit price** (AUD)

Also state explicitly:
- Which tiers have NO Stripe price (free = no billing; enterprise = custom/contact-sales?) — so the
  operator knows NOT to create products for those.
- Whether the prices in `tiers.ts` are stored **GST-inclusive or GST-exclusive** (this determines what
  number to type into Stripe — Stripe stores the charge amount; if tiers.ts is ex-GST and AU customers
  are charged inc-GST, note the distinction, but DON'T change anything — just report it so the operator
  decides what to enter).

Format the answer as a simple table:
| Tier | Monthly (AUD) | Annual (AUD) | Notes (inc/ex GST, discount) |

Plus a one-liner for the one-off audit price.

Change nothing. Report only.
