# VisibleAU Sprint 10 — Test Runbook (Onboarding + Sample Audit + Stripe Billing)
Follow top to bottom. Stripe is **test mode only** — no real cards, no real money, ever.

---

## Part 0 — One-time setup (do this once)

### 0.1 Stripe test-mode account + products
1. Log in to dashboard.stripe.com → toggle **Test mode** (switch, top-right). Everything below is on the test side.
2. **Products → Add product** for each tier/billing combo your `price-map.ts` expects. From your env list you need price IDs for:
   - Growth monthly, Growth annual
   - Agency monthly, Agency annual
   - Agency Pro monthly, Agency Pro annual
   - One-off audit (A$299, one-time — NOT recurring)
   Set each price in **AUD**. For subscriptions choose "Recurring"; for the one-off audit choose "One time".
3. Copy each resulting `price_…` ID.

### 0.2 Stripe CLI (forwards webhooks to localhost)
- Install: `brew install stripe/stripe-cli/stripe` (mac) / `scoop install stripe` (win) / see stripe.com/docs/stripe-cli. You're on WSL2 — install the Linux binary inside WSL.
- `stripe login` → approve in browser (links the CLI to your test account).

### 0.3 Fill `.env.dev` (test-mode values)
Confirm these are the names your build actually reads (your summary says 12 vars were added to `.env.dev`):
```bash
grep -nE "STRIPE_|UPSTASH_|SAMPLE_AUDIT|FX_AUD" .env.dev
```
Set:
```
STRIPE_SECRET_KEY=sk_test_...              # Dashboard → Developers → API keys (TEST)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_GROWTH_MONTHLY=price_...      # the IDs from 0.1
STRIPE_PRICE_GROWTH_ANNUAL=price_...
STRIPE_PRICE_AGENCY_MONTHLY=price_...
STRIPE_PRICE_AGENCY_ANNUAL=price_...
STRIPE_PRICE_AGENCY_PRO_MONTHLY=price_...
STRIPE_PRICE_AGENCY_PRO_ANNUAL=price_...
STRIPE_PRICE_ONE_OFF_AUDIT=price_...
STRIPE_WEBHOOK_SECRET=whsec_...            # filled in Part 1, step 2 (from `stripe listen`)
UPSTASH_REDIS_REST_URL=https://...         # a free Upstash Redis DB (console.upstash.com)
UPSTASH_REDIS_REST_TOKEN=...
SAMPLE_AUDIT_USE_REAL_LLM=true
SAMPLE_AUDIT_COST_CAP_AUD=0.10
FX_AUD_USD=0.66
```
> Sample audit hits a REAL ChatGPT call (~A$0.10, capped) — that's the LLM, not Stripe. If you want zero spend during a first dry run, temporarily set `SAMPLE_AUDIT_USE_REAL_LLM=false` to confirm the *flow/UX* on mock, then flip back to `true` for one genuine end-to-end pass.

### 0.4 Migrate BEFORE seed (canon ordering — HH5)
`organizations.slug` must exist before `ensureSampleOrg()` runs, or the seed throws "column slug not found":
```bash
pnpm drizzle-kit migrate          # or your repo's migrate script
```
Then run the seed that calls `ensureSampleOrg()` (check the script name):
```bash
grep -rnE "ensureSampleOrg|seed" package.json scripts/ | head
# run whatever the repo exposes, e.g.:
pnpm tsx scripts/seed.ts          # adjust to the real path
```
Confirm the synthetic org exists:
```sql
SELECT id, slug, tier FROM organizations WHERE slug = 'sample';
```

### 0.5 Sanity: migrations + RLS actually applied
```bash
grep -rnE "subscriptions|processed_webhook_events" drizzle/    # migration files exist (not raw-SQL-to-dev only)
```
> Your earlier scheduling work applied an index via raw SQL with no migration file (prod drift risk). Re-confirm Sprint 10's tables came in via real migration files so prod gets them.

---

## Part 1 — Start the stack (two terminals, every test session)

**Terminal A — app:**
```bash
pnpm dev          # confirm http://localhost:3000 is up; LLM_MODE per your dev default
```

**Terminal B — Stripe webhook forwarding (leave running the whole session):**
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
- It prints `> Ready! Your webhook signing secret is whsec_xxx`. **Copy that `whsec_…` into `STRIPE_WEBHOOK_SECRET` in `.env.dev`, then restart Terminal A** so the app picks it up. (Webhook signature verification — your `verify-webhook.ts` — fails without the matching secret.)
- Keep this terminal visible: it logs every event + your endpoint's HTTP response (200 = handled).

---

## Part 2 — Test the SAMPLE AUDIT flow (pre-signup, no Stripe)

Definition of done (canon §47): visitor enters domain → ~90s audit → result + signup CTA.

1. Open `http://localhost:3000/sample-audit` (or click "Free audit" in the marketing nav).
2. Enter a domain + vertical (e.g. `bondiplumbing.com.au`, Tradies) → submit → `POST /api/sample-audit`.
3. **Running page** (`/sample-audit/running`): progress bar polls `GET /api/audits/[auditId]/status` (this route is intentionally UNauthenticated — it's pre-signup). Confirm it advances and doesn't 401.
4. **Result page** (`/sample-audit/result/[id]`): a real score shows + the UPGRADE CTA ("This is a sample… Sign up free to run one").
5. **Rate limit (Upstash):** repeat the submit from the same IP 4×. The **4th** must be blocked (3/IP/24h). If it isn't, Upstash creds are wrong or the limiter isn't wired.
6. **Honesty check:** the score on the result page must be a real audit result, not a placeholder. (Trust-product rule — no fabricated numbers.)

> If you set `SAMPLE_AUDIT_USE_REAL_LLM=false` for a dry run, the flow/UX is identical but the score is mock — flip to `true` and do ONE real pass to confirm the genuine ChatGPT path + the A$0.10 cap.

---

## Part 3 — Test CHECKOUT → WEBHOOK → TIER UPGRADE (the core billing path)

Definition of done (canon §47): Free user clicks Upgrade → Checkout → test card → webhook → `organizations.tier='growth'` within ~30s → Growth features unlock.

1. Sign in as a **Free-tier** test user (or set your dev org to `tier='free'` first):
   ```sql
   UPDATE organizations SET tier='free' WHERE id='<your-dev-org-id>';
   ```
2. Go to `/pricing`. Verify: 6 tier cards, monthly/annual toggle changes prices, **GST inc/ex toggle** changes the displayed amount (AU GST = 10%), one-off audit section present.
3. Click **Upgrade to Growth** → `POST /api/billing/checkout` → redirected to Stripe Checkout (test mode — you'll see a "TEST MODE" banner).
4. Pay with the **success test card**:
   - Card `4242 4242 4242 4242`, any future expiry (e.g. 12/34), any CVC (e.g. 123), any postcode (e.g. 2000).
5. After redirect back, watch **Terminal B**: you should see `checkout.session.completed` → your endpoint returns **200**. (Also `customer.subscription.created/updated`.)
6. Confirm the tier actually changed:
   ```sql
   SELECT tier FROM organizations WHERE id='<your-dev-org-id>';        -- expect 'growth'
   SELECT * FROM subscriptions WHERE organization_id='<your-dev-org-id>';
   ```
7. Reload the app → Growth features unlocked; `/settings/billing` shows the Growth plan card + usage.

### Decline + SCA cards (run these too)
- **Decline:** `4000 0000 0000 0002` → Checkout shows the card declined; tier must NOT change; no spurious subscription row.
- **3D-Secure / SCA required:** `4000 0027 6000 3184` → Checkout presents an authentication step; complete it → success path; tier upgrades. (Cancel the auth → no upgrade.)

---

## Part 4 — WEBHOOK IDEMPOTENCY (Sprint 10's #1 blast-radius risk)

The same event must never apply twice (no tier flapping). Your handler wraps the tier update + the `processed_webhook_events` insert in one transaction with a UNIQUE guard — prove it:

1. Replay the same event twice from a 3rd terminal:
   ```bash
   stripe trigger checkout.session.completed
   stripe trigger checkout.session.completed
   ```
   (Or, more precise: in Terminal B's log, copy a real `evt_…` id from the live run and use
   `stripe events resend evt_...` twice.)
2. Expected: **both** return 200, but the **second is a no-op** — exactly one row in `processed_webhook_events` for that event id, tier unchanged on the second hit, no duplicate `subscriptions` row.
   ```sql
   SELECT event_id, COUNT(*) FROM processed_webhook_events GROUP BY event_id HAVING COUNT(*) > 1;  -- expect ZERO rows
   ```
3. If the second replay changes state or inserts a dup → the transaction/guard isn't atomic. Flag it (this is the exact edge the prompt warned about).

> **`'complete'` vs `'completed'` watch:** the one-off-audit webhook path FIRES an audit. The Stripe event is `checkout.session.completed` (correct, with -d) but the DB audit `status` is `'complete'` (no -d). After a one-off purchase, confirm the created audit row has `status` progressing through the real DB enum, not a stray `'completed'`:
> ```bash
> grep -rnE "status:\s*'completed'|\.eq\(.*status.*'completed'\)" lib/stripe/webhook-handlers/
> ```
> Any hit here is the footgun — should be `'complete'` (or, correctly, the audit lifecycle the rest of the app uses).

---

## Part 5 — CUSTOMER PORTAL + DOWNGRADE / RETENTION

1. As the now-Growth user, go to `/settings/billing` → click the **portal button** → `POST /api/billing/portal` → redirected to Stripe's hosted Customer Portal (test mode). Confirm you can see the plan / payment method / invoices.
   > If the portal errors, you likely need to **activate the Customer Portal** once in Dashboard → Settings → Billing → Customer portal (test mode) and save its configuration.
2. **Retention modal:** trigger the downgrade/cancel flow in-app → the 3-option modal appears:
   - **Downgrade to Free**
   - **Pause for 1 month** → this should set the org's **Sprint 9 audit schedules to `paused`** (cross-feature check — verify on `/agency/schedules`).
   - **Cancel anyway** → proceeds.
3. **Downgrade:** choose it → `POST /api/billing/downgrade` sets `cancel_at_period_end: true`. Confirm:
   ```sql
   SELECT cancel_at_period_end, current_period_end FROM subscriptions WHERE organization_id='<org-id>';
   ```
   - User keeps Growth until period end (tier shouldn't flip to free immediately).
4. **Simulate the period actually ending** (so you test the deletion path without waiting a month):
   ```bash
   stripe trigger customer.subscription.deleted
   ```
   → watch Terminal B for 200 → confirm `organizations.tier` drops to `'free'` and Growth features lock.

---

## Part 6 — ONBOARDING (post-signup first-run state machine)

1. Sign up a **brand-new** user (new email) → Clerk email verify → after verify you should land on **`/brands/wizard`** (NOT `/dashboard`) per canon.
2. Complete the wizard → a **first audit auto-fires using the new user's tier** (Free = 2 engines, ChatGPT + Perplexity).
3. Until that audit completes, nav shows the "complete your first audit" CTA; `welcome-modal` shows on first visit. Confirm the flag is **server-side** (`organizations.onboardingComplete` / `org.metadata.firstTimeFlowComplete`), not localStorage:
   - Log in from a different browser/incognito as the same user → the completed state must persist (proves it's not localStorage).
4. After the first audit completes → user lands on `/dashboard`; CTA + modal gone.

---

## Part 7 — Automated tests (run the suite your build should include)

```bash
pnpm test        # or vitest — run the Sprint 10 unit/integration tests
```
Confirm these exist and pass (canon §11): each webhook handler idempotent (unit), GST math (unit), checkout→webhook→tier integration. If any are missing, that's a gap to flag — idempotency + GST are the two you don't want unverified.

---

## What "signed off" looks like
- Sample audit: real score + CTA + rate limit (4th blocked). ✅
- Checkout: `4242` upgrades tier within ~30s; decline + SCA cards behave correctly. ✅
- Idempotency: double-replay = one state change, zero dup rows. ✅
- Portal + downgrade: portal opens; downgrade sets period-end; `subscription.deleted` drops to free; "Pause" pauses Sprint 9 schedules. ✅
- Onboarding: verify → wizard → first audit → /dashboard; flag is server-side + persists. ✅
- No `'completed'` leak in audit-status writes; no fabricated sample scores. ✅
- Migrations are real files (prod parity), not raw-SQL-to-dev. ✅

## If something fails
Capture: the failing step, Terminal B's event log line (event type + your endpoint's HTTP status), any red app-console error, and the relevant SQL result. Send those back and I'll write a scoped Claude Code fix prompt per issue.
