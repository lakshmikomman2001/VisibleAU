# VisibleAU — Architecture Overview

**Version:** 1.6
**Date:** 13 May 2026
**Audience:** Engineering reference document — high-level view of how VisibleAU fits together. Companion to the PRD (what we build) and Foundations doc (how we build it).

**Changelog:**
- v1.0 (4 May 2026): Initial draft
- v1.1 (6 May 2026): Conflict resolution pass — added Canada (CA) as 6th region; added Free tier to Stripe pricing table (feature-flagged); updated vertical pack folder structure to flag v1/v1.1/v2 release timing
- v1.2 (6 May 2026): Deep audit round 2 — no architectural changes (v1 design holds). Confirmed Foundations and Sprint prompts now align with this document's data model (brands.region, multi-user deferred to v1.1, signup region detection flow).
- v1.4 (9 May 2026): Round 29 cross-doc propagation — added forward-reference notes for v1.11+ strategic posture changes from PRD Rounds 22-28: (a) OSS reference strategy (PRD §16, Auriti-Labs reference-only — not a production dependency); (b) Sprint 7 audit module expanded scope from PRD §8.8/§16 (~22 additional days vs §11 baseline; 27 AI bots, CDN crawler check, AI discovery endpoints, AU-localised Brand & Entity, 47 citability methods, 50-site validation corpus prerequisite); (c) Sprint 8 expanded scope (~5-7 additional days; SARIF/JUnit/GHA outputs, confidence labels Confirmed/Likely/Hypothesis, webhook integrations); (d) ATTRIBUTIONS.md sprint deliverable matrix; (e) engine roadmap clarification (v1=4 engines on all paid tiers; Copilot+AI Overviews Q3 2026; DeepSeek+Grok Q4 2026). Architecture's 5-layer model + Domain layer purity claim hold unchanged — these additions are integration notes for engineers, not architectural changes.
- v1.3 (9 May 2026): Round 19 audit — replaced single-line "GPT-4o for primary queries" with PRD-aligned tier-aware model strategy (Free/Starter use cheapest models; Growth uses mid-tier; Agency Pro uses top-tier). Documents single source of truth at lib/llm/model-selector.ts.
- v1.5 (13 May 2026): **Second-pass-fix audit** — 1 issue. **(N8)** §5 data flow Step 3 "Returns 50-200 prompts" → "Returns 10 prompts per audit (selected from the tier's library: 20/50/200 per PRD §7; pack-size capped in v1)". The 50-200 range contradicted Sprint 3, CLAUDE.md, and PRD §8 Module 1 tech notes which all use 10 prompts × 5 runs × 4 engines = 200 LLM calls.
- v1.6 (13 May 2026): **Third-pass-fix audit B5.** Tier-aware model selection reference §11.5 → §10 Layer 3 (the section "Tier-based provider routing" actually lives at PRD §10 Layer 3, not §11.5; §11.5 doesn't exist). One inline reference corrected.

---

## v1.11+ strategic posture forward-references (added v1.4, Round 29)

This section forward-references PRD-level strategic posture additions from Rounds 22-28 that engineers reading Architecture alone should be aware of. **These are integration notes; they do not change the 5-layer architecture or the domain-layer purity claim.**

### OSS-layer reference strategy (PRD §16)

- The Domain Layer (audit module, scorer, citability evaluator) re-implements selected patterns from MIT-licensed OSS GEO/AEO reference sources — **none of those repos are production dependencies**.
- Primary reference: Auriti-Labs/geo-optimizer-skill v4.6.0 (47 citability methods, 8 scoring dimensions, 27 AI bots tracked, CDN crawler check pattern, MCP server pattern).
- Secondary references: danishashko/geo-aeo-tracker (12-tab UX, Persona Fan-Out, Citation Opportunities), ai-search-guru/getcito (multi-brand routing), Foglift (webhook event taxonomy), Bhanunamikaze/Agentic-SEO-Skill (confidence labels pattern), 6 others catalogued in PRD §16.
- ATTRIBUTIONS.md sprint deliverable per PRD §16 matrix (touched in Sprints 7/8/9/11/12).

### Sprint 7 audit module expanded scope (PRD §8.8 + §16)

Architecture's Domain Layer "audit module" was originally scoped at PRD §11 baseline for Sprint 7. Rounds 22-26 added ~22 days of additional Sprint 7 work:

- 27 AI bots tracked in robots.txt audit (3 tiers: training, search, user-agent)
- CDN crawler access check (Cloudflare/Akamai/Vercel detection — silent blocks even when robots.txt allows)
- AI discovery endpoints check (`.well-known/ai.txt`, `/ai/summary.json`, `/ai/faq.json`)
- Schema richness scoring (graduated /16 per JSON-LD object)
- llms.txt depth scoring (graduated /18 across 6 components)
- AU-localised Brand & Entity scoring (replaces Auriti's Crunchbase/Wikipedia with ABN Lookup + Wikipedia AU + AU TLD + AU directory aggregate)
- 47 citability methods catalogue exposure in Action Center recommendations

**Sprint 7 prerequisite per PRD §16:** Build 50-site validation corpus (5 AU Tradies + 5 AU Allied Health + 5 AU SaaS + 5 each US/UK/CA/NZ + 5 known-good high-citation + 5 known-bad low-citation). Sprint 7 module passes when Spearman correlation > 0.7 between audit scores and observed citation patterns across the corpus.

### Sprint 8 expanded scope

- SARIF + JUnit + GitHub Actions output formats (in addition to PDF + CSV + JSON) — unlocks DevOps/CI integration use cases
- Confidence labels for Action Center: Confirmed / Likely / Hypothesis (**categorical, not %-numeric**) per PRD §8.5 anti-pattern against single-number scores
- Webhook integrations (Slack / Discord / Sheets / Airtable / custom) + code recipes for Zapier / n8n / Make.com

### Engine roadmap (PRD §7)

- **v1**: 4 engines on all paid tiers (ChatGPT, Claude, Gemini, Perplexity)
- **v1.1 (Q3 2026)**: + Copilot + Google AI Overviews on Growth+ tiers
- **v1.2 (Q4 2026)**: + DeepSeek + Grok on Agency Pro tier

The LLM abstraction layer (Infrastructure Layer) is engine-pluggable from v1 (Round 19 model-selector pattern); adding v1.1/v1.2 engines is a config + impl-file change, not an architectural change.

### Cross-cutting: Citation source enum forward-compat

`citations.cited_sources` `type` field includes `'tiktok'` from Sprint 2 for v1.1 forward-compatibility; detection logic ships in v1.1 Month 8.

---

## 1. System purpose in one paragraph

VisibleAU is a multi-tenant SaaS platform that audits, scores, and tracks Australian brands' visibility across AI search engines (ChatGPT, Claude, Gemini, Perplexity). It generates research-backed action recommendations, integrates Australian local SEO signals, and provides multi-brand dashboards for agencies. The system is async-heavy (LLM API calls dominate processing time), data-intensive (millions of citation records), multi-tenant (agencies manage many brands), and AU-region aware (suburb-level tracking, AU directory integration, AU regulatory awareness).

---

## 2. Conceptual architecture (five logical layers)

VisibleAU is structured in five conceptual layers. Each layer has a clear responsibility. Boundaries between layers are enforced by the interface pattern (described in Section 6).

```
┌──────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                      │
│  Marketing site, dashboard, audit views, agency portal   │
│  Built with: Next.js + Tailwind + shadcn/ui              │
└──────────────────────────────────────────────────────────┘
                          ↓ HTTP/REST
┌──────────────────────────────────────────────────────────┐
│  API LAYER                                               │
│  REST endpoints, validation, auth, authorization         │
│  Built with: Next.js API routes + Zod                    │
└──────────────────────────────────────────────────────────┘
                          ↓ function calls
┌──────────────────────────────────────────────────────────┐
│  DOMAIN LAYER (the value)                                │
│  Pure TypeScript business logic.                         │
│  Audit runner, citation detector, scorer, recommendation │
│  engine, vertical packs, research database               │
│  No framework dependencies. Highly testable.             │
└──────────────────────────────────────────────────────────┘
                          ↓ via interfaces
┌──────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE LAYER                                    │
│  External service abstractions: LLMs, auth, payments,    │
│  email, jobs, storage. All wrapped in interfaces.        │
└──────────────────────────────────────────────────────────┘
                          ↓ implementation
┌──────────────────────────────────────────────────────────┐
│  EXTERNAL SERVICES                                       │
│  Clerk, Stripe, Resend, Inngest, Supabase, OpenAI,       │
│  Anthropic, Google AI, Perplexity, PostHog, Sentry       │
└──────────────────────────────────────────────────────────┘
```

**Why this layering matters:** Domain logic is the value of the business. By keeping it pure (no framework or service dependencies), we can rebuild any other layer without rewriting the business. Frontend can switch to TanStack Start in 2030. Auth can move from Clerk to Better Auth in 2027. Database can migrate from Supabase to AWS RDS in days. The domain layer survives all of this.

---

## 3. System context diagram

The boundaries: who interacts with VisibleAU, and which external systems VisibleAU depends on.

```
                    ┌─────────────────┐
                    │   AU Agency     │
                    │  (Anna persona) │
                    └────────┬────────┘
                             │
                             ▼
       ┌──────────────────────────────────────┐
       │                                      │
       │           VISIBLEAU SAAS             │
       │      (web + API + workers)           │
       │                                      │
       └─┬──────┬─────┬─────┬─────┬──────┬───┘
         │      │     │     │     │      │
         ▼      ▼     ▼     ▼     ▼      ▼
       Clerk  Stripe Resend Sentry PostHog Inngest
                                            │
                                            ▼
                                   ┌────────────────┐
                                   │  LLM PROVIDERS │
                                   │   OpenAI       │
                                   │   Anthropic    │
                                   │   Google AI    │
                                   │   Perplexity   │
                                   └────────────────┘

       ┌─────────────────┐
       │   AU SaaS       │
       │  Founder        │
       │  (Paul persona) │
       │                 │
       └────────┬────────┘
                │
                ▼
       (interacts with same SaaS)
```

**External system dependencies:**

| Provider | Role | Replaceability |
|---|---|---|
| Clerk | User authentication | Medium — wrapped in interface |
| Supabase | Postgres + storage + auth backup | High — Postgres is portable |
| Stripe | Payments + subscriptions | Medium — wrapped in interface |
| Inngest | Background job orchestration | Medium — wrapped in interface |
| Resend | Transactional email | High — easy swap |
| OpenAI | ChatGPT API | High — Vercel AI SDK abstracts |
| Anthropic | Claude API | High — Vercel AI SDK abstracts |
| Google AI | Gemini API | High — Vercel AI SDK abstracts |
| Perplexity | Perplexity API | Medium — separate SDK |
| Sentry | Error monitoring | High — easy swap |
| PostHog | Product analytics | High — easy swap |
| Vercel | App hosting | Medium — Dockerfile escape hatch |

---

## 4. Component architecture

Inside the application, components organize into 8 functional modules. Each module corresponds to a section in the PRD.

```
┌─────────────────────────────────────────────────────────────┐
│                    VISIBLEAU APPLICATION                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────┐    ┌─────────────────────────┐   │
│  │  Module 1             │    │  Module 2               │   │
│  │  Visibility Audit     │◄──►│  AU Vertical Packs      │   │
│  │  (anchor feature)     │    │  (content moat)         │   │
│  └─────────┬─────────────┘    └─────────────────────────┘   │
│            │                                                │
│            │  ┌─────────────────────────┐                   │
│            ├─►│  Module 3               │                   │
│            │  │  Multi-Engine Tracking  │                   │
│            │  └─────────────────────────┘                   │
│            │                                                │
│            │  ┌─────────────────────────┐                   │
│            ├─►│  Module 4               │                   │
│            │  │  Local SEO + GEO        │                   │
│            │  └─────────────────────────┘                   │
│            │                                                │
│            │  ┌─────────────────────────┐                   │
│            └─►│  Module 5               │                   │
│               │  Action Reports         │                   │
│               │  (research-backed)      │                   │
│               └──────────┬──────────────┘                   │
│                          │                                  │
│                          ▼                                  │
│               ┌─────────────────────────┐                   │
│               │  Module 5b              │                   │
│               │  Technical Infra        │                   │
│               │  (llms.txt, schema, etc)│                   │
│               └─────────────────────────┘                   │
│                                                             │
│  ┌─────────────────────────┐    ┌─────────────────────────┐ │
│  │  Module 6               │    │  Module 7               │ │
│  │  Agency Dashboard       │    │  Notifications & Alerts │ │
│  │  (multi-brand mgmt)     │    │  (real-time signals)    │ │
│  └─────────────────────────┘    └─────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Module dependencies and data flow:**

- **Module 1** (Audit Engine) is the core. Most other modules consume audit data.
- **Module 2** (Vertical Packs) feeds prompts INTO Module 1.
- **Module 3** (Multi-Engine) sits inside Module 1 — it's the multi-LLM orchestration.
- **Module 4** (Local SEO) reads brand data, integrates external signals, augments audit results.
- **Module 5** (Action Reports) consumes audit results from Module 1 and produces recommendations.
- **Module 5b** (Technical Infrastructure) is invoked from Module 5 for specific recommendation types.
- **Module 6** (Agency Dashboard) is a presentation layer over Modules 1-5 with multi-tenant filtering.
- **Module 7** (Notifications) listens to events from Modules 1, 3, 4 and triggers alerts.

---

## 5. Data flow: what happens when an audit runs

The most important data flow in the system. Walking through it end-to-end:

```
USER ACTION                    SYSTEM ACTION                   PROVIDER
───────────                    ─────────────                   ────────

Click "Run Audit"
on a brand
       │
       ▼
                       POST /api/audits
                       Validate auth, ownership
                       Create audit record (status: pending)
                       Return audit ID
       │
       ▼
                       Trigger Inngest job
                       'audit/start'                            ────► Inngest
       │
       ▼
                                                               ◄──── Inngest
                                                               event received
                                                               
                       Step 1: Mark running
                       UPDATE audits SET status='running'        ────► Supabase
                       
                       Step 2: Load brand details
                       SELECT * FROM brands WHERE id=$1          ────► Supabase
                       
                       Step 3: Generate prompts
                       Pure function call:
                         generatePrompts(brand)
                       Returns 10 prompts per audit (selected
                       from the tier's library: 20/50/200 per PRD §7;
                       pack-size capped in v1, see PRD §7 note)
                       
                       Step 4: Query each LLM (parallel)
                       For each prompt × engine × 5 runs:
                         Call LLM API                            ────► OpenAI
                                                                       Anthropic
                                                                       Google AI
                                                                       Perplexity
                       
                       Step 5: Detect citations
                       Pure function call:
                         detectBrandMention(response, brand)
                       For each response
                       
                       Step 6: Store citations
                       INSERT INTO citations (...)               ────► Supabase
                       
                       Step 7: Calculate scores
                       Pure function call:
                         calculateMultidimensionalScore(citations)
                       Returns 5-dimension score
                       
                       Step 8: Update audit
                       UPDATE audits SET scores=...              ────► Supabase
                       
                       Step 9: Generate recommendations
                       Pure function call:
                         generateRecommendations(audit, score)
                       Returns 5-10 actions with research
                       
                       Step 10: Store recommendations
                       INSERT INTO recommendations (...)         ────► Supabase
                       
                       Step 11: Send completion email
                       Email template: audit-complete            ────► Resend
                       
                       Step 12: Mark complete
                       UPDATE audits SET status='complete'       ────► Supabase
                                                                
                       Webhook event: 'audit.completed'          ────► PostHog
       │                                                        ────► Sentry (if errors)
       ▼
User receives
email notification

User clicks link
       │
       ▼
                       GET /api/audits/:id/full
                       Validate auth, ownership
                       SELECT * FROM audits, citations,         ────► Supabase
                         recommendations WHERE audit_id=$1
                       Return rich payload
       │
       ▼
User views results
on dashboard
```

**Key characteristics of this flow:**

1. **Asynchronous from the start.** User triggers audit and immediately gets a response. Actual work happens in the background via Inngest.

2. **Each step is idempotent.** If step 4 fails partway through, retrying it doesn't double-charge LLM calls (state is checked).

3. **Pure functions for domain logic.** Steps 3, 5, 7, 9 are pure — they take data, return data. No DB or HTTP calls inside.

4. **Granular retry boundaries.** If step 11 fails (email service down), we don't re-run steps 1-10.

5. **Cost-conscious.** Estimated cost tracked across all LLM calls. Stored on the audit record for unit economics analysis.

---

## 6. The interface pattern (key architectural choice)

Every external service is wrapped in a TypeScript interface. This is the most important architectural decision in the system.

```
┌────────────────────────────────────────────────────────┐
│  Domain code (lib/audit/, lib/recommendations/, etc.)  │
│                                                        │
│  imports:  authService, llmService, paymentService     │
│  uses:     authService.getCurrentUser()                │
└──────────────┬─────────────────────────────────────────┘
               │
               ▼ via the interface
┌────────────────────────────────────────────────────────┐
│  lib/auth/index.ts                                     │
│  export { clerkAuth as authService }                   │
│                                                        │
│  lib/auth/interface.ts                                 │
│  export interface AuthService {                        │
│    getCurrentUser(): Promise<User | null>              │
│    requireAuth(): Promise<User>                        │
│  }                                                     │
└──────────────┬─────────────────────────────────────────┘
               │
               ▼ implemented by
┌────────────────────────────────────────────────────────┐
│  lib/auth/clerk-impl.ts                                │
│  export const clerkAuth: AuthService = {               │
│    async getCurrentUser() {                            │
│      // calls @clerk/nextjs                            │
│    }                                                   │
│  }                                                     │
└────────────────────────────────────────────────────────┘
```

**Why this matters for VisibleAU specifically:**

- **Auth (Clerk):** if Clerk pricing or terms change in 18 months, we replace `clerk-impl.ts` with `better-auth-impl.ts`. One file. No domain code changes.

- **Jobs (Inngest):** if we hit Inngest's pricing ceiling at scale, we replace with `graphile-worker-impl.ts` (Postgres-backed jobs). One file.

- **LLMs:** the most volatile category. Vercel AI SDK already abstracts most providers. If a new dominant provider emerges (DeepSeek, future model), we add an impl alongside existing ones.

- **Payments (Stripe):** unlikely to need replacement, but the wrapper means we could add Paddle for AU GST handling if useful.

- **Database (Supabase):** Drizzle ORM uses standard Postgres. If we leave Supabase, we point Drizzle at AWS RDS or Neon. Schema unchanged.

The cost of this pattern is small: one extra file per external service. The benefit is enormous: protection against vendor lock-in for any of these services.

---

## 7. Multi-tenancy model

VisibleAU is multi-tenant from day 1. The hierarchy:

```
                    ┌─────────────┐
                    │    User     │ (managed by Clerk)
                    └──────┬──────┘
                           │ owns
                           ▼
                    ┌─────────────┐
                    │ Organization│ (the agency or solo founder)
                    └──────┬──────┘
                           │ has many
                           ▼
                    ┌─────────────┐
                    │    Brand    │ (the actual product/business being audited)
                    └──────┬──────┘
                           │ has many
                           ▼
                    ┌─────────────┐
                    │   Audit     │ (a point-in-time snapshot)
                    └──────┬──────┘
                           │ has many
                           ▼
                    ┌─────────────┐    ┌────────────────────┐
                    │  Citation   │    │  Recommendation    │
                    └─────────────┘    └────────────────────┘
```

**Tenancy enforcement:**

- Every database query filters by `organization_id`
- API authorization checks `user.organization_id === resource.organization_id`
- Brands cannot be shared across organizations (no cross-tenant access)
- Solo founders are technically a single-user organization

**Why organizations as the tenant boundary (not users):**

- Agencies have multiple users (owner, account managers, contractors)
- Multi-brand isolation must be at the agency level
- Stripe subscriptions attach to organizations, not individual users
- Migration path to enterprise (multi-org accounts) is preserved

---

## 7.5. Multi-region architecture (tenant-property model)

VisibleAU is designed for multi-region from v1, even though only AU is fully active at launch. The architectural approach is **region-as-tenant-property** — single database, single deployment, but every piece of region-dependent logic is structured to switch cleanly based on the organization's region.

This avoids the complexity of multi-database / multi-deployment architecture (deferred to Phase 2 — see separate document) while delivering 90% of the customer-facing value.

### Region rollout sequence

| Region | Code | v1 status | v2 target | v3 target |
|---|---|---|---|---|
| Australia | AU | **Active** (full content, primary market) | Continue | Continue |
| New Zealand | NZ | Architecture ready, content stub | **Active** (full content) | Continue |
| United Kingdom | UK | Architecture ready, content stub | **Active** (full content) | Continue |
| Canada | CA | Architecture ready, content stub | Architecture ready | **Active** (full content) |
| United States | US | Architecture ready, content stub | Architecture ready | **Active** (full content) |
| Europe (English) | EU | Architecture ready, content stub | Architecture ready | **Active** (full content) |

**Why this sequence:** AU first (the moat, the home market). NZ next (smallest jump — same buying culture, similar SMB ecosystem). UK after (English-speaking, mature B2B SaaS market, AU expat networks help). CA, US, and EU last (most competitive markets, by which point we have validated playbook + revenue).

### What "region" determines

The `region` field on the `organizations` table determines **8 things** at the application level:

| Aspect | Region-determined behaviour |
|---|---|
| Vertical packs | AU pack, NZ pack, UK pack — different prompt libraries per region |
| Local directories | TrueLocal/Yellow Pages AU vs UK Yell vs US YP |
| Suburb/locality structure | NSW:Bondi (AU) vs London:Camden (UK) vs different geographic models |
| Currency display | A$, NZ$, £, US$, € |
| Tax handling | GST 10% (AU), GST 15% (NZ), VAT 20% (UK), state tax (US), VAT (EU) |
| Compliance flags | AHPRA/AFSL (AU), Medicines Act (NZ), GMC/SRA/FCA (UK), HIPAA (US) |
| Buyer prompt language | en-AU vs en-NZ vs en-GB vs en-US (spelling, terminology) |
| Recommended sources | LinkedIn AU vs Reddit (US/UK skew) etc. |

Some of these the user never sees directly (the system just behaves correctly). Others are exposed as configuration (currency on invoices, compliance options).

### Data model: region as a first-class concept

```
┌─────────────────┐
│  organizations  │
│                 │
│  id             │
│  name           │
│  slug           │
│  owner_id       │
│  tier           │
│  region: 'AU'   │ ◄── First-class field. Determines all region-aware behavior.
│                 │
└────────┬────────┘
         │
         │ one-to-many
         ▼
┌─────────────────┐
│     brands      │
│                 │
│  id             │
│  organization_id│
│  region         │ ◄── Inherited from organization (cached for query speed).
│                 │      Cannot be different from organization region.
│                 │      Brands are bound to their organization's region.
└─────────────────┘
```

**Key constraint:** a brand cannot have a different region from its organization. An AU agency manages AU brands. If they expand to UK clients, that becomes a separate organization (UK agency) — possibly under the same Clerk user, but a separate billing entity with separate data.

This avoids the complexity of cross-region brand support which would force multi-currency invoicing on a single bill.

### Architecture: region as a content router, not a deployment router

```
┌────────────────────────────────────────────────────────┐
│                  USER REQUEST                          │
│  (signed in, organization.region = 'AU')               │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│             API ROUTE / DOMAIN CALL                    │
│                                                        │
│  const region = currentUser.organization.region        │
│  const verticalPack = getVerticalPack(brand.vertical,  │
│                                       region)          │
│  const directories = getLocalDirectories(region)       │
│  const currency = getCurrency(region)                  │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│         REGION-AWARE CONTENT MODULES                   │
│                                                        │
│  lib/verticals/au/tradies.ts    (AU plumber/electrician│
│                                  prompts)              │
│  lib/verticals/nz/tradies.ts    (NZ trades prompts)    │
│  lib/verticals/uk/tradies.ts    (UK trades prompts)    │
│                                                        │
│  lib/locations/au/index.ts      (AU states + suburbs)  │
│  lib/locations/nz/index.ts      (NZ regions)           │
│  lib/locations/uk/index.ts      (UK counties)          │
│                                                        │
│  lib/local-seo/au-directories.ts  (TrueLocal etc.)     │
│  lib/local-seo/uk-directories.ts  (Yell etc.)          │
│                                                        │
│  lib/compliance/au-rules.ts     (AHPRA, AFSL)          │
│  lib/compliance/uk-rules.ts     (GMC, SRA, FCA)        │
└────────────────────────────────────────────────────────┘
```

**Critical design rule:** there is no `if (region === 'AU') { ... } else if (region === 'UK') { ... }` scattered through domain code. The pattern is always: **lookup region-specific module, call it with shared interface**.

### Module-level region implementation

Every region-aware module follows the same pattern:

```typescript
// lib/verticals/index.ts
import { auTradies, auAlliedHealth, auSaaS } from './au';
import { nzTradies, nzAlliedHealth, nzSaaS } from './nz';
import { ukTradies, ukAlliedHealth, ukSaaS } from './uk';

const VERTICAL_REGISTRY = {
  AU: { tradies: auTradies, allied_health: auAlliedHealth, saas: auSaaS },
  NZ: { tradies: nzTradies, allied_health: nzAlliedHealth, saas: nzSaaS },
  UK: { tradies: ukTradies, allied_health: ukAlliedHealth, saas: ukSaaS },
  // CA, US, EU added later (v2)
};

export function getVerticalPack(vertical: string, region: Region): VerticalPack {
  const pack = VERTICAL_REGISTRY[region]?.[vertical];
  if (!pack) {
    throw new AppError('VERTICAL_NOT_AVAILABLE', 
      `${vertical} pack not available for region ${region}`);
  }
  return pack;
}
```

**Adding a new region (or adding a vertical to an existing region) is then a 3-step process:**

1. Create new content module (e.g., `lib/verticals/uk/tradies.ts`)
2. Add it to the registry
3. Update region availability in pricing/onboarding

No domain logic changes. No database migrations. No deployment changes.

### Folder structure for multi-region content

The Foundations doc folder structure is updated to support this:

```
lib/
├── verticals/
│   ├── au/
│   │   ├── tradies.ts           (100+ AU tradie prompts) [v1]
│   │   ├── allied-health.ts     [v1]
│   │   ├── saas.ts              [v1]
│   │   ├── professional-services.ts  [v1.1]
│   │   ├── real-estate.ts       [v1.1]
│   │   ├── hospitality.ts       [v2]
│   │   ├── retail.ts            [v2]
│   │   ├── education.ts         [v2]
│   │   ├── automotive.ts        [v2]
│   │   ├── beauty.ts            [v2]
│   │   ├── legal.ts             [v2]
│   │   └── financial.ts         [v2]
│   ├── nz/                      (v1: stubs returning AU pack as fallback)
│   │   └── ... same vertical files
│   ├── uk/                      (v1: stubs)
│   │   └── ... same vertical files
│   ├── us/                      (v2: stubs)
│   ├── eu/                      (v2: stubs)
│   ├── ca/                      (v2: stubs)
│   └── shared/
│       ├── prompt-types.ts      (shared types across regions)
│       └── prompt-utils.ts      (shared utilities)
│
├── locations/
│   ├── au/
│   │   ├── states.ts            (NSW, VIC, QLD, etc.)
│   │   ├── suburbs.ts           (Bondi, Parramatta, etc. - 200+ suburbs)
│   │   └── postcodes.ts
│   ├── nz/                      (v1: stubs)
│   ├── uk/                      (v1: stubs - counties, postcodes)
│   ├── us/                      (v2: states, cities, ZIP codes)
│   ├── eu/                      (v2: country-specific)
│   └── ca/                      (v2: provinces, postal codes)
│
├── local-seo/
│   ├── au-directories.ts        (TrueLocal, Yellow Pages AU, Whitepages, Localsearch)
│   ├── nz-directories.ts        (Yellow NZ, Finda)
│   ├── uk-directories.ts        (Yell, Thomson Local, Scoot)
│   ├── us-directories.ts        (YP.com, BBB, Yelp)
│   ├── eu-directories.ts        (country-specific)
│   ├── ca-directories.ts        (Yellow Pages CA, Canada411)
│   └── shared/
│       └── nap-validator.ts     (NAP consistency logic, region-agnostic)
│
├── compliance/
│   ├── au-rules.ts              (AHPRA, AFSL, NSW Conduct Rules)
│   ├── nz-rules.ts              (Medicines Act, Health Practitioners)
│   ├── uk-rules.ts              (GMC, SRA, FCA, Advertising Standards)
│   ├── us-rules.ts              (HIPAA, ABA, FINRA)
│   ├── eu-rules.ts              (GDPR, country-specific)
│   ├── ca-rules.ts              (PIPEDA, provincial law society rules)
│   └── shared/
│       └── compliance-checker.ts (orchestration, region-agnostic)
│
└── pricing/
    ├── currency.ts              (region → currency mapping)
    ├── tax.ts                   (region → tax rules)
    └── stripe-products.ts       (region → product IDs)
```

### Region-aware Stripe products

Stripe handles multi-currency natively but each currency needs its own product:

| Tier | AU price | NZ price | UK price | US price | EU price | CA price |
|---|---|---|---|---|---|---|
| Free (feature-flagged) | A$0 | NZ$0 | £0 | US$0 | €0 | CA$0 |
| Starter | A$99 | NZ$109 | £55 | US$69 | €65 | CA$89 |
| Growth | A$299 | NZ$329 | £169 | US$209 | €199 | CA$269 |
| Agency | A$499 | NZ$549 | £279 | US$349 | €329 | CA$449 |
| Agency Pro | A$1,499 | NZ$1,649 | £849 | US$1,049 | €989 | CA$1,349 |

**Implementation:** maintain a Stripe product per (tier × currency) combination. Region determines which product the customer sees and pays for. The mapping lives in `lib/pricing/stripe-products.ts`.

**v1 scope:** only AU products created. NZ/UK/US/EU products created when those regions go live.

### Region-aware prompts and language

AU and UK English are similar but not identical. Spellings differ ("colour" vs "color"). Terminology differs ("solicitor" vs "lawyer", "GP" vs "primary care doctor"). Currency markers differ ("A$" vs "£" vs "$").

Prompt libraries per region account for this. The same vertical (e.g., legal) has materially different buyer prompts in AU vs UK vs US.

**Example: legal vertical tradies prompt comparison:**

```typescript
// lib/verticals/au/legal.ts (excerpt)
{
  prompt: "best family lawyer Sydney CBD for divorce settlement",
  intent: "high_intent_local",
  buyerStage: "decision",
}

// lib/verticals/uk/legal.ts (excerpt)
{
  prompt: "best family solicitor central London for divorce",
  intent: "high_intent_local",
  buyerStage: "decision",
}

// lib/verticals/us/legal.ts (excerpt)
{
  prompt: "top family law attorney Manhattan for divorce",
  intent: "high_intent_local",
  buyerStage: "decision",
}
```

Each prompt is hand-tuned to that region's actual buyer search behavior.

### Region in the user journey

```
SIGNUP FLOW (multi-region aware)
─────────────────────────────────

1. User clicks "Sign up" on visibleau.com
   ↓
2. Region detection (in priority order):
   a. URL path (/au, /nz, /uk) — explicit
   b. Geo-IP detection — automatic
   c. Default to AU — fallback
   ↓
3. Sign-up form shows region-appropriate:
   - Currency for pricing
   - Vertical pack options
   - Compliance check options
   ↓
4. User confirms region (can override detection)
   ↓
5. Organization created with region field set
   ↓
6. All subsequent behavior region-aware
```

**Region cannot be changed after creation.** Changing region would require:
- Migrating brand data to different prompt libraries
- Re-running audits with different vertical packs
- Switching currency mid-billing-cycle (Stripe complexity)

For users who genuinely need multiple regions (an agency with AU and UK clients), the design pattern is **separate organizations** under the same Clerk user. They get separate billing, separate dashboards, separate brand portfolios. This is intentional, not a limitation.

### Region in compliance reporting

Different regions have different compliance frameworks. The compliance module is structured per region:

```typescript
// lib/compliance/index.ts
export function getComplianceFlags(
  recommendation: Recommendation,
  region: Region,
  vertical: string
): ComplianceFlag[] {
  const rules = COMPLIANCE_RULES[region]?.[vertical] || [];
  return rules.flatMap(rule => rule.check(recommendation));
}

// lib/compliance/au-rules.ts (excerpt)
export const auHealthcareRules: ComplianceRule[] = [
  {
    id: 'ahpra-section-133',
    name: 'AHPRA Section 133 — Testimonials prohibited',
    check: (rec) => rec.type === 'add_testimonials' 
      ? [{ severity: 'block', reason: 'AHPRA Section 133' }]
      : []
  },
  // ...
];
```

Adding UK healthcare compliance is just adding `lib/compliance/uk-rules.ts` with UK-specific rules (GMC guidance, MHRA advertising rules).

### Region in observability

Every event tracked in PostHog is tagged with `region`. This lets us answer:
- Which regions are growing fastest?
- What's the conversion rate per region?
- Which verticals perform best in which regions?
- Where are we leaking customers?

```typescript
posthog.capture('audit_completed', {
  audit_id: audit.id,
  region: organization.region,
  vertical: brand.vertical,
  cost_usd: audit.totalCostUsd,
});
```

This is region-aware analytics from day 1, even though only AU is active in v1.

### What stays single-region in v1

Despite the multi-region design, these things remain single-region in v1:

| Component | v1 (single-region) | v2/v3 (when multi-region) |
|---|---|---|
| Database (Supabase) | Sydney only | Multi-region (Phase 2 doc) |
| App deployment | Sydney + edge | Regional Vercel deployments |
| Inngest workers | Default region | Region-pinned workers |
| Email sender | Single sender (resend@visibleau.com) | Region-specific senders |
| Support timezone | AU business hours | Follow-the-sun |
| Customer data residency | All in Sydney | Regional residency |

This is the trade-off: multi-region UX and content with single-region infrastructure. Phase 2 lifts the infrastructure into multi-region.

### Region-related ADRs (decisions made)

For future-Sri reference:

**ADR-MR-1: Region as tenant property, not separate deployments**  
Decision: store `region` on `organizations` table; share infrastructure across regions.  
Alternative considered: separate Vercel deployments per region (au.visibleau.com, etc.).  
Rationale: 10x simpler operationally; allows shared codebase; defers data residency complexity to v2.  
Trade-off accepted: data physically lives in Sydney for all regions in v1.

**ADR-MR-2: Region cannot change after organization creation**  
Decision: locking region at signup; multi-region agencies use multiple organizations.  
Alternative considered: allow region switching with data migration.  
Rationale: simpler billing, clearer data ownership, avoids edge cases in mid-billing-cycle changes.

**ADR-MR-3: Content as code, not as database rows**  
Decision: vertical packs, location data, compliance rules are TypeScript modules.  
Alternative considered: store all content in database for runtime editing.  
Rationale: simpler deployment (no migrations to update prompts), version-controllable, code-reviewable, testable.  
Trade-off: changing prompts requires a deploy. Acceptable at v1 scale.

**ADR-MR-4: Stripe products per (tier × currency), not single multi-currency products**  
Decision: separate Stripe products per region+tier combination.  
Alternative considered: single product with multi-currency prices.  
Rationale: cleaner reporting, easier tax handling per region, Stripe handles each combo cleanly.

---

## 8. Data architecture

### Logical data model

Six core entities. Relationships are mostly hierarchical.

```
┌─────────────┐       ┌─────────────────┐       ┌─────────────┐
│    users    │       │  organizations  │       │   brands    │
│             │ owns  │                 │ has   │             │
│  id (Clerk) ├──────►│  id (UUID)      ├──────►│  id (UUID)  │
│  email      │  1:1  │  name           │  1:N  │  name       │
│  name       │       │  slug           │       │  domain     │
└─────────────┘       │  tier           │       │  vertical   │
                      │  region         │       │  regions    │
                      │  stripe_id      │       │  competitors│
                      └─────────────────┘       └──────┬──────┘
                                                       │
                                                       │ has many
                                                       ▼
                                                ┌─────────────┐
                                                │   audits    │
                                                │             │
                                                │  id (UUID)  │
                                                │  status     │
                                                │  scores     │
                                                │  cost       │
                                                └──────┬──────┘
                                                       │
                                                       │ has many
                                          ┌────────────┼────────────┐
                                          ▼                         ▼
                                   ┌─────────────┐          ┌──────────────────┐
                                   │  citations  │          │  recommendations │
                                   │             │          │                  │
                                   │  prompt     │          │  title           │
                                   │  engine     │          │  category        │
                                   │  response   │          │  priority        │
                                   │  mentioned  │          │  effort          │
                                   │  position   │          │  expected_lift   │
                                   │  sentiment  │          │  research_cite   │
                                   │  context    │          │  status          │
                                   └─────────────┘          └──────────────────┘
```

### Data volume expectations

For unit economics planning:

| Entity | Per-organization scale | Total system scale (year 1) |
|---|---|---|
| Users | 1-10 | 100-1,000 |
| Organizations | 1 | 50-200 |
| Brands | 1-25 (Agency Pro) | 500-2,000 |
| Audits | 1/week × 25 brands × 52 = 1,300 | 50,000 |
| Citations | 1,300 × 200 = 260,000 | 10M+ |
| Recommendations | 1,300 × 5 = 6,500 | 500,000 |

**Implication:** Citations table is the hot table. Index on `(audit_id, engine, brand_mentioned)` is critical. Consider partitioning by month if growth exceeds projections.

### Data retention strategy

| Entity | Retention | Rationale |
|---|---|---|
| Users | Indefinite | Customer relationship data |
| Organizations | Indefinite | Customer relationship data |
| Brands | Indefinite while subscription active; delete 90 days after cancellation | Business operational data |
| Audits | 12 months for free/Starter; indefinite for Growth+ | Differentiation; cost containment |
| Citations | 6 months on free; 12 months on Starter; 24 months on Growth; indefinite on Agency+ | Storage cost vs feature value |
| Recommendations | Same as audits | Tied to audit lifecycle |

---

## 9. Deployment architecture

```
┌──────────────────────────────────────────────────────────┐
│                    GLOBAL EDGE                           │
│  Vercel Edge Network (CDN + Edge Functions)              │
│  - Marketing pages cached globally                       │
│  - Auth-required pages: route to nearest region          │
└─────────┬────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────┐
│                  PRIMARY REGION (Sydney)                 │
│                                                          │
│  ┌─────────────────────────────────────────────────┐     │
│  │  Vercel Serverless (ap-southeast-2)             │     │
│  │  - Next.js app                                  │     │
│  │  - API routes                                   │     │
│  └────────────┬────────────────────────────────────┘     │
│               │                                          │
│               ▼                                          │
│  ┌─────────────────────────────────────────────────┐     │
│  │  Supabase (Sydney region)                       │     │
│  │  - Postgres (primary)                           │     │
│  │  - Storage (S3-compatible)                      │     │
│  └─────────────────────────────────────────────────┘     │
│                                                          │
│  ┌─────────────────────────────────────────────────┐     │
│  │  Inngest (managed, multi-region)                │     │
│  │  - Audit job execution                          │     │
│  │  - Scheduled refreshes                          │     │
│  └─────────────────────────────────────────────────┘     │
│                                                          │
└──────────────────────────────────────────────────────────┘
                  │
                  ▼ external API calls
┌──────────────────────────────────────────────────────────┐
│                  EXTERNAL APIS                           │
│  OpenAI (US), Anthropic (US), Google AI (multi-region),  │
│  Perplexity (US), Stripe (multi-region), Resend (US)     │
└──────────────────────────────────────────────────────────┘
```

**Deployment characteristics:**

- **Primary region:** ap-southeast-2 (Sydney) for latency to AU customers
- **Edge:** marketing pages cached globally for low time-to-first-byte
- **No multi-region writes:** all writes go to Sydney Postgres
- **Disaster recovery:** Supabase daily backups; point-in-time recovery on Pro tier
- **Scaling:** Vercel auto-scales serverless functions; Supabase scales connection pooling

**Why ap-southeast-2 specifically:**
- Latency to AU users < 50ms
- Data residency for AU customers (a Pro tier feature in v2)
- Compliance-friendly for AU healthcare/legal customers

---

## 10. Security architecture

### Authentication and authorization

```
┌─────────────────────────────────────────────────┐
│  USER REQUEST                                   │
└─────────┬───────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────┐
│  CLERK MIDDLEWARE                               │
│  - Validates session JWT                        │
│  - Attaches user.id to request                  │
│  - 401 if invalid/missing                       │
└─────────┬───────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────┐
│  AUTHORIZATION CHECK (in API route)             │
│  - User belongs to organization?                │
│  - Resource belongs to organization?            │
│  - User role allows this action?                │
│  - 403 if any fail                              │
└─────────┬───────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────┐
│  INPUT VALIDATION (Zod schema)                  │
│  - Type check                                   │
│  - Constraint check (length, range, enum)       │
│  - 400 if invalid                               │
└─────────┬───────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────┐
│  DOMAIN LOGIC EXECUTION                         │
└─────────────────────────────────────────────────┘
```

### Data security

- **In transit:** all API traffic over HTTPS (Vercel default)
- **At rest:** Supabase encrypts all data at rest (AES-256)
- **PII minimization:** only collect email, name, organization. No phone, no address, no payment details (Stripe holds those).
- **Secrets management:** all credentials in environment variables. No secrets in code. No secrets in client-side code.
- **API keys:** rotated quarterly. Revocation procedures documented.

### Threat model (high level)

| Threat | Mitigation |
|---|---|
| SQL injection | Drizzle ORM parametrizes all queries |
| XSS | React escapes by default; no `dangerouslySetInnerHTML` with user input |
| CSRF | Clerk session tokens; SameSite cookies |
| Cross-tenant data access | Every query filters by organization_id |
| Account takeover | Clerk handles MFA option, password security |
| LLM prompt injection | User-provided text is escaped before LLM calls |
| Cost-based DoS | Rate limits per organization on audit creation |

### What's deliberately not in v1 security scope

- SOC 2 compliance (year 2 if we go upmarket)
- HIPAA (we're not handling PHI)
- ISO 27001 (year 3+ if enterprise demand)
- Penetration testing (done before any enterprise contract)

---

## 11. Performance architecture

### Performance targets

| Operation | Target | Rationale |
|---|---|---|
| Marketing page load | < 1s (FCP) | Conversion-critical |
| Dashboard load | < 2s | Authenticated user expectation |
| API response (non-LLM) | < 500ms p95 | Snappy feel |
| Audit completion | < 10 min for 50-prompt audit | User patience |
| LLM call (single) | < 30s timeout | Bound user wait |
| Recommendation generation | < 30s | Inngest step |

### Performance strategies

**Caching:**
- Marketing pages: edge-cached for 1 hour
- Static assets: long-cache via Vercel edge
- API responses: short cache for read-heavy endpoints (5-60s) — but multi-tenant, so cache key includes organization_id
- LLM responses: NOT cached (we want fresh data per audit)

**Concurrency:**
- LLM calls: parallelized per engine within rate limits
- Database queries: connection pooling via Supabase
- Audits: each audit is its own Inngest job; multiple can run in parallel

**Database optimization:**
- Indexes on hot query paths: `(organization_id, created_at)`, `(brand_id, created_at)`, `(audit_id, engine)`
- JSONB for semi-structured fields (`primary_regions`, `competitors`, `cited_sources`) to avoid join complexity
- Partitioning consideration if citations table grows past 100M rows

**Cost optimization:**
- LLM calls are the dominant cost (~$2-3 per audit)
- Cap audit frequency per tier (Starter: weekly, Growth: 3x/week, Agency: daily, Agency Pro: 2x/day)
- Cache LLM responses for retries (within an audit run, not across audits)
- Use **tier-aware model selection** for primary brand-mention queries (per PRD §10 Layer 3 "Tier-based provider routing"):
  - **Free / Starter:** cheapest competent models — Gemini Flash (Google), Claude Haiku (Anthropic), GPT-4o-mini (OpenAI), Sonar (Perplexity)
  - **Growth:** mid-tier — GPT-4o-mini, Claude Sonnet
  - **Agency Pro:** top-tier — GPT-4o, Claude Opus, Gemini Pro
- Use cheapest capable model per **derived task regardless of tier**: Claude Haiku for sentiment classification, Haiku for context labelling. These run on extracted snippets, not full LLM responses, so quality at the cheap tier is sufficient.
- The model dispatcher (`lib/llm/model-selector.ts`, planned Sprint 3) takes `(tier, task)` and returns the model identifier. Single source of truth for tier→model mapping.

---

## 12. Failure modes and resilience

### What can fail

| Component | Failure mode | Impact | Mitigation |
|---|---|---|---|
| LLM API outage | Timeout, 5xx | Audit fails partially | Skip failed prompts; complete with partial data; retry on next refresh |
| LLM API rate limit | 429 | Audit slows | Exponential backoff; concurrency caps |
| Supabase outage | DB unavailable | Whole system down | Status page; Supabase has 99.9% SLA |
| Inngest outage | Jobs queue up | Audits delayed | Inngest retries when service returns |
| Clerk outage | New logins fail | Existing sessions work | Status page; Clerk has 99.9% SLA |
| Stripe outage | New subscriptions blocked | Existing subscriptions unaffected | Webhook retries; subscription state cached |
| Resend outage | Emails delayed | User notifications delayed | Queue retries; not user-blocking |

### Resilience patterns in the system

1. **Idempotency:** every Inngest step is idempotent so retries are safe
2. **Partial completion:** audits succeed even if some LLM calls fail
3. **Graceful degradation:** UI handles missing data fields without crashing
4. **Status visibility:** users see "audit running" state and can check progress
5. **Error visibility:** errors logged to Sentry with full context
6. **No data loss:** all events go to durable storage (Postgres or Inngest queue) before processing

---

## 13. Observability

### Three pillars of visibility

```
┌───────────────────────────────────────────────────────┐
│  LOGS                                                 │
│  Where: Vercel logs + Inngest logs + Supabase logs    │
│  What: API requests, job execution, DB queries        │
│  Retention: 7 days (Vercel free tier)                 │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│  METRICS                                              │
│  Where: PostHog (product) + Vercel Analytics (perf)   │
│  What: Audit creation rate, completion time, cost     │
│        per audit, conversion funnel, page latency     │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│  ERRORS                                               │
│  Where: Sentry                                        │
│  What: Exceptions, performance issues, source-mapped  │
│        stack traces                                   │
└───────────────────────────────────────────────────────┘
```

### Key metrics to track from day 1

**Business metrics (PostHog):**
- Sign-up to first-audit conversion
- First-audit to second-audit conversion (engagement)
- Trial to paid conversion
- MRR per tier
- Churn rate
- Top action types (which recommendations users complete)

**Operational metrics (Vercel + custom):**
- Audit completion time (p50, p95, p99)
- LLM API latency per provider
- Error rate per API endpoint
- Cost per audit (USD)

**System health (uptime monitoring):**
- App availability (Vercel built-in)
- Database availability (Supabase)
- Critical workflow synthetic tests (sign-up flow, audit creation)

---

## 14. Evolutionary architecture

The system is designed to evolve through three eras:

### Era 1: MVP (months 1-6)
- Solo founder, < 50 customers
- All decisions optimized for solo-dev velocity
- Wrap external services in interfaces but don't migrate prematurely
- Single region (Sydney)

### Era 2: Growth (months 7-18)
- 50-500 customers, possible co-founder addition
- Move some decisions toward operational maturity:
  - Add NZ/UK/CA region prompt libraries (architecture is ready)
  - Add API access for enterprise tier
  - Migrate background jobs to Postgres-backed (Graphile Worker) if Inngest pricing tightens
  - Possibly add read replicas for Postgres
- Begin adding compliance features (SOC 2 prep)

### Era 3: Scale (months 19+)
- 500+ customers
- Replace pieces that have hit limits:
  - Auth: evaluate Better Auth or Auth.js if Clerk costs scale poorly
  - Hosting: evaluate AWS direct if Vercel pricing scales poorly
  - Database: evaluate read replicas + dedicated Postgres clusters
- Add geographic redundancy
- Multi-region writes become possible (but expensive)

**Key architectural decision for evolution:** because all external services are wrapped in interfaces, and domain logic is pure, each era's migration is incremental. No "big rewrite" should ever be needed.

---

## 15. Architecture decision summary

The most consequential decisions, captured for future reference:

| Decision | Choice | Alternative considered | Reason |
|---|---|---|---|
| API style | REST + OpenAPI | tRPC | Decouples frontend/backend; external API story |
| ORM | Drizzle | Prisma | More SQL-native; easier to migrate off Supabase |
| Auth | Clerk (wrapped) | Better Auth, Auth.js | Faster to ship; wrapper protects against lock-in |
| Jobs | Inngest (wrapped) | Graphile Worker | DX advantage; wrapper protects against lock-in |
| LLM access | Vercel AI SDK | Direct provider SDKs | Multi-provider abstraction critical |
| Database | Postgres via Supabase | Neon, AWS RDS | Bundled features (auth backup, storage) at MVP scale |
| Hosting | Vercel | AWS, Railway | Velocity for solo dev; Dockerfile escape hatch |
| Frontend | Next.js 15 | TanStack Start, Remix | Largest community, mature ecosystem |
| State | TanStack Query | Redux, Zustand | Server-state focus; minimal boilerplate |
| Mobile | PWA only | React Native | B2B dashboard usage; mobile is glance-only |

---

## 16. What this architecture is NOT optimized for

Honest acknowledgment of trade-offs:

- **Not optimized for ultra-low cost.** Vercel + Supabase + Inngest stack is more expensive than self-hosted equivalents. Trade-off accepted for solo-dev velocity.

- **Not optimized for enterprise compliance.** SOC 2, HIPAA, FedRAMP would require infrastructure changes. Deliberately out of scope for v1.

- **Not optimized for ultra-high scale.** Architecture supports 1,000-10,000 customers comfortably. Beyond that, components need re-evaluation.

- **Not optimized for offline use.** Requires internet connection; no offline-first PWA capabilities planned.

- **Not optimized for real-time collaboration.** Single-user-at-a-time editing model. No Google Docs-style multi-cursor.

- **Not optimized for global low-latency.** Sydney-primary. International users will see additional latency.

These are deliberate choices, not oversights. They match the customer profile (AU agencies, single-user editing of brand profiles, B2B dashboard usage) and the business stage (solo founder, < $1M ARR target year 1).

---

## 17. Document boundaries

This is the architecture overview. Three other documents complete the picture:

- **PRD v1.3** — what we build (features, market, customer pain points). The "what."
- **Foundations doc v1.0** — engineering conventions, file structure, patterns. The "how."
- **Architecture overview (this doc)** — system topology, data flows, deployment. The "where."

Future documents we might add:
- **Detailed HLD** (formal traditional format) — sectional spec for each subsystem
- **API reference** — auto-generated from OpenAPI spec
- **Runbook** — operational procedures (deploys, incidents, recovery)
- **Architecture Decision Records (ADRs)** — one document per major decision with context and rationale

This document is the living reference. Update as architecture evolves.
