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
- ✓ **SOC 2 Type 1 kickoff plan** per PRD §10 Security baseline — "SOC 2 Type 1 by month 12 (Type 2 by month 18, required for enterprise tier)". Sprint 12 plans the kickoff (Vanta or Drata vendor selection, scope document, initial control inventory). Audit itself runs months 6-12 post-launch.
- ✓ Pre-launch marketing: ProductHunt assets, IndieHackers post draft, AU community plan
- ✓ GoLive checklist: 30+ item walkthrough before flipping DNS
- ✓ Internal documentation: ops runbook (what to do when X breaks)

**Definition of done:** Product is live at visibleau.com. Sentry receives events. Backup restored successfully in a test. 5-10 beta customers have run 1-2 audits each and any blocking issues are fixed. SOC 2 Type 1 vendor selected + kickoff plan documented. ProductHunt scheduled launch is ready to fire. Sri has an ops runbook he can follow at 2am when something breaks.

---

## 2. Dependencies to install

```bash
# Monitoring
pnpm add @sentry/nextjs

# Cookie consent (only if not handled by Clerk/Stripe checkout)
pnpm add cookie-consent  # or build custom; lightweight either way
```

---

## 3. Environment variables

```bash
# Sentry
SENTRY_DSN=https://...
SENTRY_AUTH_TOKEN=...  # for source map uploads
SENTRY_ORG=visibleau
SENTRY_PROJECT=visibleau-web
NEXT_PUBLIC_SENTRY_DSN=https://...

# Production
NEXT_PUBLIC_APP_URL=https://visibleau.com
NODE_ENV=production
LLM_MODE=real  # production uses real LLMs
```

---

## 4. Project structure additions

```
sentry.client.config.ts                   # Sentry browser
sentry.server.config.ts                   # Sentry server
sentry.edge.config.ts                     # Sentry edge runtime
instrumentation.ts                        # Next.js 15 instrumentation

scripts/
├── load-test/
│   ├── audit-concurrency.ts              # k6 or autocannon script
│   └── dashboard-load.ts
├── backup-restore-test.ts                # Postgres restore drill
└── security-scan.ts                      # pnpm audit + custom checks

docs/
├── ops-runbook.md                        # "When X breaks, do Y"
├── golive-checklist.md                   # 30+ items
├── incident-response.md                  # Roles + escalation
└── marketing/
    ├── producthunt-launch.md             # Assets + copy
    ├── indiehackers-post-draft.md
    └── au-community-rollout.md           # Reddit r/AusFinance, FB groups, etc.

app/
├── error.tsx                             # ENHANCED — Sentry capture
├── global-error.tsx                      # Top-level error boundary

components/domain/
├── shared/
│   └── cookie-consent-banner.tsx
└── legal/
    └── privacy-policy-content.tsx        # JSX version of privacy policy

ATTRIBUTIONS.md                           # FINAL entries

next.config.ts                            # Sentry wrapped
vercel.json                               # Production config
```

---

## 5. Database schema

No new tables. Sprint 12 verifies existing schema is production-ready.

Verify: all `FOREIGN KEY` constraints set, indexes on hot columns (`audits.brandId`, `audits.createdAt`, `citations.auditId`, etc.). Run `EXPLAIN ANALYZE` on common queries; add indexes where missing.

---

## 6. Monitoring + alerting

### Sentry setup

```typescript
// sentry.server.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,  // 10% of transactions
  beforeSend(event) {
    // Scrub PII
    if (event.user) delete event.user.email;
    return event;
  },
});
```

### Alert rules (configured in Sentry dashboard)

- Error rate >5/minute → email + Slack
- Audit job failure rate >10% in 1h → email
- Stripe webhook 4xx/5xx >3 in 5min → email
- LLM API error rate >25% per engine in 1h → email + investigate
- Postgres connection failures >0 → page

### Uptime monitoring (Vercel + external)

- Better Uptime / Cronitor hitting `/api/health` every minute
- Alert on 2+ consecutive failures

---

## 7. Load testing

`scripts/load-test/audit-concurrency.ts`:

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

- **Privacy Policy** — Australian Privacy Principles compliant. Cover: data collection, retention (audit results retained 12 months), third-party processors (Clerk, Stripe, OpenAI, etc.), user rights (access, deletion).
- **Terms of Service** — service description, payment terms, acceptable use, liability disclaimer, governing law (AU jurisdiction).
- **Cookie Policy** — what cookies, why, opt-out instructions.
- **Cookie consent banner** — required if EU users access (which they do via `/eu` region).

Source from template + legal review. Don't ship without privacy policy.

---

## 10. GoLive checklist

`docs/golive-checklist.md` — 30+ items walked through immediately before DNS cutover:

```
PRE-CUTOVER (T-1 day):
[ ] All Sentry config in production
[ ] All env vars set in Vercel production
[ ] Stripe in production mode (separate from test mode)
[ ] Stripe webhook endpoint registered (production URL)
[ ] Clerk webhook endpoint registered (production URL)
[ ] DNS records prepared but not switched
[ ] Backup verified within last 24h
[ ] Load test passed within last week
[ ] Security audit complete
[ ] Privacy + Terms live at /privacy and /terms
[ ] ProductHunt launch scheduled
[ ] IndieHackers post drafted

CUTOVER (T-0):
[ ] Run final smoke test on staging
[ ] Switch DNS A/CNAME to Vercel production
[ ] Verify SSL provisioning (Vercel auto)
[ ] Run signup flow against production
[ ] Run sample audit against production
[ ] Verify Stripe checkout end-to-end
[ ] Verify Clerk webhook fires
[ ] Verify Sentry receives events
[ ] Tweet/post launch announcement

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
- Maker comment: Sri introduces himself + why he built this
- Launch day: Tuesday-Thursday best (avoid Monday/Friday)

### IndieHackers

- `docs/marketing/indiehackers-post-draft.md`
- Format: "I just launched VisibleAU" — what it does, MRR plan, lessons learned
- Honest framing: solo founder, AU-first niche, why AU SMBs specifically

### AU communities

- Reddit r/AusFinance (subtle), r/smallbusiness, r/Sydney
- Facebook groups: AU SMB groups (with care — many are anti-promotion)
- LinkedIn: 1 personal post from Sri's profile
- IndieHackers AU meetup mention

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
   - Wrap next.config.ts with withSentryConfig
   - Configure source map upload (CI step)
   - Test: throw an error in a route, verify Sentry receives

2. ALERTING
   - Configure alert rules in Sentry dashboard per §6
   - Set up Better Uptime / Cronitor hitting /api/health
   - Test: take staging DB offline, verify alert fires

3. LOAD TESTING
   - scripts/load-test/* per §7
   - Run against staging environment
   - Document results in docs/load-test-results.md
   - Fix any p95 regressions (likely Drizzle query optimization, Inngest concurrency limits)

4. SECURITY AUDIT
   - Run pnpm audit and fix high/critical
   - Walk through §8 checklist
   - Document in docs/security-review.md
   - Rotate all API keys (Clerk, Stripe, etc.) — fresh keys for production

5. BACKUP DRILL
   - Restore Vercel Postgres backup to a temporary DB
   - Verify data integrity
   - Document the procedure in docs/ops-runbook.md

6. LEGAL DOCS
   - Privacy policy: use Termly or similar template; Sri customizes
   - Terms of service: same
   - Cookie consent banner: components/domain/shared/cookie-consent-banner.tsx
   - Make sure cookie banner shows on EU routes (/eu/*)

7. PRODUCTION DEPLOYMENT
   - Vercel project: production env vars set
   - Vercel Postgres: production database provisioned (separate from staging)
   - Stripe: switch to production mode, run setup-stripe-products.ts against prod
   - Clerk: production instance, webhook URL updated
   - DNS records prepared (do NOT switch yet)

8. PRE-LAUNCH MARKETING ASSETS
   - docs/marketing/producthunt-launch.md (Sri authors the content)
   - docs/marketing/indiehackers-post-draft.md
   - docs/marketing/au-community-rollout.md
   - Schedule ProductHunt launch for a Tuesday-Thursday

9. GOLIVE CHECKLIST
   - docs/golive-checklist.md per §10
   - Walk through with Sri before DNS cutover

10. OPS RUNBOOK
    - docs/ops-runbook.md with sections for:
      - Sentry alert response
      - Database connection issues
      - LLM API outages (which engine to disable in feature flags)
      - Stripe webhook backlog
      - High audit failure rate

11. FINAL ATTRIBUTIONS.md
    - Last entries per Sprint 12 touchpoints
    - All sprints' contributions consolidated

12. POST-LAUNCH MONITORING PLAN
    - Day 1: Sri watches Sentry every 30min
    - Week 1: daily Sentry digest + Vercel metrics review
    - Month 1: weekly KPI review (signups, first-audit completion, conversion)

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

---

## 14. Acceptance criteria

- [ ] Sentry receives errors from production
- [ ] Uptime monitoring active with alerting
- [ ] Backup restored successfully in drill
- [ ] Load test results within targets
- [ ] Security audit complete, no high/critical
- [ ] Privacy + Terms live at /privacy and /terms
- [ ] Cookie consent banner shows on EU routes
- [ ] Production DNS prepared (not yet cut over)
- [ ] GoLive checklist walked through
- [ ] Ops runbook readable + accurate
- [ ] ProductHunt launch scheduled
- [ ] ATTRIBUTIONS.md final

---

## 15. Common pitfalls / Sprint 12 anti-patterns

- **Do not** launch without Sentry. Production without monitoring is gambling.
- **Do not** skip the backup drill. The drill is the only thing that verifies your backup actually works.
- **Do not** rotate keys without rolling deployment. Stage the rotation.
- **Do not** ship privacy policy without legal review if possible. Acceptable minimum: Termly template + Sri customization. Recommended: lawyer review for ~A$300-500.
- **Do not** launch on a Friday. Weekday launches mean you can respond during business hours.
- **Do not** announce launch publicly before verifying production is stable for 24+ hours.

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

---

## Changelog

- v1.2 (13 May 2026): **Second-pass-fix audit N11.** Broken PRD §18 reference fixed — PRD only has §1-§16 + Appendices A/B/C. §0 read-first list now references PRD §11 Sprint 12 (deliverables) + §10 Security baseline (SOC 2 timeline + APP/GDPR). PRD doc reference bumped to v1.15.
- v1.1 (12 May 2026): Conflict-resolution fixes per audit L10 + L11 + stack alignment. Added **beta cohort with 5-10 friendly customers** per PRD §11 Sprint 12 (was missing). Added **SOC 2 Type 1 kickoff plan** per PRD §10 Security baseline (was missing). Stack reference updated: Vercel Postgres → Supabase Postgres throughout (matches CLAUDE.md v1.2 + Sprint 1 v1.1).
- v1.0 (12 May 2026): Initial. Net-new sprint prompt.
