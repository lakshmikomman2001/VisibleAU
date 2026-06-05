# VisibleAU — Phase 2 Multi-Region Implementation Plan

**Version:** 1.0
**Date:** 4 May 2026
**Status:** Forward-looking design document. Not v1 scope.
**Trigger for execution:** When EITHER (a) UK enterprise customer demands data residency, OR (b) data sovereignty regulations make Sydney-only storage non-viable for European/UK customers, OR (c) regional latency becomes a customer complaint pattern.

---

## 1. Purpose of this document

The v1 architecture (see Architecture Overview, Section 7.5) implements multi-region as a **tenant property** — single database in Sydney, region-aware content and UX, but all data physically stored in one place.

This document specifies how to **lift the infrastructure into true multi-region** when business demand justifies it. This is Phase 2 work, expected in months 12-24 of the company.

This document is forward-looking design. Do NOT implement any of this in v1. The v1 architecture is intentionally simpler.

---

## 2. When to execute Phase 2

Don't migrate to multi-region infrastructure prematurely. The trigger conditions:

### Hard triggers (you MUST migrate)

1. **Regulatory compliance:** UK or EU enterprise customer requires data residency, with audit trail. GDPR data subject access rights become operationally difficult cross-region.

2. **Customer contract loss:** A deal worth £50K+ ARR is rejected specifically because data is in Sydney.

3. **Latency complaints become a pattern:** UK or US customers report > 2-second dashboard load times consistently. (v1 architecture should handle 95% of cases via Vercel edge caching.)

### Soft triggers (consider migrating)

1. **Geographic revenue distribution:** > 30% of MRR from a region other than AU.

2. **Enterprise sales motion:** SOC 2 or ISO 27001 audit raises data residency as a finding.

3. **Co-founder or ops capacity:** You have someone available to run the migration without slowing core product work.

### When NOT to migrate

- "It would be nice to have" — not enough
- "Competitors have it" — not enough (also probably not true at your stage)
- Speculative future demand — not enough

The migration is a 3-6 month engineering project. Don't start unless the business demands it.

---

## 3. Phase 2 architecture overview

### Target topology

```
┌────────────────────────────────────────────────────────────────┐
│                      GLOBAL ROUTER                             │
│  visibleau.com (region detection + redirect)                   │
└────────────┬─────────────────┬─────────────────┬───────────────┘
             │                 │                 │
             ▼                 ▼                 ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   AU REGION      │  │   UK REGION      │  │   US REGION      │
│ ap-southeast-2   │  │  eu-west-2       │  │  us-east-1       │
│                  │  │  (London)        │  │  (N. Virginia)   │
│ ┌──────────────┐ │  │ ┌──────────────┐ │  │ ┌──────────────┐ │
│ │ Vercel app   │ │  │ │ Vercel app   │ │  │ │ Vercel app   │ │
│ │ Sydney       │ │  │ │ London       │ │  │ │ N. Virginia  │ │
│ └──────┬───────┘ │  │ └──────┬───────┘ │  │ └──────┬───────┘ │
│        │         │  │        │         │  │        │         │
│        ▼         │  │        ▼         │  │        ▼         │
│ ┌──────────────┐ │  │ ┌──────────────┐ │  │ ┌──────────────┐ │
│ │ Supabase     │ │  │ │ Supabase     │ │  │ │ Supabase     │ │
│ │ Postgres     │ │  │ │ Postgres     │ │  │ │ Postgres     │ │
│ │ Sydney       │ │  │ │ London       │ │  │ │ N. Virginia  │ │
│ └──────────────┘ │  │ └──────────────┘ │  │ └──────────────┘ │
│                  │  │                  │  │                  │
│ ┌──────────────┐ │  │ ┌──────────────┐ │  │ ┌──────────────┐ │
│ │ Inngest      │ │  │ │ Inngest      │ │  │ │ Inngest      │ │
│ │ AU workers   │ │  │ │ EU workers   │ │  │ │ US workers   │ │
│ └──────────────┘ │  │ └──────────────┘ │  │ └──────────────┘ │
└──────────────────┘  └──────────────────┘  └──────────────────┘
        │                     │                     │
        └─────────┬───────────┴─────────────────────┘
                  ▼
        ┌────────────────────────┐
        │   GLOBAL SERVICES      │
        │   (single instance)    │
        │                        │
        │   Clerk (auth)         │
        │   Stripe (payments)    │
        │   PostHog (analytics)  │
        │   Sentry (errors)      │
        │   LLM APIs             │
        └────────────────────────┘
```

### Key changes from v1

| Component | v1 (single-region) | Phase 2 (multi-region) |
|---|---|---|
| App deployment | Single Vercel deployment, edge cached | Per-region Vercel deployment |
| Database | Single Supabase (Sydney) | Per-region Supabase (Sydney, London, N. Virginia) |
| Background jobs | Single Inngest workers | Per-region Inngest workers |
| Customer data | All in Sydney | Stays in customer's region |
| Auth (Clerk) | Single instance (global) | Single instance (global) — same |
| Payments (Stripe) | Single account (global) | Single account (global) — same |
| Analytics (PostHog) | Single instance (global) | Single instance (global) — same |

**Critical principle:** what stays global vs what becomes regional is determined by data sensitivity and regulatory requirements. Auth tokens and payment data are global because Clerk and Stripe handle their own multi-region compliance. Customer audit data becomes regional because that's what we're being asked to localize.

---

## 4. Migration sequence (high-level phases)

### Phase 2A: Infrastructure preparation (months 1-2)

Before touching production, build the new region's infrastructure in parallel.

1. **Provision target region resources:**
   - New Supabase project in target region (e.g., London for UK)
   - New Vercel deployment configured for target region
   - New Inngest environment for target region

2. **Replicate database schema:**
   - Apply all current migrations to new region database
   - Verify schema parity via Drizzle introspection
   - No data yet — empty schema only

3. **Set up cross-region observability:**
   - PostHog tags: `region` already exists in v1
   - Sentry projects: one per region for clean error tracking
   - Add region label to all logs

4. **DNS preparation:**
   - Add region subdomains: au.visibleau.com, uk.visibleau.com, us.visibleau.com
   - Set up Cloudflare or Vercel routing rules
   - SSL certificates per region domain

**Outcome:** infrastructure ready, no traffic yet, zero customer impact.

### Phase 2B: New customer routing (month 3)

Route NEW signups to their regional infrastructure. Existing customers remain on v1 (Sydney).

1. **Update signup flow:**
   - Region detection at signup (URL path > geo-IP > user choice)
   - Customer creation goes to regional database
   - Stripe customer with regional metadata

2. **Update auth flow:**
   - Clerk webhook routes user creation to correct regional DB
   - Sign-in routes user to their region's app deployment

3. **Implement region-aware data access layer:**
   - `getDatabaseForRegion(region)` returns correct Drizzle client
   - All queries route via this helper

4. **Test thoroughly:**
   - Signup flow for each region
   - Audit creation in regional DB
   - Cross-region data isolation (UK customer cannot access AU data)

**Outcome:** new UK customers store data in London. AU customers continue on Sydney. No migration of existing data yet.

### Phase 2C: Existing customer migration (months 4-5)

Migrate existing UK and EU customers' data from Sydney to their target region.

1. **Identify customers to migrate:**
   - Query: `SELECT * FROM organizations WHERE region IN ('UK', 'EU')`
   - Generate migration manifest

2. **Per-customer migration script:**
   - Snapshot all data for organization (ETL script)
   - Insert into target region database
   - Verify row counts match
   - Update Clerk user metadata to point to new region
   - Switch app routing for that user
   - Verify customer can log in and see their data

3. **Communication plan:**
   - Email customers 7 days before migration
   - Schedule migration during their off-hours
   - Send confirmation when complete
   - Provide rollback contact if issues

4. **Decommission Sydney copies:**
   - 30 days after migration, delete Sydney copies of UK/EU customer data
   - Keep audit logs of the migration (compliance trail)

**Outcome:** UK customers' data physically in London. EU customers' data in chosen EU region.

### Phase 2D: New region launch (months 6+)

Once Phase 2A-2C is stable, launching new regions becomes routine.

For each new region:
1. Provision infrastructure (1-2 weeks)
2. Test signup flow (1 week)
3. Update marketing site to advertise availability
4. Soft launch with 5-10 beta customers
5. General availability

**Outcome:** adding US, EU, NZ regions becomes a 1-month operational rollout, not an architecture project.

---

## 5. Detailed design — what changes in code

### Database access layer

**v1 pattern (single database):**
```typescript
// db/client.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const queryClient = postgres(process.env.DATABASE_URL!);
export const db = drizzle(queryClient);
```

**Phase 2 pattern (region-routed databases):**
```typescript
// db/client.ts
const REGION_CONNECTIONS: Record<Region, ReturnType<typeof drizzle>> = {
  AU: drizzle(postgres(process.env.DATABASE_URL_AU!)),
  NZ: drizzle(postgres(process.env.DATABASE_URL_NZ!)),
  UK: drizzle(postgres(process.env.DATABASE_URL_UK!)),
  US: drizzle(postgres(process.env.DATABASE_URL_US!)),
  EU: drizzle(postgres(process.env.DATABASE_URL_EU!)),
};

export function getDatabase(region: Region) {
  return REGION_CONNECTIONS[region];
}

// Backwards-compat helper for existing code
export const db = getDatabase('AU'); // default; flag this for review
```

**Critical change:** every place that does `db.select(...)` becomes `getDatabase(region).select(...)`. The `region` flows through API request context.

### API request context

Every authenticated request must establish region context early:

```typescript
// lib/auth/context.ts (Phase 2)
export async function requireAuthWithContext(): Promise<AuthContext> {
  const user = await authService.requireAuth();
  
  // In Phase 2, organization data lives in regional DB
  // We need a "global lookup" first to find which region this user belongs to
  const region = await getUserRegion(user.id); // Cached in Clerk metadata
  
  const db = getDatabase(region);
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.ownerId, user.id),
  });
  
  return { user, organization, region, db };
}
```

The `AuthContext` becomes the standard input for every API route handler.

### Routing strategy

**Option A (recommended): Per-region Vercel deployments with global router**

```
visibleau.com (router) → detects region → redirects to:
- au.visibleau.com (Vercel deployment in Sydney)
- uk.visibleau.com (Vercel deployment in London)
- us.visibleau.com (Vercel deployment in N. Virginia)
- nz.visibleau.com (Vercel deployment in Sydney — same infrastructure as AU initially)
- eu.visibleau.com (Vercel deployment in Frankfurt)
```

Benefits:
- Each deployment connects to its regional database (env vars per deployment)
- Clear data residency story for compliance
- Latency benefit (UK users hit London app)

Costs:
- 5x Vercel deployments to manage
- Deployment pipelines per region
- Configuration drift risk

**Option B: Single deployment with regional database routing**

Single global Vercel deployment that connects to multiple regional databases based on user's region.

Benefits:
- Simpler deployment management
- Fewer moving parts

Costs:
- App is in Sydney (or single region) so UK users still hit Sydney app
- Latency benefit lost
- Doesn't fully solve "data in UK" perception — app code still in Sydney

**Recommendation:** Option A. The complexity is justified by the latency and clarity of data residency story.

### User-region resolution

When a user signs in, we need to route them to their region quickly. Options:

**Option A: Clerk metadata stores region**
- On signup, set `user.publicMetadata.region`
- Every page load reads it (cached)
- Trade-off: Clerk metadata sync latency

**Option B: Subdomain-based**
- User accessed via uk.visibleau.com → region = UK
- Trade-off: requires consistent deep linking

**Option C: Middleware lookup**
- Middleware queries user's region from Clerk on every request
- Trade-off: extra DB roundtrip per request (cached in cookie)

**Recommendation:** A + B combined. Clerk metadata as source of truth, subdomain reflects region for UX clarity.

### Inngest multi-region

Inngest supports multi-region deployment. Each region gets its own Inngest environment:

```typescript
// inngest/clients.ts
const INNGEST_CLIENTS = {
  AU: new Inngest({ id: 'visibleau-au', eventKey: process.env.INNGEST_KEY_AU }),
  UK: new Inngest({ id: 'visibleau-uk', eventKey: process.env.INNGEST_KEY_UK }),
  US: new Inngest({ id: 'visibleau-us', eventKey: process.env.INNGEST_KEY_US }),
  // ...
};

export function getInngestClient(region: Region) {
  return INNGEST_CLIENTS[region];
}
```

When triggering jobs, route to the correct regional Inngest:

```typescript
// In an API route
const inngest = getInngestClient(authContext.region);
await inngest.send({ name: 'audit/start', data: { auditId, organizationId } });
```

### Cross-region data prohibitions

In Phase 2, certain operations MUST NOT cross regions:

```typescript
// lib/validators/region-isolation.ts
export function ensureSameRegion(...resources: { region: Region }[]) {
  const regions = new Set(resources.map(r => r.region));
  if (regions.size > 1) {
    throw new AppError(
      'CROSS_REGION_VIOLATION',
      `Operation spans multiple regions: ${Array.from(regions).join(', ')}`,
      403
    );
  }
}
```

Use this in any place where multiple resources must align regionally:
- User accessing organization (must match)
- Organization owning brand (must match)
- Audit linked to brand (must match)

---

## 6. Compliance and security implications

### GDPR / data residency

Phase 2 enables genuine GDPR compliance for EU customers:

- **Data subject access requests:** customer's data is in their region; queries don't cross borders
- **Right to be forgotten:** delete from regional DB; no risk of missed copies elsewhere
- **Data processing addendum:** clearly states EU data stays in EU region

Pre-Phase-2 (v1), GDPR compliance is achievable but requires "data transfer" documentation since Sydney is not in the EU. Most EU customers in B2B SaaS accept this with proper SCCs (Standard Contractual Clauses), but enterprise customers may not.

### SOC 2 implications

Multi-region adds complexity to SOC 2 audit but doesn't fundamentally change controls:

- Each region is a separate "environment" in SOC 2 terms
- Controls (access, change management, monitoring) must apply identically to each
- Logging and observability must work across regions
- Incident response must work across regions

Plan for SOC 2 audit AFTER Phase 2 stabilizes (likely month 7-9 of execution).

### Cross-region admin access

VisibleAU operators (you, possibly co-founders) need access to all regions for operations. Solution:

- Admin-tier Clerk users have access to all regions
- Admin actions logged to global audit log (not regional)
- Customer data access by admins logged for compliance trail

This is a v1 problem too (admin access exists), just becomes more rigorous in Phase 2.

---

## 7. Cost implications

### v1 vs Phase 2 cost comparison

For a single-region deployment with 50 customers / 50K audits/month:

| Component | v1 monthly | Phase 2 monthly (3 regions) |
|---|---|---|
| Vercel | $20 (Hobby/Pro) | $60 (3x deployments) |
| Supabase | $25 (Pro) | $75 (3x Pro) |
| Inngest | $50 (Pro tier) | $150 (3x Pro) |
| Sentry | $26 (Team) | $78 (3 projects on Team) |
| Misc (DNS, domains) | $5 | $15 |
| **Total** | **~$126/mo** | **~$378/mo** |

3x infrastructure cost roughly. At 50 customers, this is acceptable. At 5 customers, premature.

### Migration project cost

The Phase 2 migration project itself costs:
- 3-6 months of engineering time (40% of capacity)
- Customer communication overhead
- Beta customer goodwill (any disruption)

This is real. Don't trigger Phase 2 lightly.

---

## 8. Failure modes specific to multi-region

New failure modes that don't exist in v1:

| Failure | Impact | Mitigation |
|---|---|---|
| Regional DB outage | Customers in that region offline | Per-region status page; cross-region failover NOT planned (data residency forbids) |
| Cross-region clock skew | Audit timestamps inconsistent | Use UTC always; never rely on local DB time |
| Region-specific deployment fails | One region offline, others fine | Deployment pipeline tests pre-prod per region |
| User region mismatch | User locked out of their data | Region resolution debug tooling |
| Stripe webhook lag | Subscription state out of sync | Webhook retries; sync job |
| Inngest job sent to wrong region | Job runs but can't access target DB | Strict region validation in job handlers |

### Disaster recovery in multi-region

Each region has its own DR strategy:
- Daily backups in target region (not cross-region)
- Point-in-time recovery to target region
- Maximum tolerable data loss: 24 hours

Cross-region DR (failing over UK to AU) is **not implemented** because it would violate data residency promises. UK customer expects UK data; if London region is fully down, they wait for restore, not failover to Sydney.

---

## 9. What stays in v1 architecture vs Phase 2

To make the trigger-decision easy, here's what changes vs stays:

### Changes in Phase 2

- Database connections are region-aware
- App deployments are region-specific
- Inngest workers are region-specific
- DNS is region-routed
- Customer data physically resides in their region
- Migration scripts for existing customers
- Per-region status pages

### Stays the same

- Clerk auth (single instance, global)
- Stripe (single account, global)
- LLM APIs (called from any region)
- PostHog (single instance for cross-region analytics)
- Sentry (one project per region but UI is global)
- The application code structure
- The data model (per-region instances of same schema)
- The interface pattern
- The vertical packs / locations / compliance modules (these are content, deployed to all regions)

This is a deliberate choice: minimize what changes, maximize what's the same. The migration is hard enough without rewriting the application logic.

---

## 10. Pre-Phase-2 readiness checklist

Before triggering Phase 2, ensure:

- [ ] V1 architecture has been running stable for 6+ months
- [ ] You have at least 1 customer in each target Phase 2 region (real demand)
- [ ] Engineering capacity available for 3-6 month project
- [ ] Customer count > 50 (justifies infrastructure cost)
- [ ] You've talked to a SOC 2 auditor about implications (if pursuing compliance)
- [ ] You have a written decision document explaining WHY now (not before, not later)
- [ ] Stakeholders (co-founders if any, key customers) understand the project plan
- [ ] You have a rollback plan for each migration phase

If any are missing, defer Phase 2.

---

## 11. Decision log for Phase 2

When Phase 2 is triggered, document the decisions:

**Trigger event:** [What customer, contract, or compliance requirement triggered this?]

**Target regions:** [Which regions are in scope? UK first? EU first? Both?]

**Customer migration sequence:** [Which existing customers migrate? When? In what order?]

**Architecture choice:** [Option A (per-region deployments) or Option B (regional databases only)?]

**Timeline:** [What's the 3-6 month plan?]

**Budget:** [What's the cost increase accepted?]

**Risk register:** [What are the top 3 risks and how are they mitigated?]

This decision log lives at the start of execution, not in this design document.

---

## 12. What's NOT in Phase 2

To be clear about scope, Phase 2 is NOT:

- Multi-region writes (a single record being writable from any region)
- Cross-region failover (London failing to Sydney)
- Active-active database replication
- Real-time data sync between regions
- Single global query interface (admin can query all regions in one go)

These are Phase 3+ if ever needed. Most B2B SaaS never needs them. They add 5-10x more complexity than what Phase 2 already requires.

If a customer asks for any of these, the answer is: "we don't support that pattern; instead, [recommended workaround]."

---

## 13. Document boundaries

This document covers:
- WHEN to migrate to multi-region infrastructure
- HOW the migration is structured
- WHAT changes in code, deployment, and operations
- WHY certain decisions are made (architecture choices)

This document does NOT cover:
- v1 multi-region content (covered in Architecture Overview Section 7.5)
- Specific code-level implementations (those become detailed design docs at execution time)
- Marketing/sales strategy for new regions (that's GTM concern)
- Specific compliance frameworks (SOC 2, ISO 27001, etc.) — separate documents

---

## 14. Companion artifacts at execution time

When Phase 2 is triggered, generate these companion documents:

1. **Migration runbook** — step-by-step operational procedures
2. **Customer communication templates** — emails, support docs
3. **Per-region environment setup guide** — engineering specifics
4. **Updated foundations doc** — reflecting multi-region patterns
5. **Updated architecture overview** — Phase 2 architecture as new "current state"
6. **Decision log** — record of choices made during execution

Don't create these now. They'll be obsolete by the time you actually need them. Generate at execution time.

---

## 15. Summary

VisibleAU v1 ships with multi-region as a **tenant property** — region-aware content and UX, but single-region infrastructure. This delivers ~90% of customer value at ~10% of operational complexity.

Phase 2 lifts the infrastructure layer into true multi-region — per-region databases, per-region app deployments, regional data residency. This is a 3-6 month engineering project with 3x infrastructure cost.

**Trigger Phase 2 when:** real enterprise customer demand justifies the complexity. Don't trigger speculatively.

**Until Phase 2 is triggered:** the v1 architecture is sufficient. The interface pattern and tenant-property design ensure the migration to Phase 2 is incremental, not a rewrite.

This document is the forward-looking blueprint. It exists so future-Sri (or co-founder, or contractor) doesn't have to re-think these decisions when the time comes.
