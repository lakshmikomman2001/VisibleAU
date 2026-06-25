# VisibleAU — External Services & Subscriptions Guide

**Last updated:** June 2026
**Scope:** All 12 sprints, local development through production launch

---

## The short answer

You can build and fully test all 12 sprints for **zero dollars**.
The only money needed is ~A$70/month, and only when you go live.

---

## Service-by-sprint reference

| Service | First needed | Cost to test | Production cost | Notes |
|---------|-------------|-------------|----------------|-------|
| PostgreSQL | Sprint 1 | Free | Free (local) | Already running locally |
| Stripe | Sprint 1 | Free | Free (test mode) | Use `sk_test_...` keys throughout dev |
| PostHog | Sprint 1 | Free | Free | Free tier = 1M events/month |
| LLM APIs | Sprint 2 | Free | ~US$3–4/audit | `LLM_MODE=mock` bypasses all real calls |
| Inngest | Sprint 2 | Free | Free tier | Run `npx inngest-cli dev` locally |
| Email (Nodemailer) | Sprint 2 | Free | Free | Logs to console in dev; no SMTP needed |
| Playwright | Sprint 3 | Free | Free | Already installed for E2E tests |
| Google Places API | Sprint 8 | Free | Free (within quota) | $200/month credit — dev volume never exceeds this |
| Supabase Pro | Sprint 12 | Not needed | ~A$40/month | Only needed for PITR before launch |
| Vercel Pro | Sprint 12 | Not needed | ~A$30/month | Needed for >10s function timeout in production |
| Sentry | Sprint 12 | Free | Free | Free tier = 5,000 errors/month, sufficient for beta |

---

## Detailed breakdown by sprint

### Sprints 1–3 — Foundation, Audit Engine, Scoring

**What you need:** Nothing paid.

- **PostgreSQL** — local, already running (`visibleau` + `visibleau_test` databases)
- **Stripe** — test mode keys (`sk_test_...`, `pk_test_...`) are free. Sprint 1 creates
  products only — no real checkout until Sprint 10
- **PostHog** — free account at posthog.com, free tier covers all dev and beta
- **LLM APIs** — `LLM_MODE=mock` in `.env.local` routes all audit calls to JSON
  fixtures in `tests/fixtures/`. No OpenAI/Anthropic/Perplexity/Google keys
  consumed during testing. You've been doing this through Sprints 1–3 already.
- **Inngest** — run locally with `npx inngest-cli@latest dev` in a separate
  terminal. No account needed until you deploy to production.

**Real LLM keys** — you have them in `.env.local` for when you want to run a
live audit against a real brand. That costs roughly US$3–4 per paid-tier audit
(200 LLM calls across 4 engines). For testing, always use `LLM_MODE=mock`.

---

### Sprint 4 — First UI Layer

**What you need:** Nothing new.

All Sprints 1–3 services continue. Sprint 4 is pure frontend — no new external
services. Recharts is installed (`pnpm add recharts`) but that's a free npm package.

---

### Sprints 5–6 — Vertical Packs, Action Center

**What you need:** Nothing new.

Sprint 5 adds 336 curated AU prompts to the database — no external API calls.
Sprint 6 builds the Action Center with recommendation logic — no external APIs.
Both sprints test fully in mock mode.

---

### Sprint 7 — Technical AI Infrastructure

**What you need:** Nothing new.

Sprint 7 uses **Playwright** (already installed) as a headless site crawler to
check client websites for AI-visibility signals — llms.txt, robots.txt, schema
markup, SSR rendering, CDN bot-blocking. Playwright is free and already in your
project from E2E testing.

The crawler runs inside Inngest functions locally. No browser service subscription
needed — Playwright spins up a local Chromium instance, the same one your E2E
tests already use.

---

### Sprint 8 — Local SEO, Drift Detection, Exports, Webhooks

**What you need:** Google Places API key (free).

Sprint 8 adds GMB (Google Business Profile) completeness checking via the
Google Places API. Setup:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use an existing one)
3. Enable **Places API (New)**
4. Create an API key
5. Add to `.env.local`:
   ```env
   GMB_API_KEY=your_key_here
   GOOGLE_PLACES_API_KEY=your_key_here   # same value, both names used
   ```

**Cost:** Google gives $200 USD free credit per month. Each Places API call costs
roughly $0.017. Your development and testing volume will never come close to the
free threshold.

Sprint 8 also adds Slack/Discord/Teams webhooks for audit notifications —
testing uses MSW (Mock Service Worker) to mock the webhook endpoints. No real
Slack workspace needed for tests.

---

### Sprints 9–11 — Agency Tier, Onboarding, Polish

**What you need:** Nothing new beyond Sprint 8.

- **Sprint 9** (Agency tier): multi-brand workspace, white-label PDF, bulk
  exports. All testable locally.
- **Sprint 10** (Stripe billing): real Stripe Checkout and Customer Portal, but
  still using test mode keys. Stripe test mode is completely free and simulates
  the full checkout/webhook flow. No real card charges.
- **Sprint 11** (Polish + landing): pure frontend. No new services.

---

### Sprint 12 — Launch

**What you actually need to spend money on:**

#### Supabase Pro — ~A$40/month
Required for: point-in-time recovery (PITR) before launch. Supabase free tier
has no PITR — if something goes wrong with the database, you can't roll back.
The Pro plan has automatic daily backups + PITR. This is the one hard requirement
before accepting real customer data.

How to upgrade: Supabase dashboard → your project → Settings → Billing → Upgrade.

#### Vercel Pro — ~A$30/month
Required for: serverless function timeout. Vercel Hobby plan caps functions at
10 seconds. Your audit Inngest jobs (200 LLM calls) take 4–6 minutes. On Hobby,
the function that triggers the Inngest event would time out. Vercel Pro raises
the limit to 60 seconds (enough for the trigger — the actual job runs in Inngest,
not Vercel).

**Alternative:** If you want to defer the Vercel cost, you can self-host on a
VPS (Hetzner, DigitalOcean) and run the Next.js app there instead. More setup
work but cheaper at scale.

#### Sentry — Free for beta
Free tier (5,000 errors/month) is more than enough for a beta launch. Upgrade
only when you have paying customers generating meaningful error volume.

---

## Keeping LLM costs under control during development

The 4-layer cost-control architecture in the codebase protects you:

- **Layer 1** — `LLM_MODE=mock` in `.env.local` → zero LLM cost for all tests
- **Layer 2** — Response cache (`llm_response_cache`) → identical prompt+model
  combos reuse cached responses, never hit the API twice
- **Layer 3** — Per-audit budget cap (`<US$4.00`) enforced in the Inngest job —
  job aborts if it would exceed budget
- **Layer 4** — Tier-aware model selector → Free tier uses cheaper models
  (`gpt-4o-mini`, `sonar`) and fewer engines (2 vs 4)

When you do run real audits during development, each one costs roughly:
- **Free tier audit:** ~US$1.53 (100 LLM calls across 2 engines)
- **Paid tier audit:** ~US$3.03 (200 primary + ~56 derived task calls)

A typical development session of 5–10 real audits costs under US$30 and gives
you thorough real-data verification.

---

## Quick setup checklist by sprint

### Before Sprint 4 (you're here now — all already done)
- [x] Local PostgreSQL running
- [x] Stripe test keys in `.env.local`
- [x] PostHog account (free)
- [x] `LLM_MODE=mock` set for all tests
- [x] Inngest CLI installed

### Before Sprint 8
- [ ] Google Cloud account (free)
- [ ] Places API enabled
- [ ] `GMB_API_KEY` added to `.env.local`

### Before Sprint 12 (launch)
- [ ] Supabase Pro plan activated (~A$40/month)
- [ ] Vercel Pro plan activated (~A$30/month)
- [ ] Stripe live keys obtained (switch from `sk_test_...` to `sk_live_...`)
- [ ] LLM API keys confirmed for production (OpenAI, Anthropic, Perplexity, Google)
- [ ] Sentry project created (free tier)
- [ ] Domain DNS configured

---

## Cost summary

| Phase | Monthly cost |
|-------|-------------|
| Sprints 1–11 (development) | $0 |
| Sprint 12 launch (Supabase Pro + Vercel Pro) | ~A$70/month |
| Post-launch at scale (add LLM API costs) | ~A$70 + ~A$5 per 100 real audits |

