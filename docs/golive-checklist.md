# VisibleAU — GoLive Checklist

## PRE-CUTOVER (T-1 day)

- [ ] All Sentry config in production (client/server/edge configs, instrumentation.ts)
- [ ] All env vars set in Vercel production (cross-check with .env.production.example)
- [ ] GitHub Actions CI green on main branch — pnpm test + pnpm lint + pnpm typecheck all passing
- [ ] Vercel plan upgraded to Pro (~US$20/mo) — 60s function timeout required for Inngest
- [ ] Supabase plan upgraded to Pro (~US$25/mo) — required for PITR backup drill
- [ ] Stripe in production/live mode (separate from test mode)
- [ ] Stripe webhook endpoint registered (production URL: https://visibleau.com/api/webhooks/stripe)
- [ ] Stripe Customer Portal configured (return URL: https://visibleau.com/settings/billing)
- [ ] Clerk production instance created, Organizations enabled
- [ ] Clerk webhook endpoint registered (https://visibleau.com/api/webhooks/clerk)
- [ ] Resend domain verified (SPF + DKIM DNS records green in Resend dashboard)
- [ ] PostHog production key configured (NEXT_PUBLIC_POSTHOG_KEY updated)
- [ ] Upstash production database created (visibleau-production in ap-southeast-2)
- [ ] Supabase production project confirmed (NEXT_PUBLIC_SUPABASE_URL + ANON_KEY point to prod, Sydney region)
- [ ] drizzle-kit migrate run against production DATABASE_URL
- [ ] RLS policies verified in production Supabase (organizations, brands, audits, citations)
- [ ] Supabase Storage buckets created (logos: public, reports: private)
- [ ] processed_webhook_events table exists (Stripe idempotency)
- [ ] public/og-image.png exists (1200×630px)
- [ ] DNS TTL lowered to 300s (5 min) at registrar — 24h before cutover
- [ ] DNS records prepared but not switched
- [ ] Backup verified within last 24h
- [ ] Load test passed within last week
- [ ] Security audit complete (pnpm security:scan green)
- [ ] Privacy + Terms live at /privacy and /terms
- [ ] Cookie consent banner showing on first visit
- [ ] ProductHunt launch scheduled (Tue-Thu)
- [ ] IndieHackers post drafted
- [ ] Beta cohort sign-off — 5-10 customers have run audits, blocking issues fixed

## CUTOVER (T-0)

- [ ] Run final smoke test on staging
- [ ] Verify production build passes: NODE_ENV=production pnpm build (zero errors)
- [ ] Switch DNS A/CNAME to Vercel production
- [ ] Verify SSL provisioning (Vercel auto, ~60s)
- [ ] Register Inngest production app URL (https://visibleau.com/api/webhooks/inngest) — AFTER DNS live
- [ ] Run signup flow against production
- [ ] Run sample audit against production
- [ ] Verify Stripe checkout end-to-end
- [ ] Verify Clerk webhook fires
- [ ] Verify Sentry receives events (test error)
- [ ] Verify /api/health returns 200
- [ ] Open browser DevTools → Console on production — verify zero errors/warnings
- [ ] ALL above items green → THEN tweet/post launch announcement

## POST-CUTOVER

- [ ] T+1h: Check Sentry dashboard for spike
- [ ] T+1h: Check Vercel metrics for performance regressions
- [ ] T+1d: Monitor signups + first-audit completion rate
- [ ] T+7d: Respond to user reports within 4h
