# Sprint 10 — Onboarding + Sample Audit + Stripe Billing

**Sprint:** 10 of 12
**Estimated effort:** 40-50 hours (~5-6 weekends at 8 hrs/week — covers PRD §11 Sprint 10 onboarding scope + Stripe billing originally drafted as separate sprint)
**Goal:** Self-serve signup → wizard → first audit flow. Pre-signup sample audit (1 engine, 5 prompts, ~90s, ~A$0.10). Stripe checkout + customer portal + webhook handlers. One-off audit (A$299) + annual billing prices.
**Prerequisites:** Sprint 9 complete. Agency tier features operational. Per-tier `TIER_AUDIT_LIMITS` matches PRD §7 canonical.
**Out of scope:** Polish + landing page (Sprint 11), launch readiness + Sentry (Sprint 12).

---

## 0. Read first

1. `CLAUDE.md`
2. `sri-geo-aeo-prd-v1.md` v1.14 §7 Pricing Strategy (canonical prices + sample audit spec) + §7.6 pricing model A/B + §11 Sprint 10
3. Stripe Checkout docs (current): https://stripe.com/docs/payments/checkout
4. Stripe webhook idempotency: https://stripe.com/docs/webhooks/best-practices

---

## 1. What ships this sprint

### Self-serve onboarding flow

- ✓ **Signup → email verify → wizard → first audit** — Clerk handles email verify. After verify, redirect to `/brands/wizard` (NOT `/dashboard`). Wizard from Sprint 4. After wizard completion, auto-trigger first audit using **the new user's tier rules** (Free tier = 2 engines ChatGPT + Perplexity per PRD §7 + Sprint 3 TIER_ENGINES). The pre-signup *sample audit* (below, 1 engine ChatGPT) already gave the 90-second teaser; the first post-signup audit honours the tier they signed up for.
- ✓ **First-time UX state machine** — `org.metadata.firstTimeFlowComplete`: false until first audit completes. Until then, navigation hints to "complete your first audit" CTA.

### Sample audit (PRD §7 Pricing Principle #6)

- ✓ **Sample audit at landing page** — `/sample-audit?domain=X&vertical=Y`. **1 engine (ChatGPT only), 5 prompts, single run, ~90 seconds, ~A$0.10 cost** per PRD canonical (conflict-audit C3: was 2 engines in my v1.0 Sprint 11; fixed here).
- ✓ **No-signup flow** — Visitor enters domain + vertical → POST `/api/sample-audit` → rate-limited (3 per IP per day via Upstash) → live progress UI → simplified results page
- ✓ **Synthetic "sample" organization** — Auto-created at seed time; all sample audits attach to it for tenancy. Auto-deleted after 24h via Inngest cron.
- ✓ **Real-LLM default** — Sample audit uses real ChatGPT (not mock) so demo is genuine. Cost is bounded at A$0.10 max. Rate-limit prevents abuse.
- ✓ **Results page UPGRADE CTA** — "This is a sample. Full audit = 4 engines × 10 prompts × 5 runs = 200 LLM calls. Sign up free to run one."

### Stripe billing

- ✓ **Stripe Checkout for paid tiers** — Starter A$99, Growth A$299, Agency A$499, Agency Pro A$1,499 — both monthly + annual prices (annual = 10× monthly = 2 months free per PRD §7 Principle #3)
- ✓ **One-off audit product (A$299)** — Sprint 1 created the Stripe product; Sprint 10 wires the purchase flow + conversion path UX
- ✓ **Customer Portal** — `/settings/billing` opens Stripe-hosted portal for plan changes + invoices + cancellation
- ✓ **Subscription webhooks** — `customer.subscription.created/updated/deleted`, `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`. Idempotent (replay-safe via `processed_webhook_events` table).
- ✓ **Tier sync** — Webhook handlers update `organizations.tier` based on active subscription
- ✓ **AUD pricing display** — GST-inclusive by default for AU users (10% GST). Toggle for ex-GST view (UK/US/CA/NZ users default ex-GST).
- ✓ **Pricing page polish** — `/pricing` page (Sprint 11 polishes visually; Sprint 10 makes it functional)
- ✓ **Upgrade CTAs** — `components/domain/pricing/upgrade-cta.tsx` used across app (quota-exceeded states from Sprint 9, Free tier blurred recommendations from Sprint 6, Action Center)
- ✓ **Cancellation retention modal** — Before redirecting to Stripe Customer Portal cancellation, show in-app retention prompt: "Downgrade to Free" / "Pause for 1 month" / "Cancel anyway"

**Definition of done:** Visitor enters domain on landing → 90-second sample audit → result + signup CTA → click → email verify → brand wizard → first audit fires + completes → user lands on /dashboard. Separately: existing Free user clicks "Upgrade to Growth" → Stripe Checkout → enters test card → webhook fires → `organizations.tier='growth'` within 30s → Growth features unlock. One-off audit purchase fires single audit and emails report.

---

## 2. Dependencies to install

```bash
# Stripe already installed Sprint 1
# stripe @stripe/stripe-js

# Sample audit rate-limiting
pnpm add @upstash/ratelimit @upstash/redis

# Verify Stripe SDK versions current
pnpm list stripe @stripe/stripe-js
```

---

## 3. Environment variables (additions)

```bash
# Stripe Sprint 1 + price IDs captured from Sprint 1 setup script
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_GROWTH_MONTHLY=price_...
STRIPE_PRICE_GROWTH_ANNUAL=price_...
STRIPE_PRICE_AGENCY_MONTHLY=price_...
STRIPE_PRICE_AGENCY_ANNUAL=price_...
STRIPE_PRICE_AGENCY_PRO_MONTHLY=price_...
STRIPE_PRICE_AGENCY_PRO_ANNUAL=price_...
STRIPE_PRICE_ONE_OFF_AUDIT=price_...

# Upstash Redis for sample audit rate-limit
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Sample audit cost cap (AUD per PRD §7 Principle #6 — "~A$0.10 cost")
SAMPLE_AUDIT_USE_REAL_LLM=true
SAMPLE_AUDIT_COST_CAP_AUD=0.10
FX_AUD_USD=0.66                          # AUD→USD conversion factor (refresh periodically)
```

---

## 4. Project structure additions

```
db/schema/
├── subscriptions.ts                          # NEW — mirror of Stripe subscription state
└── processed-webhook-events.ts               # NEW — idempotency tracking

lib/
├── onboarding/
│   ├── state-machine.ts                      # first-time flow tracking
│   └── redirects.ts                          # post-signup destination logic
├── sample-audit/
│   ├── run.ts                                # single-engine ChatGPT audit
│   ├── rate-limit.ts                         # Upstash sliding window
│   └── synthetic-org.ts                      # ensure "sample" org exists
├── stripe/
│   ├── client.ts                             # already from Sprint 1
│   ├── price-map.ts                          # env-driven tier → priceId mapping
│   ├── checkout.ts                           # createCheckoutSession({ tier, billing, organizationId })
│   ├── portal.ts                             # createPortalSession({ stripeCustomerId })
│   ├── verify-webhook.ts                     # signature verification
│   └── webhook-handlers/
│       ├── checkout-completed.ts
│       ├── subscription-updated.ts
│       ├── subscription-deleted.ts
│       ├── invoice-paid.ts
│       └── invoice-payment-failed.ts
└── pricing/
    ├── tiers.ts                              # tier metadata (matches PRD §7 canonical)
    └── gst.ts                                # AU 10% GST math + inc/ex display

inngest/functions/
└── sample-audit-cleanup.ts                   # NEW — daily 03:00 UTC, deletes sample audits >24h old

app/(marketing)/
├── pricing/page.tsx                          # functional (Sprint 11 polishes)
└── sample-audit/
    ├── page.tsx                              # domain + vertical input
    └── result/[id]/page.tsx                  # simplified result + signup CTA

app/(auth)/
├── settings/billing/page.tsx                 # current plan + manage button + invoice history
├── onboarding/page.tsx                       # first-time wizard wrapper (calls Sprint 4 wizard)
└── upgrade/page.tsx                          # in-app upgrade flow (sends to Stripe Checkout)

app/api/
├── billing/
│   ├── checkout/route.ts                     # POST create checkout session
│   └── portal/route.ts                       # POST create portal session
├── sample-audit/route.ts                     # POST rate-limited sample run
├── webhooks/stripe/route.ts                  # FILL IN (Sprint 1 stubbed signature verify)
└── one-off-audit/route.ts                    # POST trigger one-off purchase

components/domain/
├── pricing/
│   ├── pricing-table.tsx                     # 6 tier cards
│   ├── pricing-card.tsx                      # per-tier
│   ├── gst-toggle.tsx                        # inc/ex GST
│   ├── billing-interval-toggle.tsx           # monthly/annual
│   ├── upgrade-cta.tsx                       # used app-wide
│   └── retention-modal.tsx                   # pre-cancellation prompt
├── billing/
│   ├── current-plan-card.tsx
│   ├── invoice-history-table.tsx
│   └── usage-meter.tsx                       # X of Y audits this month
├── onboarding/
│   ├── progress-stepper.tsx                  # 4-step indicator (Sprint 4 wizard wrapper)
│   └── welcome-modal.tsx                     # first dashboard visit
└── sample-audit/
    ├── sample-form.tsx                       # landing-page input
    ├── live-progress.tsx                     # 90-second progress
    └── result-card.tsx                       # simplified single-engine result

tests/
├── unit/
│   ├── sample-audit/
│   │   ├── run.test.ts                       # 1 engine × 5 prompts × 1 run only
│   │   └── rate-limit.test.ts                # 3/day enforcement
│   ├── stripe/
│   │   ├── price-map.test.ts
│   │   ├── verify-webhook.test.ts
│   │   └── handlers/                         # one test file per handler
│   │       ├── checkout-completed.test.ts
│   │       ├── subscription-updated.test.ts
│   │       └── subscription-deleted.test.ts
│   └── pricing/
│       ├── gst.test.ts                       # AU 10% math
│       └── tiers.test.ts                     # matches PRD §7
├── integration/
│   ├── onboarding/full-flow.test.ts          # signup → wizard → first audit
│   ├── sample-audit/end-to-end.test.ts       # rate limit + real-LLM smoke (gated)
│   └── billing/checkout-to-tier-sync.test.ts
└── e2e/
    ├── sample-audit.spec.ts                  # landing → sample → result + signup CTA
    ├── onboarding.spec.ts                    # signup → first audit
    └── billing.spec.ts                       # pricing → upgrade → test card → tier change
```

---

## 5. Database schema additions

### `subscriptions.ts`

```typescript
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).unique().notNull(),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').unique().notNull(),
  stripePriceId: text('stripe_price_id').notNull(),
  tier: text('tier').notNull(),
  billingInterval: text('billing_interval').notNull(),  // 'monthly' | 'annual'
  status: text('status').notNull(),  // 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete'
  cancelAtPeriodEnd: text('cancel_at_period_end').default('false').notNull(),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  metadata: jsonb('metadata').default('{}').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### `processed_webhook_events.ts` (idempotency)

```typescript
export const processedWebhookEvents = pgTable('processed_webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  stripeEventId: text('stripe_event_id').unique().notNull(),
  type: text('type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Migrate:
```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

---

## 6. Sample audit spec (PRD §7 canonical)

```typescript
// lib/sample-audit/run.ts
const SAMPLE_AUDIT_CONFIG = {
  engines: ['chatgpt'] as const,    // 1 engine ONLY per PRD §7 Principle #6
  promptsCount: 5,                  // 5 prompts ONLY
  runsPerPrompt: 1,                 // 1 run ONLY (no Wilson CI for sample)
  totalCallsExpected: 5,
  estimatedDurationSec: 90,
  estimatedCostAud: 0.10,           // PRD §7 Principle #6 canonical (AUD, not USD)
} as const;

// POST /api/sample-audit body: { domain, vertical }
// Rate limit: 3 per IP per 24h via Upstash sliding window
// Synthetic "sample" org used for tenancy
// Real LLM (not mock) so demo is genuine
// Cost capped: SAMPLE_AUDIT_COST_CAP_AUD (env, default 0.10).
// Convert to USD at call time using FX_AUD_USD env (default 0.66 ≈ AU$1 = US$0.66).
// Reject if estimated cost AUD > cap.
```

**Conflict-audit C3 fix:** my v1.0 Sprint 11 had "2 engines × 5 prompts × 1 run = 10 calls". PRD canonical is "1 engine, 5 prompts, single run, ~90 seconds, ~A$0.10". Sprint 10 v2.0 implements PRD canonical exactly. **Second-pass-fix N14:** env var renamed `SAMPLE_AUDIT_COST_CAP_USD` → `SAMPLE_AUDIT_COST_CAP_AUD` since the PRD cap is in AUD; USD conversion happens at call time.

---

## 7. Stripe webhook handler

```typescript
// app/api/webhooks/stripe/route.ts
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency — check if event.id already processed
  const existing = await db.query.processedWebhookEvents.findFirst({
    where: eq(processedWebhookEvents.stripeEventId, event.id),
  });
  if (existing) return Response.json({ received: true, duplicate: true });

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event);
      break;
    case 'invoice.paid':
      await handleInvoicePaid(event);
      break;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event);
      break;
  }

  await db.insert(processedWebhookEvents).values({
    stripeEventId: event.id,
    type: event.type,
  });

  return Response.json({ received: true });
}
```

Each handler must be idempotent — re-running the same event = same final state.

---

## 8. Claude Code prompt (paste this when starting Sprint 10)

```
We're building VisibleAU Sprint 10: Onboarding + Sample Audit + Stripe Billing. Sprint 9
shipped Agency tier. Sprint 10 wires the actual purchasing experience + the pre-signup
sample audit that's the #1 conversion lever per PRD §7.

CRITICAL constraints:
- Sample audit = 1 engine (ChatGPT only), 5 prompts, 1 run, ~90s, ~A$0.10 — NOT 2 engines.
  Conflict-audit C3 fix.
- Stripe webhooks MUST be idempotent. Stripe replays events. Without idempotency, duplicate
  webhooks cause tier flapping.

Sprint 10 deliverables, in order:

1. SCHEMA
   - subscriptions table + processed_webhook_events table per §5
   - Migrate

2. ONBOARDING FLOW
   - Clerk email verify (already set up Sprint 1) → redirect to /brands/wizard NOT /dashboard
   - Sprint 4 wizard completion → auto-trigger first audit (single-engine ChatGPT for fast feedback)
   - org.metadata.firstTimeFlowComplete tracking
   - Welcome modal on first dashboard visit (one-time via localStorage)

3. SAMPLE AUDIT
   - lib/sample-audit/* per §4
   - Synthetic "sample" organization seeded at startup (idempotent)
   - app/api/sample-audit/route.ts with Upstash rate limit (3/IP/24h)
   - /sample-audit landing page with domain + vertical form
   - /sample-audit/result/[id] simplified result page with signup CTA
   - inngest/functions/sample-audit-cleanup.ts daily 03:00 UTC deletes >24h-old samples
   - Cost cap: log warning if >A$0.10; reject upfront if estimated >A$0.10

4. STRIPE LAYER
   - lib/stripe/price-map.ts env-driven tier → priceId mapping (monthly + annual + one-off)
   - lib/stripe/checkout.ts createCheckoutSession({ tier, billing, organizationId })
   - lib/stripe/portal.ts createPortalSession({ stripeCustomerId })
   - 5 webhook handlers (lib/stripe/webhook-handlers/)
   - Each handler MUST be idempotent

5. WEBHOOK ROUTE
   - app/api/webhooks/stripe/route.ts per §7
   - Verify signature → idempotency check → dispatch to handler → record processed_webhook_events
   - 200 even for unknown event types (Stripe retries 4xx/5xx)

6. CHECKOUT + PORTAL ROUTES
   - app/api/billing/checkout/route.ts POST
   - app/api/billing/portal/route.ts POST

7. PRICING PAGE
   - app/(marketing)/pricing/page.tsx functional
   - 6 tier cards (Free, Starter, Growth, Agency, Agency Pro, Enterprise)
   - GST inc/ex toggle (default inc for AU users, ex for others)
   - Monthly/Annual toggle (annual = 2 months free)
   - One-off audit (A$299) section below the tiers
   - Wire upgrade CTAs to checkout endpoint

8. SETTINGS BILLING
   - /settings/billing page
   - Current plan card + manage button → portal
   - Invoice history (latest 12 months from Stripe API)
   - Usage meter (audits this month vs cap from TIER_AUDIT_LIMITS from Sprint 9)

9. UPGRADE CTAs APP-WIDE
   - components/domain/pricing/upgrade-cta.tsx
   - Used on: quota-exceeded states (Sprint 9), Free tier blurred recommendations (Sprint 6),
     Action Center, Free tier sample-audit result
   - Context-aware: "Upgrade to Growth to unlock weekly audits"

10. CANCELLATION RETENTION
    - Before redirecting to Stripe portal cancellation, show retention modal
    - 3 options: "Downgrade to Free" / "Pause for 1 month" (set Sprint 9 schedules to paused) /
      "Cancel anyway" (proceed to portal)

11. TESTS
    - Unit: each webhook handler idempotent
    - Unit: GST math
    - Integration: checkout → webhook → tier update flow with Stripe test mode
    - E2E: pricing → click upgrade → Stripe test card → return → tier change visible
    - E2E: sample audit → result → signup CTA → complete flow

POTENTIAL BLOCKERS:
- Stripe webhook in dev: use `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
- Webhook idempotency edge: ensure transaction wraps both the tier update + the
  processed_webhook_events insert
- AEST timezone handling in billing dates: use Stripe's UTC timestamps + format on display
- AU GST regulatory: GST-inclusive is preferred but ex-GST view is also valid for B2B AU.
  Display both clearly.

Start with step 1. After schema migrates, step 2 (onboarding) ships the visible win that
makes the rest feel real. Step 3 (sample audit) is the pre-signup conversion lever.
```

---

## 9. Tests required

- Unit: webhook handlers idempotent (5 files); GST math; sample audit cost cap
- Integration: checkout → webhook → tier sync; sample audit rate limit
- E2E: pricing → upgrade → success → tier changed; sample audit → result → signup

---

## 10. Acceptance criteria

- [ ] Visitor enters domain at `/sample-audit` → 90-second audit runs → result displayed → signup CTA visible
- [ ] **Sample audit calls: 1 engine × 5 prompts × 1 run = 5 calls** (verified in audits table)
- [ ] Sample audit cost ≤ A$0.10 (logged)
- [ ] Rate limit: 4th sample audit from same IP within 24h returns 429
- [ ] Signup → email verify → /brands/wizard (NOT /dashboard) for first-time users
- [ ] First-time wizard completion → auto-trigger first audit (single-engine)
- [ ] Pricing page shows 6 tiers + one-off audit
- [ ] GST inc/ex toggle works (AU default = inc; non-AU = ex)
- [ ] Monthly/annual toggle shows correct prices (annual = monthly × 10)
- [ ] Starter checkout completes with test card → `organizations.tier='starter'` within 30s
- [ ] Customer Portal accessible from /settings/billing
- [ ] Webhook idempotency: replay same event = same state, no double-process
- [ ] Cancellation retention modal shown before portal
- [ ] Downgrade takes effect at period end (verified by setting `cancelAtPeriodEnd=true`)
- [ ] One-off audit purchase flow: select brand → checkout → audit fires → email arrives
- [ ] Invoice history populated from Stripe API
- [ ] No regression on Sprint 1-9 tests

---

## 11. Common pitfalls / Sprint 10 anti-patterns

- **Do not** use 2 engines for sample audit. PRD canonical = 1 engine (ChatGPT). Conflict-audit C3.
- **Do not** trust client-side tier claims. Always read `organizations.tier` server-side.
- **Do not** skip webhook idempotency. Stripe WILL replay events.
- **Do not** downgrade tier immediately on cancellation. Honor paid period until expiry (set `cancelAtPeriodEnd=true`, downgrade at period end via subscription-deleted handler).
- **Do not** create a Stripe customer on signup. Only on first checkout. Avoids empty customers.
- **Do not** hardcode price IDs. Env vars from Sprint 1 setup script.
- **Do not** display ex-GST pricing as primary for AU users. ACL says display inclusive by default.
- **Do not** skip the cost cap on sample audit. Hard A$0.10 budget; reject if estimate exceeds.

---

## 12. Handoff to Sprint 11

Ready:
- ✓ Stripe billing fully operational — Sprint 11 landing page can include "Start free trial" + "See pricing" CTAs that work
- ✓ Sample audit pre-signup flow — Sprint 11 landing page is the entry funnel
- ✓ Tier upgrades unlock features — Sprint 11 onboarding can leverage tier-aware UX

Not ready:
- Pre-launch marketing copy (Sprint 11)
- Methodology page (Sprint 11)
- Loom demos (Sprint 11)
- Trust signals / testimonials (Sprint 11)

---

## Changelog

- v2.1 (13 May 2026): **Second-pass-fix audit.** **(N5)** First-audit-after-signup spec reconciled: §1 line 24 was "auto-trigger first audit using ChatGPT-only single-engine mode" — contradicted prototype line 1894 ("4 engines × 10 prompts × 5 runs") and Free tier PRD canonical (2 engines). Now: first post-signup audit honours the new user's tier (Free = 2 engines per Sprint 3 TIER_ENGINES). The pre-signup sample audit already provides the 90-second ChatGPT-only teaser. **(N14)** `SAMPLE_AUDIT_COST_CAP_USD` env var renamed to `SAMPLE_AUDIT_COST_CAP_AUD` because PRD §7 Principle #6 caps the sample at "~A$0.10" (AUD), not USD. Added `FX_AUD_USD=0.66` env var; cost-cap conversion happens at call time. `estimatedCostUsd` in `SAMPLE_AUDIT_CONFIG` renamed to `estimatedCostAud`.
- v2.0 (12 May 2026): **Complete rewrite per conflict-audit C3 + H2 + L7.** Sprint 10 v1.0 was Stripe billing only. PRD §11 says Sprint 10 = Onboarding + Sample audit + Upgrade flow (Stripe is a component of upgrade flow). v2.0 implements PRD canonical: onboarding state machine, **sample audit at PRD canonical spec (1 engine ChatGPT, 5 prompts, 1 run, ~90s, ~A$0.10)** — was incorrectly 2 engines in v1.0 Sprint 11; moved to correct Sprint 10 here. Stripe billing layer with **monthly + annual prices (annual = 10× monthly = 2 months free)** + **one-off audit A$299** purchase flow. Webhook idempotency via processed_webhook_events table. Cancellation retention modal.
- v1.0 (12 May 2026): Initial. Net-new sprint prompt as "Stripe billing only." **Conflicts: missing onboarding, missing sample audit, missing one-off + annual products.**
