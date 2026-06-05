# Sprint 12 — Launch Readiness

**Sprint:** 12 of 12
**Estimated effort:** 24-30 hours (~3-4 weekends at 8 hrs/week)
**Goal:** Take Sprint 11's polished build to production. Monitoring, alerting, backups, load testing, security audit, legal docs final, pre-launch marketing prep.
**Prerequisites:** Sprint 11 complete. All previous sprints accepted.
**Out of scope:** Post-launch growth marketing, paid acquisition channels (v1.1+).

---

## 0. Read first

1. `CLAUDE.md`
2. `sri-geo-aeo-prd-v1.md` v1.15 §11 Sprint 12 (deliverables checklist) + §10 Security & compliance baseline (SOC 2 timeline + APP/GDPR baseline) — GoLive criteria are derived from these sections; the PRD has no standalone "§18 GoLive checklist."
3. Sentry Next.js integration docs
4. OWASP Top 10 (current)

---

## 1. What ships this sprint

- ✓ Sentry integration (errors, performance, releases)
- ✓ Uptime monitoring (Vercel native + external like Better Uptime or Cronitor)
- ✓ Alerting: error rate spikes, audit job failures, webhook delivery failures, billing anomalies
- ✓ Backup verification: **Supabase Postgres point-in-time recovery tested** (Supabase Pro has automatic daily backups + PITR)
- ✓ Load testing: 50 concurrent audits + 100 concurrent dashboard loads
- ✓ Security audit: dependency scan (`pnpm audit`), OWASP Top 10 review, secret rotation
- ✓ Legal: privacy policy final, terms of service final, cookie consent banner
- ✓ ATTRIBUTIONS.md final (Sprint 12 last entry)
- ✓ Production deployment: Vercel production env vars, **Supabase production project**, domain DNS
- ✓ **Beta cohort: 5-10 friendly customers** per PRD §11 Sprint 12 — recruit from Sri's network or pre-launch waitlist, run 1-2 audits each, fix issues, THEN cut DNS over
  **JI1 fix: zero specifics on recruitment, URL, tasks, feedback collection, or issue triage. Operational plan:**

  **Recruitment (1 week before target launch):**
  - LinkedIn: DM 10-15 AU tradies/allied health business owners Sri knows personally — "I'm building a tool to track your business's AI search visibility. Would you try a free beta?"
  - Existing Facebook group contacts from TradieQuotes/VisibleAU research (personal messages, not group posts)
  - Target: 5 AU tradies, 3 allied health, 2 professional services

  **Beta access:**
  - Give staging URL (not production) OR production URL with a free 30-day code
  - Provide a 2-minute Loom walkthrough: "here's what to do" (reuse the landing page Loom)
  - Create a free Starter trial for each beta user so they get full paid-tier features

  **Feedback collection:**
  - Simple Typeform or Google Form: "Did your audit complete? (Y/N) Any errors? What was confusing?"
  - Direct WhatsApp/email for blocking issues (faster than forms)
  - Set expectation: "Takes 2-5 minutes, I'd love your feedback within 3 days"

  **Issue triage (blocking vs non-blocking):**
  - **Blocking (delays launch):** Audit fails to complete; payment doesn't work; signup broken; data wrong
  - **Non-blocking (v1.1):** UI/UX improvements; missing features; wording suggestions
- ✓ **SOC 2 Type 1 kickoff plan** per PRD §10 Security baseline — "SOC 2 Type 1 by month 12 (Type 2 by month 18, required for enterprise tier)". Sprint 12 plans the kickoff (Vanta or Drata vendor selection, scope document, initial control inventory). Audit itself runs months 6-12 post-launch.
- ✓ Pre-launch marketing: ProductHunt assets, IndieHackers post draft, AU community plan
- ✓ GoLive checklist: 30+ item walkthrough before flipping DNS
- ✓ Internal documentation: ops runbook (what to do when X breaks)
- ✓ **Dynamic README badge generator** — PRD §16 item 27, Sprint 12 launch deliverable (1 day effort)
  - `app/api/badge/route.ts` — returns SVG with score colour band
  - URL: `https://visibleau.com/api/badge?domain=foo.com.au`
  - SVG: "Visible on AI: 72%" with green/amber/red colour based on score
  - Cache: 1h. No auth required (public API).
  - Adds to `@visibleau/wilson-ci-scorer` npm publish (see below)
- ✓ **Demo data mode** — PRD §16 item 29, Sprint 12 launch deliverable (2 days effort)
  - Pre-seeded AU Tradies / Allied Health / AU SaaS workspaces for demos
  - Triggered by env var `DEMO_MODE=true` or a special `/demo` route
  - Surfaces existing sample org infrastructure (Sprint 10 HC1 `ensureSampleOrg`)
  - **JA5 fix: Both items listed in PRD §16 as "Sprint 12 (launch)" deliverables — missing from Sprint 12 §1 entirely.**
  - **JL5 fix: PRD §8.5 anti-pattern: "Do not ship 'Coming soon' features in marketing." Demo data mode must only seed data for features that are fully shipped (Sprints 1-11). Guard the seed data:**
    - ✓ Seed: audit results, citations, scores, action center recommendations (Sprints 3-6 — complete)
    - ✓ Seed: agency dashboard with multi-brand (Sprint 9 — complete)
    - ❌ Do NOT seed: features deferred to v1.1 (AI Overviews engine, UK region, additional verticals)
    - The demo workspace must reflect the real product — `DEMO_MODE` is for authentic demos, not aspirational ones
- ✓ **npm OSS package publish** — PRD §16 "v1 launch: publish `@visibleau/wilson-ci-scorer` + `@visibleau/llms-txt-generator`"
  **JF1 fix: PRD §16 explicitly schedules both npm publishes at "v1 launch (Sprint 12)" — completely absent from Sprint 12. Steps:**
  - `packages/wilson-ci-scorer/` — extract Wilson CI scorer from Sprint 3's scoring module
    - `package.json`: `{ "name": "@visibleau/wilson-ci-scorer", "version": "1.0.0", "main": "dist/index.js" }`
    - README: links to `visibleau.com` + usage example
    - `npm publish --access public` (requires npm account + `npm login`)
  - `packages/llms-txt-generator/` — extract llms.txt generator from Sprint 7
    - `package.json`: `{ "name": "@visibleau/llms-txt-generator", "version": "1.0.0", "bin": { "llms-txt": "dist/cli.js" } }`
    - README: CLI usage + links to `visibleau.com`
    - `npm publish --access public`
  - **Effort: 2-3 days total (extraction + docs + publish)**. Add to §12 Claude Code as Step 13.

**Definition of done:** Product is live at visibleau.com. Sentry receives events. Backup restored successfully in a test. 5-10 beta customers have run 1-2 audits each and any blocking issues are fixed. SOC 2 Type 1 vendor selected + kickoff plan documented. ProductHunt scheduled launch is ready to fire. Sri has an ops runbook he can follow at 2am when something breaks.

---

## 2. Dependencies to install

```bash
# Monitoring
pnpm add @sentry/nextjs

# Load testing
pnpm add -D autocannon tsx  # JD1 fix: use autocannon + tsx instead of k6 (k6 doesn't run TS natively)

# Cookie consent (only if not handled by Clerk/Stripe checkout)
# JB2 fix: 'cookie-consent' package is abandoned (last publish 2015) — wrong package.
# Options in order of preference:
# 1. Build custom with shadcn Dialog (lightweight, matches design system — recommended for Sprint 12)
# 2. pnpm add react-cookie-consent  (maintained, 200KB, simple API)
# 3. pnpm add @osano/cookieconsent  (full-featured, heavier)
# For v1: custom shadcn Dialog banner is fastest and avoids a runtime dependency.
```

**JK3 fix: Sprint 12 scripts referenced throughout but never added to `package.json`. Without named scripts, developers type full paths and make errors. Add to `package.json` `"scripts"` block:**
```json
{
  "stripe:setup":    "tsx scripts/setup-stripe-products.ts",
  "load:audits":     "tsx scripts/load-test/audit-concurrency.ts",
  "load:dashboard":  "tsx scripts/load-test/dashboard-load.ts",
  "backup:test":     "tsx scripts/backup-restore-test.ts",
  "security:scan":   "tsx scripts/security-scan.ts",
  "postbuild":       "next-sitemap",
  "demo:seed":       "tsx scripts/seed-demo-data.ts"
}
```

**JW5 fix: Vercel auto-injects `@vercel/analytics` and `@vercel/speed-insights` into Next.js projects deployed on Vercel. If both are active alongside PostHog, pageviews are double-counted (Vercel Analytics + PostHog each fire `$pageview`). Decision required before launch:**

- **Option A — Disable Vercel Analytics, use PostHog only (recommended):** Add `NEXT_PUBLIC_VERCEL_ANALYTICS_DISABLED=1` env var in Vercel dashboard, OR remove `<Analytics />` + `<SpeedInsights />` from `app/layout.tsx` if they were added by a wizard. PostHog provides equivalent funnel data.
- **Option B — Keep both:** Vercel Analytics tracks performance metrics (Core Web Vitals, TTFB); PostHog tracks product funnels. They serve different purposes — coexistence is fine IF you accept the pageview double-count in PostHog dashboard. Filter PostHog funnels by `$lib = posthog-js` to exclude Vercel pageview events.
- **Check:** `grep -r "@vercel/analytics\|SpeedInsights" app/` — if found, decide A or B before launch.

---

## 3. Environment variables

```bash
# JU4 fix: Vercel has 3 environments — Production, Preview, Development.
# NEVER set live secrets on "All Environments" — staging/preview would use real Stripe keys.
# Set each group to the correct environment in Vercel → Settings → Environment Variables:
#
# PRODUCTION ONLY (live secrets — never expose to preview/staging):
#   STRIPE_SECRET_KEY=sk_live_...
#   STRIPE_WEBHOOK_SECRET=whsec_... (production endpoint secret)
#   CLERK_SECRET_KEY=sk_live_...
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
#   All LLM API keys (OPENAI/ANTHROPIC/GOOGLE/PERPLEXITY) — production keys
#   SUPABASE_SERVICE_ROLE_KEY (production project)
#   NEXT_PUBLIC_SUPABASE_URL (production project URL)
#   NEXT_PUBLIC_SUPABASE_ANON_KEY (production project)
#   UPSTASH_REDIS_REST_URL / TOKEN (production database)
#
# PREVIEW + PRODUCTION (shared — non-secret or safe to share):
#   NEXT_PUBLIC_POSTHOG_KEY (PostHog tracks staging separately via distinct_id)
#   NEXT_PUBLIC_SENTRY_DSN (Sentry filters by environment tag)
#   SENTRY_AUTH_TOKEN (build-time source map upload — same for all)
#   RESEND_FROM_EMAIL=noreply@visibleau.com
#
# ALL ENVIRONMENTS (config, not secrets):
#   NEXT_PUBLIC_APP_URL (overridden per env by Vercel system var VERCEL_URL)
#   NODE_ENV (Vercel sets automatically)

# Sentry
SENTRY_DSN=https://...
SENTRY_AUTH_TOKEN=...  # for source map uploads
SENTRY_ORG=visibleau
SENTRY_PROJECT=visibleau-web
NEXT_PUBLIC_SENTRY_DSN=https://...

# Stripe
# JK2 fix: STRIPE_WEBHOOK_SECRET missing from §3 — critical for production webhook verification.
# Sprint 10 HL4 added it to Sprint 10's §3 but Sprint 12's §3 omitted it.
# Without this, production Stripe webhooks fail signature verification → subscriptions broken.
STRIPE_WEBHOOK_SECRET=whsec_...    # Stripe dashboard → Live mode → Webhooks → your endpoint → signing secret
                                   # Different from dev (stripe listen) secret — must get production value

# JO2 fix: STRIPE_PRICE_* vars never in §3 despite being referenced by billing routes.
# After running setup-stripe-products.ts against production (JE1), copy these from Stripe dashboard:
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_GROWTH_MONTHLY=price_...
STRIPE_PRICE_GROWTH_ANNUAL=price_...
STRIPE_PRICE_AGENCY_MONTHLY=price_...
STRIPE_PRICE_AGENCY_ANNUAL=price_...
STRIPE_PRICE_AGENCY_PRO_MONTHLY=price_...
STRIPE_PRICE_AGENCY_PRO_ANNUAL=price_...
STRIPE_PRICE_ONE_OFF_AUDIT=price_...  # A$299 one-off audit (Sprint 10 HF1)

# JR2 fix: Resend production vars never in §3. Sprint 2 uses RESEND_FROM_EMAIL (not FROM_EMAIL).
# Get production RESEND_API_KEY from Resend dashboard → API Keys → create production key:
RESEND_API_KEY=re_...                 # Resend dashboard → API Keys → production key
RESEND_FROM_EMAIL=noreply@visibleau.com  # must match verified domain (JG2 Resend verification)

# JP2 fix: One-off audit uses Stripe mode:'payment' (not 'subscription').
# Sprint 10's webhook handler has: if (session.mode !== 'subscription') return;
# This means one-off payment completions (checkout.session.completed with mode:'payment')
# are SILENTLY IGNORED — customer pays A$299, nothing happens.
# Before production launch: verify Sprint 10's webhook handler has a SEPARATE branch:
# if (session.mode === 'payment') { await handleOneOffAuditPayment(session); return; }
# Sprint 10 spec shows this at line ~320: 'if (session.mode !== 'payment') return;' in the
# one-off handler — confirm this path exists and is tested end-to-end in staging.

# Production
NEXT_PUBLIC_APP_URL=https://visibleau.com
NODE_ENV=production
LLM_MODE=real  # production uses real LLMs

# JS1 fix: LLM API keys — the most critical keys for product functionality — never in §3.
# §8 rotation checklist mentions them but §3 never listed them for Vercel env var setup.
# Rotate these during Step 7 (after production deployment is ready per JQ1):
OPENAI_API_KEY=sk-...              # platform.openai.com → API keys → create production key
ANTHROPIC_API_KEY=sk-ant-...      # console.anthropic.com → API keys → create production key
GOOGLE_GENERATIVE_AI_API_KEY=...  # JT4 fix: ambiguous "OR Google Cloud Console (Vertex AI)".
                                   # CLAUDE.md specifies @ai-sdk/google via Vercel AI SDK.
                                   # @ai-sdk/google uses Google AI Studio keys (NOT Vertex AI):
                                   # → aistudio.google.com → Get API key → Create API key
                                   # Vertex AI uses Google Cloud service accounts + project IDs
                                   # (completely different auth system — DO NOT use Vertex AI keys here)
                                   # Google AI Studio key format: AIza...
PERPLEXITY_API_KEY=pplx-...      # perplexity.ai/settings/api → create production key
# Note: LLM providers don't support dual-key rotation — accept ~30s window (JD4 procedure)

# JC1 fix: missing from §3 despite being in CLAUDE.md stack — required for rotation + production deploy:
SUPABASE_SERVICE_ROLE_KEY=...          # Supabase dashboard → Project Settings → API
SUPABASE_JWT_SECRET=...               # Supabase dashboard → Project Settings → API
# JH2 fix: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing from §3.
# Both CHANGE when switching from dev to production Supabase project.
# If these still point to dev project, the production frontend reads the wrong database.
NEXT_PUBLIC_SUPABASE_URL=https://[prod-project-ref].supabase.co  # production project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # production anon key (safe to expose — RLS enforces access)
INNGEST_SIGNING_KEY=...               # Inngest dashboard → production environment
INNGEST_EVENT_KEY=...                 # Inngest dashboard → production environment
NEXT_PUBLIC_POSTHOG_KEY=...          # PostHog dashboard → project API key (separate prod key)
POSTHOG_HOST=https://app.posthog.com  # or self-hosted URL (see CLAUDE.md §3)
# JM4 fix: NEXT_PUBLIC_POSTHOG_KEY listed but PostHog App Router init pattern never specified.
# Without the provider, PostHog captures zero events despite the key being set.
# Add components/providers/posthog-provider.tsx:
# 'use client';
# import posthog from 'posthog-js';
# import { PostHogProvider } from 'posthog-js/react';
# import { useEffect } from 'react';
# export function PHProvider({ children }: { children: React.ReactNode }) {
#   useEffect(() => {
#     posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
#       api_host: process.env.POSTHOG_HOST,
#       capture_pageview: false,  // handled by PostHogPageView component
#       persistence: 'localStorage+cookie',
#     });
#   }, []);
#   return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
# }
# Mount in app/layout.tsx: wrap <body> with <PHProvider>
#
# JN2 fix: capture_pageview:false requires a PostHogPageView component — never specified.
# Without it, zero pageviews tracked despite PHProvider being set up:
# Add components/analytics/posthog-page-view.tsx:
# 'use client';
# import { usePathname, useSearchParams } from 'next/navigation';
# import { usePostHog } from 'posthog-js/react';
# import { useEffect } from 'react';
# export function PostHogPageView() {
#   const pathname = usePathname();
#   const searchParams = useSearchParams();
#   const posthog = usePostHog();
#   useEffect(() => {
#     if (pathname && posthog) {
#       let url = window.location.origin + pathname;
#       if (searchParams?.toString()) url += '?' + searchParams.toString();
#       posthog.capture('$pageview', { $current_url: url });
#     }
#   }, [pathname, searchParams, posthog]);
#   return null;
# }
# In app/layout.tsx: wrap PostHogPageView in <Suspense fallback={null}> (required for useSearchParams)
# JQ5 fix: where exactly in layout.tsx was never shown. Canonical layout.tsx body:
# import { PHProvider } from '@/components/providers/posthog-provider';
# import { PostHogPageView } from '@/components/analytics/posthog-page-view';
# import { Suspense } from 'react';
# export default function RootLayout({ children }: { children: React.ReactNode }) {
#   return (
#     <html lang="en">
#       <body>
#         <PHProvider>                      {/* PostHog context — client component */}
#           <Suspense fallback={null}>
#             <PostHogPageView />           {/* fires $pageview on route change */}
#           </Suspense>
#           <CookieConsentBanner />         {/* JO3 — shows on first visit */}
#           {children}
#         </PHProvider>
#       </body>
#     </html>
#   );
# }
# Note: PostHogPageView must be INSIDE PHProvider (needs PostHog context)
#       and INSIDE Suspense (useSearchParams requires it in Next.js App Router)
UPSTASH_REDIS_REST_URL=...           # Upstash console → database → REST URL
UPSTASH_REDIS_REST_TOKEN=...         # Upstash console → database → REST token
# JI3 fix: §3 lists Upstash URL+token but uses SAME database as dev — wrong.
# Dev test runs pollute rate-limit state: a dev test of sample audit rate limiting
# could block real production users from their free sample audit.
# Create a PRODUCTION Upstash database (separate from dev):
# Upstash console → Create database → Name: visibleau-production → Region: ap-southeast-1 (Singapore — closest to Sydney)
# Copy REST URL + Token to Vercel production env vars.
# Delete keys from dev database after production is live (don't share databases).
```

---

## 4. Project structure additions

```
sentry.client.config.ts                   # Sentry browser  (wizard-created)
sentry.server.config.ts                   # Sentry server   (wizard-created)
sentry.edge.config.ts                     # Sentry edge runtime (wizard-created)
                                          # JN1 fix: body never shown. Edge runtime has no Node.js APIs.
                                          # Keep minimal — no file I/O, no native modules, no complex hooks:
                                          # import * as Sentry from '@sentry/nextjs';
                                          # Sentry.init({
                                          #   dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
                                          #   tracesSampleRate: 0.1,
                                          #   // No beforeSend complex logic in edge — keep lean
                                          #   // Edge captures: middleware errors, edge API route errors
                                          #   // Most important: Clerk auth middleware errors surface here
                                          # });
instrumentation.ts                        # Next.js 15 instrumentation
                                          # JA4 fix: §4 lists this as a manual file but the Sentry wizard
                                          # (Step 1: pnpm exec @sentry/wizard@latest -i nextjs) creates it
                                          # automatically alongside sentry.*.config.ts files.
                                          # DO NOT create instrumentation.ts manually — let the wizard do it.
                                          # Step 1 says "Verify sentry.client/server/edge.config.ts created"
                                          # — also verify instrumentation.ts was created and contains:
                                          # export { register } from '@sentry/nextjs';

scripts/
├── load-test/
│   ├── audit-concurrency.ts              # JD1 fix: k6 does NOT natively run TypeScript — needs esbuild
│   │                                     # bundling. RECOMMENDED: use autocannon (Node.js) with tsx instead:
│   │                                     # pnpm add -D autocannon tsx
│   │                                     # Run: tsx scripts/load-test/audit-concurrency.ts
│   │                                     # OR use k6 with bundling: k6 requires esbuild transpile step.
│   │                                     # For Sprint 12: autocannon + tsx is simplest (no bundling needed).
│   └── dashboard-load.ts
├── backup-restore-test.ts                # Postgres restore drill
│                                         # JL4 fix: body never specified beyond "verify data integrity".
│                                         # Run AFTER Supabase PITR restore creates a temp project (JE5).
│                                         # Set DATABASE_URL to the restored project's connection string.
│                                         # #!/usr/bin/env tsx
│                                         # import { drizzle } from 'drizzle-orm/postgres-js';
│                                         # import postgres from 'postgres';
│                                         # import * as schema from '../db/schema';
│                                         #
│                                         # const client = postgres(process.env.DATABASE_URL!);
│                                         # const db = drizzle(client, { schema });
│                                         #
│                                         # // 1. Table existence checks
│                                         # const tables = ['organizations','brands','audits','citations','users'];
│                                         # for (const t of tables) {
│                                         #   const [{ count }] = await client\`SELECT COUNT(*) FROM ${t}\`;
│                                         #   console.log(\`✅ \${t}: \${count} rows\`);
│                                         # }
│                                         # // 2. RLS sanity: anon key returns 0 rows for other org
│                                         # // 3. Foreign key integrity: no orphaned audit rows
│                                         # const orphans = await client\`
│                                         #   SELECT COUNT(*) FROM audits a
│                                         #   WHERE NOT EXISTS (SELECT 1 FROM brands b WHERE b.id = a.brand_id)\`;
│                                         # if (orphans[0].count > 0) throw new Error('Orphaned audit rows found');
│                                         # console.log('✅ Foreign key integrity OK');
│                                         # // 4. Check most recent audit timestamp (confirm backup is recent)
│                                         # const latest = await client\`SELECT MAX(created_at) FROM audits\`;
│                                         # console.log('✅ Most recent audit in backup:', latest[0].max);
│                                         # await client.end();
└── security-scan.ts                      # pnpm audit + custom checks
                                          # JL3 fix: "custom checks" never specified. Canonical body:
                                          # #!/usr/bin/env tsx
                                          # import { execSync } from 'child_process';
                                          # import { readFileSync } from 'fs';
                                          # import { globSync } from 'glob';
                                          #
                                          # let failures = 0;
                                          # const fail = (msg: string) => { console.error('❌', msg); failures++; };
                                          # const ok   = (msg: string) => console.log('✅', msg);
                                          #
                                          # // 1. pnpm audit — no high/critical
                                          # try { execSync('pnpm audit --audit-level=high', { stdio: 'inherit' }); ok('pnpm audit clean'); }
                                          # catch { fail('pnpm audit: high/critical vulnerabilities found'); }
                                          #
                                          # // 2. .env.local not in git history
                                          # try {
                                          #   const log = execSync('git log --all --full-history -- .env.local .env').toString();
                                          #   if (log.trim()) fail('.env.local was committed to git — rotate ALL secrets immediately');
                                          #   else ok('No .env in git history');
                                          # } catch {}
                                          #
                                          # // 3. No dangerouslySetInnerHTML in codebase
                                          # const dangerous = globSync('app/**/*.{tsx,ts}').filter(f =>
                                          #   readFileSync(f,'utf8').includes('dangerouslySetInnerHTML'));
                                          # if (dangerous.length) fail('dangerouslySetInnerHTML found: ' + dangerous.join(', '));
                                          # else ok('No dangerouslySetInnerHTML');
                                          #
                                          # // 4. Hardcoded secrets check (sk_, pk_, whsec_, eyJ)
                                          # const secretPattern = /(sk_live|sk_test|pk_live|pk_test|whsec_|AKIA)[a-zA-Z0-9]{10,}/g;
                                          # const sourceFiles = globSync('app/**/*.{tsx,ts}', { ignore: ['**/*.test.*'] });
                                          # sourceFiles.forEach(f => {
                                          #   const content = readFileSync(f,'utf8');
                                          #   if (secretPattern.test(content)) fail('Hardcoded secret in: ' + f);
                                          # });
                                          # ok('No hardcoded secrets in source');
                                          #
                                          # // 5. Stripe webhook signature check exists
                                          # const webhookRoute = readFileSync('app/api/webhooks/stripe/route.ts','utf8');
                                          # if (!webhookRoute.includes('constructEvent') && !webhookRoute.includes('verifyStripeWebhook'))
                                          #   fail('Stripe webhook: no signature verification found');
                                          # else ok('Stripe webhook signature verified');
                                          #
                                          # if (failures > 0) { console.error(\`\n\${failures} security issues found\`); process.exit(1); }
                                          # else console.log('\n✅ All security checks passed');

docs/
├── ops-runbook.md                        # "When X breaks, do Y"
├── golive-checklist.md                   # 30+ items
├── incident-response.md                  # Roles + escalation
│                                         # JD5 fix — solo founder spec (see below)
├── soc2-kickoff.md                       # JF4 fix: SOC 2 kickoff in §1 Definition of Done but no §4 file.
│                                         # Vendor: Vanta (~$800/mo, recommended for solo) vs Drata (~$1k+).
│                                         # Scope: Security + Availability + Confidentiality TSC criteria.
│                                         # Initial control inventory mapped to Sprint 12 baselines:
│                                         # encryption at rest (Supabase Pro AES-256), in transit (HSTS),
│                                         # access control (Clerk + RLS), audit logging (Sentry + Supabase),
│                                         # incident response (this docs/), backup (PITR drilled Sprint 12).
│                                         # founder. Generic template (Engineering Lead / On-call Manager)
│                                         # is useless. Solo founder incident-response.md canonical content:
│                                         #
│                                         # ## Severity levels
│                                         # P0 (wake up now): site down / Stripe checkout broken / data loss
│                                         # P1 (fix within 2h): audit jobs failing >50% / Sentry spike >20/min
│                                         # P2 (fix within 24h): single feature broken, workaround exists
│                                         # P3 (next sprint): cosmetic / UX issue
│                                         #
│                                         # ## Solo response checklist
│                                         # 1. Check Sentry → identify error + affected users
│                                         # 2. Check Supabase dashboard → DB health
│                                         # 3. Check Vercel → deployment status / edge function logs
│                                         # 4. Check Inngest → job queue backlog
│                                         # 5. If unable to fix in 30min → post status update on
│                                         #    status page (statuspage.io free tier) + email affected users
│                                         # 6. Disable affected feature via env flag if possible
│                                         # 7. Fix in staging → deploy → verify → close incident
│                                         #
│                                         # ## Contact points (not escalation — just external support)
│                                         # - Vercel support: vercel.com/support (Pro plan)
│                                         # - Supabase support: supabase.com/dashboard/support
│                                         # - Stripe support: support.stripe.com
│                                         # - Clerk support: clerk.com/support
└── marketing/
    ├── producthunt-launch.md             # Assets + copy
    ├── indiehackers-post-draft.md
    └── au-community-rollout.md           # Reddit r/AusFinance, FB groups, etc.

app/
├── error.tsx                             # ENHANCED — Sentry capture
│                                         # JL1 fix: "ENHANCED — Sentry capture" but no code specified.
│                                         # Sprint 11 IC1 confirmed 'use client' required. Add Sentry:
│                                         # 'use client';
│                                         # import { useEffect } from 'react';
│                                         # import * as Sentry from '@sentry/nextjs';
│                                         # export default function Error({
│                                         #   error, reset,
│                                         # }: { error: Error & { digest?: string }; reset: () => void }) {
│                                         #   useEffect(() => {
│                                         #     Sentry.captureException(error);  // sends to Sentry dashboard
│                                         #   }, [error]);
│                                         #   return (
│                                         #     <div className="flex flex-col items-center justify-center min-h-screen gap-4">
│                                         #       <h2 className="text-xl font-semibold">Something went wrong</h2>
│                                         #       <button onClick={reset} className="btn-primary">Try again</button>
│                                         #     </div>
│                                         #   );
│                                         # }
├── global-error.tsx                      # Top-level error boundary
│                                         # JL1 fix: global-error.tsx catches errors in root layout.
│                                         # Must also be 'use client' + include <html><body> (replaces layout):
│                                         # 'use client';
│                                         # import * as Sentry from '@sentry/nextjs';
│                                         # import { useEffect } from 'react';
│                                         # export default function GlobalError({
│                                         #   error, reset,
│                                         # }: { error: Error & { digest?: string }; reset: () => void }) {
│                                         #   useEffect(() => { Sentry.captureException(error); }, [error]);
│                                         #   return (
│                                         #     <html><body>
│                                         #       <div className="flex flex-col items-center justify-center min-h-screen gap-4">
│                                         #         <h2>Critical error — please refresh</h2>
│                                         #         <button onClick={reset}>Refresh</button>
│                                         #       </div>
│                                         #     </body></html>
│                                         #   );
│                                         # }
└── api/
    ├── health/
    │   └── route.ts                      # JA2 fix — health check for uptime monitor (see §6)
    ├── badge/
    │   └── route.ts                      # JB4 fix: JA5 added badge generator to §1 but never to §4.
    │                                     # Returns SVG. URL: /api/badge?domain=foo.com.au
    │                                     # export async function GET(req: Request) {
    │                                     #   const domain = new URL(req.url).searchParams.get('domain');
    │                                     #   const score = await getLatestScore(domain);  // query Supabase
    │                                     #   // JQ2 fix: getLatestScore never defined — it's a public cross-org
    │                                     #   // query that bypasses RLS (anon key can't see other users' data).
    │                                     #   // Must use SERVICE ROLE client, not anon client:
    │                                     #   async function getLatestScore(domain: string): Promise<number | null> {
    │                                     #     const serviceClient = createClient(
    │                                     #       process.env.NEXT_PUBLIC_SUPABASE_URL!,
    │                                     #       process.env.SUPABASE_SERVICE_ROLE_KEY!  // bypasses RLS
    │                                     #     );
    │                                     #     const { data } = await serviceClient.from('audits')
    │                                     #       .select('score_composite, brands!inner(domain)')
    │                                     #       .eq('brands.domain', domain)
    │                                     #       .eq('status', 'completed')
    │                                     #       .order('created_at', { ascending: false })
    │                                     #       .limit(1).single();
    │                                     #     return data?.score_composite ?? null;
    │                                     #   }
    │                                     #   // If null: return "No data" SVG badge, not an error
    │                                     #   const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
    │                                     #   const svg = `<svg ...>Visible on AI: ${score}%</svg>`;
    │                                     #   return new Response(svg, { headers: {
    │                                     #     'Content-Type': 'image/svg+xml',
    │                                     #     'Cache-Control': 'public, max-age=3600',  // 1h cache
    │                                     #     'Access-Control-Allow-Origin': '*',  // JJ3 CORS fix
    │                                     #   }});
    │                                     #   // JS3 fix: badge API is fully public — no rate limit specified.
    │                                     #   // Upstash is already in the stack (sample audit rate limiting).
    │                                     #   // Add IP-based rate limit BEFORE the getLatestScore() call:
    │                                     #   // const ip = req.headers.get('x-forwarded-for') ?? 'anon';
    │                                     #   // const { success } = await ratelimit.limit(`badge:${ip}`);
    │                                     #   // if (!success) return new Response('Rate limited', { status: 429 });
    │                                     #   // Use Ratelimit.slidingWindow(100, '1 h') — 100 badge req/hr/IP
    │                                     #   // (generous for legitimate README embedding, restrictive for abuse)
    │                                     # }

# JW3 fix: /api/audits (auth-gated audit trigger) has no per-org daily rate limit.
# A Growth tier user triggering 500 audits/day = A$1,200 in LLM costs. Add:
# const DAILY_AUDIT_LIMITS: Record<string, number> = {
#   free: 3, starter: 10, growth: 50, agency: 200, agency_pro: 500,
# };
# const rl = new Ratelimit({ redis, limiter:
#   Ratelimit.fixedWindow(DAILY_AUDIT_LIMITS[org.tier] ?? 3, '1 d') });
# const { success } = await rl.limit(`audit-trigger:${org.id}`);
# if (!success) return NextResponse.json(
#   { error: 'Daily audit limit reached. Upgrade your plan for more.' }, { status: 429 }
# );
# Add this check AFTER auth but BEFORE Inngest event dispatch in /api/audits/route.ts
        └── route.ts                      # JB4 fix: Demo data mode from §1 JA5 — never in §4.
                                          # Only available when DEMO_MODE=true env var set.
                                          # JQ3 fix: no NODE_ENV guard — if DEMO_MODE=true accidentally
                                          # set in production Vercel env vars, demo orgs get created
                                          # in the production DB, contaminating real user data.
                                          # ALWAYS return 404 in production regardless of DEMO_MODE:
                                          # export async function GET(req: Request) {
                                          #   if (process.env.NODE_ENV === 'production') {
                                          #     return new Response(null, { status: 404 });  // never in prod
                                          #   }
                                          #   if (process.env.DEMO_MODE !== 'true') {
                                          #     return new Response(null, { status: 404 });
                                          #   }
                                          #   // ... demo session redirect
                                          # }
                                          # Note: Demo data is seeded via scripts/seed-demo-data.ts (JM5)
                                          # and accessed by signing in normally with demo org credentials,
                                          # not via this route in production.
                                          # JM5 fix: ensureSampleOrg() creates ONE synthetic org
                                          # for sample audits — not 3 rich demo workspaces.
                                          # Seeding must be done via scripts/seed-demo-data.ts:
                                          #
                                          # For EACH demo workspace (tradies, allied-health, saas):
                                          # 1. db.insert(organizations).values({ slug: 'demo-tradies', name: 'Demo Plumbing Co' })
                                          # 2. db.insert(brands).values({ name: 'Bondi Plumbing', domain: 'bondiplumbing.com.au' })
                                          # 3. db.insert(audits).values({ status: 'completed', scoreComposite: 72, ... })
                                          # 4. db.insert(citations).values([...10 realistic citations])
                                          # 5. db.insert(actionRecommendations).values([...5 top actions])
                                          #
                                          # Run once: DEMO_MODE=true pnpm tsx scripts/seed-demo-data.ts
                                          # The /api/demo route signs Sri in as the 'demo-tradies' org user.
                                          # Add scripts/seed-demo-data.ts to §4 and package.json: "demo:seed"
                                          # but route never exists — uptime monitor fires 404 from day 1.
                                          # export async function GET() {
                                          #   try {
                                          #     await db.execute(sql`SELECT 1`);  // Supabase DB check
                                          #     return Response.json({ ok: true, db: 'ok', ts: Date.now() });
                                          #   } catch (err) {
                                          #     return Response.json({ ok: false, db: 'error' }, { status: 503 });
                                          #   }
                                          # }
                                          # No auth — uptime monitors call unauthenticated.
                                          # Returns 200 OK when healthy, 503 when DB unreachable.

components/domain/
├── shared/
│   └── cookie-consent-banner.tsx
│       # JO3 fix: JB2 said "build custom shadcn Dialog" but body never specified.
│       # 'use client';
│       # import { useState, useEffect } from 'react';
│       # export function CookieConsentBanner() {
│       #   const [visible, setVisible] = useState(false);
│       #   useEffect(() => {
│       #     // Show if not yet accepted (stored in localStorage — acceptable for non-essential cookies)
│       #     if (!localStorage.getItem('cookie-consent')) setVisible(true);
│       #   }, []);
│       #   const accept = () => { localStorage.setItem('cookie-consent', 'accepted'); setVisible(false); };
│       #   const decline = () => { localStorage.setItem('cookie-consent', 'declined'); setVisible(false);
│       #     // If declined: disable PostHog tracking
│       #     import('posthog-js').then(({ default: posthog }) => posthog.opt_out_capturing());
│       #   };
│       #   if (!visible) return null;
│       #   return (
│       #     <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background border-t shadow-lg">
│       #       <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
│       #         <p className="text-sm text-muted-foreground">
│       #           We use cookies for authentication and analytics.{' '}
│       #           <a href="/privacy#cookies" className="underline">Learn more</a>
│       #         </p>
│       #         <div className="flex gap-2 shrink-0">
│       #           <button onClick={decline} className="btn-outline text-sm px-3 py-1.5">Decline</button>
│       #           <button onClick={accept} className="btn-primary text-sm px-3 py-1.5">Accept</button>
│       #         </div>
│       #       </div>
│       #     </div>
│       #   );
│       # }
│       # Mount in app/(marketing)/layout.tsx and app/(auth)/layout.tsx
└── legal/
    └── privacy-policy-content.tsx        # JSX version of privacy policy

app/(auth)/launch/
└── page.tsx                              # JG5 fix: prototype LaunchReadinessDashboard
                                          # JJ5 fix: JG5 added file but no content spec. Prototype shows
                                          # 4 sections with specific items from prototype lines 4386-4523:
                                          # export default function LaunchReadinessPage() {
                                          # Auth check: if not Sri's userId → redirect('/dashboard')
                                          # 4 sections of checklist items with priority badges:
                                          #
                                          # ENGINEERING (high priority):
                                          # ☐ Sentry error monitoring configured
                                          # ☐ Uptime monitoring active (Cronitor/Better Uptime)
                                          # ☐ Backup drill completed (Supabase PITR)
                                          # ☐ Load test passed (p95 within targets)
                                          # ☐ Security audit complete (pnpm audit clean)
                                          # ☐ All secrets rotated for production
                                          # ☐ Inngest production app registered
                                          #
                                          # PRODUCT (high priority):
                                          # ☐ Beta cohort (5-10 customers) run 1-2 audits
                                          # ☐ All blocking issues from beta fixed
                                          # ☐ Privacy + Terms live at /privacy /terms
                                          # ☐ Cookie consent banner working
                                          #
                                          # MARKETING (medium priority):
                                          # ☐ ProductHunt draft ready (screenshots uploaded)
                                          # ☐ IndieHackers post drafted
                                          # ☐ Launch day scheduled (Tue-Thu)
                                          # ☐ npm packages published
                                          #
                                          # LEGAL (high priority):
                                          # ☐ Privacy policy reviewed (Termly + APP 8 section)
                                          # ☐ Terms of service live
                                          # ☐ SOC 2 kickoff plan documented
                                          #
                                          # Status stored as JSON in org.metadata.launchChecklist
                                          # Each item: { id, checked, updatedAt }
                                          # "Go Live" button only enabled when all HIGH priority items checked

ATTRIBUTIONS.md                           # FINAL entries

next-sitemap.config.js                    # JU3 fix: 'postbuild: next-sitemap' in package.json (JK3)
                                          # but no config file in §4 — next-sitemap crawls ALL routes
                                          # including /dashboard, /settings, /launch (internal auth routes),
                                          # leaking URL structure to Google. Canonical config:
                                          # /** @type {import('next-sitemap').IConfig} */
                                          # module.exports = {
                                          #   siteUrl: 'https://visibleau.com',
                                          #   generateRobotsTxt: true,
                                          #   exclude: [
                                          #     '/dashboard*',   // auth — not for Google
                                          #     '/settings*',    // auth
                                          #     '/launch*',      // internal admin
                                          #     '/api/*',        // API routes
                                          #     '/sign-in*',     // Clerk-hosted
                                          #     '/sign-up*',
                                          #   ],
                                          #   robotsTxtOptions: {
                                          #     additionalSitemaps: [],
                                          #     policies: [{ userAgent: '*', allow: '/',
                                          #       disallow: ['/dashboard', '/settings', '/launch', '/api'] }],
                                          #   },
                                          # };
                                          # No consolidated env var checklist exists. Without a reference
                                          # file, setting Vercel production env vars is error-prone.
                                          # Commit this file (no real values) as the canonical list:
                                          # Contains every var from §3 with placeholder values + comments.
                                          # Sri copies to Vercel → Settings → Environment Variables manually.
                                          # (Alternatively: use `vercel env pull .env.production.local`
                                          #  after setting them to verify completeness)

next.config.ts                            # Sentry wrapped
vercel.json                               # Production config
                                          # JC3 fix: listed as "Production config" but body never specified.
                                          # §8 mentions CSP + HSTS headers — this is where they live:
                                          # {
                                          #   "regions": ["syd1"],  // AU latency — Supabase is ap-southeast-2
                                          #   "functions": {
                                          #     "app/api/inngest/route.ts": { "maxDuration": 60 },
                                          #     "app/api/audits/route.ts":  { "maxDuration": 60 },
                                          #     "app/api/badge/route.ts":   { "maxDuration": 10 }
                                          #   },
                                          #   // JF5 fix: no functions key in JC3's spec.
                                          #   // Vercel Pro default: 60s. Vercel Hobby default: 10s.
                                          #   // /api/inngest must respond within 30s for Inngest ACK.
                                          #   // Long audit jobs run via Inngest background functions (not HTTP),
                                          #   // so 60s is sufficient for all HTTP routes.
                                          #   // If on Vercel Hobby (not Pro): upgrade to Pro before launch —
                                          #   // Hobby 10s timeout will break Inngest webhook delivery.
                                          #   "headers": [
                                          #     {
                                          #       "source": "/(.*)",
                                          #       "headers": [
                                          #         { "key": "Strict-Transport-Security",
                                          #           "value": "max-age=63072000; includeSubDomains; preload" },
                                          #         { "key": "X-Frame-Options", "value": "DENY" },
                                          #         { "key": "X-Content-Type-Options", "value": "nosniff" },
                                          #         { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
                                          #         { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
                                          #         { "key": "Content-Security-Policy",
                                          #           "value": "default-src 'self'; script-src 'self' 'unsafe-inline' accounts.visibleau.com *.sentry.io *.posthog.com; img-src 'self' data: *.stripe.com; connect-src 'self' *.sentry.io *.posthog.com accounts.visibleau.com api.clerk.com api.stripe.com" }
                                          #         // JX1 fix: PostHog JS SDK loads from app.posthog.com.
                                          #         // connect-src had *.posthog.com (correct for API calls).
                                          #         // script-src was MISSING *.posthog.com — the SDK itself
                                          #         // is blocked by CSP before it can make API calls.
                                          #         // Without this: PostHog silently fails to load; zero
                                          #         // events captured despite PHProvider being mounted.
                                          #         // JH1 fix: was *.clerk.accounts.dev — Clerk's DEVELOPMENT domain.
                                          #         // Production with custom domain accounts.visibleau.com (JG1) uses:
                                          #         //   accounts.visibleau.com + api.clerk.com (not *.clerk.accounts.dev)
                                          #       ]
                                          #     }
                                          #   ]
                                          # }
                                          # Note: CSP 'unsafe-inline' needed for Next.js inline scripts.
                                          # Tighten with nonces in v1.1 (Next.js 15 CSP nonce support).
```

---

## 5. Database schema

No new tables. Sprint 12 verifies existing schema is production-ready.

Verify: all `FOREIGN KEY` constraints set, indexes on hot columns (`audits.brandId`, `audits.createdAt`, `citations.auditId`, etc.). Run `EXPLAIN ANALYZE` on common queries; add indexes where missing.

**JH4 fix: §9 Privacy Policy says "audit results retained 12 months" — no cleanup cron exists in any sprint to enforce this. Without enforcement, audit data accumulates forever (privacy compliance breach + storage cost). Add an Inngest cron function:**

```typescript
// inngest/functions/audit-data-retention.ts
export const auditDataRetention = inngest.createFunction(
  {
    id: 'audit-data-retention',
    name: 'Audit Data Retention Cleanup',
    // JV2 fix: audit functions run 200 LLM calls (~6-7 min total). Inngest default timeouts
    // vary by plan. For any long-running function, set concurrency + timeout explicitly:
    concurrency: { limit: 1 },  // retention cron: only 1 instance at a time
    // Note: the data-retention cron itself is fast (DB deletes) — no timeout risk here
    // BUT: the run-audit Inngest function (Sprint 2) runs 200 LLM calls.
    // Sprint 2 run-audit.ts should have: concurrency: { limit: 10 } (max 10 concurrent audits)
    // and each step.run() handles one engine batch, keeping individual steps under 2 min.
    // Verify Sprint 2 run-audit.ts has step-level parallelisation, not one giant step.run().
  },
  { cron: '0 4 * * 0' },  // Weekly, Sunday 04:00 UTC (off-peak AEST)
```

**JM3 fix: cron scheduling conflict check — Sprint 10's sample-audit-cleanup runs daily at 03:00 UTC. On Sundays, both crons run within the same hour. Verified schedule:**

| Cron | Schedule | Sprint | Risk |
|---|---|---|---|
| `sample-audit-cleanup` | `0 3 * * *` (daily 03:00 UTC) | 10 | No conflict — cleans sample audits |
| `audit-data-retention` | `0 4 * * 0` (Sunday 04:00 UTC) | 12 | 1h gap from sample-audit-cleanup — **safe** |

**Supabase connection pool impact:** Both crons do DB writes but different tables (sample_orgs vs audits/citations). 1-hour gap means no simultaneous connection saturation. No schedule change needed.
  async ({ step }) => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);  // 12 months ago

    await step.run('delete-old-audit-data', async () => {
      // JU2 fix: BEFORE writing this cron, verify Sprint 1 citations FK cascade behaviour:
      // Check db/schema.ts or db/migrations/ for citations.auditId FK definition:
      //
      // CASE A — onDelete: 'cascade' exists in schema:
      //   citations.auditId FK has cascade → deleting audits auto-deletes citations
      //   Skip the explicit citations delete below (it's a no-op after cascade)
      //   Just: await db.delete(audits).where(...)
      //
      // CASE B — no onDelete: 'cascade' (plain references only):
      //   Must delete citations FIRST (FK constraint violation if audits deleted first)
      //   Keep both steps below in order
      //
      // Verify: grep -r "auditId" db/schema.ts | grep -i "cascade"

      // Delete citations + scores first (safe in both CASE A and B)
      await db.delete(citations)
        .where(lt(citations.createdAt, cutoff));
      // Delete old audits (keeps brand + org — only audit results purged)
      const deleted = await db.delete(audits)
        .where(and(lt(audits.createdAt, cutoff), eq(audits.status, 'completed')))
        .returning({ id: audits.id });
      return { deleted: deleted.length };
    });
    // JQ4 fix: audit-data-retention only deletes audits/citations — but orgs/brands from
    // CHURNED (cancelled + not re-subscribed) accounts accumulate forever.
    // APP 11: destroy personal information "no longer needed."
    // A churned customer's business name + domain sitting in DB = APP 11 gap.
    // Add a second step to this cron (or a separate monthly cron):
    await step.run('delete-churned-org-data', async () => {
      const churnCutoff = new Date();
      churnCutoff.setMonth(churnCutoff.getMonth() - 13); // 12mo retention + 1mo grace
      // Delete brands + orgs where: subscription cancelled > 13 months ago AND no active subscription
      // Requires joining with Stripe subscription status stored in organizations.metadata:
      // await db.delete(brands).where(and(
      //   eq(organizations.stripeStatus, 'canceled'),
      //   lt(organizations.stripeCurrentPeriodEnd, churnCutoff)
      // ));
      // Cascade: Drizzle FK constraints delete associated audits/citations automatically
      // NOTE: send a "data deletion notice" email via Resend before deleting (30-day warning)
    });
  }
);
// Register in inngest/index.ts alongside other functions.
// Note: sample audits have their own 24h cron (Sprint 10 HB4) — this covers paid audits only.
```

**JD2 fix: "add indexes where missing" — Drizzle ORM index syntax never specified. Without it Claude Code adds a comment but no migration. Canonical Drizzle index pattern:**

```typescript
// In the schema file (e.g. db/schema/audits.ts) — add third argument to pgTable:
import { index } from 'drizzle-orm/pg-core';

export const audits = pgTable('audits', {
  // ... existing columns ...
}, (table) => ({
  brandIdIdx:   index('audits_brand_id_idx').on(table.brandId),
  createdAtIdx: index('audits_created_at_idx').on(table.createdAt),
  statusIdx:    index('audits_status_idx').on(table.status),
}));

export const citations = pgTable('citations', {
  // ... existing columns ...
}, (table) => ({
  auditIdIdx: index('citations_audit_id_idx').on(table.auditId),
}));
// After schema change: pnpm drizzle-kit generate && pnpm drizzle-kit migrate
// Verify with EXPLAIN ANALYZE: SELECT * FROM audits WHERE brand_id = $1 ORDER BY created_at DESC LIMIT 10;
```

---

## 6. Monitoring + alerting

### Sentry setup

**JM1 fix: §6 only showed sentry.server.config.ts — sentry.client.config.ts body never specified. Client config uses NEXT_PUBLIC_SENTRY_DSN (must be public for browser) and different options:**

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,  // public var — different from server SENTRY_DSN
  tracesSampleRate: 0.1,
  // Session replay: records user sessions when errors occur
  // Low sample rates to manage Sentry quota on free/team plan:
  replaysSessionSampleRate: 0.01,  // 1% of all sessions
  replaysOnErrorSampleRate: 1.0,   // 100% of sessions with errors
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,    // GDPR/APP compliance — mask text in replays
      blockAllMedia: false,
    }),
  ],
  beforeSend(event) {
    // Same PII scrub as server config (JC2):
    if (event.user) { delete event.user.email; delete event.user.ip_address; }
    return event;
  },
});
```

```typescript
// sentry.server.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,  // 10% of transactions
  // JR3 fix: integrations never specified for server config. Key Next.js server integrations:
  integrations: [
    Sentry.httpIntegration(),        // captures HTTP request URL, method, status code in errors
    Sentry.nativeNodeFetchIntegration(), // captures outbound fetch() calls (LLM API calls)
  ],
  beforeSend(event) {
    // JC2 fix: original only deleted event.user.email.
    // Australian Privacy Act 1988 APP 6 protects: name, contact info, business identity.
    // Domain names and org names are business identifiers — must also be scrubbed:
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;   // IP = personal data under APP 3
      delete event.user.username;     // may be email prefix
    }
    // Scrub domain names from request URLs and breadcrumbs (they identify the business):
    if (event.request?.url) {
      event.request.url = event.request.url.replace(/domain=[^&]+/, 'domain=[REDACTED]');
    }
    // Scrub any extra context keys that may contain org/brand data:
    if (event.extra) {
      delete event.extra.brandName;
      delete event.extra.domain;
      delete event.extra.organizationId;  // internal ID is fine but belt+braces
    }
    return event;
  },
});
```

### Alert rules (configured in Sentry dashboard)

- Error rate >5/minute → email + Slack
  **JD3 fix: "email + Slack" — Slack alerting webhook never set up in Sprint 12. Steps:**
  1. Create Slack app at api.slack.com → Incoming Webhooks → add to `#visibleau-alerts` channel
  2. Copy webhook URL → add to Vercel env vars as `SLACK_ALERT_WEBHOOK_URL`
  3. In Sentry: Settings → Integrations → Slack → connect → configure alert rules to post to `#visibleau-alerts`
  4. Alternatively: Sentry email alerts are sufficient for solo founder v1 — Slack optional.
- Audit job failure rate >10% in 1h → email
- Stripe webhook 4xx/5xx >3 in 5min → email
- LLM API error rate >25% per engine in 1h → email + investigate
  **JD3 fix: "which engine to disable in feature flags" — Sprint 1's `lib/feature-flags/` handles region/tier gates but never LLM engine toggling. Add engine-disable env vars:**
  ```bash
  # In .env.local / Vercel env vars — disable specific engines without code changes:
  LLM_ENGINE_OPENAI_ENABLED=true
  LLM_ENGINE_ANTHROPIC_ENABLED=true
  LLM_ENGINE_GOOGLE_ENABLED=true
  LLM_ENGINE_PERPLEXITY_ENABLED=true
  # Set to 'false' when an engine has an outage — audit runner reads these before dispatching
  ```
  Add to `lib/feature-flags/index.ts`: `isEngineEnabled(engine: 'openai'|'anthropic'|'google'|'perplexity'): boolean`
- Postgres connection failures >0 → page

### Uptime monitoring (Vercel + external)

- Better Uptime / Cronitor hitting `/api/health` every minute
- Alert on 2+ consecutive failures
- **JR4 fix: prototype footer links "Status" to an external uptime page — prototype comment says "Status is an external uptime page (Sprint 12)" but Sprint 12 never specifies this. Better Uptime and Cronitor both offer free hosted status pages:**
  - **Better Uptime:** dashboard → Status Pages → Create → name "VisibleAU Status" → add monitors → publish at `status.visibleau.com` (requires CNAME: `status.visibleau.com → betteruptime.com`)
  - **Cronitor:** similar — Cronitor Status Pages → publish at `status.visibleau.com`
  - Status page shows: API uptime, audit job completion rate, last 90 days history
  - **Footer link in Sprint 11's footer.tsx:** update `href` from `#` to `https://status.visibleau.com`
  - Add `status.visibleau.com` CNAME to DNS preparation steps (§10 GoLive)

---

## 7. Load testing

`scripts/load-test/audit-concurrency.ts` — **JD1 fix: k6 requires TypeScript bundling via esbuild; use autocannon + tsx instead:**

```bash
pnpm add -D autocannon tsx
# Run with: tsx scripts/load-test/audit-concurrency.ts
```

```typescript
// scripts/load-test/audit-concurrency.ts — autocannon example:
import autocannon from 'autocannon';

// JK5 fix: ORIGINAL SCENARIO WAS WRONG — "50 concurrent audits" would trigger 50 × 200 LLM calls
// = 10,000 real API calls costing ~A$125 in LLM costs in staging. NEVER load-test real LLM calls.
//
// CORRECT approach: load-test the HTTP TRIGGER layer only, not the Inngest background job.
// Test that the POST /api/audits endpoint accepts 50 concurrent requests and queues Inngest jobs
// without DB connection exhaustion. The Inngest jobs themselves are NOT triggered in load tests.
//
// To test without real LLM calls: set LLM_MODE=mock in staging env before load testing.
// (Sprint 2 mock mode returns fake but valid audit results instantly)
//
// JT1 fix: TEST_SESSION_COOKIE and TEST_BRAND_ID never explained. Clerk cookies are
// JWTs signed by Clerk's private key — cannot be mocked. Before each load test run:
// 1. Open staging URL in browser → sign in with a dedicated load-test@visibleau.com account
// 2. Browser DevTools → Application → Cookies → copy '__session' cookie value
// 3. export TEST_SESSION_COOKIE='__session=<paste>'
// 4. Supabase staging → Table Editor → brands → copy any brand UUID
// 5. export TEST_BRAND_ID='<uuid>'
// These expire (Clerk sessions: 24h default) — regenerate if load test returns 401s.

// Scenario 1: 50 concurrent audit trigger requests (HTTP layer only — LLM_MODE=mock in staging)
const auditResult = await autocannon({
  url: process.env.STAGING_URL + '/api/audits',
  method: 'POST',
  connections: 50,
  duration: 30,
  headers: {
    Cookie: process.env.TEST_SESSION_COOKIE ?? '',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ brandId: process.env.TEST_BRAND_ID }),
});
console.log('Audit trigger p95:', auditResult.latency.p97_5, 'ms (target: <300ms)');

// Scenario 2: 100 concurrent dashboard loads
const dashResult = await autocannon({
  url: process.env.STAGING_URL + '/dashboard',
  connections: 100,
  duration: 30,
  headers: { Cookie: process.env.TEST_SESSION_COOKIE ?? '' },
});
console.log('Dashboard p95:', dashResult.latency.p97_5, 'ms (target: <500ms)');
```

```typescript
// Use k6 or autocannon — verify product holds at expected scale
// Scenarios:
// 1. 50 concurrent audit triggers — verify Inngest handles, no DB connection exhaustion
// 2. 100 concurrent dashboard page loads — verify <500ms p95
// 3. 10 concurrent Stripe webhook deliveries — verify idempotency holds

// Target metrics:
// - Audit job 4-engine: p95 < 6 minutes
// - Dashboard page load: p95 < 500ms
// - API endpoints: p95 < 300ms
// - Sample audit: p95 < 90 seconds
```

Run in staging environment before production cutover.

---

## 8. Security audit checklist

Run before launch:

- [ ] `pnpm audit` — no high/critical vulnerabilities
- [ ] Secrets rotated (Clerk, Stripe, OpenAI, Anthropic, Google, Perplexity, Resend, Sentry)
  **JC1 fix: 4 secrets from CLAUDE.md stack missing from rotation list:**
  - [ ] Supabase service role key (`SUPABASE_SERVICE_ROLE_KEY`) — full DB access; must rotate for production
  - [ ] Inngest signing key (`INNGEST_SIGNING_KEY`) + event key (`INNGEST_EVENT_KEY`) — audit job security
  - [ ] PostHog API key (`NEXT_PUBLIC_POSTHOG_KEY`) — analytics; rotate to separate prod key from dev
  - [ ] Upstash Redis token (`UPSTASH_REDIS_REST_TOKEN` + `UPSTASH_REDIS_REST_URL`) — rate limiting
  - [ ] Supabase JWT secret (`SUPABASE_JWT_SECRET`) if using custom JWT claims
  **Rotation procedure: generate new key in each provider's dashboard → update Vercel production env vars → redeploy → verify old key no longer works.**
- [ ] `.env.local` not committed (check git history)
- [ ] All API routes verify `currentUser` server-side
- [ ] Cross-org access returns 404 (regression test)
- [ ] CSRF: relying on SameSite cookies + Clerk; verify
- [ ] XSS: React escapes by default; verify no `dangerouslySetInnerHTML` without sanitization
- [ ] SQL injection: Drizzle parameterized queries (verified)
- [ ] Stripe webhook signature verified
- [ ] Clerk webhook signature verified
- [ ] Rate limiting on sample audit + signup endpoints
- [ ] Content Security Policy headers (Next.js `headers()` in config)
- [ ] HSTS header
- [ ] OWASP Top 10 review documented in `docs/security-review.md`

---

## 9. Legal docs

- **Privacy Policy** — Australian Privacy Principles compliant.
  **JF3 fix: APP 8 cross-border disclosure required (OpenAI/Anthropic/Google/Perplexity named as US recipients).**
  **JN4 fix: minimum required content for Australian Privacy Act 1988 compliance never enumerated. Eight required sections:**
  1. **What we collect** (APP 3): email, business domain, brand name, IP address, audit results, payment info
  2. **Why we collect it** (APP 3): to provide AI search visibility auditing; process payments; send notifications
  3. **How we use it** (APP 6): run audits, send result emails, billing, product analytics (PostHog), error monitoring (Sentry)
  4. **Who we share it with** (APP 6): Clerk (auth, USA), Stripe (billing, USA), OpenAI/Anthropic/Google/Perplexity (LLM APIs, USA), Resend (email, USA), PostHog (analytics, USA/EU), Sentry (errors, USA), Supabase (database, USA)
  5. **Overseas disclosure** (APP 8): "All processors above are based in the USA and are not required to comply with the Australian Privacy Act 1988. By using VisibleAU you consent to this transfer under APP 8.2(a) (reasonably necessary for the service)."
  6. **Retention** (APP 11): audit results 12 months → deleted; billing records 7 years (ATO requirement); account data until deletion requested
  7. **Your rights** (APP 12/13): access your data, correction, deletion within 30 days — email privacy@visibleau.com
  8. **Complaints** (APP 1): contact privacy@visibleau.com; unresolved complaints → OAIC (oaic.gov.au) within 12 months
- **Terms of Service** — service description, payment terms, acceptable use, liability disclaimer, governing law (AU jurisdiction).
  **JO1 fix: 5 topics listed but Australian Consumer Law requires 9 specific sections for a legally compliant SaaS ToS:**
  1. **Service description** (APP 1): VisibleAU provides AI search visibility auditing for Australian businesses using third-party LLM APIs; results are informational only
  2. **Eligibility** (ACL §18): must be an Australian business entity, 18+; by signing up you confirm you're authorised to act on behalf of the entity
  3. **Payment terms** (ACL §64): pricing as displayed inc. GST; billing monthly or annually in advance; no refunds for partial periods; cancellation takes effect at period end
  4. **Acceptable use**: no automated scraping, no resale of audit results, no reverse engineering, no misrepresentation of results
  5. **Intellectual property**: audit results and raw data belong to the customer; VisibleAU owns the platform, scoring methodology, and software; customer grants VisibleAU a licence to process their domain data to deliver the service
  6. **Disclaimer of warranties** (ACL §64A): audit results reflect LLM outputs at the time of the audit and may change; VisibleAU does not guarantee accuracy or completeness; results are not legal or commercial advice
  7. **Limitation of liability** (ACL §64A): liability capped at the greater of A$100 or 12 months' subscription fees paid; VisibleAU is not liable for indirect, consequential, or business loss
  8. **Termination**: either party may terminate on 30 days notice; Sri may terminate immediately for breach of acceptable use; customer data deleted within 30 days of termination
  9. **Governing law**: New South Wales, Australia; disputes submitted to NSW courts; customers in other AU states consent to NSW jurisdiction
- **Cookie Policy** — **JC4 fix: §9 lists Cookie Policy as a standalone legal document, but no `/cookie-policy` page exists in Sprint 11 (which only ships `/privacy` and `/terms`). Two options:**
  - **v1 canonical (recommended):** Merge cookie policy section INTO the Privacy Policy page (`/privacy`) under a "Cookies and Tracking" heading. Simpler, legally acceptable in AU/EU for an early-stage product.
  - **v1.1 option:** Add `app/(marketing)/cookie-policy/page.tsx` as a separate route (mirror of Sprint 11's about/privacy/terms pattern with `buildMetadata`).
  - Cookie content minimum: what cookies VisibleAU sets (Clerk session cookie, PostHog analytics, Stripe payment), purpose, duration, opt-out method.
- **Cookie consent banner** — **JA3 fix** (see §9): show to all visitors. Banner links to `/privacy#cookies` (the merged section).
- **Cookie consent banner** — **JA3 fix: §9 says "required if EU users access (which they do via `/eu` region)" — VisibleAU has NO `/eu` route in any sprint. This was a fiction. GDPR applies to any EU-resident visitor regardless of URL path.** Canonical approach:
  - Show the cookie consent banner to **all visitors** on first visit (simplest compliant implementation)
  - OR use IP geolocation in middleware to show only to EU visitors (more complex, defer to v1.1)
  - For v1 launch: show banner to all visitors — over-compliant but safe. Australian Privacy Act 1988 does not prohibit this.
  - Banner: "We use cookies for authentication and analytics. [Accept] [Decline]"
  - Remove all references to `/eu/*` routes — they don't exist.

Source from template + legal review. Don't ship without privacy policy.

---

## 10. GoLive checklist

`docs/golive-checklist.md` — 30+ items walked through immediately before DNS cutover:

```
PRE-CUTOVER (T-1 day):
[ ] All Sentry config in production
[ ] All env vars set in Vercel production
[ ] JX4 fix: GitHub Actions CI green on main branch — pnpm test + pnpm lint + pnpm type-check all passing.
[ ]   A TypeScript error pushed during Sprint 12 causes Vercel build failure, silently leaving
[ ]   old deployment live. Verify: github.com → repo → Actions → latest run → all checks green.
[ ]   If CI is red: fix before DNS cutover. Do not cut over to a failing build.
[ ] **Vercel plan: upgraded to Pro before launch — JH5 fix: JF5 flagged Hobby 10s timeout breaks Inngest. Steps:**
[ ]   vercel.com → dashboard → Settings → Billing → "Upgrade to Pro" (~US$20/mo per seat)
[ ]   Pro unlocks: 60s function timeout, 100GB bandwidth, custom domains, team features
[ ]   Do this BEFORE deploying production — plan affects active deployments immediately
[ ] **Supabase plan: upgraded to Pro before launch — JT3 fix: Supabase Pro required for PITR backup drill (§1 deliverable) and production-grade storage. Free tier has no PITR option in dashboard:**
[ ]   supabase.com → project → Settings → Billing → "Upgrade to Pro" (~US$25/mo)
[ ]   Pro unlocks: PITR (point-in-time recovery), 8GB DB, 100GB storage, daily backups
[ ]   Without Pro: JE5 backup drill is impossible — PITR tab doesn't appear in free tier
[ ] Stripe in production mode (separate from test mode)
[ ] Stripe webhook endpoint registered (production URL)
[ ] Clerk webhook endpoint registered (production URL)
[ ] Resend domain verified (SPF + DKIM DNS records added + green in Resend dashboard) — JG2 fix
[ ] PostHog production key configured (NEXT_PUBLIC_POSTHOG_KEY updated) — JJ1 fix
[ ] Upstash production database created + env vars updated (visibleau-production in ap-southeast-1) — JJ1 fix
[ ] Supabase production project confirmed (NEXT_PUBLIC_SUPABASE_URL + ANON_KEY point to prod) — JJ1 fix
[ ] npm packages published (@visibleau/wilson-ci-scorer + @visibleau/llms-txt-generator) — JJ1 fix (JF1)
[ ] JU5 fix: public/og-image.png exists and is 1200×630px — Sprint 11 IJ3 added it as operator-authored
[ ]   asset. Without it every social share of visibleau.com shows a broken/missing image.
[ ]   Verify: ls public/og-image.png && file public/og-image.png (confirm dimensions)
[ ]   Create: Canva → Custom size 1200×630px → export PNG → save to public/og-image.png
[ ] DNS records prepared but not switched
[ ] JS4 fix: DNS TTL lowered to 300s (5 min) at registrar — do this 24h BEFORE cutover.
[ ]   Without this, a DNS rollback after a failed cutover takes hours (default TTL = 86400s = 24h).
[ ]   With 300s TTL: rollback takes 5 minutes. Always lower TTL the day before, not on cutover day.
[ ] Backup verified within last 24h
[ ] Load test passed within last week
[ ] Security audit complete
[ ] Privacy + Terms live at /privacy and /terms
[ ] ProductHunt launch scheduled
[ ] IndieHackers post drafted
[ ] JB5 fix: Beta cohort sign-off — 5-10 friendly customers have run 1-2 audits each on staging/production
[ ]   and any blocking issues identified are FIXED before DNS cutover (per §1 Definition of Done)

CUTOVER (T-0):
[ ] Run final smoke test on staging
[ ] **JT5 fix: verify production build passes before DNS cutover — never specified. Vercel deploys on push but TypeScript errors cause silent build failures (previous deployment stays live). Run locally with production env vars:**
[ ]   cp .env.production.example .env.production.local → fill in production values
[ ]   NODE_ENV=production pnpm build → must complete with zero errors
[ ]   Check: no TypeScript errors, no missing module errors, no env var undefined warnings
[ ]   Only proceed to DNS switch after clean build confirmed
[ ] Switch DNS A/CNAME to Vercel production
[ ] Verify SSL provisioning (Vercel auto)
[ ] Register Inngest production app URL (https://visibleau.com/api/inngest) — AFTER DNS live (JF2) — JJ1 fix
[ ] Run signup flow against production
[ ] Run sample audit against production
[ ] Verify Stripe checkout end-to-end
[ ] Verify Clerk webhook fires
[ ] Verify Sentry receives events
[ ] Verify /api/health returns 200
[ ] JS5 fix: Open browser DevTools → Console on production visibleau.com — verify zero errors/warnings.
[ ]   Next.js hydration errors are SILENT in production (no crash) but indicate broken UI components.
[ ]   Check: no "Text content did not match", no "Warning: Prop mismatch", no uncaught exceptions.
[ ]   If hydration errors appear: identify the component, fix before announcing launch.
[ ] JO5 fix: ONLY NOW tweet/post launch announcement — all above items must be green first.
[ ]   Announcing before verifying = announcing to users that something broken is live.
[ ]   All above items must be green before any public announcement.

POST-CUTOVER (T+1h, T+1d, T+7d):
[ ] Check Sentry dashboard for spike
[ ] Check Vercel metrics for performance regressions
[ ] Monitor signups + first-audit completion rate
[ ] Respond to user reports within 4h
```

---

## 11. Pre-launch marketing

Sprint 12 prepares — doesn't execute. Drafts and assets only.

### ProductHunt

- `docs/marketing/producthunt-launch.md`
- Tagline: "AI search visibility for Australian SMBs"
- Description: 260 chars
- Gallery: 5-6 screenshots from the live product
  **JE4 fix: image dimensions and format never specified — wrong dimensions cause submission rejection:**
  - Gallery images: **1270×952px** PNG or JPG, max 2MB each
  - Logo/thumbnail: **240×240px** PNG (transparent background preferred)
  - Recommended screens: (1) landing hero, (2) audit results dashboard, (3) 5-dimension score breakdown, (4) action center recommendations, (5) pricing page, (6) methodology page
  - Tool: take browser screenshots at 1270px viewport width, or use Cleanshot X / Screely for framing
  - Upload in the ProductHunt draft before the launch day — can't upload during live launch window
- Maker comment: Sri introduces himself + why he built this
- Launch day: Tuesday-Thursday best (avoid Monday/Friday)

### IndieHackers

- `docs/marketing/indiehackers-post-draft.md`
- Format: "I just launched VisibleAU" — what it does, MRR plan, lessons learned
- Honest framing: solo founder, AU-first niche, why AU SMBs specifically

### AU communities

**JH3 fix: original community list has 3 problems — r/AusFinance (Rule 7 bans self-promotion; violators get permanent bans), r/smallbusiness (US-focused subreddit, not AU), r/Sydney (social community, not business-appropriate). Corrected AU community plan:**

- **LinkedIn (highest ROI for B2B):** 1 personal post from Sri's profile — "I built VisibleAU, here's why I started it" with story-first framing (not product pitch)
- **r/AusTechProfessionals** (60k members) — tech/SaaS product posts tolerated if genuinely useful; lead with the problem, not the product
- **r/webdev** AU variant or Hackernews "Show HN" — developer audience, technical framing ("I built a multi-LLM citation tracker for AU SMBs")
- **Facebook groups (AU-specific, highest SMB density):**
  - "Business Owners Australia" (120k members) — moderate promotion tolerance
  - "AU Small Business Owners" groups (search for regional variants e.g. "Sydney Small Business")
  - Tradie-specific groups (e.g. "Australian Plumbers Network") — if offering free audit
- **IndieHackers** — primary launch channel for founders, no anti-promotion rules
- **Startups AU Slack** (startmates.com) — AU founder community, warm reception for local products
- **Do NOT post to r/AusFinance** — permanent ban risk for self-promotion

---

## 12. Claude Code prompt (paste this when starting Sprint 12)

```
We're building VisibleAU Sprint 12: launch readiness. Sprint 11 polished the product.
Sprint 12 turns it into a production system that doesn't break at 2am.

Sprint 12 is more ops than code. Most of the work is configuration, testing, and
documentation. Don't over-engineer.

Sprint 12 deliverables, in order:

1. SENTRY INTEGRATION
   - pnpm add @sentry/nextjs
   - Run pnpm exec @sentry/wizard@latest -i nextjs
   - Verify sentry.client/server/edge.config.ts created
   - Wrap next.config.ts with withSentryConfig — **JI4 fix: critical options never specified:**
     ```typescript
     // next.config.ts
     import { withSentryConfig } from '@sentry/nextjs';
     const nextConfig = {
       // JJ4 fix: www redirect
       async redirects() {
         return [
           {
             source: '/:path*',
             has: [{ type: 'host', value: 'www.visibleau.com' }],
             destination: 'https://visibleau.com/:path*',
             permanent: true,
           },
         ];
       },
       // JM2 fix: images.remotePatterns missing — next/image throws "Invalid src" for
       // Supabase Storage (PDF reports, brand assets) and Clerk profile avatars:
       images: {
         remotePatterns: [
           { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/**' },
           { protocol: 'https', hostname: 'img.clerk.com' },
         ],
       },
       // Other existing config goes here
     };
     export default withSentryConfig(nextConfig, {
       org: process.env.SENTRY_ORG,          // 'visibleau'
       project: process.env.SENTRY_PROJECT,   // 'visibleau-web'
       silent: !process.env.CI,               // suppress in local builds
       widenClientFileUpload: true,           // upload client-side source maps
       hideSourceMaps: true,                  // CRITICAL: prevent source maps being served publicly
                                              // Without this, anyone in browser DevTools can see
                                              // all your server-side code via source maps
       disableLogger: true,                   // remove Sentry logger from prod bundle
       automaticVercelMonitors: true,         // Vercel cron monitor integration
     });
     ```
   - **JE3 fix: source map upload is handled by withSentryConfig at build time — no separate CI step needed**
   - **JP3 fix: Sentry Vercel integration provides automatic release tracking and deployment markers — never mentioned. Free 2-click setup:**
     1. Sentry dashboard → Settings → Integrations → Vercel → Connect
     2. Authorise Sentry to access the VisibleAU Vercel project
     3. Sentry automatically: creates a new release on each Vercel deployment, marks deploys in Sentry timeline, links errors to specific git commits
     4. This is separate from `@sentry/nextjs` — it's a Sentry platform integration. Both are needed.
   - Test: throw an error in a route, verify Sentry receives

2. ALERTING
   - Configure alert rules in Sentry dashboard per §6
   - Set up Better Uptime / Cronitor hitting /api/health
   - Test: take staging DB offline, verify alert fires

3. LOAD TESTING
   - scripts/load-test/* per §7
   - **JS2 fix: "Run against staging environment" — Inngest needs its own staging environment synced to the staging URL. Without this, autocannon triggers `POST /api/audits` on staging which fires Inngest events into dev or production Inngest environment — contaminating production job queue during load tests. Setup:**
     1. Inngest Cloud → Environments → Create "Staging" environment
     2. Get staging `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY` — set in Vercel staging env vars
     3. After deploying staging: Inngest → Staging → Apps → Sync `https://[staging-url]/api/inngest`
     4. `LLM_MODE=mock` must be set in staging env vars before load testing (JK5 — prevents real LLM costs)
   - Run against staging environment (after Inngest staging is synced)
   - Document results in docs/load-test-results.md
   - Fix any p95 regressions (likely Drizzle query optimization, Inngest concurrency limits)

4. SECURITY AUDIT
   - Run pnpm audit and fix high/critical
   - Walk through §8 checklist
   - Document in docs/security-review.md
   - **JQ1 fix: "Rotate all API keys" was listed here in Step 4 — but §15 says "Do not rotate keys without rolling deployment." Rotating production keys in Step 4 (before Step 7 production deployment) creates a window where:**
     - Staging still has old keys → staging breaks before new keys are deployed to prod
     - Old keys are revoked before new deployment is live → brief outage window
   - **Key rotation belongs in Step 7 (production deployment), alongside the Vercel env var setup. Step 4 should only GENERATE new keys in each provider's dashboard — do NOT revoke old ones yet.**

5. BACKUP DRILL
   - Restore Supabase Postgres backup to a temporary DB
   **JE5 fix: "restore to a temporary DB" — Supabase PITR cannot be automated via script (it's a dashboard operation). `scripts/backup-restore-test.ts` can verify data integrity AFTER the restore, not perform it. Actual PITR restore procedure:**
   ```
   1. Supabase dashboard → your project → Settings → Database → Backups tab
   2. Select "Point in Time Recovery" → choose a restore timestamp (e.g. 1 hour ago)
   3. Click "Restore to new project" — Supabase creates a NEW Supabase project with the restored data
      (Supabase cannot restore in-place to the same project — this is by design)
   4. Note the new project's DATABASE_URL connection string
   5. Run: DATABASE_URL=<new-project-url> tsx scripts/backup-restore-test.ts
      → script verifies: row counts match, RLS policies present, foreign keys intact
   6. Delete the temporary project after verification (billing stops immediately)
   7. Document the restore time (target: <30 min for a solo founder) in docs/ops-runbook.md
   ```
   - Verify data integrity (script checks row counts + schema)
   - Document the procedure in docs/ops-runbook.md

6. LEGAL DOCS
   - Privacy policy: use Termly or similar template; Sri customizes
   - Terms of service: same
   - Cookie consent banner: components/domain/shared/cookie-consent-banner.tsx
   - **JA3 fix: "Make sure cookie banner shows on EU routes (/eu/*)" — /eu/* routes don't exist. Show banner to ALL visitors (v1 compliant default). See §9 JA3 fix.**

7. PRODUCTION DEPLOYMENT
   - Vercel project: production env vars set
   - **JP1 fix: Sprint 12 adds 3 public API routes that Clerk's middleware.ts will block with 401 unless added to publicRoutes. Uptime monitor hitting /api/health gets 401 → alert fires immediately after launch. Update middleware.ts:**
     ```typescript
     // middleware.ts — add to publicRoutes array:
     export default clerkMiddleware((auth, req) => {
       const publicRoutes = [
         '/',
         '/pricing',
         '/about',
         '/privacy',
         '/terms',
         '/methodology',
         '/sample-audit(.*)',
         '/sign-in(.*)',
         '/sign-up(.*)',
         '/api/webhooks/(.*)',
         '/api/health',      // JP1: uptime monitor — must be public
         '/api/badge',       // JP1: SVG badge API — must be public for external embedding
         '/api/demo',        // JP1: demo mode — handles its own DEMO_MODE guard
       ];
       if (!publicRoutes.some(r => req.nextUrl.pathname.match(r))) {
         auth().protect();
       }
     });
     ```
   - **JL2 fix: Supabase production project starts EMPTY — drizzle-kit migrate must run against production DATABASE_URL or app crashes on first request ("relation does not exist"). Never specified in Step 7:**
     ```bash
     DATABASE_URL=postgresql://postgres:[prod-password]@[prod-host]:5432/postgres \
       pnpm drizzle-kit migrate
     ```
   - **JV3 fix: DATABASE_URL connection string — Vercel serverless functions require the POOLED connection string (pgbouncer, port 6543), NOT the direct connection (port 5432). Supabase provides two:**
     - **Direct:** `postgresql://postgres:[pass]@db.[ref].supabase.co:5432/postgres` — use for `drizzle-kit migrate` ONLY (migrations need direct connection, not pooled)
     - **Pooled:** `postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true` — use for `DATABASE_URL` in Vercel production env vars
     - **Why:** Vercel serverless creates a new DB connection per invocation. At 50 concurrent functions, direct = 50 open connections (exhausts Supabase Pro's 200-connection limit fast). Pooled = pgbouncer manages the pool.
     - Find pooled string: Supabase dashboard → Settings → Database → Connection string → URI → toggle "Use connection pooling"
   - **JR5 fix: RLS policies — whether they transfer depends on how Sprint 1 applied them:**
     - If RLS was written as Drizzle migration SQL (in `db/migrations/*.sql`): `drizzle-kit migrate` applies them automatically ✓
     - If RLS was applied manually in Supabase dashboard SQL editor: they are NOT in migrations — must be re-applied manually
     - **Verify:** Supabase dashboard → production project → Authentication → Policies — confirm policies exist for organizations, brands, audits, citations tables
     - **Test cross-org isolation:** sign in as user A, attempt to fetch user B's org data via API → should return 0 rows or 404
   - **JW4 fix: Sprint 10 HJ3 added `processed_webhook_events` table for Stripe webhook idempotency — never in Sprint 12's migration verification. Without this table, duplicate webhook events cause double-subscription-creation.**
     - After `drizzle-kit migrate`, verify in Supabase Table Editor: `processed_webhook_events` table exists
     - Verify columns: `id` (uuid), `stripe_event_id` (text, unique), `type` (text), `processed_at` (timestamp)
     - If missing: `grep -r "processedWebhookEvents" db/migrations/` — confirm migration was generated for it in Sprint 10
   - Supabase Postgres: production database provisioned (Supabase Pro project — separate from staging project)
   - **JX5 fix: region never specified for production Supabase project. CLAUDE.md says "Supabase Sydney (ap-southeast-2)" but JV3's pooled connection string example used ap-southeast-1 (Singapore). Creating in wrong region adds ~50ms per query for AU users.**
     - Supabase dashboard → New project → Region: **ap-southeast-2 (Sydney)** ← CRITICAL for AU latency
     - The pooled connection string for Sydney: `postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true`
     - Note: JV3's example showed `ap-southeast-1` — that was an error. Sydney is `ap-southeast-2`.
   - **JR1 fix: Supabase Storage buckets never created in production setup. Sprint 9 uses a `logos` bucket for agency branding uploads. Production project starts with zero buckets — logo uploads fail immediately. Create via Supabase dashboard:**
     1. Supabase dashboard → production project → Storage → New bucket
     2. Create bucket: `logos` — Public (agency logos must be publicly accessible for PDF reports)
     3. Create bucket: `reports` — Private (audit PDF reports — accessed via signed URLs only)
     4. Apply RLS on `logos` bucket: authenticated users can upload to `logos/[org-id]/`; public read
     5. Apply RLS on `reports` bucket: org members can read their own org's reports only
     6. Update `SUPABASE_STORAGE_URL` if used directly (or use the Supabase JS client which reads `NEXT_PUBLIC_SUPABASE_URL`)
   - Stripe: switch to production mode, run setup-stripe-products.ts against prod
     **JE1 fix: `setup-stripe-products.ts` reads `STRIPE_SECRET_KEY` from env. If this still points to the Stripe TEST key, products get created in test mode — silent failure that wastes real money when first customer checks out. Correct procedure:**
     ```bash
     # 1. Get production Stripe secret key from dashboard.stripe.com → Developers → API keys
     #    (Live mode key starts with sk_live_...)
     # 2. Run script with production key explicitly — do NOT rely on .env.local:
     STRIPE_SECRET_KEY=sk_live_... pnpm tsx scripts/setup-stripe-products.ts
     # 3. Verify in Stripe dashboard (Live mode) → Products — 4 tiers + 1 one-off-audit created
     # 4. Copy the resulting price IDs to Vercel production env vars:
     #    STRIPE_PRICE_STARTER_MONTHLY, STRIPE_PRICE_GROWTH_MONTHLY, etc.
     # 5. Verify Stripe webhook endpoint in Live mode dashboard → pointing to production URL
     ```
     **JT2 fix: Stripe Customer Portal requires production configuration — never specified. Sprint 10's `/api/billing/portal` calls `stripe.billingPortal.sessions.create()` which throws "No configuration found" without this setup:**
     1. Stripe dashboard → Live mode → Settings → Billing → Customer Portal
     2. Allowed features: plan upgrades/downgrades, invoice history, cancellation
     3. Branding: VisibleAU logo + brand colour
     4. Return URL: `https://visibleau.com/settings/billing`
     5. Save → test via `/api/billing/portal` after DNS cutover
     **JI2 fix: Sprint 10 HG1 established `tax_behavior: 'inclusive'` as CRITICAL for AU GST compliance. Sprint 1's setup-stripe-products.ts predates HG1 — verify/add this before running against production:**
     ```typescript
     // In setup-stripe-products.ts, each price creation must include:
     await stripe.prices.create({
       product: product.id,
       unit_amount: p.priceAud,
       currency: 'aud',
       recurring: { interval: 'month' },
       tax_behavior: 'inclusive',  // JI2: GST included in displayed price (HG1 CRITICAL fix)
       // NOT: automatic_tax: { enabled: true } — this adds tax ON TOP, wrong for AU
     });
     // After running: Stripe dashboard → Prices → confirm tax_behavior = "Inclusive"
     ```
     **JX2 fix: PRD §7 "annual = 16% discount (2 months free)" — annual unit_amount NEVER calculated in any sprint. Without amounts the script produces broken prices. Canonical amounts (AUD cents, GST-inclusive):**
     ```typescript
     // Monthly:  Starter A$99 | Growth A$299 | Agency A$599 | Agency Pro A$999
     // Annual = monthly × 12 × 0.84 (16% off):
     //   Starter:    A$99  × 12 × 0.84 = A$997.92  → 99792 cents
     //   Growth:     A$299 × 12 × 0.84 = A$3014.88 → 301488 cents
     //   Agency:     A$599 × 12 × 0.84 = A$6035.88 → 603588 cents
     //   Agency Pro: A$999 × 12 × 0.84 = A$10069.92 → 1006992 cents
     // One-off audit: A$299 → 29900 cents (mode: 'payment', not 'subscription')
     ```
   - Clerk: production instance, webhook URL updated
     **JG1 fix: "production instance, webhook URL updated" — full Clerk production setup never specified. Without correct keys, dev-mode Clerk is used in production (authentication cross-contaminated with test signups). Complete procedure:**
     1. Clerk dashboard → "Create application" → choose **Production** (not Development)
     2. **JW1 fix: Enable Organizations — Clerk Dashboard → Configure → Organizations → toggle "Enable organizations" ON.**
        **Without this: `auth().orgId` returns null for ALL users; every org-based query fails silently.**
        **VisibleAU's multi-tenant model depends entirely on Clerk Organizations — this is the most critical Clerk setting.**
     3. Get new keys: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...` and `CLERK_SECRET_KEY=sk_live_...`
     3. Add production domain: Clerk dashboard → Domains → add `visibleau.com`
     4. Configure Clerk-hosted sign-in URL: `https://accounts.visibleau.com` (requires DNS CNAME: `accounts.visibleau.com → frontend-api.clerk.accounts.dev`)
     5. Webhooks → Add endpoint: `https://visibleau.com/api/webhooks/clerk` → select events (user.created, session.created)
     6. Copy new `CLERK_WEBHOOK_SECRET` for production webhook
     7. Update Vercel production env vars: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`
   - **JF2 fix: Inngest production deployment requires registering the app URL — missing from Step 7. Without this, Inngest cannot deliver any job events to production (jobs queue but never execute):**
     1. Inngest Cloud dashboard → Environments → Production → Apps → "Sync new app"
     2. Enter: `https://visibleau.com/api/inngest` (the production Inngest endpoint from Sprint 2)
     3. Inngest fetches the function list and registers all Inngest functions
     4. Verify: Inngest dashboard → Functions → all audit/email/cron functions visible
     5. Test: trigger a sample audit → verify Inngest shows job as "Completed" not "Pending"
     **This step requires the production domain to be live (DNS switched) BEFORE Inngest can register.**
     **Sequence: DNS cutover → Inngest URL registration → verify job delivery.**
   - DNS records prepared (do NOT switch yet)
     **JG2 fix: Resend production domain verification missing from Step 7 and GoLive checklist entirely. Without this, every transactional email (audit-complete, invite, billing alert) is rejected or lands in spam. Resend domain verification procedure:**
     1. Resend dashboard → Domains → "Add domain" → enter `visibleau.com`
     2. Resend provides DNS records: SPF TXT record + DKIM CNAME records (typically 3 CNAME records)
     3. Add these records at your domain registrar → wait for propagation (5-30 min)
     4. Resend dashboard → verify domain (green checkmark)
     5. Update `FROM_EMAIL` in Resend API calls from `noreply@resend.dev` (dev) to `noreply@visibleau.com` (prod)
     **JR2 fix: Sprint 2 uses `RESEND_FROM_EMAIL` env var (not `FROM_EMAIL`) set to `audits@visibleau.com` in dev.**
     **`FROM_EMAIL` is the wrong var name — it won't update anything. Correct procedure:**
     - Update Vercel production env var: `RESEND_FROM_EMAIL=noreply@visibleau.com`
     - This var is also missing from Sprint 12 §3 — add it: see §3 env vars below.
     6. Get production `RESEND_API_KEY` (separate from dev key) → update Vercel env vars
     **Note: domain verification DNS records can be added BEFORE DNS cutover — do this step early.** — PRD §16 uses `visibleau.com.au` (badge URLs, npm links); Sprint 11 uses `visibleau.com`. These are different domains with different registrar requirements. Canonical resolution:**
     - **Primary launch domain: `visibleau.com`** (simpler registrar, Vercel native, used in Sprint 11 SEO)
     - **Register `visibleau.com.au`** separately via auDA-accredited registrar (e.g. Crazy Domains, VentraIP) — requires Australian presence (ABN or ACN). Redirect `visibleau.com.au` → `visibleau.com` post-launch.
     - **JI5 fix: "redirect .com.au → .com" — HOW was never specified. Registrar URL forwarding doesn't preserve paths or HTTPS. Canonical implementation via Vercel:**
       1. Vercel dashboard → your project → Settings → Domains → "Add domain" → enter `visibleau.com.au`
       2. Vercel will ask: "Redirect to visibleau.com" — select 301 Permanent redirect
       3. Point `visibleau.com.au` DNS to Vercel (A record or CNAME as Vercel instructs)
       4. Vercel auto-provisions SSL for `.com.au` and serves the 301 redirect with path preservation
       5. Verify: `curl -I https://visibleau.com.au/pricing` → Location: `https://visibleau.com/pricing`
       **This preserves all paths, works with HTTPS, and is managed entirely within Vercel.**
     - **DNS preparation steps:**
       1. In Vercel dashboard → project → Domains → add `visibleau.com`
       2. Vercel provides an A record IP + CNAME value
       3. At domain registrar → DNS settings → set A record (or CNAME for www) to Vercel values
       4. Set DNS TTL to 300s (5 min) 24h before cutover — allows fast rollback
       5. After cutover: verify SSL auto-provisioned (Vercel does this automatically within ~60s)

8. PRE-LAUNCH MARKETING ASSETS
   **JP4 fix: "Sri authors the content" — no content spec for any of the 3 files. Minimum structure:**

   `docs/marketing/producthunt-launch.md`:
   - **Tagline** (60 chars max): "AI search visibility for Australian SMBs — see how ChatGPT, Claude + Gemini describe your business"
   - **Description** (260 chars): problem + solution + differentiator + CTA
   - **Gallery captions** (1 per screenshot): describe what's shown and why it matters
   - **Maker comment** (300-500 words): Sri's story — "I built this because..." → problem → what it does → early results → ask for upvotes/feedback
   - **First comment** (to post launch day): "Happy to answer any questions about how the scoring works!"
   - **Tags**: productivity, saas, developer-tools, seo, marketing

   `docs/marketing/indiehackers-post-draft.md`:
   - **Title**: "I just launched VisibleAU — AI search visibility for AU SMBs. Here's what I learned building it solo"
   - **Sections**: What it does (2 para) → Why AU specifically (1 para) → MRR goal and timeline → 3 biggest technical challenges → Honest early metrics (beta cohort results) → What's next → Ask: "Would you use this for your business?"
   - **Tone**: honest, founder-to-founder, data-driven, no hype

   `docs/marketing/au-community-rollout.md`:
   - **Week 1** (ProductHunt launch week): LinkedIn post, IH post, 2-3 targeted Facebook group posts
   - **Week 2** (beta feedback incorporated): HN Show HN post, r/AusTechProfessionals
   - **Messaging per channel**: B2B LinkedIn (ROI framing) vs IH (founder story) vs Facebook SMB groups (plain language, "is your business showing up when people ask AI?")
   - **Follow-up plan**: respond to every comment within 24h launch week

   - Schedule ProductHunt launch for a Tuesday-Thursday

9. GOLIVE CHECKLIST
   - docs/golive-checklist.md per §10
   - Walk through with Sri before DNS cutover

10. OPS RUNBOOK
    - docs/ops-runbook.md with sections for:
    **JJ2 fix: runbook headings only — no actual content. Sri can't follow headings at 2am. Canonical content per section:**

    **Sentry alert response:**
    - Error rate >5/min: open Sentry → filter by `environment=production` → identify top error → check if deployment-related (check Vercel deployment tab) → rollback if new deploy caused it (`vercel rollback` in Vercel dashboard)

    **Database connection issues:**
    - Symptoms: 503 on all routes, Sentry shows "connection timeout"
    - Check: Supabase dashboard → Project → Home → Connection pooler status
    - Fix: Supabase → Pause/Resume project; if pooler saturated, add `?pgbouncer=true` to DATABASE_URL and redeploy

    **LLM API outages (which engine to disable):**
    - Set `LLM_ENGINE_OPENAI_ENABLED=false` (or relevant engine) in Vercel env vars → Redeploy
    - Active audits using that engine will fail gracefully; next audit skips disabled engine
    - Check status pages: status.openai.com, status.anthropic.com, status.google.com

    **Stripe webhook backlog:**
    - Symptoms: subscriptions not updating; check Stripe dashboard → Developers → Webhooks → failed deliveries
    - Fix: Stripe dashboard → "Resend" failed webhooks manually OR fix the handler + let Stripe retry (retries for 3 days)
    - Emergency: manually update org tier in Supabase if customer paid but tier not updated

    **High audit failure rate:**
    - Check Inngest dashboard → Functions → recent failures → read error message
    - If LLM error: disable engine (see above)
    - If DB error: check Supabase connection
    - If Inngest queue backlog: Inngest dashboard → cancel stuck jobs → re-trigger

11. FINAL ATTRIBUTIONS.md
    - Last entries per Sprint 12 touchpoints
    - All sprints' contributions consolidated
    **JG3 fix: "last entries per Sprint 12 touchpoints" — no specifics. PRD §16 ATTRIBUTIONS matrix specifies Sprint 12's exact entries:**
    ```markdown
    ## Sprint 12 — Launch (additions)

    ### npm package attributions
    - `@visibleau/wilson-ci-scorer` — Wilson score interval algorithm adapted from
      standard statistical literature. No OSS dependency; original implementation.
      README credits: Princeton KDD 2024 paper for effect-size validation methodology.
    - `@visibleau/llms-txt-generator` — llms.txt format inspired by Auriti-Labs/geo-optimizer-skill
      (MIT). VisibleAU re-implemented from scratch against the llms.txt.site spec.

    ### Final cross-check (complete before public repos go live)
    - [ ] All Sprint 7-11 ATTRIBUTIONS entries verified accurate
    - [ ] MIT license headers in any files derived from OSS references
    - [ ] SCORING_RUBRIC.md published in public repo (Auriti pattern — epistemic honesty)
    - [ ] Sprint 7 OSS references (Auriti-Labs, Princeton KDD, AutoGEO ICLR) still accurate
    ```

12. POST-LAUNCH MONITORING PLAN
    - Day 1: Sri watches Sentry every 30min
    - Week 1: daily Sentry digest + Vercel metrics review
    - Month 1: weekly KPI review (signups, first-audit completion, conversion)

13. NEW §4 FILES (added by audit passes JA-JJ — not in original steps):
    **JK1 fix: 8 files added to §4 but with no §12 Claude Code steps — Claude Code won't create them:**
    - app/api/health/route.ts — JA2 spec (Supabase DB ping, returns 200/503)
    - app/api/badge/route.ts — JA5/JB4 spec (SVG badge, Access-Control-Allow-Origin: *)
    - app/api/demo/route.ts — JA5/JB4 spec (DEMO_MODE guard, Sprint 10 ensureSampleOrg)
    - app/(auth)/launch/page.tsx — JG5/JJ5 spec (LaunchReadinessDashboard, auth-gated)
    - inngest/functions/audit-data-retention.ts — JH4 spec (weekly cron, 12-month cleanup)
    - docs/soc2-kickoff.md — JF4 spec (Vanta/Drata vendor selection + control inventory)

13b. CROSS-SPRINT FILE MODIFICATIONS (JO4 fix — Sprint 12 modifies files owned by earlier sprints):
    **These 6 files exist in earlier sprints but Sprint 12 must update them. Claude Code won't modify them unless explicitly listed:**
    - `lib/feature-flags/index.ts` (Sprint 1) → add `isEngineEnabled(engine)` function (JD3)
    - `inngest/index.ts` (Sprint 2) → register `auditDataRetention` function (JH4)
    - `app/(auth)/dashboard/page.tsx` (Sprint 3) → add `org.metadata` query + `showTour` prop (IM1)
    - `components/domain/dashboard/dashboard-view.tsx` (Sprint 3) → add `showTour` prop + `<ProductTour>` render (IM5)
    - `components/domain/pricing/pricing-card.tsx` (Sprint 10) → add `isMostPopular` prop + badge (IL4)
    - `app/error.tsx` (Sprint 11) → ENHANCE with `Sentry.captureException` (JL1)

    **JW1 fix: also verify `app/api/webhooks/clerk/route.ts` Svix body — see JV1 above.**

    **JW2 fix: Sprint 2 `lib/email/templates/audit-complete.tsx` footer hardcodes `href="https://visibleau.com.au"`. JE2 established `visibleau.com` as the CANONICAL production domain (.com.au redirects to .com). Every audit completion email sent to real users links to the wrong TLD. Fix:**
    - `lib/email/templates/audit-complete.tsx` (Sprint 2) → change footer href from `visibleau.com.au` to `visibleau.com`
    - Also check: `NEXT_PUBLIC_APP_URL` in Sprint 2's `.env.local` had a commented-out `https://app.visibleau.com.au` — production Vercel env var must be `https://visibleau.com` (no subdomain, .com not .com.au)
    - Search Sprint 2: `grep -r "visibleau.com.au" lib/email/` — fix all occurrences

    **JX3 fix: `inngest/functions/send-audit-complete-email.ts` (Sprint 2) Resend `emails.send()` call is missing `List-Unsubscribe` header. Gmail/Yahoo/Outlook have required this for bulk senders since February 2024. Without it, transactional audit emails are flagged as bulk and deliverability degrades.**
    - `inngest/functions/send-audit-complete-email.ts` (Sprint 2) → add `headers` to Resend send call:
    ```typescript
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: userEmail,
      subject: `Audit complete: ${emailData.brandName} — Score ${score}/100`,
      html,
      headers: {
        'List-Unsubscribe': `<mailto:unsubscribe@visibleau.com?subject=unsubscribe>, <${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',  // RFC 8058 one-click unsubscribe
      },
    });
    ```
    - Note: audit-complete emails are transactional (triggered by user action), not marketing — strictly speaking RFC 2369 applies to marketing lists. But Gmail's 2024 policy treats ALL bulk senders the same. Add the header to be safe.

    **JV1 fix: Sprint 1 `app/api/webhooks/clerk/route.ts` says "Verify signature with svix" but the Svix code body is NEVER shown across all 12 sprints. Without it, any attacker can POST fake Clerk events — creating fake orgs or faking subscription upgrades. Also add to cross-sprint modifications:**
    - `app/api/webhooks/clerk/route.ts` (Sprint 1) → verify Svix code is present and correct:
    ```typescript
    import { Webhook } from 'svix';
    import { headers } from 'next/headers';

    export async function POST(req: Request) {
      const body = await req.text();  // raw body required for Svix
      const headersList = await headers();
      const svixId = headersList.get('svix-id');
      const svixTs = headersList.get('svix-timestamp');
      const svixSig = headersList.get('svix-signature');

      if (!svixId || !svixTs || !svixSig) {
        return new Response('Missing svix headers', { status: 400 });
      }

      const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
      let event: WebhookEvent;
      try {
        event = wh.verify(body, {
          'svix-id': svixId,
          'svix-timestamp': svixTs,
          'svix-signature': svixSig,
        }) as WebhookEvent;
      } catch {
        return new Response('Invalid signature', { status: 400 });
      }
      // ... handle event.type switch
    }
    ```
    **Verify this pattern exists in Sprint 1's implementation before launch (Step 4 security scan).**

14. NPM PACKAGES (JF1 — build before npm publish):
    - packages/wilson-ci-scorer/: extract from Sprint 3 scoring module, add package.json, README
    - packages/llms-txt-generator/: extract from Sprint 7 llms.txt generator, add CLI entry point
    - pnpm build in each package, then: npm login && npm publish --access public
    - Verify on npmjs.com: @visibleau/wilson-ci-scorer + @visibleau/llms-txt-generator visible

15. LAUNCH READINESS VERIFICATION:
    - Walk through docs/golive-checklist.md with Sri (all items checked)
    - Open app/(auth)/launch/page.tsx — verify all HIGH priority items green
    - Only then: cut DNS

POTENTIAL BLOCKERS:
- Privacy policy review by lawyer (recommended but expensive — Termly + careful edit is acceptable for v1)
- ProductHunt assets (5-6 screenshots): take from the polished production product
- Load test environment: ideally staging mirrors production tier; if budget-constrained, run smaller-scale tests with documented assumptions

Start with step 1. Sentry first — without monitoring, launching is irresponsible.
```

---

## 13. Tests required

- Backup restore drill: passes
- Load test: p95 metrics within target
- Security scan: no high/critical
- Sentry integration: test event received in dashboard
- **JP5 fix: §13 had 4 tests but 20+ new deliverables added across audit passes. Additional required tests:**
- Cookie consent banner: shows on first visit, stores choice in localStorage, PostHog opt-out fires on Decline
- Data retention cron: registered in Inngest dashboard (visible as a function, runs on Sunday)
- Badge route: `curl https://visibleau.com/api/badge?domain=visibleau.com` returns SVG with score
- LaunchReadiness dashboard: accessible at `/launch` when signed in as Sri, shows checklist items
- Cross-sprint modifications verified: `isEngineEnabled('openai')` returns true; audit-data-retention registered in Inngest
- Privacy Policy: `/privacy` returns 200, contains "Overseas disclosure" section (APP 8 JF3)
- Terms of Service: `/terms` returns 200, contains governing law and liability cap sections
- One-off audit checkout: Stripe `mode: 'payment'` flow triggers `handleOneOffAuditPayment` (staging test)
- Stripe webhook idempotency: duplicate webhook event → processed once only (Sprint 10 HJ3)
- npm packages: `npm show @visibleau/wilson-ci-scorer` returns package info

---

## 14. Acceptance criteria

- [ ] Sentry receives errors from production
- [ ] Uptime monitoring active with alerting
- [ ] Backup restored successfully in drill
- [ ] Load test results within targets
- [ ] Security audit complete, no high/critical
- [ ] Privacy + Terms live at /privacy and /terms
- [ ] Cookie consent banner shows on first visit for all visitors (JB1 fix: was "shows on EU routes" — /eu/* routes don't exist; JA3 fix shows banner to all visitors)
- [ ] Production DNS prepared (not yet cut over)
- [ ] GoLive checklist walked through
- [ ] Ops runbook readable + accurate
- [ ] ProductHunt launch scheduled
- [ ] ATTRIBUTIONS.md final
- [ ] JC5 fix: Post-launch monitoring plan documented and Sri has read it — Day 1/Week 1/Month 1 cadence from §12 Step 12. Verify docs/ops-runbook.md contains the monitoring schedule.
- [ ] JF4 fix: SOC 2 kickoff plan documented in docs/soc2-kickoff.md — vendor selected (Vanta or Drata), scope defined, initial control inventory listed. Required by §1 Definition of Done.
- [ ] JK4 fix: Data retention cron registered in Inngest (audit-data-retention runs weekly — verify in Inngest dashboard)
- [ ] JK4 fix: /api/badge returns SVG with score for a known domain (smoke test)
- [ ] JK4 fix: /api/demo redirects to dashboard when DEMO_MODE=true (or returns 404 when false)
- [ ] JK4 fix: npm packages visible on npmjs.com (@visibleau/wilson-ci-scorer + @visibleau/llms-txt-generator)
- [ ] JK4 fix: app/(auth)/launch/page.tsx accessible and shows checklist items
- [ ] JV4 fix: not-found.tsx returns 404 — visit /nonexistent-path, verify custom 404 page renders (not a 500)
- [ ] JV5 fix: instrumentation.ts exists and exports register — cat instrumentation.ts | grep "@sentry/nextjs"
- [ ]   Without instrumentation.ts, Sentry is never registered on the Node.js server runtime
- [ ]   Verify: Sentry dashboard shows server-side errors (not just client-side) after test throw

---

## 15. Common pitfalls / Sprint 12 anti-patterns

- **Do not** launch without Sentry. Production without monitoring is gambling.
- **Do not** skip the backup drill. The drill is the only thing that verifies your backup actually works.
- **Do not** rotate keys without rolling deployment. Stage the rotation.
  **JD4 fix: "stage the rotation" — procedure never described. For a solo Vercel + Supabase deployment:**
  1. Generate the NEW key in the provider dashboard (old key still active)
  2. Add the NEW key to Vercel production env vars alongside the old one (if the service supports dual keys — Stripe does via restricted keys; most others don't)
  3. Deploy a new Vercel build — it picks up new env vars immediately for new requests
  4. Wait 5 minutes — verify Sentry shows no auth errors on new requests
  5. Revoke the OLD key in the provider dashboard
  6. For services that don't support dual keys (Clerk, most LLM providers): accept a ~30s window where in-flight requests using the old key may fail. Schedule rotation during low-traffic (e.g. 2am AEST Sunday). Alert rule suppression during window recommended.
- **Do not** ship privacy policy without legal review if possible. Acceptable minimum: Termly template + Sri customization. Recommended: lawyer review for ~A$300-500.
- **Do not** launch on a Friday. Weekday launches mean you can respond during business hours.
- **Do not** announce launch publicly before verifying production is stable for 24+ hours.
- **JN5 — Known accepted v1 risk — CSP `unsafe-inline`:** The production `Content-Security-Policy` in `vercel.json` includes `'unsafe-inline'` in `script-src`. This allows any inline `<script>` to execute — a known XSS vector. For v1 this is **accepted** because: (1) React JSX escapes all string values by default; (2) `security-scan.ts` (JL3) checks for `dangerouslySetInnerHTML`; (3) user-supplied content (brand names, domains) rendered in the dashboard is escaped by React. **Plan for v1.1:** Implement Next.js 15 nonce-based CSP — the middleware generates a unique nonce per request, inlined into `<script nonce="...">` tags, and `unsafe-inline` is removed. Until then, ensure no `dangerouslySetInnerHTML` is merged without security review.

---

## 16. Post-launch (out of scope for Sprint 12, but flag here)

Week 1+: track these KPIs:
- Signups per day
- Sample-audit-to-signup conversion
- Free-to-paid conversion
- First-audit completion rate
- Sentry error rate
- Stripe MRR

Plan v1.1 sprint kickoff after 4 weeks of production data.

**JG4 fix: §16 KPIs require PostHog funnel events — never specified. Without named events, PostHog captures pageviews only and conversion funnels can't be built. Add these PostHog.capture() calls:**
```typescript
// Track these events in the relevant server actions / API routes:
posthog.capture('signup_completed',        { tier: 'free', source: 'organic' });
posthog.capture('sample_audit_completed',  { domain, engine_count: 1 });
posthog.capture('first_audit_triggered',   { tier, brand_count: 1 });
posthog.capture('first_audit_completed',   { tier, score_composite });
posthog.capture('upgrade_clicked',         { from_tier, to_tier, source });
posthog.capture('checkout_completed',      { tier, billing_interval });

// PostHog funnels to configure in dashboard:
// Funnel 1 — Sample-to-signup: sample_audit_completed → signup_completed
// Funnel 2 — Signup-to-first-audit: signup_completed → first_audit_completed
// Funnel 3 — Free-to-paid: signup_completed → checkout_completed (filter tier=paid)
// Dashboard: signups/day (signup_completed count), MRR (Stripe webhook → PostHog revenue)
```

---

## Changelog

- v1.26 (19 May 2026): **Twenty-sixth deep audit — CSP PostHog script-src, annual price amounts, List-Unsubscribe header, CI before cutover, Supabase Sydney region (JX1-JX5).** **(JX1)** §4 vercel.json CSP: *.posthog.com added to script-src — was only in connect-src; PostHog JS SDK loads from app.posthog.com and is blocked by CSP without script-src entry; silently fails to load. **(JX2)** §12 Step 7 Stripe: annual unit_amount calculations specified — PRD §7 16% discount never calculated; Starter A97.92, Growth A014.88, Agency A035.88, Agency Pro A0069.92 annual in AUD cents. **(JX3)** §12 Step 13b cross-sprint: List-Unsubscribe header added to Sprint 2 Resend send call — Gmail/Yahoo require this since Feb 2024 for bulk senders; List-Unsubscribe + List-Unsubscribe-Post RFC 8058. **(JX4)** §10 GoLive PRE-CUTOVER: GitHub Actions CI green check added — TypeScript error causes silent Vercel build failure leaving old deployment live; verify Actions green before DNS switch. **(JX5)** §12 Step 7 Supabase: ap-southeast-2 (Sydney) region specified — CLAUDE.md canonical; JV3 example had wrong ap-southeast-1 (Singapore); correct pooled URL uses aws-0-ap-southeast-2.
- v1.25 (19 May 2026): **Twenty-fifth deep audit — Clerk Organizations toggle, email footer domain, audit trigger rate limit, idempotency table verification, Vercel Analytics conflict (JW1-JW5).** **(JW1)** §12 Step 7 Clerk: Organizations feature enable added as step 2 — without this auth().orgId returns null for all users; VisibleAU multi-tenant model silently fails. **(JW2)** §12 Step 13b cross-sprint: Sprint 2 audit-complete.tsx footer hardcodes visibleau.com.au — JE2 canonical domain is visibleau.com; every production email links wrong TLD; grep lib/email/ and fix. **(JW3)** §4 api/audits: per-org daily rate limit added — DAILY_AUDIT_LIMITS map per tier (free:3, starter:10, growth:50, agency:200, agency_pro:500); Upstash fixedWindow per org.id per day; prevents A200/day runaway LLM costs. **(JW4)** §12 Step 7 migration: processed_webhook_events table verification added — Sprint 10 HJ3 created idempotency table; without it Stripe duplicate webhooks cause double-subscription-creation; verify in Supabase Table Editor after migrate. **(JW5)** §2: Vercel Analytics vs PostHog coexistence decision specified — Vercel auto-injects @vercel/analytics causing pageview double-count with PostHog; Option A disable Vercel Analytics or Option B keep both with filter; check grep before launch.
- v1.24 (19 May 2026): **Twenty-fourth deep audit — Svix webhook verification, Inngest concurrency, Supabase pooled connection, not-found.tsx, instrumentation.ts (JV1-JV5).** **(JV1)** §12 Step 13b: Svix signature verification code body added — Sprint 1 said "verify with svix" but code never shown across all 12 sprints; any attacker can POST fake Clerk events without it; Webhook.verify() pattern with raw body + svix-id/timestamp/signature headers. **(JV2)** §5 audit-data-retention: Inngest concurrency:1 added + note that Sprint 2 run-audit must use step-level parallelisation (not one giant step.run()) to avoid 2-min timeout on 200 LLM calls. **(JV3)** §12 Step 7 DATABASE_URL: Supabase pooled connection string specified — Vercel serverless needs port 6543 pgbouncer string for production DATABASE_URL; port 5432 direct string for drizzle-kit migrate only; without pooling 50 concurrent functions exhaust connection limit. **(JV4)** §14: not-found.tsx verification added — visit /nonexistent-path, verify custom 404 renders not 500. **(JV5)** §14: instrumentation.ts verification added — cat instrumentation.ts | grep sentry/nextjs; without it Sentry never registers on Node.js server runtime; verify server-side errors appear in Sentry dashboard.
- v1.23 (19 May 2026): **Twenty-third deep audit — CLAUDE.md Sprint 12 patterns, Drizzle cascade verification, next-sitemap.config.js, Vercel env scope, og-image GoLive check (JU1-JU5).** **(JU1)** CLAUDE.md: Sprint 12 production patterns added — PostHog App Router init, cookie consent banner, Sentry error capture, public API routes, data retention cron, demo data; Claude Code reads CLAUDE.md before every session. **(JU2)** §5 audit-data-retention: Drizzle cascade delete verification added — if citations.auditId has onDelete:cascade, explicit citations delete is redundant; if not, order matters for FK constraint; grep db/schema.ts to verify before writing cron. **(JU3)** §4: next-sitemap.config.js added — postbuild:next-sitemap in package.json but no config; without it /dashboard /settings /launch /api/* all included in sitemap; canonical config with exclude patterns + robotsTxtOptions. **(JU4)** §3: Vercel environment scope specified for all 30+ vars — live Stripe/Clerk keys must be Production-only; never All Environments; Preview can use staging keys. **(JU5)** §10 GoLive: og-image verification added to pre-cutover checklist — Sprint 11 IJ3 requires 1200×630px public/og-image.png; missing = broken social share images on launch day.
- v1.22 (19 May 2026): **Twenty-second deep audit — load test session cookie, Stripe Customer Portal, Supabase Pro upgrade, Google AI Studio vs Vertex AI, build verification (JT1-JT5).** **(JT1)** §7 load test: TEST_SESSION_COOKIE acquisition specified — Clerk JWTs cannot be mocked; must copy __session cookie from browser DevTools after signing in to staging; expires every 24h; TEST_BRAND_ID from Supabase brands table. **(JT2)** §12 Step 7 Stripe: Customer Portal production configuration added — Sprint 10 /api/billing/portal throws without this; Stripe dashboard → Settings → Billing → Customer Portal → configure plan changes + return URL. **(JT3)** §10 GoLive: Supabase Pro upgrade added to pre-cutover checklist — ~US5/mo; required for PITR (JE5 backup drill impossible on free tier); PITR tab does not appear without Pro. **(JT4)** §3: GOOGLE_GENERATIVE_AI_API_KEY clarified — @ai-sdk/google uses Google AI Studio keys (AIza...) not Vertex AI; completely different auth systems; aistudio.google.com. **(JT5)** §10 GoLive CUTOVER: production build verification added — NODE_ENV=production pnpm build must pass before DNS switch; TypeScript errors cause silent Vercel build failures leaving old deployment live.
- v1.21 (18 May 2026): **Twenty-first deep audit — LLM API keys in §3, Inngest staging env, badge rate limiting, DNS TTL in GoLive, hydration error check (JS1-JS5).** **(JS1)** §3: 4 LLM API keys added (OPENAI_API_KEY/ANTHROPIC_API_KEY/GOOGLE_GENERATIVE_AI_API_KEY/PERPLEXITY_API_KEY) — the most critical product keys; listed in §8 rotation but absent from §3. **(JS2)** §12 Step 3: Inngest staging environment setup specified — staging needs its own Inngest Cloud environment synced to staging URL; without it load test events contaminate dev/prod queue. **(JS3)** §4 badge route: Upstash rate limit added — slidingWindow(100, 1h) per IP before getLatestScore() call; badge is fully public and could be abused without limiting. **(JS4)** §10 GoLive: DNS TTL 300s reduction added to PRE-CUTOVER checklist — JE2 specified it in Step 7 prose but it was never in the checklist; without it rollback takes 24h not 5 min. **(JS5)** §10 GoLive CUTOVER: browser console hydration error check added — Next.js hydration errors are silent in production but indicate broken UI; check DevTools Console before announcing launch.
- v1.20 (18 May 2026): **Twentieth deep audit — Supabase Storage buckets, RESEND_FROM_EMAIL, Sentry integrations, public status page, RLS migration verification (JR1-JR5).** **(JR1)** §12 Step 7: Supabase Storage bucket creation added — logos (public) + reports (private) buckets with RLS; Sprint 9 logo uploads fail without logos bucket in production. **(JR2)** §12 Step 7 + §3: Resend FROM_EMAIL corrected to RESEND_FROM_EMAIL (Sprint 2 uses this var name) + RESEND_API_KEY and RESEND_FROM_EMAIL=noreply@visibleau.com added to §3. **(JR3)** §6 sentry.server.config.ts: integrations array added — httpIntegration() captures request context; nativeNodeFetchIntegration() captures outbound LLM API call errors. **(JR4)** §6 uptime: public status page added — Better Uptime/Cronitor hosted status page at status.visibleau.com; CNAME required; footer.tsx href update; Sprint 12 prototype footer links to it. **(JR5)** §12 Step 7: RLS migration verification added — RLS in migrations = automatic; RLS applied via dashboard = manual re-apply needed; cross-org isolation test specified.
- v1.19 (18 May 2026): **Nineteenth deep audit — key rotation ordering, getLatestScore, DEMO_MODE prod guard, churned account cleanup, PostHog layout.tsx (JQ1-JQ5).** **(JQ1)** §12 Step 4: key rotation removed — contradicts §15 anti-pattern; Step 4 only generates new keys (do not revoke yet); revocation happens in Step 7 after production deployment is live. **(JQ2)** §4 badge route: getLatestScore() specified — service role key bypasses RLS for public domain query; returns null for unknown domains (shows No data badge not error). **(JQ3)** §4 demo route: NODE_ENV production guard added — returns 404 in production regardless of DEMO_MODE; prevents accidental demo org creation in production DB. **(JQ4)** §5 audit-data-retention: churned account cleanup step added — organizations/brands from cancelled accounts deleted after 13 months; APP 11 compliance; 30-day deletion warning email via Resend. **(JQ5)** §3 PostHog: layout.tsx integration specified — PHProvider wraps body; PostHogPageView inside Suspense inside PHProvider; CookieConsentBanner also mounted inside PHProvider.
- v1.18 (18 May 2026): **Eighteenth deep audit — middleware publicRoutes, one-off payment webhook, Sentry Vercel integration, marketing docs content, §13 test expansion (JP1-JP5).** **(JP1)** §12 Step 7: middleware.ts publicRoutes update specified — /api/health /api/badge /api/demo must be public or Clerk returns 401; uptime monitor fires immediately without this fix. **(JP2)** §3 after STRIPE_PRICE_ONE_OFF_AUDIT: one-off mode:payment vs subscription webhook conflict flagged — Sprint 10 webhook returns early for non-subscription; one-off payments silently ignored without separate handler branch. **(JP3)** §12 Step 1: Sentry Vercel integration step added — free 2-click setup in Sentry dashboard; provides automatic release tracking and deployment markers linked to git commits. **(JP4)** §12 Step 8: marketing docs content structure specified — ProductHunt (tagline/description/maker comment/tags), IndieHackers (title/sections/tone), AU community (week 1-2 rollout/channel-specific messaging). **(JP5)** §13: expanded from 4 to 14 tests — cookie banner, data retention cron, badge route, LaunchReadiness, cross-sprint mods, Privacy/ToS pages, one-off checkout, npm packages visible.
- v1.17 (18 May 2026): **Seventeenth deep audit — ToS 9 sections, STRIPE_PRICE env vars, cookie banner body, cross-sprint mods step, launch announcement reorder (JO1-JO5).** **(JO1)** §9 ToS: 9 minimum sections enumerated — service description, eligibility, payment terms, acceptable use, IP ownership, disclaimer (ACL §64A), liability cap (12mo fees), termination, NSW governing law. **(JO2)** §3: 9 STRIPE_PRICE_* env vars added (starter/growth/agency/agency-pro monthly+annual + one-off audit price_...) — JE1 said copy them but they were never in §3. **(JO3)** §4 cookie-consent-banner.tsx: shadcn-style body specified — localStorage consent state, Accept/Decline buttons, PostHog opt-out on decline, link to /privacy#cookies, mounts in both marketing and auth layouts. **(JO4)** §12 Step 13b: cross-sprint file modifications step added — 6 files owned by Sprints 1-11 that Sprint 12 must update (feature-flags, inngest/index.ts, dashboard/page.tsx, DashboardView, PricingCard, error.tsx). **(JO5)** §10 GoLive CUTOVER: tweet/post announcement moved AFTER all verification items + /api/health check added — was announcing before verifying which would launch broken product to public.
- v1.16 (18 May 2026): **Fifteenth deep audit — edge config body, PostHogPageView, env var example file, 8 APP sections, unsafe-inline acknowledged (JN1-JN5).** **(JN1)** §4 sentry.edge.config.ts: minimal body specified — NEXT_PUBLIC_SENTRY_DSN + tracesSampleRate only; no complex hooks; captures middleware/Clerk auth errors. **(JN2)** §3: PostHogPageView component specified — usePathname+useSearchParams captures pageviews on route change; Suspense wrapper required; complementary to PHProvider. **(JN3)** §4: .env.production.example added — 30+ vars now in §3; canonical reference file for Vercel env var setup; committed to repo with placeholder values. **(JN4)** §9 Privacy Policy: 8 minimum APP-required sections enumerated (APP 3 collection, APP 6 use/disclosure, APP 8 overseas, APP 11 retention, APP 12/13 rights, APP 1 complaints) with specific VisibleAU content. **(JN5)** §15: CSP unsafe-inline acknowledged as accepted v1 risk — React escaping + security-scan mitigates; v1.1 nonce-based CSP plan documented.
- v1.15 (18 May 2026): **Fourteenth deep audit — Sentry client config, next.config images, cron schedule map, PostHog App Router init, demo seeder spec (JM1-JM5).** **(JM1)** §6: sentry.client.config.ts body added — NEXT_PUBLIC_SENTRY_DSN, replay integrations at 1%/100% sample rates, maskAllText for GDPR. **(JM2)** §4 next.config.ts: images.remotePatterns added — *.supabase.co/storage/v1/object/** + img.clerk.com; without these next/image throws Invalid src errors. **(JM3)** §5 audit-data-retention cron: schedule map documented — Sprint 10 daily 03:00 + Sprint 12 Sunday 04:00 = 1h gap, safe, no conflict. **(JM4)** §3: PostHog App Router provider pattern specified — PHProvider client component with posthog.init() in useEffect; mount in app/layout.tsx; pnpm add posthog-js added to §2. **(JM5)** §4 demo route: demo seeder implementation specified — scripts/seed-demo-data.ts with Drizzle inserts for 3 workspaces (tradies/allied-health/saas); ensureSampleOrg() is for sample audits only, not demo workspaces.
- v1.14 (18 May 2026): **Twelfth deep audit — error.tsx Sentry, drizzle-kit migrate prod, security-scan body, backup-restore body, demo mode anti-pattern (JL1-JL5).** **(JL1)** §4 error.tsx + global-error.tsx: Sentry.captureException wiring specified — useEffect([error]) pattern for both; global-error.tsx must include html/body wrapper. **(JL2)** §12 Step 7: drizzle-kit migrate against production DATABASE_URL added — new Supabase project starts empty; without migration app crashes on first request. **(JL3)** §4 security-scan.ts: full script body specified — pnpm audit, git history .env check, dangerouslySetInnerHTML grep, hardcoded secrets regex, Stripe webhook signature verification. **(JL4)** §4 backup-restore-test.ts: full script body specified — table existence + row counts, RLS sanity, foreign key orphan check, most recent audit timestamp. **(JL5)** §1 demo mode: PRD §8.5 anti-pattern guard added — demo data must only include shipped features (Sprints 1-11); v1.1-deferred features (AI Overviews, UK region) must not appear in demo workspace.
- v1.13 (18 May 2026): **Eleventh deep audit — Steps 13-15 for §4 files, STRIPE_WEBHOOK_SECRET, package.json scripts, 5 missing acceptance criteria, load test LLM cost bug (JK1-JK5).** **(JK1)** §12: Steps 13-15 added covering 8 new §4 files (health/badge/demo routes, launch page, data-retention cron, soc2-kickoff, npm packages, LaunchReadiness verification). **(JK2)** §3: STRIPE_WEBHOOK_SECRET added — Sprint 10 HL4 had it but Sprint 12 §3 omitted it; production webhook signature verification fails without it. **(JK3)** §2: package.json scripts block specified (stripe:setup, load:audits, load:dashboard, backup:test, security:scan, postbuild) + pnpm add -D autocannon tsx added. **(JK4)** §14: 5 acceptance criteria added — data-retention cron registered, /api/badge smoke test, /api/demo mode gate, npm packages on npmjs.com, launch dashboard accessible. **(JK5)** §7 load test: CRITICAL bug — 50 concurrent audits would trigger 10,000 real LLM calls (~A25). Corrected to test HTTP trigger layer only with LLM_MODE=mock in staging; full annotated autocannon script provided.
- v1.12 (18 May 2026): **Tenth deep audit — GoLive gaps, ops runbook content, CORS badge, www redirect, LaunchReadiness items (JJ1-JJ5).** **(JJ1)** §10 GoLive: 5 missing checklist items added (PostHog prod key, Upstash prod DB, Supabase prod verified, npm packages published, Inngest registration in CUTOVER section after DNS live). **(JJ2)** §12 Step 10: ops runbook actual content specified for all 5 sections — Sentry rollback flow, Supabase pooler fix, LLM disable + status pages, Stripe webhook resend, Inngest queue cancel. **(JJ3)** §4 badge route: Access-Control-Allow-Origin: * added — badge API is for external embedding; CORS required for JS fetch from other domains. **(JJ4)** §4 next.config.ts: www.visibleau.com → visibleau.com redirect added via redirects() async function; Vercel Domains panel is preferred but next.config is fallback. **(JJ5)** §4 launch/page.tsx: LaunchReadinessDashboard content specified — 4 sections (Engineering/Product/Marketing/Legal) with 17 specific items from prototype; high-priority gate for Go Live button; status in org.metadata.launchChecklist.
- v1.11 (18 May 2026): **Ninth deep audit — beta cohort ops, Stripe tax verification, Upstash prod DB, withSentryConfig options, domain redirect method (JI1-JI5).** **(JI1)** §1: beta cohort operational plan specified — LinkedIn DM + FB contacts for recruitment; staging URL; Loom walkthrough; Typeform feedback; blocking vs non-blocking issue triage. **(JI2)** §12 Step 7 Stripe: tax_behavior:inclusive verification added — Sprint 1 setup script predates HG1 CRITICAL fix; must confirm inclusive GST before production prices created. **(JI3)** §3 Upstash: production database creation specified — dev database pollutes rate-limit state for real users; create separate visibleau-production DB in ap-southeast-1 region. **(JI4)** §12 Step 1 withSentryConfig: options block specified — hideSourceMaps:true (CRITICAL, prevents server code exposure), widenClientFileUpload, disableLogger, automaticVercelMonitors. **(JI5)** §12 Step 7 domain: visibleau.com.au redirect implementation — Vercel Domains panel adds .com.au with 301 redirect to .com; preserves paths + HTTPS; verified with curl.
- v1.10 (18 May 2026): **Eighth deep audit — CSP prod domain, Supabase env vars, AU community plan, data retention cron, Vercel Pro upgrade (JH1-JH5).** **(JH1)** §4 vercel.json CSP: *.clerk.accounts.dev replaced with accounts.visibleau.com + api.clerk.com — dev domain blocks production Clerk; custom domain from JG1 requires this correction. **(JH2)** §3: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY added — both change on new production Supabase project; missing = frontend reads wrong database. **(JH3)** §11 AU communities: r/AusFinance (Rule 7 bans promo, permanent ban risk), r/smallbusiness (US-focused), r/Sydney (social) replaced with: LinkedIn personal post, r/AusTechProfessionals, HN Show HN, AU Facebook SMB groups, IndieHackers, Startmates AU Slack. **(JH4)** §5: audit-data-retention Inngest cron added — weekly Sunday 04:00 UTC, deletes completed audits + citations older than 12 months; enforces §9 Privacy Policy retention claim; Sprint 10 HB4 only covers sample audits. **(JH5)** §10 GoLive: Vercel Pro upgrade step added — ~US0/mo, must happen before production deployment (60s timeout vs Hobby 10s); vercel.com → Settings → Billing → Upgrade.
- v1.9 (18 May 2026): **Seventh deep audit — Clerk production setup, Resend domain verification, ATTRIBUTIONS Sprint 12 entries, PostHog KPI events, LaunchReadinessDashboard (JG1-JG5).** **(JG1)** §12 Step 7: Clerk production 7-step setup specified — pk_live_ + sk_live_ keys, production app creation, accounts.visibleau.com CNAME, new webhook endpoint + CLERK_WEBHOOK_SECRET. **(JG2)** §12 Step 7 + GoLive: Resend domain verification added — SPF + DKIM DNS records required before emails send from noreply@visibleau.com; can be done before DNS cutover; GoLive checklist updated. **(JG3)** §12 Step 11: Sprint 12 ATTRIBUTIONS entries specified per PRD §16 content matrix — npm package attributions for wilson-ci-scorer/llms-txt-generator + final cross-check checklist including SCORING_RUBRIC.md publish. **(JG4)** §16 KPIs: PostHog event names specified (signup_completed, sample_audit_completed, first_audit_triggered/completed, upgrade_clicked, checkout_completed) + 3 funnel configs in PostHog dashboard. **(JG5)** §4 + §12: LaunchReadinessDashboard added — prototype notes Sprint 12 ships it; added to §4 as app/(auth)/launch/page.tsx (auth-gated, Sri-only internal tool).
- v1.8 (18 May 2026): **Sixth deep audit — npm OSS publish, Inngest URL registration, APP 8 cross-border, SOC 2 docs, vercel.json maxDuration (JF1-JF5).** **(JF1)** §1 + §4: npm publish for @visibleau/wilson-ci-scorer + @visibleau/llms-txt-generator added — PRD §16 schedules both at v1 launch; package.json configs + publish steps specified; packages/ directory added; Step 13 added to Claude Code prompt. **(JF2)** §12 Step 7: Inngest production URL registration step added — without syncing https://visibleau.com/api/inngest in Inngest dashboard, all production jobs queue indefinitely; must happen AFTER DNS cutover. **(JF3)** §9 Privacy Policy: APP 8 cross-border disclosure requirement specified — Termly AU template misses this; must explicitly name OpenAI/Anthropic/Google/Perplexity as US-based recipients not bound by Australian Privacy Act. **(JF4)** §4 docs/ + §14: soc2-kickoff.md added to project structure and acceptance criteria — was in §1 Definition of Done but absent from §4 and §14; Vanta vs Drata comparison + control inventory template. **(JF5)** §4 vercel.json: functions key added with maxDuration for inngest/audits/badge routes — Vercel Hobby 10s timeout breaks Inngest ACK; Vercel Pro 60s sufficient; note to upgrade from Hobby before launch.
- v1.7 (18 May 2026): **Fifth deep audit — Stripe env key switch, domain TLD conflict, source maps CI fiction, ProductHunt image specs, Supabase PITR procedure (JE1-JE5).** **(JE1)** §12 Step 7: Stripe setup script must use LIVE key explicitly (sk_live_...) — running with test key creates products in test mode; 5-step procedure specified including price ID capture and webhook endpoint registration. **(JE2)** §10 + §12 Step 7: domain TLD conflict resolved — visibleau.com (primary, Sprint 11 SEO) vs visibleau.com.au (PRD §16 badge URLs); register both, redirect .com.au → .com; 5-step DNS preparation with TTL 300s for fast rollback. **(JE3)** §12 Step 1: "CI step" for source maps removed — withSentryConfig uploads source maps during pnpm build automatically; SENTRY_AUTH_TOKEN as Vercel env var is sufficient; no GitHub Actions workflow needed. **(JE4)** §11 ProductHunt: image specs added — gallery 1270×952px PNG/JPG 2MB max, logo 240×240px; 6 recommended screens listed; upload to draft before launch day. **(JE5)** §12 Step 5: Supabase PITR procedure specified — dashboard-only operation (cannot be scripted); restores to NEW project; backup-restore-test.ts verifies AFTER restore; delete temp project after; target <30 min restore time.
- v1.6 (18 May 2026): **Fourth deep audit — k6 TS runtime, Drizzle index syntax, Slack+engine flags, staged rotation procedure, solo incident-response (JD1-JD5).** **(JD1)** §4 + §7: k6 does not run TypeScript natively — switched to autocannon + tsx; pnpm add -D autocannon tsx; example script provided. **(JD2)** §5: Drizzle index() syntax specified — pgTable third argument with index() calls; drizzle-kit generate + migrate steps; EXPLAIN ANALYZE verification query. **(JD3)** §6 alerts: Slack webhook setup steps added (Sentry integration); LLM engine-disable env vars added (LLM_ENGINE_*_ENABLED) + lib/feature-flags isEngineEnabled() function. **(JD4)** §15: staged key rotation 6-step procedure specified — dual-key for Stripe, ~30s window for others, 2am AEST Sunday timing. **(JD5)** §4 incident-response.md: solo founder spec — P0/P1/P2/P3 severity levels, 7-step solo response checklist, external support contacts (no internal escalation).
- v1.5 (18 May 2026): **Third deep audit — missing secrets, PII scrub scope, vercel.json body, cookie policy route, monitoring plan acceptance (JC1-JC5).** **(JC1)** §8 + §3: 5 missing secrets added to rotation list (Supabase service role, Inngest signing/event keys, PostHog, Upstash Redis) + added to §3 env vars with sourcing instructions. **(JC2)** §6 Sentry beforeSend: expanded from email-only scrub to cover IP, username, domain query param, and extra context keys (brandName/domain/organizationId) per AU Privacy Act 1988 APP 6. **(JC3)** §4 vercel.json: body specified — regions syd1, HSTS/X-Frame/X-Content-Type/Referrer/Permissions/CSP headers; CSP nonce hardening deferred to v1.1. **(JC4)** §9: Cookie Policy route conflict resolved — v1 canonical = merge cookies section into /privacy#cookies; v1.1 option = separate /cookie-policy page; banner links to /privacy#cookies. **(JC5)** §14: post-launch monitoring plan acceptance criterion added — ops-runbook.md must contain monitoring schedule before sprint passes.
- v1.4 (18 May 2026): **Second deep audit — §14 EU acceptance, abandoned cookie package, duplicate text, badge+demo in §4, beta cohort in GoLive (JB1-JB5).** **(JB1)** §14: cookie acceptance criterion fixed — was still "shows on EU routes" (JA3 fixed §9/Step6 but missed §14). Now: "shows on first visit for all visitors". **(JB2)** §2: cookie-consent package replaced — npm package abandoned since 2015; recommended custom shadcn Dialog (v1) or react-cookie-consent. **(JB3)** §12 Step 7: duplicate "(separate from staging)" removed — left by JA1 mechanical string replace. **(JB4)** §4: app/api/badge/route.ts + app/api/demo/route.ts added — JA5 added both to §1 but §4 (what Claude Code uses to create files) had neither. **(JB5)** §10 GoLive: beta cohort sign-off added to PRE-CUTOVER checklist — 5-10 customers must run audits and blocking issues fixed BEFORE DNS cutover; was in Definition of Done but not in the checklist Claude Code walks through.
- v1.3 (18 May 2026): **First deep audit — Vercel Postgres survivors, /api/health missing, cookie EU fiction, instrumentation.ts wizard vs manual, PRD §16 deliverables absent (JA1-JA5).** **(JA1)** §12 Step 5 + Step 7: 2 surviving "Vercel Postgres" replaced with "Supabase Postgres" — v1.1 changelog said "updated throughout" but 2 instances survived. **(JA2)** §4 + §6: /api/health route specified — uptime monitor hitting nonexistent route would fire 404 alerts from day 1; route checks Supabase DB and returns 200/503. **(JA3)** §9 + §14: Cookie banner "EU routes (/eu/*)" fiction removed — no /eu/* routes exist in any sprint; GDPR applies to all EU visitors regardless of URL; v1 = show banner to all visitors. **(JA4)** §4: instrumentation.ts marked as wizard-created — Sentry wizard creates it automatically alongside sentry.*.config.ts; manual creation would duplicate. **(JA5)** §1: PRD §16 Sprint 12 deliverables added — Dynamic README badge generator (1 day) + Demo data mode (2 days) were explicitly listed in PRD §16 as "Sprint 12 (launch)" but absent from Sprint 12 entirely.
- v1.2 (13 May 2026): **Second-pass-fix audit N11.** Broken PRD §18 reference fixed — PRD only has §1-§16 + Appendices A/B/C. §0 read-first list now references PRD §11 Sprint 12 (deliverables) + §10 Security baseline (SOC 2 timeline + APP/GDPR). PRD doc reference bumped to v1.15.
- v1.1 (12 May 2026): Conflict-resolution fixes per audit L10 + L11 + stack alignment. Added **beta cohort with 5-10 friendly customers** per PRD §11 Sprint 12 (was missing). Added **SOC 2 Type 1 kickoff plan** per PRD §10 Security baseline (was missing). Stack reference updated: Vercel Postgres → Supabase Postgres throughout (matches CLAUDE.md v1.2 + Sprint 1 v1.1).
- v1.0 (12 May 2026): Initial. Net-new sprint prompt.
