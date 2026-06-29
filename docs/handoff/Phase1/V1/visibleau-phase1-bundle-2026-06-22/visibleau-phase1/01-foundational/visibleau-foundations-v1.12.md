# VisibleAU — Engineering Foundations

**Version:** 1.12
**Date:** 15 May 2026
**Purpose:** Project-wide engineering context for Claude Code.

**Changelog:**
- v1.0 (4 May 2026): Initial draft
- v1.1 (6 May 2026): Conflict resolution pass.
- v1.2 (6 May 2026): Round 3 — pgEnum for tier/region/vertical; deletedAt; auth response policy.
- v1.3 (6 May 2026): Round 5 — Tier/Region/Vertical type exports; totalCostUsd column.
- v1.4 (7 May 2026): Round 9 — auditNumber, organizationId denormalized, scoreComposite columns; two new indexes.
- v1.5 (7 May 2026): Round 10 — added explicit Drizzle import block for audits schema.
- v1.6 (7 May 2026): Round 12 — added `subscription_cancelled_at` timestamp column to organizations (set by Stripe webhook on customer.subscription.deleted).
- v1.7 (9 May 2026): Round 19 — (a) added `score_sentiment_numeric` and `score_context_numeric` columns to audits; (b) promoted `metadata jsonb` and `confidence_intervals jsonb` into Foundations canonical schema; (c) added `jsonb` to drizzle-orm/pg-core import; (d) clarified `citations.engine` is text deliberately for v1.1+ extensibility.
- v1.8 (9 May 2026): Round 29 cross-doc propagation — (a) scoreContextNumeric comment commodified=0 → 25; (b) added v1.11+ strategic posture references section.
- v1.9 (9 May 2026): Round 30 cross-doc gap fixes — (a) added `region/`, `feature-flags/`, `brands/` to canonical lib folder tree; (b) `audits.metadata` schema comment expanded with full mock-scenario list.
- v1.10 (13 May 2026): **Second-pass-fix audit** — (N2) `organizations.tier` schema default `'starter'` → `'free'`; (N17) Backend section OpenAPI deferred to v1.1.
- v1.11 (13 May 2026): **Third-pass-fix audit B4** — Performance defaults section corrected with tier-aware engine count and N3 combined multidim+technical budget.
- v1.12 (15 May 2026): **Sixth-pass audit** — 4 schema conflicts with CLAUDE.md + Sprint 1 fixed. **(T1)** `regionEnum` values corrected from uppercase `'AU','NZ',...` to lowercase `'au','nz',...` — Sprint 1 and CLAUDE.md §5 both use lowercase; Foundations was the outlier. `organizations.region` default corrected to `'au'`. **(T5)** Organizations schema reconciled to CLAUDE.md Clerk model: removed `slug` (unused), removed `ownerId text FK→users` (conflicts with Clerk org sync model), added `clerkOrgId text unique` (the Clerk sync column per CLAUDE.md §5 + Sprint 1); added `updatedAt`, `deletedAt`, `metadata`. **(T6)** Users schema reconciled to Sprint 1 + CLAUDE.md: changed from `id text PK` (Clerk user ID as PK) to `id uuid PK` + `clerkUserId text unique` + `organizationId uuid FK` + `role text`. **(T7)** Brands schema: `primaryRegions jsonb` → `text[] array` + `competitors jsonb` → `text[] array` to match Sprint 1 (text[] is canonical for v1; added `updatedAt`). Authorization section updated to remove `organizations.ownerId` reference.

---

## How to use this document

At the start of every Claude Code session, paste the foundations doc + the current sprint prompt. The foundations doc tells Claude Code "how we build everything." The sprint prompt tells it "what we're building this week."

If a decision in this document conflicts with the sprint prompt, the sprint prompt wins for that specific work (but flag it so we can update the foundations doc).

---

## What VisibleAU is (engineering perspective)

VisibleAU is a SaaS platform that:

1. Crawls and queries multiple LLM APIs (OpenAI, Anthropic, Google, Perplexity) to detect brand citations
2. Stores audit results with multidimensional scoring
3. Generates research-backed action recommendations
4. Provides multi-brand dashboards for AU agencies
5. Integrates AU-specific local SEO signals
6. Generates technical AI infrastructure files (llms.txt, schema)

**Engineering character:** Async-heavy backend (LLM calls take time), data-intensive (millions of citation records), multi-tenant (agencies manage many brands), AU-region aware.

---

## v1.11+ strategic posture references (added v1.8, Round 29)

Foundations remains the canonical source of truth for tech stack, folder structure, naming conventions, and database schema. This section forward-references PRD-level strategic posture changes from Rounds 22-28 that engineers reading Foundations alone should be aware of:

### OSS reference strategy (PRD §16, v1.11 reversal)

- VisibleAU does **not** use any OSS GEO/AEO library as a production dependency in v1. The audit module re-implements selected patterns from MIT-licensed reference sources (primarily Auriti-Labs/geo-optimizer-skill v4.6.0, plus danishashko/geo-aeo-tracker, ai-search-guru/getcito, Foglift, Bhanunamikaze/Agentic-SEO-Skill) — 11 OSS sources catalogued in PRD §16.
- All re-implementation lands in VisibleAU's own codebase, integration-tested against a 50-site validation corpus (Sprint 7 prerequisite).
- ATTRIBUTIONS.md is a required deliverable per PRD §16 sprint deliverable matrix:
  - Sprint 7: first version (audit module references)
  - Sprint 8: adds output-format + confidence-label + webhook references
  - Sprint 9: adds multi-brand routing references
  - Sprint 11: adds AI context files + SCORING_RUBRIC.md references
  - Sprint 12: final pre-launch review + npm package attributions

### 50-site validation corpus (Sprint 7 prerequisite)

- Composition: 5 AU Tradies + 5 AU Allied Health + 5 AU SaaS + 5 each US/UK/CA/NZ comparables + 5 known-good high-citation + 5 known-bad low-citation = 50 total.
- Sprint 7 audit module passes when Spearman correlation > 0.7 between audit scores and observed citation patterns across the corpus.
- Recommended location: `/tests/validation-corpus/au-tradies.json`, `/tests/validation-corpus/au-allied-health.json`, etc. Each corpus file is a JSON array of `{ domain, vertical, region, expected_score_band, known_citation_evidence }` records.
- Sprint 3's "5 real-domain audits" requirement is the seed for this corpus per Sprint 3 "How to know you're ready" guidance.

### Audit-side scoring (Sprint 7 + Sprint 8 expanded scope)

Sprint 7 audit module ships ~22 additional days of work beyond the original §11 Sprint 7 baseline, per PRD §11 v1.14 update:

- **8 scoring dimensions** (per Auriti reference): Robots /18, llms.txt /18, Schema /16, Meta /14, Content /12, Brand & Entity /10, Signals /6, AI Discovery /6 (sum = 100). Composite score band: Excellent 86-100 / Good 68-85 / Foundation 36-67 / Critical 0-35.
- **27 AI bots tracked** in robots.txt audit across 3 tiers (training, search, user-agent).
- **CDN crawler access check** (Cloudflare/Akamai/Vercel) — detects silent blocking even when robots.txt allows.
- **AI discovery endpoints** detection: `.well-known/ai.txt`, `/ai/summary.json`, `/ai/faq.json`.
- **AU-localised Brand & Entity scoring**: ABN Lookup integration + Wikipedia AU + AU TLD signal + AU directory presence aggregate (Hipages + Yellow Pages AU + ServiceSeeking + Word of Mouth = 4 directories).
- **47 citability methods catalogue** (Princeton KDD 2024 + AutoGEO ICLR 2026) exposed in Action Center recommendations.

Sprint 8 ships ~5-7 additional days beyond baseline:

- **SARIF + JUnit + GitHub Actions** output formats (in addition to PDF + CSV + JSON).
- **Confidence labels** for Action Center recommendations: Confirmed (research-backed +20%+) / Likely (moderate evidence) / Hypothesis (emerging) — **categorical, not %-numeric** per PRD §8.5 anti-pattern against single-number scores.
- **Webhook integrations**: Slack / Discord / Sheets / Airtable / custom + code recipes for Zapier / n8n / Make.com.

### Engine roadmap clarification (PRD §7 + Sprint 1 v1.11)

- **v1 ships 4 engines on all paid tiers**: ChatGPT, Claude, Gemini, Perplexity.
- **v1.1 (Q3 2026)**: adds Copilot + Google AI Overviews to Growth+ tiers.
- **v1.2 (Q4 2026)**: adds DeepSeek + Grok to Agency Pro tier.
- Stripe product descriptions must reflect v1 engines only — do NOT claim 6 or 8 engines until they actually ship. Per PRD §7 engine roadmap note (Round 19) + Sprint 1 v1.11 fix (Round 29 Conflict 1).

### Citation source enum (TikTok forward-compat)

`citations.cited_sources` `type` field includes `'tiktok'` from Sprint 2 for v1.1 forward-compatibility; detection logic ships in v1.1 Month 8 (per PRD §8.5 + §8.7).

---

## Tech stack (locked decisions for v1)

These are the choices for the 12-week MVP. Don't change them mid-build.

### Frontend
- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS + shadcn/ui components
- **Data fetching:** TanStack Query (React Query) for client state
- **Forms:** React Hook Form + Zod for validation
- **Charts:** Recharts (for visibility dashboards)
- **Icons:** Lucide React

### Backend
- **API style:** REST via Next.js API routes (NOT tRPC — keep frontend/backend decoupled). OpenAPI spec generation deferred to v1.1 alongside Growth+ tier external API access (CLAUDE.md §2 v1.1 deferred list). v1 routes are documented via Zod schemas + handler comments only.
- **API location:** Next.js API routes (`app/api/`)
- **Validation:** Zod schemas shared between frontend and backend
- **Type generation:** `openapi-typescript` deferred to v1.1 when the OpenAPI spec ships.

### Database
- **Primary:** PostgreSQL via Supabase
- **ORM:** Drizzle ORM (NOT Prisma — Drizzle is more SQL-native, easier to migrate off Supabase if needed)
- **Migrations:** Drizzle Kit
- **Connection pooling:** Supabase built-in

### Infrastructure (behind interfaces — never call directly)
- **Auth:** Clerk (wrapped in `lib/auth/` interface)
- **Background jobs:** Inngest (wrapped in `lib/jobs/` interface)
- **LLM APIs:** Vercel AI SDK (multi-provider)
- **Payments:** Stripe (wrapped in `lib/payments/` interface)
- **Email:** Resend (wrapped in `lib/email/` interface)
- **File storage:** Supabase Storage
- **Errors:** Sentry
- **Analytics:** PostHog

### Hosting
- **App:** Vercel
- **Database:** Supabase (managed Postgres)
- **Workers:** Inngest hosted

### Dev tooling
- **Package manager:** pnpm
- **Linting:** ESLint + Prettier
- **Testing:** Vitest (unit), Playwright (e2e)
- **CI:** GitHub Actions

---

## Folder structure

```
visibleau/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth-required routes
│   │   ├── dashboard/
│   │   ├── audit/
│   │   ├── brands/
│   │   ├── settings/
│   │   └── layout.tsx
│   ├── (marketing)/              # Public routes
│   │   ├── page.tsx              # Landing page
│   │   ├── pricing/
│   │   └── layout.tsx
│   ├── api/                      # API routes
│   │   ├── audits/
│   │   ├── brands/
│   │   ├── webhooks/
│   │   └── inngest/
│   └── layout.tsx
│
├── components/                   # React components
│   ├── ui/                       # shadcn/ui primitives
│   ├── audit/                    # Audit-specific components
│   ├── dashboard/                # Dashboard components
│   ├── brand/                    # Brand management components
│   └── shared/                   # Cross-feature components
│
├── lib/                          # Domain logic + integrations
│   ├── auth/                     # Clerk wrapper
│   │   ├── interface.ts          # Public auth interface
│   │   └── clerk-impl.ts         # Clerk-specific implementation
│   ├── jobs/                     # Inngest wrapper
│   │   ├── interface.ts
│   │   └── inngest-impl.ts
│   ├── llm/                      # LLM API abstraction
│   │   ├── interface.ts
│   │   ├── openai-impl.ts
│   │   ├── anthropic-impl.ts
│   │   ├── google-impl.ts
│   │   └── perplexity-impl.ts
│   ├── payments/                 # Stripe wrapper
│   ├── email/                    # Resend wrapper
│   ├── audit/                    # Audit domain logic (PURE)
│   │   ├── runner.ts             # Orchestrates an audit
│   │   ├── scorer.ts             # Multidimensional scoring
│   │   ├── citation-detector.ts  # Detects brand mentions
│   │   └── recommendation-engine.ts
│   ├── verticals/                # AU vertical packs
│   │   ├── tradies.ts
│   │   ├── allied-health.ts
│   │   ├── saas.ts
│   │   └── shared/
│   ├── locations/                # AU location/suburb data
│   ├── research/                 # Research citations database
│   ├── region/                   # Region detection (pure detectRegion() + middleware integration)
│   │   ├── detect.ts             # Pure function: input { pathname, geoCountry } → Region
│   │   └── index.ts              # Barrel export
│   ├── feature-flags/            # Env-driven feature flag reads
│   │   └── index.ts              # isFreeTierEnabled(region), etc.
│   ├── brands/                   # Brand domain logic (CRUD authorisation, region inheritance)
│   │   └── index.ts              # Pure functions; used by app/api/brands routes
│   └── utils/                    # Pure utilities
│
├── db/                           # Database
│   ├── schema/                   # Drizzle schemas
│   ├── migrations/
│   └── client.ts
│
├── inngest/                      # Background job functions
│   ├── functions/
│   │   ├── run-audit.ts
│   │   ├── refresh-audit.ts
│   │   └── send-alerts.ts
│   └── client.ts
│
├── public/                       # Static assets
├── tests/                        # Test files
├── scripts/                      # CLI scripts
├── .env.example
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── drizzle.config.ts
└── README.md
```

**Key rule:** Domain logic in `lib/` is pure TypeScript with no framework dependencies. Routes call domain logic. This way the frontend or backend can be replaced without rewriting business logic.

---

## Naming conventions

### Files and folders
- **kebab-case** for files: `citation-detector.ts`, `audit-runner.ts`
- **kebab-case** for folders: `vertical-packs/`, `audit/`
- **PascalCase** for React component files: `AuditCard.tsx`, `BrandSelector.tsx`
- **lowercase** for Next.js special files: `page.tsx`, `layout.tsx`, `route.ts`

### TypeScript
- **PascalCase** for types/interfaces: `AuditResult`, `BrandConfig`
- **camelCase** for variables/functions: `runAudit`, `detectCitations`
- **SCREAMING_SNAKE_CASE** for constants: `MAX_PROMPTS_PER_AUDIT`, `DEFAULT_VERTICAL`
- **Prefix interfaces with I only when needed for disambiguation:** Avoid `IAudit`. Use `Audit`. If there's a conflict with a class, use `AuditInterface`.

### Database
- **snake_case** for tables and columns: `audit_results`, `created_at`
- **Plural** for tables: `audits`, `brands`, `users` (not `audit`, `brand`)
- **Foreign keys:** `<table>_id` — `brand_id`, `user_id`
- **Timestamps:** `created_at`, `updated_at`, `deleted_at` (soft deletes)

### API routes
- RESTful conventions: `GET /api/brands`, `POST /api/audits`, `GET /api/audits/:id`
- Plural resource names
- Action endpoints when REST doesn't fit: `POST /api/audits/:id/refresh`

---

## Data models (core schemas)

### Users (managed by Clerk, mirrored in our DB)

```typescript
// db/schema/users.ts
// T6 fix (sixth-pass audit): Foundations originally used id=text(clerkUserId) as PK directly.
// Sprint 1 + CLAUDE.md §4 ("One or more users rows per org") use uuid PK + clerkUserId as a
// separate sync column. CLAUDE.md model adopted as canonical — Clerk user ID is a reference, not our PK.
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),           // Internal UUID PK
  clerkUserId: text('clerk_user_id').unique().notNull(), // Clerk sync reference
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  email: text('email').notNull(),
  name: text('name'),
  role: text('role').default('member').notNull(),        // 'owner' | 'admin' | 'member'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### Organizations (agencies)

```typescript
// db/schema/enums.ts — define enums in a shared file (referenced by multiple tables)
import { pgEnum } from 'drizzle-orm/pg-core';

export const tierEnum = pgEnum('tier', [
  'free', 'starter', 'growth', 'agency', 'agency_pro', 'enterprise'
]);

export const regionEnum = pgEnum('region', [
  'au', 'nz', 'uk', 'us', 'eu', 'ca'   // lowercase — matches Sprint 1 + CLAUDE.md §5 canonical ('au' | 'nz' | 'uk' | 'us' | 'ca' | 'eu')
                                          // T1 fix (sixth-pass audit): Foundations had uppercase 'AU','NZ' etc. which conflicted with Sprint 1 schema and CLAUDE.md.
]);

export const verticalEnum = pgEnum('vertical', [
  // v1
  'tradies', 'allied_health', 'saas',
  // v1.1
  'professional_services', 'real_estate',
  // v2 — added in future migration
  // 'hospitality', 'retail', 'education', 'automotive', 'beauty', 'legal', 'financial'
]);

// Type exports — single source of truth for application code
export type Tier = typeof tierEnum.enumValues[number];
export type Region = typeof regionEnum.enumValues[number];
export type Vertical = typeof verticalEnum.enumValues[number];

// db/schema/organizations.ts
// T5 fix (sixth-pass audit): Foundations originally had slug+ownerId pattern which contradicts
// CLAUDE.md §4 "One organizations row per Clerk org" + §5 "clerkOrgId TEXT UNIQUE — sync from Clerk webhook."
// Sprint 1 follows CLAUDE.md correctly. Reconciled: slug+ownerId removed; clerkOrgId added;
// updatedAt/deletedAt/metadata added; subscriptionCancelledAt retained (Foundations v1.6 canonical; Sprint 10 sets it).
import { tierEnum, regionEnum } from './enums';
import { sql } from 'drizzle-orm';

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerkOrgId: text('clerk_org_id').unique().notNull(), // Clerk organization ID — synced via webhook on org.created
  name: text('name').notNull(),
  tier: tierEnum('tier').notNull().default('free'),
  region: regionEnum('region').notNull().default('au'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  subscriptionCancelledAt: timestamp('subscription_cancelled_at', { withTimezone: true }), // Set by Stripe webhook customer.subscription.deleted. v1.6 canonical.
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(), // Free-form. Sprint 2: { mockScenario }. Sprint 10: { firstTimeFlowComplete }.
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), // Soft-delete
});
```

**Why pgEnum (not text + Zod check):** Defense in depth. If application validation is bypassed (bug, raw SQL, direct DB access), the DB rejects bad values. ENUMs also self-document the schema and become the canonical type source for TypeScript. Trade-off: adding/removing values requires a controlled migration — that friction is appropriate for a security-relevant column.

### Brands

```typescript
// db/schema/brands.ts
// T7 note (sixth-pass audit): Foundations originally used jsonb for primaryRegions + competitors.
// Sprint 1 uses text[] (Drizzle .array()). Both are valid; text[] is simpler for fixed-shape string arrays.
// Sprint 1's text[] adopted as canonical for v1 since it's already in the migration.
// If query patterns later require jsonb operators, a migration can change column type.
export const brands = pgTable('brands', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  region: regionEnum('region').notNull(), // Inherited from organization at creation; cached for query speed; immutable after
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  vertical: verticalEnum('vertical').notNull(),
  primaryRegions: text('primary_regions').array().default([]).notNull(), // ['NSW:Bondi', 'NSW:Parramatta'] — sub-region locations
  competitors: text('competitors').array().default([]).notNull(), // ['competitor1.com', 'competitor2.com']
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), // Soft delete; null = active
});
```

### Audits

```typescript
// db/schema/audits.ts
export const audits = pgTable('audits', {
  id: uuid('id').defaultRandom().primaryKey(),
  brandId: uuid('brand_id').references(() => brands.id).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(), // Denormalized from brand for tenant filtering speed
  auditNumber: integer('audit_number').notNull(), // Per-organization serial (1, 2, 3...). Used in UI as "Audit #143". Generated atomically on insert (see lib/audit/numbering.ts).
  status: text('status').notNull().default('pending'), // 'pending' | 'running' | 'complete' | 'failed'
  triggeredBy: text('triggered_by').notNull(), // 'manual' | 'scheduled' | 'webhook'
  promptCount: integer('prompt_count').notNull(),
  engineCount: integer('engine_count').notNull(),
  scoreFrequency: numeric('score_frequency', { precision: 5, scale: 2 }), // 0.00-100.00
  scoreSentiment: text('score_sentiment'), // Categorical label: 'positive' | 'neutral' | 'negative'. Populated by Sprint 3 sentiment analyzer.
  scoreSentimentNumeric: numeric('score_sentiment_numeric', { precision: 5, scale: 2 }), // 0.00-100.00. Numeric companion of scoreSentiment (label is for UI badges; numeric is for compositeVisibilityScore() input). Mapping: positive→avg(citation.sentiment_score) mapped to 67-100; neutral→33-66; negative→0-32. See lib/audit/scorer.ts:sentimentDimensionScore. Foundations v1.7 canonical — Sprint 3 populates it.
  scoreAccuracy: numeric('score_accuracy', { precision: 5, scale: 2 }),
  scorePosition: numeric('score_position', { precision: 5, scale: 2 }),
  scoreContext: text('score_context'), // Categorical label: 'recommended' | 'listed' | 'commodified'. Populated by Sprint 3 scorer.
  scoreContextNumeric: numeric('score_context_numeric', { precision: 5, scale: 2 }), // 0.00-100.00. Numeric companion of scoreContext for compositeVisibilityScore(). Mapping: recommended=100, listed=50, commodified=25 (or weighted avg if mixed across citations). Updated v1.8 (Round 29): commodified value corrected from 0 to 25 to match Sprint 3 canonical scorer — a brand listed in a commodity grid is still mentioned at all, so commodified contributes 25 (not 0) to composite. See lib/audit/scorer.ts:contextDimensionScore. Foundations v1.8 canonical — Sprint 3 populates it.
  scoreComposite: numeric('score_composite', { precision: 5, scale: 2 }), // Weighted average of dimensions; populated by Sprint 3 scorer
  scoreConfidenceLow: numeric('score_confidence_low', { precision: 5, scale: 2 }),
  scoreConfidenceHigh: numeric('score_confidence_high', { precision: 5, scale: 2 }),
  confidenceIntervals: jsonb('confidence_intervals').default(sql`'{}'::jsonb`), // Per-dimension Wilson 95% CIs as { frequency: {lower,upper}, position: {...}, sentiment: {...}, context: {...}, accuracy: {...}, composite: {...} }. Foundations v1.7 canonical (was Sprint 3 add-on column; promoted in Round 19). Used by audit-results-rich UI to render CI bands per dimension.
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(), // Free-form per-audit metadata. Sprint 2 uses this for { mockScenario: 'happy_path' | 'no_mention' | 'partial_failure' | 'rate_limited' } when LLM_MODE=mock (see Sprint 2 v1.12 spec for full mock-mode behaviour). Future sprints may use it for arbitrary per-audit context. Foundations v1.9 canonical.
  totalCostUsd: numeric('total_cost_usd', { precision: 8, scale: 4 }), // Sum of LLM API costs in USD; populated by audit job as it progresses
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // Per-org auditNumber must be unique (UI assumption: "Audit #143" is unambiguous within an org)
  uniqueOrgAuditNumber: uniqueIndex('audits_org_audit_number_idx').on(table.organizationId, table.auditNumber),
  // Index for tenant-filtered "recent audits" feed (org_id + completed_at DESC)
  orgCompletedIdx: index('audits_org_completed_idx').on(table.organizationId, table.completedAt),
  // Supports the LEFT JOIN LATERAL in GET /api/brands that fetches the most recent audit per brand
  brandCompletedIdx: index('audits_brand_completed_idx').on(table.brandId, table.completedAt),
}));
```

**Drizzle imports required at the top of `db/schema/audits.ts`:**

```typescript
import { pgTable, uuid, text, integer, numeric, timestamp, uniqueIndex, index, jsonb } from 'drizzle-orm/pg-core';
import { eq, sql } from 'drizzle-orm';
import { brands } from './brands';
import { organizations } from './organizations';
```

**Audit numbering implementation note (Sprint 2):**

`auditNumber` is a per-organization serial (1, 2, 3...). It's NOT the primary key — `id` (uuid) remains canonical. The serial is computed at insert time:

```typescript
// lib/audit/numbering.ts
export async function getNextAuditNumber(orgId: string, tx: DBTx): Promise<number> {
  const [row] = await tx
    .select({ max: sql`COALESCE(MAX(audit_number), 0)::int` })
    .from(audits)
    .where(eq(audits.organizationId, orgId))
    .for('update'); // SELECT ... FOR UPDATE locks contending inserts
  return row.max + 1;
}
```

POST /api/audits wraps the insert in a transaction that calls `getNextAuditNumber()` before insert. Race-safe under concurrent audit creation per org.

### Citations (the granular data)

```typescript
// db/schema/citations.ts
export const citations = pgTable('citations', {
  id: uuid('id').defaultRandom().primaryKey(),
  auditId: uuid('audit_id').references(() => audits.id).notNull(),
  prompt: text('prompt').notNull(),
  engine: text('engine').notNull(), // v1: 'chatgpt' | 'claude' | 'gemini' | 'perplexity'. v1.1 adds 'copilot' | 'ai_overviews'. v1.2 adds 'deepseek' | 'grok'. Stored as text (not pgEnum) deliberately so adding engines is a code change, not a migration. The TypeScript LLMService union narrows to v1 set; widen alongside PR that ships the new engine implementation.
  rawResponse: text('raw_response').notNull(), // Full LLM response
  brandMentioned: boolean('brand_mentioned').notNull(),
  position: integer('position'), // 1, 2, 3... or null if not mentioned
  contextSnippets: jsonb('context_snippets').default('[]'), // Surrounding text excerpts where brand was mentioned; used for sentiment/context analysis
  sentimentLabel: text('sentiment_label'), // 'positive' | 'neutral' | 'negative' — populated by Sprint 3 sentiment analyzer
  sentimentScore: numeric('sentiment_score', { precision: 3, scale: 2 }), // -1.00 to 1.00
  isAccurate: boolean('is_accurate'), // null if no claim to verify
  hallucinationFlags: jsonb('hallucination_flags').default('[]'),
  contextLabel: text('context_label'), // 'recommended' | 'listed' | 'commodified' — populated by Sprint 3 scorer
  competitorsMentioned: jsonb('competitors_mentioned').default('[]'),
  citedSources: jsonb('cited_sources').default('[]'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### Recommendations

```typescript
// db/schema/recommendations.ts
export const recommendations = pgTable('recommendations', {
  id: uuid('id').defaultRandom().primaryKey(),
  auditId: uuid('audit_id').references(() => audits.id).notNull(),
  title: text('title').notNull(),
  category: text('category').notNull(), // 'wikipedia' | 'reddit' | 'schema' | 'content' | etc.
  priority: integer('priority').notNull(), // 1 (highest) to N
  effort: text('effort').notNull(), // 'low' | 'medium' | 'high'
  expectedLift: numeric('expected_lift', { precision: 5, scale: 2 }), // Percentage
  researchCitation: text('research_citation'), // 'Princeton GEO 2024' | etc.
  perEngineImpact: jsonb('per_engine_impact').notNull(), // { chatgpt: 'high', claude: 'medium', ... }
  draftContent: text('draft_content'), // AI-generated starter content
  status: text('status').notNull().default('open'), // 'open' | 'in_progress' | 'completed' | 'dismissed'
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

---

## Domain logic patterns

### The interface pattern (use everywhere)

Every external integration is wrapped in an interface. This means swapping providers later requires changing one file, not 50.

```typescript
// lib/auth/interface.ts
export interface AuthService {
  getCurrentUser(): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
  requireAuth(): Promise<User>; // Throws if not authenticated
}

// lib/auth/clerk-impl.ts
import { auth } from '@clerk/nextjs/server';
import type { AuthService, User } from './interface';

export const clerkAuth: AuthService = {
  async getCurrentUser() {
    const { userId } = await auth();
    if (!userId) return null;
    // Fetch from DB or Clerk
    return mapClerkUserToOurUser(userId);
  },
  // ...
};

// lib/auth/index.ts
export { clerkAuth as authService } from './clerk-impl';
export type { AuthService } from './interface';
```

**Always import from `lib/auth/index.ts`, never from `clerk-impl.ts` directly.**

### LLM abstraction pattern

```typescript
// lib/llm/interface.ts
export interface LLMService {
  complete(input: {
    engine: 'chatgpt' | 'claude' | 'gemini' | 'perplexity';
    prompt: string;
    model?: string;
    temperature?: number;
  }): Promise<{
    response: string;
    tokensUsed: number;
    costEstimate: number;
  }>;
}
```

This abstracts away which API client gets called. Switching from OpenAI's official SDK to Vercel AI SDK is a one-file change.

### Pure domain functions (no side effects)

Domain logic in `lib/audit/`, `lib/verticals/`, `lib/research/` should be PURE. No DB calls. No LLM calls. No HTTP. They take data, return data.

```typescript
// lib/audit/scorer.ts — PURE FUNCTION
export function calculateMultidimensionalScore(citations: Citation[]): VisibilityScore {
  // No side effects. No DB calls. Just data transformation.
  return {
    frequency: calculateFrequency(citations),
    sentiment: calculateSentiment(citations),
    accuracy: calculateAccuracy(citations),
    position: calculatePosition(citations),
    context: calculateContext(citations),
    confidenceInterval: calculateConfidenceInterval(citations),
  };
}
```

This makes domain logic trivially testable AND framework-independent.

---

## API patterns

### Authorization response codes (POLICY)

VisibleAU uses different status codes depending on the operation type, to balance security (don't leak resource existence) with debuggability (clear errors for legitimate users):

| Operation | Not owned by user's org | Doesn't exist at all |
|---|---|---|
| `GET /resource/:id` | **404 Not Found** | 404 Not Found |
| `PATCH /resource/:id` | **404 Not Found** | 404 Not Found |
| `DELETE /resource/:id` | **404 Not Found** | 404 Not Found |
| `POST /resource` (cross-tenant attempt) | **403 Forbidden** | n/a |
| `GET /resource` (list) | **200** with empty array | 200 with empty array |

**Rationale:**
- For reads/updates/deletes by ID, returning 404 (vs 403) prevents leaking that the resource exists at that ID. An attacker iterating UUIDs can't distinguish between "doesn't exist" and "exists but you can't see it."
- For POST creating a resource under a specific organization the user doesn't own (e.g., `POST /api/brands` with `organizationId: <other-org>`), 403 is correct — they're attempting an action, not querying existence.
- For list endpoints, an empty array is the natural response to "show me my resources" when there are none. 403 would be wrong — they're allowed to list their own things; they just have zero.

### Route structure

```typescript
// app/api/brands/[id]/route.ts — example: GET single brand
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { authService } from '@/lib/auth';
import { brandService } from '@/lib/brands';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Authenticate
  const user = await authService.requireAuth();
  
  // 2. Validate path param
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid brand ID' }, { status: 400 });
  }
  
  // 3. Domain logic returns the brand if user can access, null otherwise
  const brand = await brandService.findOwnedByUser(user.id, id);
  
  // 4. 404 if not owned (don't leak existence)
  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }
  
  return NextResponse.json({ brand }, { status: 200 });
}

// app/api/brands/route.ts — example: POST create brand
export async function POST(req: Request) {
  const user = await authService.requireAuth();
  
  const body = await req.json();
  const parsed = CreateBrandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  
  // POST authorization: 403 if user attempts to create under wrong org
  // (For brand creation, organizationId is auto-derived from session — no cross-org possible.
  // But for endpoints where org_id is in the body, check here and return 403.)
  
  const brand = await brandService.create({ ...parsed.data, organizationId: user.organizationId }); // T5 fix: ownerId removed; organizationId is the correct FK
  return NextResponse.json({ brand }, { status: 201 });
}
```

### Error handling

Standard error response shape:

```typescript
{
  error: {
    code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'FORBIDDEN' | 'INTERNAL',
    message: string,
    details?: Record<string, unknown>
  }
}
```

Use a shared error helper:

```typescript
// lib/utils/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export function errorResponse(error: AppError) {
  return NextResponse.json(
    { error: { code: error.code, message: error.message, details: error.details } },
    { status: error.statusCode }
  );
}
```

---

## Background jobs (Inngest)

LLM-heavy operations like running an audit are async. Use Inngest functions.

> [Corrected 2026-06-28: audit/start → audit.run, see Phase 2 LLD v8.69 D-05]
> The canonical event name is `audit.run` (dot-separated), not `audit/start`.
> An audits row (status: pending) **must exist** before the event is sent or `runAuditInline(auditId)` is called.
> Preferred invocation: `runAuditInline(auditId)` for synchronous/inline runs, or `inngest.send({ name: 'audit.run', data: { auditId } })` for async.

```typescript
// inngest/functions/run-audit.ts
import { inngest } from '../client';
import { auditService } from '@/lib/audit';

export const runAudit = inngest.createFunction(
  { id: 'run-audit', name: 'Run brand visibility audit' },
  { event: 'audit.run' },  // audit row must exist before this event fires
  async ({ event, step }) => {
    const auditId = event.data.auditId;
    
    // Step 1: Mark as running
    await step.run('mark-running', async () => {
      await auditService.markRunning(auditId);
    });
    
    // Step 2: Run all LLM queries in parallel batches
    const citations = await step.run('query-llms', async () => {
      return auditService.queryAllEngines(auditId);
    });
    
    // Step 3: Calculate scores
    const score = await step.run('calculate-scores', async () => {
      return auditService.calculateScores(auditId, citations);
    });
    
    // Step 4: Generate recommendations
    await step.run('generate-recommendations', async () => {
      return auditService.generateRecommendations(auditId, score);
    });
    
    // Step 5: Mark complete + notify user
    await step.run('mark-complete', async () => {
      await auditService.markComplete(auditId);
      await emailService.sendAuditComplete(auditId);
    });
  }
);
```

**Key rules for Inngest functions:**
- Each step should be idempotent (can be retried safely)
- Steps should be granular enough that retries don't redo expensive work
- LLM calls are inside steps so they can be retried independently

---

## Environment variables

Standard `.env.example`:

```
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database
DATABASE_URL=
DIRECT_DATABASE_URL=

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# LLM APIs
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=
PERPLEXITY_API_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Email (Resend)
RESEND_API_KEY=

# Sentry
SENTRY_DSN=

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

---

## Testing strategy

### Unit tests (Vitest)
- Pure domain functions in `lib/` — 100% coverage target
- Citation detection, scoring, recommendation generation

### Integration tests (Vitest)
- API route handlers
- Inngest function steps
- Database queries

### E2E tests (Playwright)
- Critical paths only: signup → onboard → run audit → view results
- Don't try for full coverage

### What NOT to test in v1
- UI snapshot tests (brittle, low value)
- Visual regression tests (premature)
- Load testing (do this in v1.1 once you have customers)

---

## Performance defaults

- **API response time target:** < 500ms p95 for non-LLM endpoints
- **Audit completion time:** < 10 minutes for a paid-tier audit (4 engines × 10 prompts × 5 runs = 200 LLM calls, parallelize across engines); ~5-7 minutes for a Free-tier audit (2 engines × 100 calls).
- **Database queries:** Use indexes on `(organization_id, created_at)` and `(brand_id, created_at)`
- **LLM calls:** Cap concurrent calls per provider (OpenAI: 10 concurrent, Anthropic: 5, etc.)
- **Audit cost target:** < US$3 per paid-tier multidim audit (200 LLM calls, ≈ A$4.50); ~US$1.50 for Free-tier (100 calls). Combined multidim+technical audit budget (post-N3 design where one "Run Audit" triggers both) is **<US$3.50** (LLM ~US$3 + Playwright site-crawler ~US$0.30). LLM APIs price in USD; tracking in USD avoids exchange-rate confusion.

---

## Security defaults

- **Auth:** Every API route except public marketing routes requires authenticated user
- **Authorization:** Every resource access checks organization membership. **v1: each user belongs to exactly one organization** (linked via `users.organizationId → organizations.id`). v1.1 will add a `memberships` table to support multi-user organizations (Anna persona's account managers, contractors). Until v1.1, agency owners are the sole user of their organization.
- **Input validation:** Every API route uses Zod schemas
- **SQL injection:** Drizzle ORM parametrizes queries by default
- **XSS:** React escapes by default; never use `dangerouslySetInnerHTML` with user input
- **Secrets:** Never commit secrets. All in `.env`, all referenced via `process.env`.
- **PII:** Minimum collection. Email, name, organization are it. No phone, no address.

---

## AU-specific architecture decisions

These come directly from the PRD and are non-negotiable:

1. **AU vertical packs are content, not code.** Stored in `lib/verticals/` as TypeScript modules. Each pack exports a function returning prompts. Easy to update without DB migrations.

2. **Suburb-level data** is structured. AU regions are stored as `'NSW:Bondi'` format (state:suburb). Helper functions parse and validate.

3. **AU directory checks** are pluggable. Each directory (TrueLocal, Yellow Pages AU, etc.) is its own module in `lib/local-seo/directories/`.

4. **Compliance flags** are vertical-aware. Each vertical pack includes a list of recommendations to BLOCK (e.g., AHPRA Section 133 testimonials for healthcare).

5. **Multi-region readiness** from day 1. Every brand has a `region` field. Default 'AU'. Architecture supports all 6 regions (AU, NZ, UK, US, EU, CA) without rebuild.

---

## What's NOT in v1 (resist scope creep)

These are explicitly deferred. If a sprint asks for them, push back.

- ❌ White-label theming (Sprint 9 simplifies to just logo upload)
- ❌ API access (v1.1)
- ❌ Custom prompt libraries (v2)
- ❌ Programmatic SEO portal (v2)
- ❌ Tableau/Looker connectors (v2)
- ❌ Hallucination detection alerts (v1.1)
- ❌ Reddit/YouTube citation tracking (v1.1)
- ❌ AI crawler logs analysis (v1.1)
- ❌ MCP server scaffolding (v2)
- ❌ NZ/UK/CA market support (v2 — architecture is ready, content is not)

---

## Daily reminders for Claude Code

When working on VisibleAU, remember:

1. **Domain logic in `lib/` is pure TypeScript.** No framework dependencies.
2. **External services wrapped in interfaces.** Never import Clerk/Stripe/Inngest directly outside the wrapper.
3. **Multi-tenant from day 1.** Every query filters by `organization_id`.
4. **AU specificity is the moat.** Don't build features that work everywhere generically — build features that work uniquely well in AU.
5. **Honest about limits.** UI shows confidence intervals. Recommendations cite research with effect sizes. Anti-pattern recommendations are explicitly blocked.
6. **Ship fast, iterate.** First version of any feature should work end-to-end before polish.
7. **Solo dev velocity.** No abstractions for hypothetical needs. Build what's needed now.
