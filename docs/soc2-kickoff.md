# VisibleAU — SOC 2 Type 1 Kickoff Plan

## Timeline

Per PRD §10: SOC 2 Type 1 by month 12 post-launch. Type 2 by month 18 (required for enterprise tier).

## Vendor selection

| Vendor | Cost | Fit |
|--------|------|-----|
| **Vanta** | ~US$800/mo | Recommended for solo founders. Automated evidence collection. |
| Drata | ~US$1,000+/mo | More features but higher cost. Better for teams. |

**Decision:** Vanta (evaluate at month 3 post-launch).

## Scope

Trust Service Criteria:
- **Security** — access controls, encryption, vulnerability management
- **Availability** — uptime monitoring, incident response, backup procedures
- **Confidentiality** — data classification, encryption at rest/transit

## Initial control inventory

Controls already in place from Sprint 12 baseline:

| Control | Implementation | Status |
|---------|---------------|--------|
| Encryption at rest | Supabase Pro AES-256 | ✅ Active |
| Encryption in transit | HSTS (vercel.json) + TLS | ✅ Active |
| Access control | Better Auth + Supabase RLS | ✅ Active |
| Audit logging | Sentry error tracking + Supabase logs | ✅ Active |
| Incident response | docs/incident-response.md | ✅ Documented |
| Backup & recovery | Supabase PITR, drill completed Sprint 12 | ✅ Tested |
| Dependency scanning | pnpm audit in security-scan.ts | ✅ Automated |
| Secret management | Vercel env vars (prod-only scope) | ✅ Configured |
| Data retention | 12-month audit cleanup cron (Inngest) | ✅ Active |

## Controls to implement (months 3-12)

- [ ] Formal access review process (quarterly)
- [ ] Change management documentation
- [ ] Vendor risk assessments for sub-processors
- [ ] Security awareness training (even for solo — document it)
- [ ] Penetration testing (annual, third-party)
- [ ] Business continuity plan

## Next steps

1. Month 3: Sign up for Vanta trial
2. Month 4: Complete Vanta readiness assessment
3. Month 6: Engage SOC 2 auditor (recommended: Prescient Assurance or Sensiba for startups)
4. Month 9-12: SOC 2 Type 1 audit window
