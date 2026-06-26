# VisibleAU — Ops Runbook

## Sentry alert response

**Error rate >5/min:**
1. Open Sentry → filter by `environment=production` → identify top error
2. Check if deployment-related: Vercel dashboard → Deployments → compare timing
3. If new deploy caused it → `vercel rollback` in Vercel dashboard (instant, zero-downtime)
4. If not deployment-related → investigate the error stack trace, fix in staging, deploy

## Database connection issues

**Symptoms:** 503 on all routes, Sentry shows "connection timeout"

1. Check Supabase dashboard → Project → Home → Connection pooler status
2. If pooler saturated → Supabase → Pause/Resume project (resets connections)
3. Verify `DATABASE_URL` uses pooled connection string (port 6543, `?pgbouncer=true`)
4. If still failing → check Supabase status page (status.supabase.com)

## LLM API outages

**Which engine to disable:**
1. Check status pages: status.openai.com, status.anthropic.com, status.google.com
2. Set `LLM_ENGINE_OPENAI_ENABLED=false` (or relevant engine) in Vercel env vars
3. Redeploy: Vercel dashboard → Deployments → Redeploy
4. Active audits using that engine will fail gracefully; next audit skips disabled engine
5. Re-enable after provider confirms resolution

## Stripe webhook backlog

**Symptoms:** Subscriptions not updating after payment

1. Stripe dashboard → Developers → Webhooks → check failed deliveries
2. Fix: "Resend" failed webhooks manually OR fix the handler + let Stripe retry (retries for 3 days)
3. Emergency: manually update org tier in Supabase Table Editor if customer paid but tier not updated

## High audit failure rate

1. Check Inngest dashboard → Functions → recent failures → read error message
2. If LLM error → disable engine (see above)
3. If DB error → check Supabase connection (see above)
4. If Inngest queue backlog → Inngest dashboard → cancel stuck jobs → re-trigger

## Post-launch monitoring schedule

- **Day 1:** Check Sentry every 30 minutes
- **Week 1:** Daily Sentry digest + Vercel metrics review
- **Month 1:** Weekly KPI review (signups, first-audit completion, conversion to paid)
