# VisibleAU — Security Review (OWASP Top 10)

## A01:2021 — Broken Access Control
- [x] All protected routes check `currentUser.organizationId` server-side
- [x] Cross-org access returns 404, not 401 (prevents resource enumeration)
- [x] Supabase RLS policies enforce org-level isolation at DB layer
- [x] API routes mirror page routes with same auth check pattern

## A02:2021 — Cryptographic Failures
- [x] All data encrypted in transit (HSTS header, TLS via Vercel)
- [x] Data encrypted at rest (Supabase Pro AES-256)
- [x] No sensitive data in URL parameters (except domain in badge API — public info)
- [x] Stripe handles all payment card data (PCI DSS Level 1)

## A03:2021 — Injection
- [x] SQL injection: Drizzle ORM uses parameterised queries throughout
- [x] XSS: React escapes all output by default
- [x] No `dangerouslySetInnerHTML` usage (verified by security-scan.ts)
- [x] CSP header restricts script sources

## A04:2021 — Insecure Design
- [x] Rate limiting on sample audit endpoint (Upstash)
- [x] Rate limiting on badge API (100 req/hr/IP)
- [x] Audit cost controls prevent runaway LLM spend (tier-based limits)

## A05:2021 — Security Misconfiguration
- [x] Source maps hidden in production (hideSourceMaps: true in Sentry config)
- [x] Security headers set (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, CSP)
- [x] `.env.local` not in git history (verified by security-scan.ts)
- [x] Demo mode blocked in production (NODE_ENV guard)
- [ ] Known: CSP uses `unsafe-inline` for scripts — accepted risk for v1 (see Sprint 12 §15 JN5)

## A06:2021 — Vulnerable and Outdated Components
- [x] `pnpm audit` runs as part of security:scan script
- [ ] Automated: run `pnpm audit` in CI on every PR

## A07:2021 — Identification and Authentication Failures
- [x] Auth handled by Better Auth (session management, password hashing)
- [x] Webhook signatures verified (Stripe: constructEvent, Clerk: Svix)
- [x] Session cookies use SameSite attribute

## A08:2021 — Software and Data Integrity Failures
- [x] Stripe webhook signature verification prevents forged events
- [x] Clerk webhook Svix signature verification
- [x] Dependencies locked via pnpm-lock.yaml

## A09:2021 — Security Logging and Monitoring Failures
- [x] Sentry captures all server and client errors
- [x] PII scrubbed from Sentry events (email, IP, domain, org ID)
- [x] Uptime monitoring via external service (Better Uptime/Cronitor)
- [x] Alert rules configured for error spikes, audit failures, webhook failures

## A10:2021 — Server-Side Request Forgery (SSRF)
- [x] No user-controlled URLs used in server-side fetch (LLM calls use fixed provider endpoints)
- [x] Badge API only queries internal DB by domain string (no URL fetching)
