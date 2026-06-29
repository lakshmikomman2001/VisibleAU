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

**HI5 fix — Stripe requires AU-specific configuration for AUD billing + GST. Add to Sprint 1 setup or Stripe dashboard before Sprint 10:**
- Stripe dashboard → Settings → Business details → Country = Australia
- Stripe Tax (optional but recommended): enable for automatic tax reporting
- When creating Price objects via Sprint 1 setup script, set `tax_behavior: 'inclusive'` on each price (HG1 fix confirms GST is included in displayed prices, not added on top)
- Test with AUD test cards: `4000000360000006` (AU Visa success)
- Ensure `STRIPE_WEBHOOK_SECRET` is set from `stripe listen --forward-to ...` output in dev

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

# HL4 fix: STRIPE_WEBHOOK_SECRET was used throughout Sprint 10 but never listed in §3 env vars.
# Required for webhook signature verification (HD2 verify-webhook.ts):
STRIPE_WEBHOOK_SECRET=whsec_...      # from `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
                                     # In production: from Stripe dashboard → Webhooks → signing secret

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
│   │   # HC4 fix: state-machine body never written. Also: org.metadata.firstTimeFlowComplete
│   │   # is used throughout but 'metadata' jsonb column never added to organizations table.
│   │   # Sprint 10 migration (add to the Sprint 10 ALTER TABLE block):
│   │   # ALTER TABLE organizations ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}' NOT NULL;
│   │   # ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug text UNIQUE;  -- for HC1 synthetic org
│   │   #
│   │   # State machine functions:
│   │   # export async function isFirstTimeUser(organizationId: string): Promise<boolean> {
│   │   #   const [org] = await db.select({ metadata: organizations.metadata })
│   │   #     .from(organizations).where(eq(organizations.id, organizationId));
│   │   #   return !(org?.metadata as any)?.firstTimeFlowComplete;
│   │   # }
│   │   # export async function markFirstTimeComplete(organizationId: string): Promise<void> {
│   │   #   const [org] = await db.select({ metadata: organizations.metadata })
│   │   #     .from(organizations).where(eq(organizations.id, organizationId));
│   │   #   await db.update(organizations)
│   │   #     .set({ metadata: { ...(org?.metadata as any ?? {}), firstTimeFlowComplete: true } })
│   │   #     .where(eq(organizations.id, organizationId));
│   │   # }
│   │   # Called after first audit completes (in the audit/complete Inngest event handler).
│   │   # HJ4 fix: HE4 wires it to welcome modal "Got it" button — but if user closes the
│   │   # modal without clicking, flag is never set and modal reappears forever.
│   │   # ALSO wire to audit/complete Inngest event in run-audit.ts or as a separate function:
│   │   # In run-audit.ts (Sprint 3) or a new Inngest function listening to 'audit/complete':
│   │   # if (await isFirstTimeUser(organizationId)) {
│   │   #   await markFirstTimeComplete(organizationId);
│   │   # }
│   │   # This ensures the flag is set when the first audit completes — even if the user
│   │   # dismissed the modal or never saw it (e.g. navigated away during the run).
│   │   # HH3 fix: which handler calls it is never specified. Wire into Sprint 3's run-audit.ts
│   │   # Inngest function, at the end of the audit/complete emit step:
│   │   # In run-audit.ts (Sprint 3), after audit is persisted and 'audit/complete' is emitted:
│   │   #   await step.run('mark-first-time-complete', async () => {
│   │   #     const isFirst = await isFirstTimeUser(organizationId);
│   │   #     if (isFirst) await markFirstTimeComplete(organizationId);
│   │   #     // Only runs on first audit — no-op on subsequent audits
│   │   #   });
│   └── redirects.ts                          # post-signup destination logic
│       # HD1 fix: body never written. Determines where to send the user after Clerk auth.
│       # HM1 fix: originally returned '/brands/wizard' — conflicts with HH3 which says
│       # /welcome → /onboarding (which renders BrandWizard). Canonical: return '/onboarding'
│       # so the /welcome → /onboarding chain is consistent. /onboarding (HH3) then checks
│       # again and redirects to /dashboard if the user already has brands.
│       # export async function getPostSignupRedirect(organizationId: string): Promise<string> {
│       #   const isFirst = await isFirstTimeUser(organizationId);
│       #   if (isFirst) return '/onboarding';  // HM1: was '/brands/wizard' — inconsistent with HH3
│       #   const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
│       #     .from(brands).where(eq(brands.organizationId, organizationId));
│       #   if (count === 0) return '/onboarding';  // safety catch: has org but no brands
│       #   return '/dashboard';
│       # }
│       # Used by: middleware.ts (after Clerk sign-in callback) and /onboarding/page.tsx.
│       # GE5's NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/welcome sends to /welcome;
│       # /welcome page calls getPostSignupRedirect() to determine the actual final destination.
├── sample-audit/
│   ├── run.ts                                # single-engine ChatGPT audit (HA4)
│   ├── rate-limit.ts                         # Upstash sliding window
│   │   # HB5 fix: Upstash sliding window implementation never specified.
│   │   # HB3 route calls checkSampleRateLimit(ip) but the function was never written:
│   │   # import { Ratelimit } from '@upstash/ratelimit';
│   │   # import { Redis } from '@upstash/redis';
│   │   #
│   │   # const redis = new Redis({
│   │   #   url: process.env.UPSTASH_REDIS_REST_URL!,
│   │   #   token: process.env.UPSTASH_REDIS_REST_TOKEN!,
│   │   # });
│   │   #
│   │   # const ratelimit = new Ratelimit({
│   │   #   redis,
│   │   #   limiter: Ratelimit.slidingWindow(3, '24 h'),  // 3 requests per 24 hours per IP
│   │   #   analytics: true,
│   │   #   prefix: 'visibleau:sample-audit',
│   │   # });
│   │   #
│   │   # export async function checkSampleRateLimit(ip: string) {
│   │   #   return ratelimit.limit(ip);
│   │   #   // Returns: { success: boolean, remaining: number, limit: number, reset: number }
│   │   # }
│   └── synthetic-org.ts                      # ensure "sample" org exists
│       # HC1 fix: ensureSampleOrg() called by HA4's runSampleAudit — never written.
│       # HH5 fix: ensureSampleOrg() uses organizations.slug which is added by the HE5
│       # Sprint 10 migration. DEPENDENCY ORDER:
│       #   1. Run pnpm drizzle-kit migrate (adds organizations.slug column)
│       #   2. THEN run the seed script that calls ensureSampleOrg()
│       # If seed runs before migration, the query 'WHERE slug = ?' fails with column not found.
│       # Guard in ensureSampleOrg():
│       # try { ... } catch (e) {
│       #   if (e.message?.includes('column "slug"'))
│       #     throw new Error('Run migrations before seed: pnpm drizzle-kit migrate');
│       #   throw e;
│       # }
│       # Must idempotently create or return the synthetic sample org:
│       # export async function ensureSampleOrg(): Promise<{ id: string }> {
│       #   const SAMPLE_SLUG = 'sample';
│       #   // Try to find existing sample org:
│       #   const [existing] = await db.select({ id: organizations.id })
│       #     .from(organizations).where(eq(organizations.slug, SAMPLE_SLUG));
│       #   if (existing) return existing;
│       #   // Create it (idempotent via onConflictDoNothing):
│       #   const [created] = await db.insert(organizations).values({
│       #     name: 'VisibleAU Sample',
│       #     slug: SAMPLE_SLUG,
│       #     tier: 'free',
│       #   }).onConflictDoNothing().returning({ id: organizations.id });
│       #   // Handle rare race condition where another request created it first:
│       #   if (!created) {
│       #     const [retry] = await db.select({ id: organizations.id })
│       #       .from(organizations).where(eq(organizations.slug, SAMPLE_SLUG));
│       #     return retry!;
│       #   }
│       #   return created;
│       # }
│       # Note: organizations table needs a slug column (add to Sprint 2 migration via Sprint 10 ALTER TABLE).
├── stripe/
│   ├── client.ts                             # already from Sprint 1
│   ├── price-map.ts                          # env-driven tier → priceId mapping
│   │   # HA5 fix: "env-driven mapping" never specified as TypeScript.
│   │   # 9 price IDs (8 subscription + 1 one-off) in a lookup table:
│   │   # export const PRICE_MAP = {
│   │   #   starter:    { monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY!,
│   │   #                 annual:  process.env.STRIPE_PRICE_STARTER_ANNUAL! },
│   │   #   growth:     { monthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY!,
│   │   #                 annual:  process.env.STRIPE_PRICE_GROWTH_ANNUAL! },
│   │   #   agency:     { monthly: process.env.STRIPE_PRICE_AGENCY_MONTHLY!,
│   │   #                 annual:  process.env.STRIPE_PRICE_AGENCY_ANNUAL! },
│   │   #   agency_pro: { monthly: process.env.STRIPE_PRICE_AGENCY_PRO_MONTHLY!,
│   │   #                 annual:  process.env.STRIPE_PRICE_AGENCY_PRO_ANNUAL! },
│   │   # } as const;
│   │   # export const ONE_OFF_PRICE_ID = process.env.STRIPE_PRICE_ONE_OFF_AUDIT!;
│   │   #
│   │   # export function getPriceId(tier: string, interval: 'monthly'|'annual'): string {
│   │   #   const map = PRICE_MAP[tier as keyof typeof PRICE_MAP];
│   │   #   if (!map) throw new Error(`Unknown tier: ${tier}`);
│   │   #   return map[interval];
│   │   # }
│   │   # // Reverse lookup: priceId → tier (used in handleCheckoutCompleted):
│   │   # export function tierFromPriceId(priceId: string): string {
│   │   #   for (const [tier, intervals] of Object.entries(PRICE_MAP)) {
│   │   #     if (Object.values(intervals).includes(priceId)) return tier;
│   │   #   }
│   │   #   return 'starter';  // safe fallback
│   │   # }
│   ├── checkout.ts                           # createCheckoutSession({ tier, billing, organizationId })
│   │   # HB1 fix: function body never written. Stripe Checkout session creation:
│   │   # export async function createCheckoutSession({
│   │   #   tier, billing, organizationId
│   │   # }: { tier: string; billing: 'monthly'|'annual'; organizationId: string }) {
│   │   #   const priceId = getPriceId(tier, billing);  // HA5 price-map.ts
│   │   #   // Get or create Stripe customer (anti-pattern: DON'T create on signup):
│   │   #   const [sub] = await db.select({ stripeCustomerId: subscriptions.stripeCustomerId })
│   │   #     .from(subscriptions).where(eq(subscriptions.organizationId, organizationId));
│   │   #   const session = await stripe.checkout.sessions.create({
│   │   #     mode: 'subscription',
│   │   #     line_items: [{ price: priceId, quantity: 1 }],
│   │   #     ...(sub?.stripeCustomerId ? { customer: sub.stripeCustomerId } : { customer_creation: 'always' }),
│   │   #     success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/settings/billing?success=true`,
│   │   #     cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pricing`,
│   │   #     metadata: { organizationId },  // needed by handleCheckoutCompleted (HA3)
│   │   #     // HJ5: Stripe best practice — also set client_reference_id for reliable org linking:
│   │   #     // client_reference_id: organizationId,
│   │   #     // client_reference_id is echoed in all webhook events without metadata parsing.
│   │   #     // Useful as a fallback when metadata is missing (e.g. Stripe portal-initiated changes).
│   │   #     // Handlers can read: session.client_reference_id ?? session.metadata?.organizationId
│   │   #     // HK5: allow promo codes at checkout (AppSumo deals, launch codes, annual discounts):
│   │   #     allow_promotion_codes: true,
│   │   #     payment_method_types: ['card'],
│   │   #     currency: 'aud',
│   │   #     // HG1 fix: CRITICAL — original had automatic_tax: { enabled: true } which
│   │   #     // adds another 10% GST on top of the price. But PRD §7 prices (A$99, A$297,
│   │   #     // A$495, A$1,485) are already GST-INCLUSIVE amounts.
│   │   #     // DO NOT use automatic_tax here — it would charge the customer GST twice.
│   │   #     // Instead, when creating Stripe Price objects (Sprint 1 setup script), set:
│   │   #     //   tax_behavior: 'inclusive'  (GST is included in the displayed price)
│   │   #     // This tells Stripe the price already includes tax — no additional tax added.
│   │   #     // The Stripe Tax dashboard then shows GST correctly for reporting purposes.
│   │   #   });
│   │   #   return session.url!;
│   │   # }
│   ├── portal.ts                             # createPortalSession({ stripeCustomerId })
│   │   # HB1 fix: function body never written. Stripe Customer Portal session creation:
│   │   # export async function createPortalSession({ stripeCustomerId }: { stripeCustomerId: string }) {
│   │   #   const session = await stripe.billingPortal.sessions.create({
│   │   #     customer: stripeCustomerId,
│   │   #     return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/settings/billing`,
│   │   #   });
│   │   #   return session.url;
│   │   # }
│   ├── verify-webhook.ts                     # signature verification
│   │   # HD2 fix: listed as module but body never written; §7 inlines the verify call.
│   │   # Extracting to a module enables unit-testing without mocking Stripe's SDK:
│   │   # export async function verifyStripeWebhook(req: Request): Promise<Stripe.Event> {
│   │   #   const sig = req.headers.get('stripe-signature');
│   │   #   const body = await req.text();
│   │   #   if (!sig) throw new Error('Missing stripe-signature header');
│   │   #   return stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
│   │   # }
│   │   # §7 route.ts: replace inline constructEvent with: const event = await verifyStripeWebhook(req);
│   └── webhook-handlers/
│       ├── checkout-completed.ts
│       ├── subscription-updated.ts
│       ├── subscription-deleted.ts
│       ├── invoice-paid.ts
│       ├── invoice-payment-failed.ts
│       └── payment-completed.ts              # HD4 fix: HC5 noted gap — handler for one-off audit
│           # export async function handlePaymentCompleted(event: Stripe.Event) {
│           #   const session = event.data.object as Stripe.Checkout.Session;
│           #   if (session.mode !== 'payment') return;  // skip subscriptions
│           #   if (session.metadata?.type !== 'one_off_audit') return;
│           #   const { organizationId, brandId } = session.metadata;
│           #   if (!organizationId || !brandId) return;
│           #   // Fire audit via Inngest:
│           #   await inngest.send({
│           #     name: 'audit/start',
│           #     data: { brandId, organizationId, triggeredBy: 'one_off_purchase',
│           #             stripeSessionId: session.id },
│           #   });
│           # }
└── pricing/
    ├── tiers.ts                              # tier metadata (matches PRD §7 canonical)
    │   # HE1 fix: referenced 4× but never written. TIER_AUDIT_LIMITS imported by
    │   # HD3 billing page and GD3 quota-check. TIER_METADATA used by pricing-table.tsx:
    │   #
    │   # export const TIER_AUDIT_LIMITS: Record<string, { auditsPerMonth: number }> = {
    │   #   free:       { auditsPerMonth: 3 },      // PRD §7: Free = 3 audits/mo
    │   #   starter:    { auditsPerMonth: 20 },     // PRD §7: Starter = 20 audits/mo
    │   #   growth:     { auditsPerMonth: 60 },     // PRD §7: Growth = 60 audits/mo
    │   #   agency:     { auditsPerMonth: 200 },    // PRD §7: Agency = 200 audits/mo
    │   #   agency_pro: { auditsPerMonth: 500 },    // PRD §7: Agency Pro = 500 audits/mo
    │   #   enterprise: { auditsPerMonth: Infinity },
    │   # };
    │   #
    │   # export const TIER_METADATA = {
    │   #   free:       { label: 'Free',        priceAudExGst: 0,     brands: 1,  engines: 2 },
    │   #   starter:    { label: 'Starter',     priceAudExGst: 90,    brands: 3,  engines: 4 },
    │   #   growth:     { label: 'Growth',      priceAudExGst: 270,   brands: 10, engines: 4 },
    │   #   agency:     { label: 'Agency',      priceAudExGst: 450,   brands: 30, engines: 4 },
    │   #   agency_pro: { label: 'Agency Pro',  priceAudExGst: 1_350, brands: 100,engines: 4 },
    │   #   enterprise: { label: 'Enterprise',  priceAudExGst: null,  brands: -1, engines: 4 },
    │   # } as const;
    │   # // priceAudExGst: ex-GST monthly price in AUD. GST-inclusive = addGst(price).
    │   # // Annual = 10 × monthly (2 months free per PRD §7 Principle #3).
    └── gst.ts                                # AU 10% GST math + inc/ex display
        # HC2 fix: GST functions never specified. Pricing page + billing use these:
        #
        # const GST_RATE = 0.10;  // 10% AU GST
        #
        # // Add GST to ex-GST price → inc-GST price:
        # export function addGst(exGst: number): number {
        #   return Math.round(exGst * (1 + GST_RATE) * 100) / 100;
        # }
        #
        # // Remove GST from inc-GST price → ex-GST price:
        # export function removeGst(incGst: number): number {
        #   return Math.round((incGst / (1 + GST_RATE)) * 100) / 100;
        # }
        #
        # // PRD §7 prices are the ex-GST AUD amounts (A$90, A$270, A$450, A$1,350).
        # // Display canonical: GST-inclusive for AU users (A$99, A$297, A$495, A$1,485).
        # export function displayPrice(
        #   exGstAud: number, opts: { incGst: boolean; interval?: 'monthly'|'annual' }
        # ): string {
        #   const price = opts.incGst ? addGst(exGstAud) : exGstAud;
        #   const suffix = opts.incGst ? ' inc. GST' : ' ex. GST';
        #   const period = opts.interval === 'annual' ? '/yr' : '/mo';
        #   return `A$${price.toFixed(0)}${period}${suffix}`;
        # }
        # // Example: displayPrice(90, { incGst: true, interval: 'monthly' }) → 'A$99/mo inc. GST'

inngest/functions/
└── sample-audit-cleanup.ts                   # NEW — daily 03:00 UTC, deletes sample audits >24h old
    # HB4 fix: cron body never written. Sample audits attach to synthetic 'sample' org:
    # HH5 fix: HA2 imports `sampleAuditCleanup` from this file but the named export
    # was never declared. The export const must appear at the top level of the file:
    # export const sampleAuditCleanup = inngest.createFunction(
    #   { id: 'sample-audit-cleanup' },
    #   { cron: '0 3 * * *' },  // 03:00 UTC daily
    #   async ({ step }) => {
    #     const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    #     await step.run('delete-old-samples', async () => {
    #       const sampleOrg = await db.select({ id: organizations.id })
    #         .from(organizations).where(eq(organizations.slug, 'sample'))
    #         .then(r => r[0]);
    #       if (!sampleOrg) return { deleted: 0 };
    #       // Delete audits first (FK: audits.brandId → brands.id):
    #       const oldBrands = await db.select({ id: brands.id }).from(brands)
    #         .where(and(eq(brands.organizationId, sampleOrg.id), lte(brands.createdAt, cutoff)));
    #       if (!oldBrands.length) return { deleted: 0 };
    #       const brandIds = oldBrands.map(b => b.id);
    #       // HL3 fix: Sprint 8 adds FK tables that fail if deleted after brands.
    #       // Must delete satellite tables BEFORE audits and brands:
    #       const oldAuditIds = await db.select({ id: audits.id }).from(audits)
    #         .where(inArray(audits.brandId, brandIds)).then(r => r.map(a => a.id));
    #       if (oldAuditIds.length) {
    #         await db.delete(auditExports).where(inArray(auditExports.auditId, oldAuditIds));
    #       }
    #       await db.delete(driftAlerts).where(inArray(driftAlerts.brandId, brandIds));
    #       await db.delete(localSeoResults).where(inArray(localSeoResults.brandId, brandIds));
    #       await db.delete(audits).where(inArray(audits.brandId, brandIds));
    #       const { rowCount } = await db.delete(brands).where(inArray(brands.id, brandIds));
    #       console.log(`[sample-audit-cleanup] Deleted ${rowCount} sample brands`);
    #       return { deleted: rowCount ?? 0 };
    #     });
    #   }
    # );

app/(marketing)/
├── pricing/page.tsx                          # functional (Sprint 11 polishes)
│   # HG2 fix: pricing page is public (marketing route, no Clerk required) but
│   # shows "Current plan" badge for logged-in users. Pattern:
│   # export default async function PricingPage() {
│   #   // Try to get current user — null for unauthenticated visitors:
│   #   const currentUser = await getCurrentUser().catch(() => null);
│   #   const currentTier = currentUser?.tier ?? 'free';
│   #   // Detect AU locale for GST default (server-side via Accept-Language header):
│   #   // const isAu = req.headers.get('accept-language')?.includes('en-AU') ?? false;
│   #   // In App Router: use cookies() or a locale cookie set by middleware.
│   #   return <PricingTableClient currentTier={currentTier} defaultIncGst={true} />;
│   #   // PricingTableClient 'use client' — manages incGst + interval toggle state
│   #   // and passes both to each PricingCard (HF3).
│   # }
└── sample-audit/
    ├── page.tsx                              # domain + vertical input
    │   # HH4 fix: page server component never specified. HG4 wrote SampleForm (client).
    │   # This page is the marketing route wrapper — no auth required:
    │   # export default function SampleAuditPage() {
    │   #   return (
    │   #     <div className="max-w-2xl mx-auto py-16 px-6">
    │   #       <Badge>Free · No card required</Badge>
    │   #       <h1>See how visible your business is to AI</h1>
    │   #       <p>Enter your domain — we'll run a real ChatGPT audit in 90 seconds.
    │   #          No sign-up needed.</p>
    │   #       <SampleForm />  {/* HG4 client component */}
    │   #       <p className="text-xs text-muted">3 free samples per day per IP.
    │   #          Real ChatGPT (not mock). ~A$0.10 cost.</p>
    │   #     </div>
    │   #   );
    │   # }
    │   # Note: this is a SERVER component (no 'use client') — SampleForm is the client part.
    ├── running/page.tsx                      # HJ1 fix: HG4 navigates here but page never existed
    │   # export default function RunningPage({ searchParams }: { searchParams: { auditId?: string } }) {
    │   #   const { auditId } = searchParams;
    │   #   if (!auditId) return redirect('/sample-audit');
    │   #   return (
    │   #     <div className="max-w-2xl mx-auto py-16 text-center">
    │   #       <h1>Running your sample audit…</h1>
    │   #       <p>ChatGPT · 5 prompts · ~90 seconds</p>
    │   #       <LiveProgress auditId={auditId} />  {/* HG3 client component */}
    │   #     </div>
    │   #   );
    │   # }
    │   # Public route — no Clerk auth required.
        # HE2 fix: server component body never specified.
        # This is a PUBLIC route (no Clerk auth — unauthenticated visitors see their result).
        # export default async function SampleResultPage({ params }: { params: { id: string } }) {
        #   // Load audit — NO setRlsContext (sample org has no org-specific auth):
        #   // HM2 fix: audits table has RLS ENABLED (Sprint 2 migration).
        #   // Without setRlsContext, RLS policy fires with empty org → 0 rows → NotFound.
        #   // Fix: load sample org ID and call setRlsContext with it:
        #   const [sampleOrg] = await db.select({ id: organizations.id })
        #     .from(organizations).where(eq(organizations.slug, 'sample'));
        #   if (!sampleOrg) return <NotFound />;
        #   await setRlsContext(db, sampleOrg.id);  // sets org context for RLS
        #   const [audit] = await db.select({
        #     id: audits.id, scores: audits.scores, scoreComposite: audits.scoreComposite,
        #     metadata: audits.metadata, brandName: brands.name,
        #   }).from(audits).innerJoin(brands, eq(audits.brandId, brands.id))
        #     .where(eq(audits.id, params.id));
        #
        #   if (!audit) return <NotFound />;
        #   // Security: only show sample audits (not real org audits accessed by guessing ID):
        #   if (!(audit.metadata as any)?.isSample) return <NotFound />;
        #
        #   return (
        #     <SampleResultView audit={audit} />
        #     // HJ2 fix: SampleResultView body never specified. It is the composition wrapper:
        #     // export function SampleResultView({ audit }) {
        #     //   return (
        #     //     <div>
        #     //       <ResultCard audit={audit} />  {/* HI3: score + dimensions + UpgradeCta */}
        #     //       <Card className="p-5 mt-4">
        #     //         <h3>What the sample found</h3>
        #     //         {/* 3 key findings from the single-engine run: */}
        #     //         <ul>
        #     //           <li>Mention rate: {Math.round(scores.frequency ?? 0)}% of responses</li>
        #     //           <li>Avg position: {scores.position ? `${Math.round(scores.position)}th` : '—'}</li>
        #     //           <li>Sentiment: {scores.sentiment >= 60 ? 'positive' : 'neutral/negative'}</li>
        #     //         </ul>
        #     //       </Card>
        #     //       <div className="mt-6 text-center">
        #     //         <a href="/sign-up"><Btn variant="primary" size="lg">Sign up free — run full 4-engine audit</Btn></a>
        #     //       </div>
        #     //     </div>
        #     //   );
        #     // }
        #   );
        # }

app/(auth)/
├── settings/billing/page.tsx                 # current plan + manage button + invoice history
│   # HD3 fix: server component never specified. 3 data sources:
│   # HL1 fix: success_url has ?success=true but page never reads it. Add searchParams:
│   # export default async function BillingPage({ searchParams }: {
│   #   searchParams: { success?: string }
│   # }) {
│   #   const currentUser = await getCurrentUser();
│   #   if (!currentUser) redirect('/sign-in');
│   #   await setRlsContext(db, currentUser.organizationId);
│   #
│   #   const [sub, usageCount] = await Promise.all([
│   #     // 1. Current subscription from DB:
│   #     db.select().from(subscriptions)
│   #       .where(eq(subscriptions.organizationId, currentUser.organizationId))
│   #       .then(r => r[0] ?? null),
│   #     // 2. Audit usage count this calendar month (Sprint 9 quota-check pattern):
│   #     db.select({ count: sql<number>`count(*)::int` }).from(audits)
│   #       .innerJoin(brands, eq(audits.brandId, brands.id))
│   #       .where(and(eq(brands.organizationId, currentUser.organizationId),
│   #                  gte(audits.createdAt, sql`date_trunc('month', NOW())`)))
│   #       .then(r => r[0].count),
│   #   ]);
│   #
│   #   // 3. Invoice history from Stripe API (not DB — always current):
│   #   const invoices = sub?.stripeCustomerId
│   #     ? await stripe.invoices.list({ customer: sub.stripeCustomerId, limit: 12 })
│   #         .then(r => r.data) : [];
│   #
│   #   const tierLimit = TIER_AUDIT_LIMITS[currentUser.tier]?.auditsPerMonth ?? 0;
│   #   return <BillingView sub={sub} usageCount={usageCount} tierLimit={tierLimit}
│   #            invoices={invoices} showSuccess={searchParams.success === 'true'} />;
│   #   // BillingView reads showSuccess and displays a sonner/toast: "Payment successful — welcome to {tier}!"
│   # }
│   # BillingView 'use client' — handles manage button → POST /api/billing/portal + redirect.
│   # HI2 fix: BillingView body never written despite HD3 billing page using it as root component.
│   # HL5 fix: BillingView calls POST /api/billing/portal — this route handler (HB2) sets
│   # its own setRlsContext(db, currentUser.organizationId). No double-RLS issue — each
│   # API request establishes its own RLS context independently. BillingView props:
│   # export function BillingView({ sub, usageCount, tierLimit, invoices, showSuccess }: {
│   #   sub: Subscription | null; usageCount: number; tierLimit: number;
│   #   invoices: Stripe.Invoice[]; showSuccess?: boolean;  // HL1: from ?success=true
│   # }) {
│   #   useEffect(() => {
│   #     if (showSuccess) toast.success(`Payment successful — welcome to ${sub?.tier ?? 'your new plan'}!`);
│   #   }, [showSuccess]);
│   #   return (
│   #     <div className="space-y-6">
│   #       <CurrentPlanCard sub={sub} />          {/* HH1 */}
│   #       <UsageMeter usageCount={usageCount} tierLimit={tierLimit} />  {/* HG5 */}
│   #       <div>
│   #         <h3>Invoice history</h3>
│   #         <InvoiceHistoryTable invoices={invoices} />  {/* HH2 */}
│   #       </div>
│   #     </div>
│   #   );
│   # }
├── onboarding/page.tsx                       # first-time wizard wrapper (calls Sprint 4 wizard)
│   # HH3 fix: conflicts with /welcome page (GD5/HD1). Relationship clarified:
│   # /welcome  = post-Clerk-signup landing page (GE5 CLERK_SIGN_UP_FALLBACK_REDIRECT_URL).
│   #             Detects first-time user → immediately redirects to /onboarding.
│   #             Non-first-time users (brand_count > 0) → redirects to /dashboard.
│   # /onboarding = the actual Sprint 4 brand wizard (domain, vertical, competitors).
│   #             A server component that renders the wizard UI.
│   # export default async function OnboardingPage() {
│   #   const currentUser = await getCurrentUser();
│   #   if (!currentUser) redirect('/sign-in');
│   #   // If user already has brands, skip wizard:
│   #   const destination = await getPostSignupRedirect(currentUser.organizationId);
│   #   if (destination !== '/brands/wizard') redirect(destination);
│   #   // Render Sprint 4 wizard:
│   #   return <BrandWizard organizationId={currentUser.organizationId} />;
│   # }
└── upgrade/page.tsx                          # in-app upgrade flow (sends to Stripe Checkout)
    # HI1 fix: body never specified. Tier-agnostic — reads ?tier URL param (HF5).
    # export default async function UpgradePage({ searchParams }: {
    #   searchParams: { tier?: string; billing?: 'monthly'|'annual' }
    # }) {
    #   const currentUser = await getCurrentUser();
    #   if (!currentUser) redirect('/sign-in');
    #   const tier = searchParams.tier ?? 'starter';
    #   const billing = searchParams.billing ?? 'monthly';
    #   if (!PRICE_MAP[tier as keyof typeof PRICE_MAP])
    #     return redirect('/pricing');  // invalid tier → pricing page
    #   const meta = TIER_METADATA[tier as keyof typeof TIER_METADATA];
    #   const priceExGst = meta?.priceAudExGst ?? 0;
    #   async function handleCheckout() {
    #     'use server';
    #     const res = await fetch('/api/billing/checkout', { method: 'POST',
    #       headers: { 'Content-Type': 'application/json' },
    #       body: JSON.stringify({ tier, billing }) });
    #     const { url } = await res.json();
    #     redirect(url);
    #   }
    #   return (
    #     <div>
    #       <h1>Upgrade to {meta?.label}</h1>
    #       <PricingCard tier={tier} incGst={true} interval={billing}
    #         currentTier={currentUser.tier} onUpgrade={handleCheckout} />
    #       <p>Secure payment via Stripe · Cancel anytime</p>
    #     </div>
    #   );
    # }

app/api/
├── billing/
│   ├── checkout/route.ts                     # POST create checkout session
│   │   # HB2 fix: route body never specified.
│   │   # Zod body: { tier: z.enum(['starter','growth','agency','agency_pro']),
│   │   #             billing: z.enum(['monthly','annual']) }
│   │   # export async function POST(req: Request) {
│   │   #   const currentUser = await getCurrentUser();
│   │   #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
│   │   #   const { tier, billing } = await req.json();
│   │   #   const url = await createCheckoutSession({
│   │   #     tier, billing, organizationId: currentUser.organizationId
│   │   #   });
│   │   #   return NextResponse.json({ url });  // client redirects to url
│   │   # }
│   ├── portal/route.ts                       # POST create portal session
│   │   # HB2 fix: route body never specified.
│   │   # export async function POST(req: Request) {
│   │   #   const currentUser = await getCurrentUser();
│   │   #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
│   │   #   const [sub] = await db.select({ stripeCustomerId: subscriptions.stripeCustomerId })
│   │   #     .from(subscriptions).where(eq(subscriptions.organizationId, currentUser.organizationId));
│   │   #   if (!sub?.stripeCustomerId)
│   │   #     return NextResponse.json({ error: 'No active subscription' }, { status: 404 });
│   │   #   const url = await createPortalSession({ stripeCustomerId: sub.stripeCustomerId });
│   │   #   return NextResponse.json({ url });  // client redirects to url
│   │   # }
│   └── downgrade/route.ts                    # HD5: POST set cancelAtPeriodEnd=true
│       # HC3 referenced this route; HD5 fix — it was never created.
│       # export async function POST(req: Request) {
│       #   const currentUser = await getCurrentUser();
│       #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
│       #   await setRlsContext(db, currentUser.organizationId);
│       #   const [sub] = await db.select().from(subscriptions)
│       #     .where(eq(subscriptions.organizationId, currentUser.organizationId));
│       #   if (!sub?.stripeSubscriptionId)
│       #     return NextResponse.json({ error: 'No active subscription' }, { status: 404 });
│       #   await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
│       #   await db.update(subscriptions).set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
│       #     .where(eq(subscriptions.organizationId, currentUser.organizationId));
│       #   return NextResponse.json({ message: 'Plan downgrades to Free at period end',
│       #                              periodEnd: sub.currentPeriodEnd });
│       # }
├── sample-audit/route.ts                     # POST rate-limited sample run
│   # HB3 fix: route body never written. Upstash rate-limit + runSampleAudit + SSE progress:
│   # export async function POST(req: Request) {
│   #   // Extract IP for rate limiting (Next.js App Router):
│   #   const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
│   #     ?? req.headers.get('x-real-ip') ?? '127.0.0.1';
│   #   // Rate limit: 3 per IP per 24h:
│   #   const { success, remaining } = await checkSampleRateLimit(ip);  // lib/sample-audit/rate-limit.ts
│   #   if (!success) return NextResponse.json(
│   #     { error: 'Rate limit exceeded. Try again tomorrow.', remaining: 0 }, { status: 429 });
│   #
│   #   // Zod: { domain: z.string().min(3), vertical: z.string() }
│   #   const { domain, vertical } = await req.json();
│   #   // Run sample audit (HA4 runSampleAudit):
│   #   try {
│   #     const result = await runSampleAudit(domain, vertical);
│   #     return NextResponse.json({ auditId: result.auditId, scores: result.scores,
│   #                                composite: result.composite, remaining });
│   #   } catch (err: any) {
│   #     if (err.message?.includes('exceeds cap'))
│   #       return NextResponse.json({ error: err.message }, { status: 503 });
│   #     throw err;
│   #   }
│   # }
│   # Note: no Clerk auth — public endpoint (unauthenticated visitors).
├── webhooks/stripe/route.ts                  # FILL IN (Sprint 1 stubbed signature verify)
├── one-off-audit/route.ts                    # POST trigger one-off purchase (HC5 spec)
└── onboarding/
    └── complete/route.ts                     # HF1 fix: route referenced by HE4 but never created
        # export async function POST(req: Request) {
        #   const currentUser = await getCurrentUser();
        #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        #   await markFirstTimeComplete(currentUser.organizationId);  // HC4 state-machine.ts
        #   return NextResponse.json({ ok: true });
        # }
        # Called by welcome-modal "Got it" button:
        # fetch('/api/onboarding/complete', { method: 'POST' }).then(() => { onDismiss(); router.refresh(); })
    # HC5 fix: "Sprint 1 created the Stripe product; Sprint 10 wires the purchase flow"
    # but route body was never specified. One-off audit = A$299 Stripe checkout:
    # POST body: { brandId: z.string().uuid() }
    # export async function POST(req: Request) {
    #   const currentUser = await getCurrentUser();
    #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    #   const { brandId } = await req.json();
    #   // Verify brand belongs to org:
    #   await setRlsContext(db, currentUser.organizationId);
    #   const [brand] = await db.select({ id: brands.id, name: brands.name })
    #     .from(brands).where(eq(brands.id, brandId));
    #   if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    #   // Create one-off Stripe Checkout session:
    #   const session = await stripe.checkout.sessions.create({
    #     mode: 'payment',  // one-off payment, NOT subscription
    #     line_items: [{ price: ONE_OFF_PRICE_ID, quantity: 1 }],  // HA5 price-map.ts
    #     success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/brands/${brandId}/audits?oneoff=success`,
    #     cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pricing`,
    #     metadata: { organizationId: currentUser.organizationId, brandId, type: 'one_off_audit' },
    #     currency: 'aud',
    #   });
    #   return NextResponse.json({ url: session.url });
    # }
    # Webhook: checkout.session.completed fires → handleCheckoutCompleted checks
    # session.mode === 'subscription' (returns early for payments) — need a separate
    # handlePaymentCompleted handler that checks metadata.type === 'one_off_audit'
    # and fires inngest.send({ name: 'audit/start', data: { brandId, ... } })

components/domain/
├── pricing/
│   ├── pricing-table.tsx                     # 6 tier cards
│   │   # HI4 fix: HG2 referenced PricingTableClient but never wrote it.
│   │   # This is the 'use client' root that owns incGst + interval state for all 6 cards:
│   │   # 'use client'
│   │   # export function PricingTableClient({ currentTier, defaultIncGst }: {
│   │   #   currentTier: string; defaultIncGst: boolean;
│   │   # }) {
│   │   #   const [incGst, setIncGst] = useState(defaultIncGst);
│   │   #   // HM4 fix: was const [interval, setInterval] = useState(...)
│   │   #   // 'setInterval' shadows window.setInterval — TypeScript strict warns; confusing.
│   │   #   const [billingInterval, setBillingInterval] = useState<'monthly'|'annual'>('monthly');
│   │   #   const tiers = ['free', 'starter', 'growth', 'agency', 'agency_pro', 'enterprise'];
│   │   #   async function handleUpgrade(tier: string) {
│   │   #     // HK1 fix: enterprise must redirect to email, NOT Stripe checkout.
│   │   #     // Original code called fetch('/api/billing/checkout') for all tiers including enterprise
│   │   #     // → getPriceId('enterprise') throws 'Unknown tier: enterprise'.
│   │   #     if (tier === 'enterprise') { window.location.href = 'mailto:hi@visibleau.com'; return; }
│   │   #     if (tier === 'free') return;  // free tier has no checkout
│   │   #     const res = await fetch('/api/billing/checkout', { method: 'POST',
│   │   #       headers: { 'Content-Type': 'application/json' },
│   │   #       body: JSON.stringify({ tier, billing: billingInterval }) });  // HM4: was 'interval'
│   │   #     const { url } = await res.json();
│   │   #     window.location.href = url;
│   │   #   }
│   │   #   return (
│   │   #     <div>
│   │   #       <GstToggle incGst={incGst} onChange={setIncGst} />
│   │   #       <BillingIntervalToggle interval={billingInterval} onChange={setBillingInterval} />
│   │   #       <div className="grid grid-cols-3 gap-4">
│   │   #         {tiers.map(tier => (
│   │   #           <PricingCard key={tier} tier={tier} incGst={incGst} interval={billingInterval}
│   │   #             currentTier={currentTier} onUpgrade={() => handleUpgrade(tier)} />
│   │   #         ))}
│   │   #       </div>
│   │   #     </div>
│   │   #   );
│   │   # }
│   ├── pricing-card.tsx                      # per-tier
│   │   # HF3 fix: component body never specified. Uses TIER_METADATA (HE1) + displayPrice (HC2):
│   │   # export function PricingCard({ tier, incGst, interval, currentTier, onUpgrade }: {
│   │   #   tier: keyof typeof TIER_METADATA; incGst: boolean;
│   │   #   interval: 'monthly'|'annual'; currentTier: string; onUpgrade: () => void;
│   │   # }) {
│   │   #   const meta = TIER_METADATA[tier];
│   │   #   // HM3 fix: meta.auditsPerMonth doesn't exist in TIER_METADATA (only brands/engines/price).
│   │   #   // auditsPerMonth lives in TIER_AUDIT_LIMITS — import and read from there:
│   │   #   const auditsPerMonth = TIER_AUDIT_LIMITS[tier]?.auditsPerMonth;
│   │   #   const monthlyExGst = meta.priceAudExGst ?? 0;
│   │   #   const intervalPrice = interval === 'annual' ? monthlyExGst * 10 : monthlyExGst;
│   │   #   const priceStr = meta.priceAudExGst === null ? 'Contact us'
│   │   #     : displayPrice(intervalPrice, { incGst, interval });
│   │   #   const isCurrent = tier === currentTier;
│   │   #   return (
│   │   #     <div className="pricing-card">
│   │   #       <h3>{meta.label}</h3>
│   │   #       <div className="price">{priceStr}</div>
│   │   #       <div className="limits">
│   │   #         {meta.brands > 0 ? `${meta.brands} brands` : 'Unlimited'}
│   │   #         {' · '}
│   │   #         {auditsPerMonth === Infinity ? 'Unlimited' : auditsPerMonth}/mo audits
│   │   #       </div>
│   │   #       <button disabled={isCurrent} onClick={onUpgrade}>
│   │   #         {isCurrent ? 'Current plan' : `Upgrade to ${meta.label}`}
│   │   #       </button>
│   │   #     </div>
│   │   #   );
│   │   # }
│   │   # onUpgrade calls POST /api/billing/checkout with { tier, billing: interval }.
│   ├── gst-toggle.tsx                        # inc/ex GST
│   │   # HF2 fix: component body never specified. Shared state via URL params or context:
│   │   # 'use client'
│   │   # export function GstToggle({ incGst, onChange }: { incGst: boolean; onChange: (v: boolean) => void }) {
│   │   #   return (
│   │   #     <div className="flex items-center gap-2 text-sm">
│   │   #       <button onClick={() => onChange(true)}
│   │   #         className={incGst ? 'font-semibold text-primary' : 'text-tertiary'}>Inc. GST</button>
│   │   #       <span className="text-tertiary">|</span>
│   │   #       <button onClick={() => onChange(false)}
│   │   #         className={!incGst ? 'font-semibold text-primary' : 'text-tertiary'}>Ex. GST</button>
│   │   #     </div>
│   │   #   );
│   │   # }
│   │   # Default: incGst=true for AU users (detect via Accept-Language header or IP),
│   │   # incGst=false for non-AU (US/UK/CA/NZ). State lifted to pricing-table.tsx parent.
│   ├── billing-interval-toggle.tsx           # monthly/annual
│   │   # HF2 fix: component body never specified.
│   │   # 'use client'
│   │   # export function BillingIntervalToggle({ interval, onChange }:
│   │   #   { interval: 'monthly'|'annual'; onChange: (v: 'monthly'|'annual') => void }) {
│   │   #   return (
│   │   #     <div className="flex items-center gap-2 text-sm">
│   │   #       <button onClick={() => onChange('monthly')}
│   │   #         className={interval === 'monthly' ? 'font-semibold' : 'text-tertiary'}>Monthly</button>
│   │   #       <button onClick={() => onChange('annual')}
│   │   #         className={interval === 'annual' ? 'font-semibold' : 'text-tertiary'}>
│   │   #         Annual <span className="text-success text-xs">Save 2 months</span>
│   │   #       </button>
│   │   #     </div>
│   │   #   );
│   │   # }
│   ├── upgrade-cta.tsx                       # used app-wide
│   │   # HF4 fix: "context-aware" never specified. Used in 4 places with different copy.
│   │   # export function UpgradeCta({ reason, suggestedTier = 'growth' }: {
│   │   #   reason: 'quota_exceeded' | 'locked_recommendations' | 'locked_action_center' | 'sample_result';
│   │   #   suggestedTier?: string;
│   │   # }) {
│   │   #   const copy: Record<typeof reason, { title: string; body: string; cta: string }> = {
│   │   #     quota_exceeded:        { title: 'Audit limit reached',
│   │   #                              body: `You've used all audits this month.`,
│   │   #                              cta: `Upgrade to ${TIER_METADATA[suggestedTier]?.label ?? 'Growth'}` },
│   │   #     locked_recommendations:{ title: 'Unlock recommendations',
│   │   #                              body: 'Full action plan available on Starter and above.',
│   │   #                              cta: 'Upgrade to Starter' },
│   │   #     locked_action_center:  { title: 'Unlock Action Center',
│   │   #                              body: 'Track and complete recommendations on Growth and above.',
│   │   #                              cta: 'Upgrade to Growth' },
│   │   #     sample_result:         { title: 'This is a sample (1 engine)',
│   │   #                              body: 'Full audit = 4 engines × 10 prompts × 5 runs = 200 calls.',
│   │   #                              cta: 'Sign up free' },
│   │   #   };
│   │   #   const c = copy[reason];
│   │   #   return (
│   │   #     <div className="upgrade-cta">
│   │   #       <h4>{c.title}</h4><p>{c.body}</p>
│   │   #       <a href="/pricing"><button>{c.cta}</button></a>
│   │   #     </div>
│   │   #   );
│   │   # }
│   └── retention-modal.tsx                   # pre-cancellation prompt
│       # HC3 fix: 3 button actions described in §1 but API calls never specified.
│       # Modal shown before redirecting to Stripe Customer Portal cancellation.
│       # Button 1 — "Downgrade to Free":
│       #   POST /api/billing/downgrade (new route needed)
│       #   stripe.subscriptions.update(subId, { cancel_at_period_end: true })
│       #   → org stays on paid plan until period end → subscription-deleted webhook → tier='free'
│       #   Response: toast "Your plan downgrades at [periodEnd]"; no redirect to portal.
│       # Button 2 — "Pause for 1 month":
│       #   PATCH /api/audit-schedules (bulk) to pause all org schedules (GE4 route).
│       #   Does NOT cancel Stripe subscription — user keeps billing, just no audits fire.
│       #   → toast "Audits paused. Resume anytime in Settings."; close modal.
│       # Button 3 — "Cancel anyway":
│       #   POST /api/billing/portal → redirects to Stripe-hosted cancellation flow.
│       #   This is the only path that actually cancels billing.
├── billing/
│   ├── current-plan-card.tsx
│   │   # HH1 fix: body never specified. Receives subscription row from HD3 BillingView:
│   │   # export function CurrentPlanCard({ sub }: { sub: Subscription | null }) {
│   │   #   const tier = sub?.tier ?? 'free';
│   │   #   const meta = TIER_METADATA[tier];
│   │   #   const periodEnd = sub?.currentPeriodEnd
│   │   #     ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-AU') : null;
│   │   #   async function handleManage() {
│   │   #     const res = await fetch('/api/billing/portal', { method: 'POST' });
│   │   #     const { url } = await res.json();
│   │   #     window.location.href = url;
│   │   #   }
│   │   #   return (
│   │   #     <div className="plan-card">
│   │   #       <h3>{meta?.label ?? 'Free'} plan</h3>
│   │   #       <p>Status: {sub?.status ?? 'active'}</p>
│   │   #       {periodEnd && <p>Renews {periodEnd}</p>}
│   │   #       {sub?.cancelAtPeriodEnd && (
│   │   #         <p className="text-warning">⚠ Cancels at period end ({periodEnd})</p>
│   │   #       )}
│   │   #       {sub ? (
│   │   #         <button onClick={handleManage}>Manage plan</button>
│   │   #       ) : (
│   │   #         <a href="/pricing"><button>Upgrade</button></a>
│   │   #       )}
│   │   #     </div>
│   │   #   );
│   │   # }
│   │   # HH1 fix: body never specified. Shows plan, price, renewal, cancelAtPeriodEnd warning:
│   │   # export function CurrentPlanCard({ sub, tier }: {
│   │   #   sub: Subscription | null; tier: string;
│   │   # }) {
│   │   #   const meta = TIER_METADATA[tier] ?? TIER_METADATA.free;
│   │   #   const priceStr = sub ? displayPrice(meta.priceAudExGst ?? 0,
│   │   #     { incGst: true, interval: sub.billingInterval as 'monthly'|'annual' }) : 'Free';
│   │   #   return (
│   │   #     <div className="plan-card">
│   │   #       <h3>{meta.label} plan</h3>
│   │   #       <div className="price">{priceStr}</div>
│   │   #       {sub && (
│   │   #         <p className="renews">
│   │   #           {sub.cancelAtPeriodEnd
│   │   #             ? `⚠ Cancels on ${sub.currentPeriodEnd?.toLocaleDateString('en-AU')}`
│   │   #             : `Renews ${sub.currentPeriodEnd?.toLocaleDateString('en-AU')}`}
│   │   #         </p>
│   │   #       )}
│   │   #       {sub ? (
│   │   #         <ManagePlanButton />  // calls POST /api/billing/portal → redirect
│   │   #       ) : (
│   │   #         <a href="/pricing"><button>Upgrade plan</button></a>
│   │   #       )}
│   │   #     </div>
│   │   #   );
│   │   # }
│   ├── invoice-history-table.tsx
│   │   # HH2 fix: body never specified. Stripe invoice fields never mapped to columns.
│   │   # HD3 passes: stripe.invoices.list({ customer, limit: 12 }).data
│   │   # Stripe Invoice fields used: created, amount_paid, currency, status,
│   │   #   hosted_invoice_url, invoice_pdf
│   │   # export function InvoiceHistoryTable({ invoices }: { invoices: Stripe.Invoice[] }) {
│   │   #   if (!invoices.length) return <p>No invoices yet.</p>;
│   │   #   return (
│   │   #     <table>
│   │   #       <thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
│   │   #       <tbody>{invoices.map(inv => (
│   │   #         <tr key={inv.id}>
│   │   #           <td>{new Date(inv.created * 1000).toLocaleDateString('en-AU')}</td>
│   │   #           <td>A${((inv.amount_paid ?? 0) / 100).toFixed(2)}</td>
│   │   #           <td><Badge tone={inv.status==='paid' ? 'success' : 'warning'}>{inv.status}</Badge></td>
│   │   #           <td>
│   │   #             {inv.hosted_invoice_url && <a href={inv.hosted_invoice_url} target="_blank">View</a>}
│   │   #             {inv.invoice_pdf && <a href={inv.invoice_pdf} target="_blank">PDF</a>}
│   │   #           </td>
│   │   #         </tr>
│   │   #       ))}</tbody>
│   │   #     </table>
│   │   #   );
│   │   # }
│   │   # Note: inv.amount_paid is in cents (Stripe stores all amounts in smallest currency unit).
│   │   # HH2 fix: body never specified. HD3 passes Stripe invoice objects:
│   │   # import type Stripe from 'stripe';
│   │   # export function InvoiceHistoryTable({ invoices }: { invoices: Stripe.Invoice[] }) {
│   │   #   if (!invoices.length) return <p>No invoices yet.</p>;
│   │   #   return (
│   │   #     <table>
│   │   #       <thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>PDF</th></tr></thead>
│   │   #       <tbody>{invoices.map(inv => (
│   │   #         <tr key={inv.id}>
│   │   #           <td>{new Date(inv.created * 1000).toLocaleDateString('en-AU')}</td>
│   │   #           <td>A${((inv.amount_paid ?? 0) / 100).toFixed(2)}</td>
│   │   #           <td><StatusBadge status={inv.status} /></td>
│   │   #           <td>{inv.invoice_pdf
│   │   #             ? <a href={inv.invoice_pdf} target="_blank">Download</a>
│   │   #             : '—'}
│   │   #           </td>
│   │   #         </tr>
│   │   #       ))}</tbody>
│   │   #     </table>
│   │   #   );
│   │   # }
│   │   # Note: inv.created is Unix timestamp (seconds) → multiply by 1000 for JS Date.
│   │   # inv.amount_paid is in cents → divide by 100 for AUD display.
│   └── usage-meter.tsx                       # X of Y audits this month
│       # HG5 fix: component body never specified. HD3 billing page passes usageCount + tierLimit:
│       # export function UsageMeter({ usageCount, tierLimit }: { usageCount: number; tierLimit: number }) {
│       #   const pct = tierLimit === Infinity ? 0 : Math.min((usageCount / tierLimit) * 100, 100);
│       #   const tone = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'success';
│       #   return (
│       #     <div>
│       #       <div className="flex justify-between text-sm">
│       #         <span>Audits this month</span>
│       #         <span>{usageCount} of {tierLimit === Infinity ? '∞' : tierLimit}</span>
│       #       </div>
│       #       <div className="h-2 rounded bg-muted">
│       #         <div className={`h-full rounded bg-${tone}`} style={{ width: `${pct}%` }} />
│       #       </div>
│       #       {pct >= 90 && tierLimit !== Infinity && (
│       #         <p className="text-xs text-danger">Limit nearly reached.
│       #           <a href="/pricing">Upgrade</a> for more audits.</p>
│       #       )}
│       #     </div>
│       #   );
│       # }
├── onboarding/
│   ├── progress-stepper.tsx                  # 4-step indicator (Sprint 4 wizard wrapper)
│   └── welcome-modal.tsx                     # first dashboard visit
│       # HE4 fix: component body never specified.
│       # 'use client' modal shown by dashboard page when isFirstTimeUser() = true.
│       # Props: { organizationId: string; onDismiss: () => void }
│       # Content:
│       #   - Headline: "Your first audit is running! ⚡"
│       #   - Body: "ChatGPT + Perplexity are scanning 50 prompts × 5 runs right now.
│       #            Results in ~4-6 minutes."
│       #   - Progress hint: links to the audit in progress (live-progress view)
│       #   - CTA button: "Got it, I'll wait" → onClick: calls
│       #       POST /api/onboarding/complete → markFirstTimeComplete(organizationId)
│       #       → onDismiss() closes modal
│       # Rendered as a full-page overlay (z-50) with dark backdrop, centred card.
│       # Never shown again after "Got it" (HC4 org.metadata flag = persisted).
└── sample-audit/
    ├── sample-form.tsx                       # landing-page input
    │   # HG4 fix: primary conversion surface on homepage — body never specified.
    │   # 'use client'
    │   # export function SampleForm() {
    │   #   const [domain, setDomain] = useState('');
    │   #   const [vertical, setVertical] = useState('');
    │   #   const [loading, setLoading] = useState(false);
    │   #   const [error, setError] = useState<string|null>(null);
    │   #   const VERTICALS = ['Plumbing', 'Legal', 'Dental', 'Physio', 'Accounting',
    │   #                       'Real estate', 'HVAC', 'Landscaping', 'Cleaning', 'Other'];
    │   #   async function handleSubmit() {
    │   #     setLoading(true); setError(null);
    │   #     const res = await fetch('/api/sample-audit', {
    │   #       method: 'POST', headers: { 'Content-Type': 'application/json' },
    │   #       body: JSON.stringify({ domain: domain.trim(), vertical }),
    │   #     });
    │   #     if (res.status === 429) { setError('Limit reached — 3 free audits per day.'); setLoading(false); return; }
    │   #     if (res.status === 503) { setError('Service busy — try again in 1 minute.'); setLoading(false); return; }
    │   #     const { auditId } = await res.json();
    │   #     // Navigate to live-progress page (renders LiveProgress component HG3):
    │   #     window.location.href = `/sample-audit/running?auditId=${auditId}`;
    │   #   }
    │   #   return (
    │   #     <div>
    │   #       <input placeholder="yourdomain.com.au" value={domain} onChange={e=>setDomain(e.target.value)} />
    │   #       <select value={vertical} onChange={e=>setVertical(e.target.value)}>
    │   #         <option value="">Select your industry</option>
    │   #         {VERTICALS.map(v => <option key={v} value={v}>{v}</option>)}
    │   #       </select>
    │   #       {error && <p className="error">{error}</p>}
    │   #       <button onClick={handleSubmit} disabled={loading || !domain || !vertical}>
    │   #         {loading ? 'Starting…' : 'Run free sample audit →'}
    │   #       </button>
    │   #     </div>
    │   #   );
    │   # }
    ├── live-progress.tsx                     # 90-second progress
    │   # HG3 fix: polling mechanism never specified. HB3 route returns auditId synchronously.
    │   # Pattern: client-side polling every 2 seconds until audit.status === 'complete':
    │   # 'use client'
    │   # export function LiveProgress({ auditId }: { auditId: string }) {
    │   #   const [status, setStatus] = useState<'running'|'complete'|'error'>('running');
    │   #   const [elapsed, setElapsed] = useState(0);
    │   #   useEffect(() => {
    │   #     const timer = setInterval(() => setElapsed(e => e + 1), 1000);
    │   #     const poll = setInterval(async () => {
    │   #       const res = await fetch(`/api/audits/${auditId}/status`);
    │   #       if (!res.ok) return;
    │   #       const { status } = await res.json();
    │   #       if (status === 'complete') {
    │   #         clearInterval(poll); clearInterval(timer);
    │   #         setStatus('complete');
    │   #         // Navigate to result page:
    │   #         window.location.href = `/sample-audit/result/${auditId}`;
    │   #       }
    │   #     }, 2000);  // poll every 2 seconds
    │   #     return () => { clearInterval(poll); clearInterval(timer); };
    │   #   }, [auditId]);
    │   #   const progress = Math.min((elapsed / 90) * 100, 95);  // cap at 95% until done
    │   #   return <div><progress value={progress} max={100} /><p>{elapsed}s / ~90s</p></div>;
    │   # }
    │   # Note: /api/audits/[auditId]/status is the existing Sprint 3 audit status endpoint.
    └── result-card.tsx                       # simplified single-engine result
        # HI3 fix: HE2 wrote the result page rendering <SampleResultView audit={audit} />.
        # result-card.tsx is the visual card — body never specified.
        # export function ResultCard({ audit }: {
        #   audit: { scores: Record<string, number>; scoreComposite: number; brandName: string }
        # }) {
        #   const scores = audit.scores ?? {};
        #   return (
        #     <div className="result-card">
        #       <div className="text-center py-6">
        #         <div className="text-xs uppercase text-muted mb-2">Sample composite score</div>
        #         <div className="text-6xl font-bold text-blue">{Math.round(Number(audit.scoreComposite))}</div>
        #         <Badge tone="info">Limited preview · 1 of 4 engines tested</Badge>
        #       </div>
        #       <div className="space-y-2">
        #         {Object.entries(scores).map(([dim, score]) => (
        #           <div key={dim} className="flex justify-between text-sm">
        #             <span className="capitalize">{dim}</span>
        #             <span className="font-mono">{Math.round(Number(score))}/100</span>
        #           </div>
        #         ))}
        #       </div>
        #       <UpgradeCta reason="sample_result" />  {/* HF4 */}
        #     </div>
        #   );
        # }

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
  // HA1 fix: was text('cancel_at_period_end').default('false') — boolean as text string.
  // Same recurring bug as FA1 (Sprint 8), EA1 (Sprint 7). Boolean columns must use boolean():
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
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

**HA2 fix — barrel exports never specified (recurring gap: Sprints 5/6/7/8/9). Add to `db/schema/index.ts`:**
```typescript
export * from './subscriptions';
export * from './processed-webhook-events';
export type Subscription = InferSelectModel<typeof subscriptions>;
export type ProcessedWebhookEvent = InferSelectModel<typeof processedWebhookEvents>;
```

**HE5 fix — Sprint 10 references multiple new columns on `organizations` (Sprint 2 table) that are never consolidated into one migration block. All organizations additions:**
```sql
-- Sprint 10 organizations table extensions:
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS metadata     jsonb    DEFAULT '{}' NOT NULL; -- HC4
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug         text     UNIQUE;                 -- HC1 synthetic org
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tier         text     DEFAULT 'free' NOT NULL; -- multiple refs
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false NOT NULL; -- GD5
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ga4_measurement_id  text;                    -- GD1/Sprint 9
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ga4_api_secret       text;                    -- GD1/Sprint 9
ALTER TABLE brands         ADD COLUMN IF NOT EXISTS client_tag           text;                    -- GB5/Sprint 9
-- Also add to Drizzle organizations.ts schema definition for TypeScript type safety.
-- HK3 fix: 'Also add to Drizzle' was prose with no actual column definitions.
-- Add these to db/schema/organizations.ts (the Sprint 2 pgTable definition):
-- slug:               text('slug').unique(),
-- metadata:           jsonb('metadata').default('{}').notNull(),
-- tier:               text('tier').default('free').notNull(),
-- onboardingComplete: boolean('onboarding_complete').default(false).notNull(),
-- ga4MeasurementId:   text('ga4_measurement_id'),
-- ga4ApiSecret:       text('ga4_api_secret'),
-- These additions must be added to the existing pgTable(...) call, not as separate tables.
```

**RLS policy matrix (Sprint 10):**
```sql
-- subscriptions: tenant data (org has exactly one subscription row)
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON subscriptions
  USING (organization_id = current_setting('app.current_organization_id')::uuid);

-- processed_webhook_events: system table — NO RLS (accessed by webhook handler without org context)
-- Stripe webhooks do not have an organizationId — do not enable RLS on this table.
```

**`serve()` addition for Sprint 10 Inngest function:**
```typescript
import { sampleAuditCleanup } from '@/inngest/functions/sample-audit-cleanup';
// Add sampleAuditCleanup to serve() array in app/api/webhooks/inngest/route.ts
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

// HA4 fix: runSampleAudit function body never written. Canonical implementation:
// HK2 fix: results.actualCostAud never specified — Sprint 3's runAuditEngines
// doesn't return cost. For Sprint 10: use SAMPLE_AUDIT_CONFIG.estimatedCostAud as
// the logged cost (stored in audit.metadata.costAud). Exact token metering in Sprint 11.
// To get actual cost: accumulate usage.total_tokens from OpenAI responses, multiply by
// blended rate (~$0.01/1K tokens USD), divide by FX_AUD_USD env var.
// export async function runSampleAudit(domain: string, vertical: string): Promise<SampleAuditResult> {
//   const capAud = parseFloat(process.env.SAMPLE_AUDIT_COST_CAP_AUD ?? '0.10');
//   if (SAMPLE_AUDIT_CONFIG.estimatedCostAud > capAud)
//     throw new Error(`Estimated cost A$${SAMPLE_AUDIT_CONFIG.estimatedCostAud} exceeds cap A$${capAud}`);
//
//   const sampleOrg = await ensureSampleOrg();  // lib/sample-audit/synthetic-org.ts
//   const brand = await db.insert(brands).values({
//     organizationId: sampleOrg.id, name: domain, domain, vertical, createdAt: new Date(),
//   }).returning().then(r => r[0]);
//
//   // Call Sprint 3's existing prompt runner with sample constraints:
//   // HL2 fix: import path never specified. Add to top of run.ts:
//   // import { runAuditEngines } from '@/lib/audit/run-engines';  // Sprint 3 module
//   // isSample: Sprint 3's runAuditEngines may not accept this param.
//   // If it doesn't, simply don't pass it — the constraints (engines, promptsCount, runsPerPrompt)
//   // are what limit the audit. The isSample flag is only needed for cleanup identification.
//   const results = await runAuditEngines({
//     brandId: brand.id, organizationId: sampleOrg.id,
//     engines: SAMPLE_AUDIT_CONFIG.engines,       // ['chatgpt']
//     promptsCount: SAMPLE_AUDIT_CONFIG.promptsCount,  // 5
//     runsPerPrompt: SAMPLE_AUDIT_CONFIG.runsPerPrompt, // 1
//     // isSample: true — only if Sprint 3 runAuditEngines supports it
//   });
//
//   const audit = await db.insert(audits).values({
//     brandId: brand.id, organizationId: sampleOrg.id,
//     scores: results.scores, scoreComposite: results.composite,
//     metadata: { isSample: true, costAud: results.actualCostAud },
//   }).returning().then(r => r[0]);
//
//   return { auditId: audit.id, scores: results.scores, composite: results.composite };
// }
```

**Conflict-audit C3 fix:** my v1.0 Sprint 11 had "2 engines × 5 prompts × 1 run = 10 calls". PRD canonical is "1 engine, 5 prompts, single run, ~90 seconds, ~A$0.10". Sprint 10 v2.0 implements PRD canonical exactly. **Second-pass-fix N14:** env var renamed `SAMPLE_AUDIT_COST_CAP_USD` → `SAMPLE_AUDIT_COST_CAP_AUD` since the PRD cap is in AUD; USD conversion happens at call time.

---

## 7. Stripe webhook handler

```typescript
// app/api/webhooks/stripe/route.ts
export async function POST(req: Request) {
  // HM5 fix: §7 originally called req.text() here AND HD2's verifyStripeWebhook also
  // calls req.text() — second call returns empty string, Stripe signature fails.
  // Fix: delegate entirely to verifyStripeWebhook (HD2) which reads the body ONCE:
  let event: Stripe.Event;
  try {
    event = await verifyStripeWebhook(req);  // from lib/stripe/verify-webhook.ts (HD2)
  } catch {
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency — check if event.id already processed
  const existing = await db.query.processedWebhookEvents.findFirst({
    where: eq(processedWebhookEvents.stripeEventId, event.id),
  });
  if (existing) return Response.json({ received: true, duplicate: true });

  // HJ3 fix: RACE CONDITION — two simultaneous identical events both pass the check above,
  // both run the handler, both try to insert → second insert violates UNIQUE constraint.
  // Fix: wrap handler + idempotency insert in a DB transaction.
  // The UNIQUE constraint on stripe_event_id (processedWebhookEvents) acts as the final guard.
  try {
    await db.transaction(async (tx) => {
      // Re-check inside transaction (serializable isolation):
      const alreadyProcessed = await tx.query.processedWebhookEvents.findFirst({
        where: eq(processedWebhookEvents.stripeEventId, event.id),
      });
      if (alreadyProcessed) return;  // concurrent duplicate — exit transaction

      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event);
          await handlePaymentCompleted(event);  // HD4
          break;
        case 'customer.subscription.updated':  await handleSubscriptionUpdated(event); break;
        case 'customer.subscription.deleted':  await handleSubscriptionDeleted(event); break;
        case 'invoice.paid':                   await handleInvoicePaid(event); break;
        case 'invoice.payment_failed':         await handleInvoicePaymentFailed(event); break;
      }

      await tx.insert(processedWebhookEvents).values({
        stripeEventId: event.id, type: event.type,
      });
    });
  } catch (err: any) {
    // UNIQUE violation = concurrent duplicate already handled — treat as success:
    if (err.code === '23505') return Response.json({ received: true, duplicate: true });
    throw err;
  }

  return Response.json({ received: true });
}
```

Each handler must be idempotent — re-running the same event = same final state.

**HA3 fix — 5 webhook handler bodies never written. Canonical implementations:**

```typescript
// lib/stripe/webhook-handlers/checkout-completed.ts
export async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== 'subscription') return; // ignore one-off payments here
  const orgId = session.metadata?.organizationId;
  if (!orgId) throw new Error('Missing organizationId in checkout session metadata');
  const sub = await stripe.subscriptions.retrieve(session.subscription as string);
  const priceId = sub.items.data[0].price.id;
  const tier = tierFromPriceId(priceId);  // lib/stripe/price-map.ts reverse lookup
  // Upsert subscription row (idempotent):
  await db.insert(subscriptions).values({
    organizationId: orgId, stripeCustomerId: session.customer as string,
    stripeSubscriptionId: sub.id, stripePriceId: priceId,
    tier, billingInterval: sub.items.data[0].price.recurring?.interval === 'year' ? 'annual' : 'monthly',
    status: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end,
    currentPeriodStart: new Date(sub.current_period_start * 1000),
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
  }).onConflictDoUpdate({ target: subscriptions.organizationId,
    set: { tier, status: sub.status, stripePriceId: priceId, updatedAt: new Date() } });
  // Sync org.tier:
  await db.update(organizations).set({ tier }).where(eq(organizations.id, orgId));
}

// lib/stripe/webhook-handlers/subscription-updated.ts
export async function handleSubscriptionUpdated(event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;
  const [existing] = await db.select({ orgId: subscriptions.organizationId })
    .from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, sub.id));
  if (!existing) return; // subscription not in our DB yet — checkout-completed handles it
  const priceId = sub.items.data[0].price.id;
  const tier = tierFromPriceId(priceId);
  await db.update(subscriptions).set({ tier, status: sub.status, stripePriceId: priceId,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    currentPeriodEnd: new Date(sub.current_period_end * 1000), updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));
  await db.update(organizations).set({ tier }).where(eq(organizations.id, existing.orgId));
}

// lib/stripe/webhook-handlers/subscription-deleted.ts
export async function handleSubscriptionDeleted(event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;
  const [existing] = await db.select({ orgId: subscriptions.organizationId })
    .from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, sub.id));
  if (!existing) return;
  await db.update(subscriptions).set({ status: 'canceled', updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));
  // Downgrade to free at period end (anti-pattern: DO NOT downgrade immediately):
  await db.update(organizations).set({ tier: 'free' }).where(eq(organizations.id, existing.orgId));
}

// lib/stripe/webhook-handlers/invoice-paid.ts
export async function handleInvoicePaid(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  // Ensure subscription stays active (covers failed→retry→success case):
  if (invoice.subscription) {
    await db.update(subscriptions).set({ status: 'active', updatedAt: new Date() })
      .where(eq(subscriptions.stripeSubscriptionId, invoice.subscription as string));
  }
}

// lib/stripe/webhook-handlers/invoice-payment-failed.ts
export async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  if (invoice.subscription) {
    await db.update(subscriptions).set({ status: 'past_due', updatedAt: new Date() })
      .where(eq(subscriptions.stripeSubscriptionId, invoice.subscription as string));
    // Optionally: send payment-failed email via Resend
  }
}
```

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
   - Welcome modal on first dashboard visit
   - **HE3 fix: §2 said "one-time via localStorage" — wrong. localStorage is not SSR-safe
     in Next.js App Router and fails cross-device (shows again on new device/browser).
     Canonical: use HC4's `org.metadata.firstTimeFlowComplete` server-side flag instead.
     Dashboard page checks `isFirstTimeUser(org.id)` → renders WelcomeModal if true.
     Modal's "Got it" button calls markFirstTimeComplete(). No localStorage anywhere.**

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
   - **HD5 fix — POST /api/billing/downgrade/route.ts: referenced by HC3 retention-modal but never created. Sets `cancel_at_period_end: true` on Stripe + syncs DB. See HD5 spec in §4 billing section.**

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

- v1.15 (18 May 2026): **Thirty-second-pass audit — /onboarding redirect, sample RLS fix, auditsPerMonth TIER_AUDIT_LIMITS, setInterval shadow, verifyStripeWebhook double-read (HM1-HM5).**
- v1.14 (18 May 2026): **Twenty-ninth-pass audit — success toast, runAuditEngines import, cleanup cascade, STRIPE_WEBHOOK_SECRET env, BillingView RLS note (HL1-HL5).**
- v1.13 (18 May 2026): **Twenty-sixth-pass audit — enterprise checkout fix, actualCostAud, organizations Drizzle schema, LandingV2 Sprint 11 scope, allow_promotion_codes (HK1-HK5).**
- v1.12 (18 May 2026): **Twenty-third-pass audit — running page, SampleResultView, webhook race condition transaction, markFirstTimeComplete callsite, client_reference_id (HJ1-HJ5).**
- v1.11 (18 May 2026): **Twentieth-pass audit — upgrade page, BillingView, result-card, PricingTableClient, Stripe AU config (HI1-HI5).**
- v1.10 (18 May 2026): **Seventeenth-pass audit — current-plan-card, invoice-history-table, markFirstTimeComplete wiring, LaunchChecklist Sprint 12 scope, sampleAuditCleanup export (HH1-HH5).**
- v1.10 (18 May 2026): **Seventeenth-pass audit — current-plan-card, invoice-history-table, /welcome vs /onboarding, sample-audit landing page, slug migration dependency (HH1-HH5).**
- v1.9 (18 May 2026): **Fourteenth-pass audit — automatic_tax GST double-charge, pricing page server component, live-progress polling, sample-form, usage-meter (HG1-HG5).**
- v1.8 (18 May 2026): **Twelfth-pass audit — onboarding/complete route, gst-toggle+billing-toggle bodies, pricing-card, upgrade-cta context-aware, UpgradeFlow tier-agnostic note (HF1-HF5).**
- v1.7 (18 May 2026): **Ninth-pass audit — TIER_AUDIT_LIMITS, sample-result page, localStorage→org.metadata, welcome-modal, organizations migration consolidated (HE1-HE5).**
- v1.6 (18 May 2026): **Seventh-pass audit — redirects.ts, verify-webhook module, billing page, handlePaymentCompleted, downgrade route (HD1-HD5).**
- v1.5 (18 May 2026): **Fifth-pass audit — ensureSampleOrg, gst.ts math, retention-modal actions, metadata migration + state-machine, one-off-audit route (HC1-HC5).**
- v1.4 (18 May 2026): **Fourth-pass audit — createCheckoutSession+createPortalSession, billing routes, sample-audit route, cleanup cron, Upstash rate-limit (HB1-HB5).**
- v1.3 (18 May 2026): **Third-pass audit — cancelAtPeriodEnd boolean, barrel exports, webhook handlers, runSampleAudit, price-map (HA1-HA5).**

- v2.1 (13 May 2026): **Second-pass-fix audit.** **(N5)** First-audit-after-signup spec reconciled: §1 line 24 was "auto-trigger first audit using ChatGPT-only single-engine mode" — contradicted prototype line 1894 ("4 engines × 10 prompts × 5 runs") and Free tier PRD canonical (2 engines). Now: first post-signup audit honours the new user's tier (Free = 2 engines per Sprint 3 TIER_ENGINES). The pre-signup sample audit already provides the 90-second ChatGPT-only teaser. **(N14)** `SAMPLE_AUDIT_COST_CAP_USD` env var renamed to `SAMPLE_AUDIT_COST_CAP_AUD` because PRD §7 Principle #6 caps the sample at "~A$0.10" (AUD), not USD. Added `FX_AUD_USD=0.66` env var; cost-cap conversion happens at call time. `estimatedCostUsd` in `SAMPLE_AUDIT_CONFIG` renamed to `estimatedCostAud`.
- v2.0 (12 May 2026): **Complete rewrite per conflict-audit C3 + H2 + L7.** Sprint 10 v1.0 was Stripe billing only. PRD §11 says Sprint 10 = Onboarding + Sample audit + Upgrade flow (Stripe is a component of upgrade flow). v2.0 implements PRD canonical: onboarding state machine, **sample audit at PRD canonical spec (1 engine ChatGPT, 5 prompts, 1 run, ~90s, ~A$0.10)** — was incorrectly 2 engines in v1.0 Sprint 11; moved to correct Sprint 10 here. Stripe billing layer with **monthly + annual prices (annual = 10× monthly = 2 months free)** + **one-off audit A$299** purchase flow. Webhook idempotency via processed_webhook_events table. Cancellation retention modal.
- v1.0 (12 May 2026): Initial. Net-new sprint prompt as "Stripe billing only." **Conflicts: missing onboarding, missing sample audit, missing one-off + annual products.**
