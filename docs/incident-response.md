# VisibleAU — Incident Response (Solo Founder)

## Severity levels

| Level | Description | Response time |
|-------|-------------|---------------|
| P0 | Site down / Stripe checkout broken / data loss | Wake up now |
| P1 | Audit jobs failing >50% / Sentry spike >20/min | Fix within 2h |
| P2 | Single feature broken, workaround exists | Fix within 24h |
| P3 | Cosmetic / UX issue | Next sprint |

## Solo response checklist

1. Check Sentry → identify error + affected users
2. Check Supabase dashboard → DB health
3. Check Vercel → deployment status / edge function logs
4. Check Inngest → job queue backlog
5. If unable to fix in 30min → post status update on status page + email affected users
6. Disable affected feature via env flag if possible (e.g. LLM_ENGINE_*_ENABLED=false)
7. Fix in staging → deploy → verify → close incident

## Contact points (external support, not escalation)

- **Vercel support:** vercel.com/support (Pro plan)
- **Supabase support:** supabase.com/dashboard/support
- **Stripe support:** support.stripe.com
- **Inngest support:** inngest.com/support
- **Resend support:** resend.com/support
