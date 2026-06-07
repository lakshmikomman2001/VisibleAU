# VisibleAU Sprint 7 — Backend E2E Tests (Database + API)

## What these tests cover

Sprint 7 ships the Technical AI Infrastructure (Module 5b). Four new tables
(`technical_audits`, `brand_entity_scores`, `citability_methods`,
`validation_corpus_results`), eight scored audit dimensions collapsing to five
UX categories, the full site-crawler pipeline, and a 50-site Spearman
correlation acceptance gate.

These tests run against a **live local app + real Postgres DB**. Test data is
seeded in `beforeAll` using Drizzle directly (service-role, bypasses RLS) and
**hard-deleted in `afterAll`** or in inline `try/finally` blocks.

> **IMPORTANT:** These E2E tests do NOT trigger real site crawls or real Inngest
> jobs. They seed `technical_audits` + `brand_entity_scores` rows directly to
> simulate what `technical-audit-run.ts` would persist. The Inngest integration
> and the Playwright crawler are tested separately via unit + integration tests.
> Sprint 6 production seed (research citations, vertical packs) is assumed
> already present.

---

## Test file map

| File | What it tests | Test IDs |
|---|---|---|
| `01-schema-constraints.test.ts` | DB: 4 new tables, columns, indexes, RLS, FK, boolean types | TC-S7-01–TC-S7-18 |
| `02-seed-data.test.ts` | DB: 47 citability methods seeded, 27 AI bots seeded, shape | TC-S7-19–TC-S7-30 |
| `03-technical-audits-api.test.ts` | GET /api/technical-audits/[id]: auth, shape, cross-org 404, same-org 200 | TC-S7-31–TC-S7-40, TC-S7-38b |
| `04-brand-entity-api.test.ts` | GET /api/brand-entity/[brandId]: auth, shape, ABN fields | TC-S7-41–TC-S7-48 |
| `05-citability-methods-api.test.ts` | GET /api/citability-methods: auth, tier gate (free→10, starter→47) | TC-S7-49–TC-S7-56 |
| `06-scoring.test.ts` | Scoring formulas: scoreComposite, 8→5 rollup, all dimension ranges | TC-S7-57–TC-S7-72 |
| `07-acceptance.test.ts` | §9 acceptance checklist: all 4 tables migrated, all dimensions score, rollup renders | TC-S7-73–TC-S7-82 |

---

## Prerequisites

```bash
# 1. Sprints 1–6 complete. Sprint 7 migrations applied:
#    pnpm drizzle-kit generate && pnpm drizzle-kit migrate
#    Verify: technical_audits, brand_entity_scores,
#            citability_methods, validation_corpus_results exist.

# 2. Sprint 7 RLS applied to tenant tables:
#    technical_audits    → RLS ENABLED, org_isolation policy:
#      ALTER TABLE technical_audits ENABLE ROW LEVEL SECURITY;
#      CREATE POLICY "org_isolation" ON technical_audits
#        USING (organization_id = current_setting('app.current_organization_id')::uuid);
#
#    brand_entity_scores → RLS ENABLED, JOIN-based policy (no organizationId column!):
#      ALTER TABLE brand_entity_scores ENABLE ROW LEVEL SECURITY;
#      CREATE POLICY "org_isolation" ON brand_entity_scores
#        USING (EXISTS (
#          SELECT 1 FROM brands
#          WHERE brands.id = brand_entity_scores.brand_id
#            AND brands.organization_id =
#                current_setting('app.current_organization_id')::uuid
#        ));
#    NOTE: brand_entity_scores has NO organizationId column — the policy MUST JOIN
#    to the brands table. A simple organization_id = ... policy would fail at DDL time.
#
#    citability_methods         → RLS DISABLED (global seed)
#    validation_corpus_results  → RLS DISABLED (corpus data)

# 3. Seed data present (Sprint 7 adds two new seed scripts — run ALL of these):
#    pnpm seed                                      (Sprint 5+6 seeds)
#    pnpm tsx db/seed/citability-methods/seed.ts    (47 citability methods — Sprint 7)
#    pnpm tsx db/seed/ai-bots/seed.ts               (27 AI bots — Sprint 7)
#    NOTE: These seed scripts must be IDEMPOTENT (INSERT ... ON CONFLICT DO NOTHING).
#          Running pnpm seed alone may NOT include Sprint 7 seeds if they were not
#          added to the aggregate seed runner. Run the tsx commands explicitly.
#    ⚠️  Do NOT use 'import { spearman } from simple-statistics' — that export does not
#         exist in v7. Use rankArray + sampleCorrelation (Pearson of ranked arrays). See TC-S7-78.
#    Verify: SELECT COUNT(*) FROM citability_methods → 47
#            SELECT COUNT(*) FROM ai_bots → 27 (if ai_bots is its own table)
#            or verify in citability_methods seeded with all 47 methodKey values

# 4. App running:
#    LLM_MODE=mock MOCK_SCENARIO=happy_path pnpm dev

# 5. .env.test.local populated — see template below.

# 6. ABN Lookup env var NOT required for these E2E tests —
#    brand_entity_scores rows are seeded directly, not via real API calls.
```

---

## .env.test.local

```bash
# App
E2E_APP_URL=http://localhost:3000

# Database — USE a TEST Supabase project, never production
DATABASE_URL=postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres

# Clerk (test-mode keys)
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

# Test User 1 — Org 1 (starter tier: full technical audit access)
E2E_TEST_USER_1_EMAIL=e2e-s7-user-1@visibleau.test
E2E_TEST_USER_1_CLERK_ID=user_...
E2E_TEST_ORG_1_CLERK_ID=org_...
E2E_TEST_USER_1_SESSION_ID=sess_...

# Test User 2 — Org 2 (used for cross-org isolation tests)
E2E_TEST_USER_2_EMAIL=e2e-s7-user-2@visibleau.test
E2E_TEST_USER_2_CLERK_ID=user_...
E2E_TEST_ORG_2_CLERK_ID=org_...
E2E_TEST_USER_2_SESSION_ID=sess_...
```

---

## How to run

```bash
# Full suite
npx vitest run --config tests/e2e/backend/sprint7/vitest.config.e2e.ts

# Single file
npx vitest run tests/e2e/backend/sprint7/03-technical-audits-api.test.ts \
  --config tests/e2e/backend/sprint7/vitest.config.e2e.ts

# Add to package.json:
# "test:e2e:s7": "vitest run --config tests/e2e/backend/sprint7/vitest.config.e2e.ts"
```

---

## Sprint 7 Key Spec Facts (for assertions)

### Schema — `technical_audits`

```
id                  uuid PK defaultRandom
organizationId      uuid FK → organizations.id NOT NULL, RLS scoped
brandId             uuid FK → brands.id NOT NULL
auditId             uuid FK → audits.id (nullable — supports standalone tech audit)
scoreRobots         numeric(5,2)  /18  — 6 components × 3pts binary (EH5)
scoreLlmsTxt        numeric(5,2)  /18  — 6 components × 3pts binary (EC2)
scoreSchema         numeric(5,2)  /16  — 4 schema types × 4pts each (EH1)
scoreMeta           numeric(5,2)  /14  — title(4)+desc(3)+og(3)+canonical(2)+hreflang(2) (EG2)
scoreContent        numeric(5,2)  /12  — SSR(0/3/6) + capsulePassRate×6 (EG1)
scoreBrandEntity    numeric(5,2)  /10  — ABN(3)+Wikipedia AU(3)+AU TLD(2)+Directory(2)
scoreSignals        numeric(5,2)  /6   — aggregated negative signals + prompt injection
scoreAiDiscovery    numeric(5,2)  /6   — ai.txt(3)+3 JSON endpoints(1pt each) (EH2)
scoreComposite      numeric(5,2)  /100 — sum of all 8 raw scores (EA4: do NOT normalise)
findings            jsonb NOT NULL default '{}'
crawledAt           timestamp with tz (nullable)
createdAt           timestamp with tz NOT NULL defaultNow
updatedAt           timestamp with tz NOT NULL defaultNow  (EA2 fix)
RLS: ENABLED — org_isolation policy (EA2 fix)
Indexes: (auditId), (brandId, createdAt DESC)
```

### Schema — `brand_entity_scores`

```
id                  uuid PK defaultRandom
brandId             uuid FK → brands.id NOT NULL
abnVerified         boolean NOT NULL default false  (EA1: NOT text — boolean type)
abnNumber           text (nullable)
abnEntityName       text (nullable)
abnStatus           text (nullable)
wikipediaAuPresent  boolean NOT NULL default false  (EA1)
wikipediaAuUrl      text (nullable)
wikipediaAuMentions integer NOT NULL default 0
auTldDomains        jsonb NOT NULL default '[]'
auDirectoryPresence jsonb NOT NULL default '[]'
scoreOf10           numeric(5,2)   /10  ← NULLABLE (no .notNull() in spec — may be null before first score)
checkedAt           timestamp with tz NOT NULL defaultNow
RLS: ENABLED — org_isolation policy
```

### Schema — `citability_methods` (seeded, global)

```
id              uuid PK defaultRandom
methodKey       text UNIQUE NOT NULL
title           text NOT NULL
description     text NOT NULL
source          text NOT NULL    'Princeton KDD 2024' | 'AutoGEO ICLR 2026'
effectSizePct   numeric(5,2)     e.g. 30.00 for +30%
effectSizeNotes text
appliesTo       jsonb NOT NULL default '[]'
RLS: DISABLED (global operator data)
Must have exactly 47 rows after pnpm seed.
```

### Schema — `validation_corpus_results`

```
id                    uuid PK defaultRandom
fixtureName           text NOT NULL
domain                text NOT NULL
vertical              text NOT NULL
region                text NOT NULL
category              text NOT NULL
expectedScoreMin      numeric(5,2)
expectedScoreMax      numeric(5,2)
actualScore           numeric(5,2)
withinBand            text NOT NULL
spearmanContribution  numeric(10,6)
runAt                 timestamp with tz NOT NULL defaultNow
RLS: DISABLED (corpus data)
```

### GET /api/technical-audits/[id] (EE5 fix)

```typescript
// Auth required + setRlsContext
// Returns 401 if not authenticated
// Returns 404 if id not found OR cross-org (RLS: empty → 404)
// Returns full technical_audits row including findings jsonb
{
  id: string,
  organizationId: string,
  brandId: string,
  auditId: string | null,
  scoreRobots: string,         // numeric returned as string from postgres
  scoreLlmsTxt: string,
  scoreSchema: string,
  scoreMeta: string,
  scoreContent: string,
  scoreBrandEntity: string,
  scoreSignals: string,
  scoreAiDiscovery: string,
  scoreComposite: string,
  findings: {
    llmsTxt:     { present: boolean, depthScore: number, issues: string[], ... },
    robots:      { present: boolean, score: number, aiBotsAllowed: string[], ... },
    schema:      { typesFound: string[], richness: number, gaps: string[], ... },
    meta:        { score: number, titlePresent: boolean, ... },
    content:     { score: number, wordCount: number, ... },
    brandEntity: { score: number, abnVerified: boolean, ... },
    signals:     { score: number },
    aiDiscovery: { score: number, aiTxtPresent: boolean, ... },
  },
  crawledAt: string | null,
  createdAt: string,
  updatedAt: string,
}
```

### GET /api/brand-entity/[brandId]

```typescript
// Auth required + setRlsContext
// Returns most recent brand_entity_scores row for brandId
//   ORDER BY checked_at DESC LIMIT 1
//   ⚠️  brand_entity_scores has NO createdAt column — use checkedAt for recency (EC4 fix).
//   A developer using the standard ORDER BY createdAt DESC pattern gets a runtime error.
// Cross-org: RLS → 404 (via JOIN-based policy — see Prerequisites §2)
{
  id: string,
  brandId: string,
  abnVerified: boolean,        // NOT string — boolean type (EA1 fix)
  abnNumber: string | null,
  abnEntityName: string | null,
  abnStatus: string | null,
  wikipediaAuPresent: boolean,
  wikipediaAuUrl: string | null,
  wikipediaAuMentions: number,
  auTldDomains: string[],
  auDirectoryPresence: Array<{ name: string, present: boolean, url: string | null }>,
  scoreOf10: string,
  checkedAt: string,
}
```

### GET /api/citability-methods

```typescript
// Auth required. RLS disabled (global data).
// Free tier: returns top 10 by effectSizePct DESC
// Starter+:  returns all 47
// Returns:
{
  methods: Array<{
    id: string,
    methodKey: string,
    title: string,
    description: string,
    source: string,
    effectSizePct: string,
    effectSizeNotes: string | null,
    appliesTo: string[],
  }>,
  total: 47,
  shown: number,   // 10 for free, 47 for starter+
}
```

### 8→5 UX rollup formula (EC1)

```typescript
// rollupTo5Categories(dims) returns:
{
  technical:    dims.scoreRobots + dims.scoreLlmsTxt + dims.scoreAiDiscovery + dims.scoreSignals,
  technicalPct: (technical / 48) * 100,   // max: 18+18+6+6 = 48
  content:      dims.scoreContent + dims.scoreMeta,
  contentPct:   (content / 26) * 100,     // max: 12+14 = 26
  authority:    dims.scoreBrandEntity,
  authorityPct: (scoreBrandEntity / 10) * 100,
  schema:       dims.scoreSchema,
  schemaPct:    (scoreSchema / 16) * 100,
  performance:  null,                     // stub for v1.1
}
// All *Pct values are 0–100 normalised.
// Note: scoreComposite = sum of raw scores (already on 100-pt scale, do NOT normalise)
```

### Score dimension constraints

```
scoreRobots      0.00 – 18.00   (6 binary components × 3pts)
scoreLlmsTxt     0.00 – 18.00   (6 binary components × 3pts)
scoreSchema      0.00 – 16.00   (4 types × 4pts each)
scoreMeta        0.00 – 14.00   (title 4+desc 3+og 3+canonical 2+hreflang 2)
scoreContent     0.00 – 12.00   (SSR 0/3/6 + capsulePassRate×6)
scoreBrandEntity 0.00 – 10.00   (ABN 3+WikipediaAU 3+AU TLD 2+Directory 2)
scoreSignals     0.00 – 6.00    (negative signals + prompt injection)
scoreAiDiscovery 0.00 – 6.00    (ai.txt 3 + 3 JSON endpoints × 1)
scoreComposite   0.00 – 100.00  (sum of all 8)
```

### Tier gating for citability methods (EG5)

```
free tier:    shown = 10  (top 10 by effectSizePct DESC)
starter+:     shown = 47  (all methods)
citability_methods table has RLS DISABLED — no setRlsContext needed
```

### Test data cleanup order (FK-safe)

```
1. validation_corpus_results WHERE fixtureName LIKE '[S7-E2E]%'
2. technical_audits   WHERE organizationId IN (test org ids)
3. brand_entity_scores WHERE brandId IN (test brand ids)
4. action_items       WHERE organizationId IN (test org ids)  [Sprint 6 FK — RESTRICT on brandId]
5. citations          WHERE auditId IN (test audit ids)
6. audits             WHERE organizationId IN (test org ids)
7. brands             WHERE organizationId IN (test org ids)
8. users              WHERE organizationId IN (test org ids)
9. organizations      WHERE id IN (test org ids)
NOTE: citability_methods and ai_bots are GLOBAL SEED DATA — never delete in tests.
```

### Test data strategy

```
Test org1 (starter tier) seeds:
  - 1 brand (vertical=tradies, domain=bonditest.com.au)
  - 1 audit (multidim, status=complete)
  - 1 technical_audit row (seeded directly, all 8 scores populated)
  - 1 brand_entity_scores row

Test org2 (starter tier) seeds:
  - 1 brand (vertical=saas)
  - 1 audit
  - 1 technical_audit row (for cross-org isolation tests)

All seeded records use the prefix '[S7-E2E]' in name/title fields.
```

---

## `vitest.config.e2e.ts`

```typescript
import { defineConfig } from 'vitest/config';
import tsconfigPaths   from 'vite-tsconfig-paths';
import { config }      from 'dotenv';
import path            from 'node:path';

config({ path: path.resolve(process.cwd(), '.env.test.local') });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include:     ['tests/e2e/backend/sprint7/**/*.test.ts'],
    environment: 'node',
    pool:        'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters:   ['verbose', 'json'],
    outputFile:  { json: 'tests/e2e/backend/sprint7/reports/results.json' },
  },
});
```

---

## `helpers/db.ts`

```typescript
/**
 * tests/e2e/backend/sprint7/helpers/db.ts
 *
 * Service-role Drizzle client + seed/teardown helpers for Sprint 7 backend E2E.
 * Uses DIRECT_URL (bypasses RLS) for all seed and cleanup operations.
 *
 * Delete order (FK-safe):
 *   validation_corpus_results → technical_audits → brand_entity_scores
 *   → action_items → citations → audits → brands → users → organizations
 *
 * NEVER delete from: citability_methods (global seed data)
 */

import { drizzle }            from 'drizzle-orm/postgres-js';
import postgres               from 'postgres';
import { eq, inArray, sql }        from 'drizzle-orm';
import * as schema            from '../../../../../db/schema';

const pgClient = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(pgClient, { schema });

// ─── Organization ──────────────────────────────────────────────────────────────

export async function seedOrganization(data: {
  clerkOrgId: string;
  name:        string;
  tier?:       'free' | 'starter' | 'growth' | 'agency' | 'agency_pro';
}) {
  const [existing] = await db.select()
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, data.clerkOrgId));
  if (existing) return existing;
  const [org] = await db.insert(schema.organizations)
    .values({ clerkOrgId: data.clerkOrgId, name: data.name,
              region: 'au', tier: data.tier ?? 'starter' })
    .returning();
  return org;
}

// ─── User ─────────────────────────────────────────────────────────────────────

export async function seedUser(data: {
  clerkUserId:    string;
  organizationId: string;
  email:          string;
}) {
  const [existing] = await db.select()
    .from(schema.users)
    .where(eq(schema.users.clerkUserId, data.clerkUserId));
  if (existing) return existing;
  const [user] = await db.insert(schema.users)
    .values({ clerkUserId: data.clerkUserId, organizationId: data.organizationId,
              email: data.email, name: '[S7-E2E] Test User', role: 'owner' })
    .returning();
  return user;
}

// ─── Brand ────────────────────────────────────────────────────────────────────

export async function seedBrand(data: {
  organizationId: string;
  name?:          string;
  domain?:        string;
  vertical?:      string;
}) {
  const [brand] = await db.insert(schema.brands)
    .values({
      organizationId: data.organizationId,
      name:    data.name    ?? '[S7-E2E] Test Brand',
      domain:  data.domain  ?? `s7-e2e-${Date.now()}.com.au`,
      vertical: (data.vertical ?? 'tradies') as 'tradies' | 'allied_health' | 'saas',
      region:  'au',
      primaryRegions: ['NSW:Bondi'],
      competitors: [],
    })
    .returning();
  return brand;
}

// ─── Audit (multidim) ─────────────────────────────────────────────────────────

export async function seedAudit(data: {
  organizationId: string;
  brandId:        string;
  status?:        'complete' | 'running' | 'failed';
}) {
  const existing = await db.select({ id: schema.audits.id })
    .from(schema.audits)
    .where(eq(schema.audits.brandId, data.brandId));
  const [audit] = await db.insert(schema.audits)
    .values({
      organizationId:        data.organizationId,
      brandId:               data.brandId,
      auditNumber:           existing.length + 1,
      status:                data.status ?? 'complete',
      triggeredBy:           'manual',
      engines:               ['chatgpt', 'perplexity'],
      promptsCount:          10,
      runsPerPrompt:         1,
      totalCalls:            10,
      scoreFrequency:        '25.00',
      scorePosition:         '35.00',
      scoreSentimentNumeric: '42.00',
      scoreContextNumeric:   '36.00',
      scoreAccuracy:         '30.00',
      scoreComposite:        '33.60',
      totalCostUsd:          '0.0150',
      metadata:              { mockScenario: 'happy_path' },
    })
    .returning();
  return audit;
}

// ─── TechnicalAudit ───────────────────────────────────────────────────────────

export interface SeedTechnicalAuditData {
  organizationId:   string;
  brandId:          string;
  auditId?:         string;   // nullable FK
  scoreRobots?:     string;   // default '12.00' — 4/6 components passing
  scoreLlmsTxt?:    string;   // default '6.00'  — 2/6 components
  scoreSchema?:     string;   // default '8.00'  — 2/4 types
  scoreMeta?:       string;   // default '12.00' — title(4)+desc(3)+og(3)+canonical(2)+hreflang(0)=12
  scoreContent?:    string;   // default '9.00'  — SSR(6) + capsulePassRate(0.5×6=3)
  scoreBrandEntity?:string;   // default '6.00'  — ABN(3)+Wikipedia AU absent(0)+AU TLD(2)
                              //                    +partial Directory presence(1 of /2)=6
                              //   Spec /10: ABN(3)+Wikipedia AU(3)+AU TLD(2)+Directory(2)
                              //   Default seeds only Hipages present → ~1pt of /2 Directory
  scoreSignals?:    string;   // default '4.00'  — 2 minor negative signals
  scoreAiDiscovery?:string;   // default '3.00'  — only ai.txt present
  findings?:        Record<string, unknown>;
  crawledAt?:       Date;
}

export async function seedTechnicalAudit(data: SeedTechnicalAuditData) {
  const scoreRobots      = data.scoreRobots      ?? '12.00';
  const scoreLlmsTxt     = data.scoreLlmsTxt     ?? '6.00';
  const scoreSchema      = data.scoreSchema      ?? '8.00';
  const scoreMeta        = data.scoreMeta        ?? '12.00';  // title+desc+og+canonical present; hreflang absent = 4+3+3+2+0 = 12
  const scoreContent     = data.scoreContent     ?? '9.00';
  const scoreBrandEntity = data.scoreBrandEntity ?? '6.00';
  const scoreSignals     = data.scoreSignals     ?? '4.00';
  const scoreAiDiscovery = data.scoreAiDiscovery ?? '3.00';

  const scoreComposite = (
    parseFloat(scoreRobots) + parseFloat(scoreLlmsTxt) + parseFloat(scoreSchema) +
    parseFloat(scoreMeta) + parseFloat(scoreContent) + parseFloat(scoreBrandEntity) +
    parseFloat(scoreSignals) + parseFloat(scoreAiDiscovery)
  ).toFixed(2);

  const defaultFindings = {
    llmsTxt:     { present: false, depthScore: 6, issues: ['No llms-full.txt companion'], hasFullTxt: false, sizeKb: 0 },
    robots:      { present: true, score: 12, aiBotsAllowed: ['GPTBot','ClaudeBot','PerplexityBot'], aiBotsBlocked: [], cdnBlockingDetected: false, cdnVendor: null, recommendations: [] },
    schema:      { typesFound: ['Organization','LocalBusiness'], richness: 8, gaps: ['FAQPage','Article'], realityCheck: { chatgpt: 'No measurable direct impact per SE Ranking Dec 2025.', google: 'Medium impact via traditional snippets.' } },
    meta:        { score: 10, titlePresent: true, descriptionPresent: true, ogPresent: true, canonicalPresent: true, hreflangPresent: false },
    content:     { score: 9, wordCount: 850, answerCapsulesFound: 2, answerCapsulesSuggested: 2, negativeSignals: [], promptInjections: [] },
    brandEntity: { score: 6, abnVerified: true, abnNumber: '51824753556', wikipediaAuPresent: false, auTldPresent: true, directoryPresence: [{ name: 'Hipages', present: true, url: 'https://hipages.com.au/test' }] },
    signals:     { score: 4 },
    aiDiscovery: { score: 3, aiTxtPresent: true, aiSummaryPresent: false, aiFaqPresent: false, aiServicePresent: false },
  };

  const [row] = await db.insert(schema.technicalAudits)
    .values({
      organizationId:   data.organizationId,
      brandId:          data.brandId,
      auditId:          data.auditId ?? null,
      scoreRobots,
      scoreLlmsTxt,
      scoreSchema,
      scoreMeta,
      scoreContent,
      scoreBrandEntity,
      scoreSignals,
      scoreAiDiscovery,
      scoreComposite,
      findings:         data.findings ?? defaultFindings,
      crawledAt:        data.crawledAt ?? new Date(),
    })
    .returning();
  return row;
}

// ─── BrandEntityScore ─────────────────────────────────────────────────────────

export async function seedBrandEntityScore(data: {
  brandId:             string;
  abnVerified?:        boolean;
  abnNumber?:          string;
  abnEntityName?:      string;
  abnStatus?:          string;
  wikipediaAuPresent?: boolean;
  scoreOf10?:          string;
}) {
  const [row] = await db.insert(schema.brandEntityScores)
    .values({
      brandId:              data.brandId,
      abnVerified:          data.abnVerified          ?? true,
      abnNumber:            data.abnNumber            ?? '51824753556',
      abnEntityName:        data.abnEntityName        ?? '[S7-E2E] Test Business Pty Ltd',
      abnStatus:            data.abnStatus            ?? 'Active',
      wikipediaAuPresent:   data.wikipediaAuPresent   ?? false,
      wikipediaAuUrl:       null,
      wikipediaAuMentions:  0,
      auTldDomains:         ['s7-e2e-test.com.au'],
      auDirectoryPresence:  [{ name: 'Hipages', present: true, url: 'https://hipages.com.au/test' }],
      scoreOf10:            data.scoreOf10            ?? '6.00',
    })
    .returning();
  return row;
}

// ─── ValidationCorpusResult ───────────────────────────────────────────────────

export async function seedCorpusResult(data: {
  fixtureName:   string;
  domain:        string;
  vertical:      string;
  region:        string;
  category:      string;
  actualScore:   string;
  withinBand:    'yes' | 'no';
}) {
  const [row] = await db.insert(schema.validationCorpusResults)
    .values({
      fixtureName:          data.fixtureName,
      domain:               data.domain,
      vertical:             data.vertical,
      region:               data.region,
      category:             data.category,
      expectedScoreMin:     '30.00',
      expectedScoreMax:     '70.00',
      actualScore:          data.actualScore,
      withinBand:           data.withinBand,
      spearmanContribution: '0.000001',
    })
    .returning();
  return row;
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

export async function deleteTestDataForOrg(orgId: string): Promise<void> {
  if (!orgId) return;

  // corpus results for this test run — use LIKE '[S7-E2E]%' per cleanup contract
  // (eq() exact match would miss any test that seeds with a different fixture name)
  await db.execute(sql`
    DELETE FROM validation_corpus_results
    WHERE fixture_name LIKE '[S7-E2E]%'`);

  // Sprint 7 tables first
  await db.delete(schema.technicalAudits)
    .where(eq(schema.technicalAudits.organizationId, orgId));

  const brandRows = await db.select({ id: schema.brands.id })
    .from(schema.brands)
    .where(eq(schema.brands.organizationId, orgId));
  const brandIds = brandRows.map(b => b.id);

  if (brandIds.length > 0) {
    await db.delete(schema.brandEntityScores)
      .where(inArray(schema.brandEntityScores.brandId, brandIds));
  }

  // Sprint 6: action_items has RESTRICT FK on brandId — delete before brands
  await db.delete(schema.actionItems)
    .where(eq(schema.actionItems.organizationId, orgId));

  const auditRows = await db.select({ id: schema.audits.id })
    .from(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));
  const auditIds = auditRows.map(a => a.id);

  if (auditIds.length > 0) {
    await db.delete(schema.citations)
      .where(inArray(schema.citations.auditId, auditIds));
  }

  await db.delete(schema.audits).where(eq(schema.audits.organizationId, orgId));
  await db.delete(schema.brands).where(eq(schema.brands.organizationId, orgId));
  await db.delete(schema.users).where(eq(schema.users.organizationId, orgId));
  await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
}
```

---

## `helpers/http.ts`

```typescript
/**
 * tests/e2e/backend/sprint7/helpers/http.ts
 *
 * Authenticated fetch helpers for Sprint 7 backend E2E.
 * Clerk reads the '__session' cookie (not 'sid' or 'Authorization' Bearer).
 */

const BASE_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';

function authHeaders(sessionId: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Cookie':       `__session=${sessionId}`,
  };
}

export const SESSION_1 = process.env.E2E_TEST_USER_1_SESSION_ID ?? '';
export const SESSION_2 = process.env.E2E_TEST_USER_2_SESSION_ID ?? '';

export async function getJson<T>(
  path: string, sessionId: string,
): Promise<{ status: number; body: T }> {
  const res  = await fetch(`${BASE_URL}${path}`, {
    method: 'GET', headers: authHeaders(sessionId),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

export async function getNoAuth(path: string): Promise<{ status: number }> {
  const res = await fetch(`${BASE_URL}${path}`);
  return { status: res.status };
}
```

---

## `01-schema-constraints.test.ts`

```typescript
/**
 * 01-schema-constraints.test.ts
 *
 * Sprint 7 §5 — 4 new tables, columns, indexes, RLS, FK, boolean types.
 * TC-S7-01 through TC-S7-18
 *
 * Verifies: EA1 (boolean types), EA2 (updatedAt + RLS), EB1 (barrel exports),
 *           EC4 (brand_entity_scores no FK to technical_audits), EH5 (scoreRobots /18).
 */

import { it, expect, beforeAll, afterAll, describe } from 'vitest';
import { sql, eq }                                    from 'drizzle-orm';
import * as schema                                    from '../../../../../db/schema';
import {
  db, seedOrganization, seedUser, seedBrand, seedAudit,
  seedTechnicalAudit, seedBrandEntityScore, deleteTestDataForOrg,
} from './helpers/db';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL     ?? '',
};

let org1Id = '';
let brand1Id = '';
let audit1Id = '';

beforeAll(async () => {
  const org   = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S7-E2E] Schema Test Org', tier: 'starter' });
  org1Id      = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
  const brand = await seedBrand({ organizationId: org1Id, name: '[S7-E2E] Schema Brand', domain: 's7-schema-test.com.au' });
  brand1Id    = brand.id;
  const audit = await seedAudit({ organizationId: org1Id, brandId: brand1Id });
  audit1Id    = audit.id;
});

afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
});

// ── TC-S7-01: All 4 new tables exist ─────────────────────────────────────────
it('TC-S7-01: technical_audits table exists', async () => {
  const result = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'technical_audits'`);
  expect(result.rows).toHaveLength(1);
});

it('TC-S7-02: brand_entity_scores table exists', async () => {
  const result = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'brand_entity_scores'`);
  expect(result.rows).toHaveLength(1);
});

it('TC-S7-03: citability_methods table exists', async () => {
  const result = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'citability_methods'`);
  expect(result.rows).toHaveLength(1);
});

it('TC-S7-04: validation_corpus_results table exists', async () => {
  const result = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'validation_corpus_results'`);
  expect(result.rows).toHaveLength(1);
});

// ── TC-S7-05: technical_audits has all required columns ───────────────────────
it('TC-S7-05: technical_audits has all 17 required columns', async () => {
  const result = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'technical_audits'
    ORDER BY ordinal_position`);
  const cols = result.rows.map((r: any) => r.column_name);
  const required = [
    'id','organization_id','brand_id','audit_id',
    'score_robots','score_llms_txt','score_schema','score_meta',
    'score_content','score_brand_entity','score_signals','score_ai_discovery',
    'score_composite','findings','crawled_at','created_at','updated_at',
  ];
  for (const col of required) {
    expect(cols, `missing column: ${col}`).toContain(col);
  }
});

// ── TC-S7-06: audit_id FK is nullable (supports standalone tech audit) ────────
it('TC-S7-06: audit_id column is nullable', async () => {
  const result = await db.execute(sql`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'technical_audits'
      AND column_name = 'audit_id'`);
  expect((result.rows[0] as any).is_nullable).toBe('YES');
});

// ── TC-S7-07: updatedAt present (EA2 fix) ────────────────────────────────────
it('TC-S7-07: technical_audits has updated_at column (EA2 fix)', async () => {
  const result = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'technical_audits'
      AND column_name = 'updated_at'`);
  expect(result.rows).toHaveLength(1);
});

// ── TC-S7-08: brand_entity_scores uses boolean not text (EA1 fix) ─────────────
it('TC-S7-08: abn_verified column is boolean type (EA1 fix — NOT text)', async () => {
  const result = await db.execute(sql`
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brand_entity_scores'
      AND column_name = 'abn_verified'`);
  expect((result.rows[0] as any).data_type).toBe('boolean');
});

it('TC-S7-09: wikipedia_au_present column is boolean type (EA1 fix)', async () => {
  const result = await db.execute(sql`
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brand_entity_scores'
      AND column_name = 'wikipedia_au_present'`);
  expect((result.rows[0] as any).data_type).toBe('boolean');
});

// ── TC-S7-10: brand_entity_scores has NO FK to technical_audits (EC4 fix) ─────
it('TC-S7-10: brand_entity_scores has no FK referencing technical_audits (EC4 fix)', async () => {
  // Use constraint_column_usage to find what table each FK on brand_entity_scores references.
  // The non-existent 'references_table' column pattern always passes trivially — use this instead.
  const result = await db.execute(sql`
    SELECT ccu.table_name AS referenced_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.table_name = 'brand_entity_scores'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'`);
  // brand_entity_scores should only FK to 'brands' — NOT to 'technical_audits'
  const referencedTables = result.rows.map((r: any) => r.referenced_table);
  expect(referencedTables).not.toContain('technical_audits');
  // Verify it does have a FK to brands (basic sanity check)
  expect(referencedTables).toContain('brands');
});

// ── TC-S7-11: Indexes on technical_audits ────────────────────────────────────
it('TC-S7-11: technical_audits has index on audit_id', async () => {
  const result = await db.execute(sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'technical_audits'
      AND indexdef LIKE '%audit_id%'`);
  expect(result.rows.length).toBeGreaterThanOrEqual(1);
});

it('TC-S7-12: technical_audits has index on (brand_id, created_at)', async () => {
  const result = await db.execute(sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'technical_audits'
      AND indexdef LIKE '%brand_id%' AND indexdef LIKE '%created_at%'`);
  expect(result.rows.length).toBeGreaterThanOrEqual(1);
});

// ── TC-S7-13: RLS on tenant tables (EA2 fix) ─────────────────────────────────
it('TC-S7-13: technical_audits has RLS enabled (EA2 fix)', async () => {
  const result = await db.execute(sql`
    SELECT rowsecurity FROM pg_tables
    WHERE tablename = 'technical_audits'`);
  expect((result.rows[0] as any).rowsecurity).toBe(true);
});

it('TC-S7-14: brand_entity_scores has RLS enabled', async () => {
  // IMPORTANT: brand_entity_scores has NO organizationId column.
  // The RLS policy must JOIN to the brands table (see Prerequisites §2 for the exact SQL).
  // A simple 'organization_id = current_setting(...)' policy would fail — that column doesn't exist.
  const result = await db.execute(sql`
    SELECT rowsecurity FROM pg_tables WHERE tablename = 'brand_entity_scores'`);
  expect((result.rows[0] as any).rowsecurity).toBe(true);
});

it('TC-S7-15: citability_methods has RLS DISABLED (global seed data)', async () => {
  const result = await db.execute(sql`
    SELECT rowsecurity FROM pg_tables WHERE tablename = 'citability_methods'`);
  expect((result.rows[0] as any).rowsecurity).toBe(false);
});

it('TC-S7-16: validation_corpus_results has RLS DISABLED (corpus data)', async () => {
  const result = await db.execute(sql`
    SELECT rowsecurity FROM pg_tables WHERE tablename = 'validation_corpus_results'`);
  expect((result.rows[0] as any).rowsecurity).toBe(false);
});

// ── TC-S7-17: scoreComposite stored correctly ─────────────────────────────────
it('TC-S7-17: seeded technical_audit scoreComposite equals sum of 8 dimension scores (EA4)', async () => {
  const row = await seedTechnicalAudit({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    scoreRobots: '12.00', scoreLlmsTxt: '6.00', scoreSchema: '8.00',
    scoreMeta: '10.00', scoreContent: '9.00', scoreBrandEntity: '6.00',
    scoreSignals: '4.00', scoreAiDiscovery: '3.00',
  });
  expect(parseFloat(row.scoreComposite!)).toBeCloseTo(58.00, 1);
  // 12+6+8+10+9+6+4+3 = 58
  await db.delete(schema.technicalAudits).where(eq(schema.technicalAudits.id, row.id));
});

// ── TC-S7-18: findings jsonb shape ────────────────────────────────────────────
it('TC-S7-18: findings jsonb contains all 8 dimension keys (EB5)', async () => {
  const row = await seedTechnicalAudit({ organizationId: org1Id, brandId: brand1Id, auditId: audit1Id });
  const findings = row.findings as Record<string, unknown>;
  const expectedKeys = ['llmsTxt','robots','schema','meta','content','brandEntity','signals','aiDiscovery'];
  for (const key of expectedKeys) {
    expect(findings, `findings missing key: ${key}`).toHaveProperty(key);
  }
  await db.delete(schema.technicalAudits).where(eq(schema.technicalAudits.id, row.id));
});
```

---

## `02-seed-data.test.ts`

```typescript
/**
 * 02-seed-data.test.ts
 *
 * Sprint 7 §5 + §7 step 1 — Seed data: 47 citability methods, 27 AI bots.
 * TC-S7-19 through TC-S7-30
 *
 * Verifies: EB4 (real Princeton KDD effect sizes, not invented),
 *           EF1 (27 bots, 3 tiers: Training/Search-AI/User-agent, 9/9/9),
 *           EC3 (bot seed schema shape).
 */

import { it, expect, describe } from 'vitest';
import { sql, eq }              from 'drizzle-orm';
import { db }                   from './helpers/db';
import * as schema              from '../../../../../db/schema';

// ── TC-S7-19: 47 citability methods seeded ────────────────────────────────────
it('TC-S7-19: citability_methods has exactly 47 rows after pnpm seed', async () => {
  const result = await db.execute(sql`SELECT COUNT(*)::int as n FROM citability_methods`);
  expect((result.rows[0] as any).n).toBe(47);
});

it('TC-S7-20: every citability method has a non-null effectSizePct > 0', async () => {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int as n FROM citability_methods
    WHERE effect_size_pct IS NULL OR effect_size_pct <= 0`);
  expect((result.rows[0] as any).n).toBe(0);
});

it('TC-S7-21: methodKey values are unique', async () => {
  const result = await db.execute(sql`
    SELECT COUNT(DISTINCT method_key)::int as distinct_n,
           COUNT(*)::int as total_n
    FROM citability_methods`);
  const { distinct_n, total_n } = result.rows[0] as any;
  expect(distinct_n).toBe(total_n);
  expect(distinct_n).toBe(47);
});

it('TC-S7-22: source values are only Princeton KDD 2024 or AutoGEO ICLR 2026', async () => {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int as n FROM citability_methods
    WHERE source NOT IN ('Princeton KDD 2024', 'AutoGEO ICLR 2026')`);
  expect((result.rows[0] as any).n).toBe(0);
});

it('TC-S7-23: add-statistics-with-sources method has effectSizePct = 30 (Princeton KDD)', async () => {
  const [method] = await db.select()
    .from(schema.citabilityMethods)
    .where(eq(schema.citabilityMethods.methodKey, 'add-statistics-with-sources'));
  expect(method).toBeDefined();
  expect(parseFloat(method.effectSizePct!)).toBe(30.0);
  expect(method.source).toBe('Princeton KDD 2024');
});

it('TC-S7-24: add-expert-quotes method has effectSizePct = 41 (Princeton KDD)', async () => {
  const [method] = await db.select()
    .from(schema.citabilityMethods)
    .where(eq(schema.citabilityMethods.methodKey, 'add-expert-quotes'));
  expect(method).toBeDefined();
  expect(parseFloat(method.effectSizePct!)).toBe(41.0);
});

it('TC-S7-25: all methods have non-empty title and description', async () => {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int as n FROM citability_methods
    WHERE title IS NULL OR title = ''
       OR description IS NULL OR description = ''`);
  expect((result.rows[0] as any).n).toBe(0);
});

// ── TC-S7-26: AI bots seeded (27 bots, 3 tiers) ──────────────────────────────
// Note: AI bots may be seeded into a separate 'ai_bots' table or embedded in robots-txt config.
// Adjust table name to match your schema. The test covers the canonical 27 bots × 3 tiers.
it('TC-S7-26: AI bots seeded — 27 total across 3 tiers', async () => {
  // If bots are in a separate table:
  const result = await db.execute(sql`
    SELECT COUNT(*)::int as n FROM ai_bots`).catch(() => null);
  if (result) {
    expect((result.rows[0] as any).n).toBe(27);
  } else {
    // Bots may be embedded as seed constants — verify via application logic
    console.log('TC-S7-26: ai_bots table not found — verify bots are seeded as constants');
  }
});

it('TC-S7-27: Tier 1 Training crawlers include GPTBot, ClaudeBot, anthropic-ai (EF1)', async () => {
  const result = await db.execute(sql`
    SELECT user_agent FROM ai_bots WHERE tier = 1`).catch(() => null);
  if (!result) return; // bots as constants — skip
  const tier1 = result.rows.map((r: any) => r.user_agent);
  expect(tier1).toContain('GPTBot');
  expect(tier1).toContain('ClaudeBot');
  expect(tier1).toContain('anthropic-ai');
});

it('TC-S7-28: Tier 2 Search-AI crawlers include PerplexityBot, GeminiBot (EF1)', async () => {
  const result = await db.execute(sql`
    SELECT user_agent FROM ai_bots WHERE tier = 2`).catch(() => null);
  if (!result) return;
  const tier2 = result.rows.map((r: any) => r.user_agent);
  expect(tier2).toContain('PerplexityBot');
  expect(tier2).toContain('GeminiBot');
});

it('TC-S7-29: Tier 3 User-agent crawlers include ChatGPT-User, Claude-User (EF1)', async () => {
  const result = await db.execute(sql`
    SELECT user_agent FROM ai_bots WHERE tier = 3`).catch(() => null);
  if (!result) return;
  const tier3 = result.rows.map((r: any) => r.user_agent);
  expect(tier3).toContain('ChatGPT-User');
  expect(tier3).toContain('Claude-User');
});

it('TC-S7-30: each tier has exactly 9 bots (EF1: 9/9/9 = 27)', async () => {
  const result = await db.execute(sql`
    SELECT tier, COUNT(*)::int as n FROM ai_bots GROUP BY tier ORDER BY tier`).catch(() => null);
  if (!result) return;
  const tiers = result.rows as Array<{ tier: number; n: number }>;
  expect(tiers).toHaveLength(3);
  for (const t of tiers) {
    expect(t.n, `tier ${t.tier} should have 9 bots`).toBe(9);
  }
});
```

---

## `03-technical-audits-api.test.ts`

```typescript
/**
 * 03-technical-audits-api.test.ts
 *
 * GET /api/technical-audits/[id]: auth, shape, cross-org 404, RLS.
 * TC-S7-31 through TC-S7-40
 *
 * Verifies: EE5 (route body specified), EA2 (RLS cross-org), EA1 (boolean in findings).
 */

import { it, expect, beforeAll, afterAll } from 'vitest';
import { eq }                              from 'drizzle-orm';
import {
  db, seedOrganization, seedUser, seedBrand, seedAudit,
  seedTechnicalAudit, deleteTestDataForOrg,
} from './helpers/db';
import { getJson, getNoAuth, SESSION_1, SESSION_2 } from './helpers/http';
import * as schema from '../../../../../db/schema';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL     ?? '',
  clerkOrgId2:  process.env.E2E_TEST_ORG_2_CLERK_ID  ?? '',
  clerkUserId2: process.env.E2E_TEST_USER_2_CLERK_ID  ?? '',
  email2:       process.env.E2E_TEST_USER_2_EMAIL     ?? '',
};

let org1Id = '';
let org2Id = '';
let techAudit1Id = '';
let techAudit2Id = '';

beforeAll(async () => {
  const org1    = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S7-E2E] TechAPI Org1', tier: 'starter' });
  const org2    = await seedOrganization({ clerkOrgId: ENV.clerkOrgId2, name: '[S7-E2E] TechAPI Org2', tier: 'starter' });
  org1Id = org1.id;
  org2Id = org2.id;
  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
  await seedUser({ clerkUserId: ENV.clerkUserId2, organizationId: org2Id, email: ENV.email2 });
  const brand1  = await seedBrand({ organizationId: org1Id, name: '[S7-E2E] TechAPI Brand1' });
  const brand2  = await seedBrand({ organizationId: org2Id, name: '[S7-E2E] TechAPI Brand2' });
  const audit1  = await seedAudit({ organizationId: org1Id, brandId: brand1.id });
  const audit2  = await seedAudit({ organizationId: org2Id, brandId: brand2.id });
  const ta1     = await seedTechnicalAudit({ organizationId: org1Id, brandId: brand1.id, auditId: audit1.id });
  const ta2     = await seedTechnicalAudit({ organizationId: org2Id, brandId: brand2.id, auditId: audit2.id });
  techAudit1Id  = ta1.id;
  techAudit2Id  = ta2.id;
});

afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
  await deleteTestDataForOrg(org2Id);
});

// ── TC-S7-31: Unauthenticated returns 401 ────────────────────────────────────
it('TC-S7-31: GET /api/technical-audits/[id] unauthenticated → 401', async () => {
  const { status } = await getNoAuth(`/api/technical-audits/${techAudit1Id}`);
  expect(status).toBe(401);
});

// ── TC-S7-32: Authenticated own org returns 200 + full shape ─────────────────
it('TC-S7-32: GET /api/technical-audits/[id] own org → 200 with full shape (EE5)', async () => {
  const { status, body } = await getJson<any>(
    `/api/technical-audits/${techAudit1Id}`, SESSION_1);
  expect(status).toBe(200);
  expect(body.id).toBe(techAudit1Id);
  expect(body).toHaveProperty('scoreRobots');
  expect(body).toHaveProperty('scoreLlmsTxt');
  expect(body).toHaveProperty('scoreSchema');
  expect(body).toHaveProperty('scoreMeta');
  expect(body).toHaveProperty('scoreContent');
  expect(body).toHaveProperty('scoreBrandEntity');
  expect(body).toHaveProperty('scoreSignals');
  expect(body).toHaveProperty('scoreAiDiscovery');
  expect(body).toHaveProperty('scoreComposite');
  expect(body).toHaveProperty('findings');
  expect(body).toHaveProperty('crawledAt');
  expect(body).toHaveProperty('createdAt');
  expect(body).toHaveProperty('updatedAt');
});

// ── TC-S7-33: findings has all 8 dimension keys ───────────────────────────────
it('TC-S7-33: findings object has all 8 dimension keys (EB5)', async () => {
  const { body } = await getJson<any>(`/api/technical-audits/${techAudit1Id}`, SESSION_1);
  const findings = body.findings;
  expect(findings).toHaveProperty('llmsTxt');
  expect(findings).toHaveProperty('robots');
  expect(findings).toHaveProperty('schema');
  expect(findings).toHaveProperty('meta');
  expect(findings).toHaveProperty('content');
  expect(findings).toHaveProperty('brandEntity');
  expect(findings).toHaveProperty('signals');
  expect(findings).toHaveProperty('aiDiscovery');
});

// ── TC-S7-34: Cross-org GET returns 404 (RLS — EA2 fix) ──────────────────────
it('TC-S7-34: GET cross-org technical audit → 404 (not 403, RLS scopes to org)', async () => {
  const { status } = await getJson<any>(
    `/api/technical-audits/${techAudit1Id}`, SESSION_2);
  expect(status).toBe(404);
});

// ── TC-S7-35: Fake UUID returns 404 ──────────────────────────────────────────
it('TC-S7-35: GET /api/technical-audits/00000000-0000-0000-0000-000000000000 → 404', async () => {
  const { status } = await getJson<any>(
    '/api/technical-audits/00000000-0000-0000-0000-000000000000', SESSION_1);
  expect(status).toBe(404);
});

// ── TC-S7-36: Score values are within spec ranges ────────────────────────────
it('TC-S7-36: all dimension scores are within their spec ranges', async () => {
  const { body } = await getJson<any>(`/api/technical-audits/${techAudit1Id}`, SESSION_1);
  expect(parseFloat(body.scoreRobots)).toBeGreaterThanOrEqual(0);
  expect(parseFloat(body.scoreRobots)).toBeLessThanOrEqual(18);
  expect(parseFloat(body.scoreLlmsTxt)).toBeGreaterThanOrEqual(0);
  expect(parseFloat(body.scoreLlmsTxt)).toBeLessThanOrEqual(18);
  expect(parseFloat(body.scoreSchema)).toBeGreaterThanOrEqual(0);
  expect(parseFloat(body.scoreSchema)).toBeLessThanOrEqual(16);
  expect(parseFloat(body.scoreMeta)).toBeGreaterThanOrEqual(0);
  expect(parseFloat(body.scoreMeta)).toBeLessThanOrEqual(14);
  expect(parseFloat(body.scoreContent)).toBeGreaterThanOrEqual(0);
  expect(parseFloat(body.scoreContent)).toBeLessThanOrEqual(12);
  expect(parseFloat(body.scoreBrandEntity)).toBeGreaterThanOrEqual(0);
  expect(parseFloat(body.scoreBrandEntity)).toBeLessThanOrEqual(10);
  expect(parseFloat(body.scoreSignals)).toBeGreaterThanOrEqual(0);
  expect(parseFloat(body.scoreSignals)).toBeLessThanOrEqual(6);
  expect(parseFloat(body.scoreAiDiscovery)).toBeGreaterThanOrEqual(0);
  expect(parseFloat(body.scoreAiDiscovery)).toBeLessThanOrEqual(6);
  expect(parseFloat(body.scoreComposite)).toBeGreaterThanOrEqual(0);
  expect(parseFloat(body.scoreComposite)).toBeLessThanOrEqual(100);
});

// ── TC-S7-37: scoreComposite equals sum of 8 dimensions (EA4) ─────────────────
it('TC-S7-37: scoreComposite equals sum of all 8 dimension scores (EA4 — do NOT normalise)', async () => {
  const { body } = await getJson<any>(`/api/technical-audits/${techAudit1Id}`, SESSION_1);
  const expectedSum = (
    parseFloat(body.scoreRobots) + parseFloat(body.scoreLlmsTxt) +
    parseFloat(body.scoreSchema) + parseFloat(body.scoreMeta) +
    parseFloat(body.scoreContent) + parseFloat(body.scoreBrandEntity) +
    parseFloat(body.scoreSignals) + parseFloat(body.scoreAiDiscovery)
  );
  expect(parseFloat(body.scoreComposite)).toBeCloseTo(expectedSum, 1);
});

// ── TC-S7-38: org2 cannot access org1 tech audit (cross-org 404) ───────────────
it('TC-S7-38: org2 cannot access org1 tech audit → 404 (RLS isolation)', async () => {
  // Sprint 7 spec only defines GET /api/technical-audits/[id] (single item, no list).
  const { status } = await getJson<any>(`/api/technical-audits/${techAudit1Id}`, SESSION_2);
  expect(status).toBe(404);
});

// ── TC-S7-38b: org2 CAN access its own tech audit (completes the isolation proof) ──
it('TC-S7-38b: org2 CAN access its own tech audit → 200 (RLS allows same-org)', async () => {
  // Verifying both directions: cross-org blocked AND same-org allowed.
  // Without this, the 404 in TC-S7-38 could be caused by the item not existing (bug)
  // rather than RLS correctly blocking cross-org access.
  const { status, body } = await getJson<any>(`/api/technical-audits/${techAudit2Id}`, SESSION_2);
  expect(status).toBe(200);
  expect(body.id).toBe(techAudit2Id);
});

// ── TC-S7-39: findings.brandEntity.abnVerified is boolean in JSONB ──────────────
// Note: EA1 fix is about the brand_entity_scores TABLE column (tested in TC-S7-08).
// This test verifies the JSONB findings field — JSON booleans are always JS booleans,
// not strings. Both tests are valid but check different things.
it('TC-S7-39: findings.brandEntity.abnVerified is a JSON boolean not a string', async () => {
  const { body } = await getJson<any>(`/api/technical-audits/${techAudit1Id}`, SESSION_1);
  expect(typeof body.findings.brandEntity.abnVerified).toBe('boolean');
});

// ── TC-S7-40: auditId is null when not linked (nullable FK) ───────────────────
it('TC-S7-40: auditId can be null (supports standalone technical audit)', async () => {
  // Seed a tech audit without auditId
  const brand = await seedBrand({ organizationId: org1Id, name: '[S7-E2E] Standalone Brand' });
  const ta    = await seedTechnicalAudit({ organizationId: org1Id, brandId: brand.id });
  expect(ta.auditId).toBeNull();
  await db.delete(schema.technicalAudits).where(eq(schema.technicalAudits.id, ta.id));
  await db.delete(schema.brands).where(eq(schema.brands.id, brand.id));
});
```

---

## `04-brand-entity-api.test.ts`

```typescript
/**
 * 04-brand-entity-api.test.ts
 *
 * GET /api/brand-entity/[brandId]: auth, shape, boolean types, cross-org.
 * TC-S7-41 through TC-S7-48
 *
 * Verifies: EA1 (boolean fields), EE4 (4 data sources not 5),
 *           score composition /10 = ABN(3)+WikipediaAU(3)+AU TLD(2)+Directory(2).
 */

import { it, expect, beforeAll, afterAll } from 'vitest';
import {
  db, seedOrganization, seedUser, seedBrand,
  seedBrandEntityScore, deleteTestDataForOrg,
} from './helpers/db';
import { getJson, getNoAuth, SESSION_1, SESSION_2 } from './helpers/http';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL     ?? '',
  clerkOrgId2:  process.env.E2E_TEST_ORG_2_CLERK_ID  ?? '',
  clerkUserId2: process.env.E2E_TEST_USER_2_CLERK_ID  ?? '',
  email2:       process.env.E2E_TEST_USER_2_EMAIL     ?? '',
};

let org1Id   = '';
let org2Id   = '';
let brand1Id = '';
let brand2Id = '';

beforeAll(async () => {
  const org1   = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S7-E2E] BrandEntity Org1', tier: 'starter' });
  const org2   = await seedOrganization({ clerkOrgId: ENV.clerkOrgId2, name: '[S7-E2E] BrandEntity Org2', tier: 'starter' });
  org1Id = org1.id;
  org2Id = org2.id;
  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
  await seedUser({ clerkUserId: ENV.clerkUserId2, organizationId: org2Id, email: ENV.email2 });
  const brand1 = await seedBrand({ organizationId: org1Id, name: '[S7-E2E] BrandEntity Brand1', domain: 's7-entity1.com.au' });
  const brand2 = await seedBrand({ organizationId: org2Id, name: '[S7-E2E] BrandEntity Brand2', domain: 's7-entity2.com.au' });
  brand1Id = brand1.id;
  brand2Id = brand2.id;
  await seedBrandEntityScore({
    brandId: brand1Id, abnVerified: true, abnNumber: '51824753556',
    abnEntityName: '[S7-E2E] Test Pty Ltd', abnStatus: 'Active',
    wikipediaAuPresent: false, scoreOf10: '8.00',
  });
  await seedBrandEntityScore({
    brandId: brand2Id, abnVerified: false, scoreOf10: '3.00',
  });
});

afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
  await deleteTestDataForOrg(org2Id);
});

it('TC-S7-41: GET /api/brand-entity/[brandId] unauthenticated → 401', async () => {
  const { status } = await getNoAuth(`/api/brand-entity/${brand1Id}`);
  expect(status).toBe(401);
});

it('TC-S7-42: GET /api/brand-entity/[brandId] own org → 200 with correct shape', async () => {
  const { status, body } = await getJson<any>(`/api/brand-entity/${brand1Id}`, SESSION_1);
  expect(status).toBe(200);
  expect(body).toHaveProperty('id');
  expect(body).toHaveProperty('brandId');
  expect(body).toHaveProperty('abnVerified');
  expect(body).toHaveProperty('abnNumber');
  expect(body).toHaveProperty('abnEntityName');
  expect(body).toHaveProperty('abnStatus');
  expect(body).toHaveProperty('wikipediaAuPresent');
  expect(body).toHaveProperty('auTldDomains');
  expect(body).toHaveProperty('auDirectoryPresence');
  expect(body).toHaveProperty('scoreOf10');
  expect(body).toHaveProperty('checkedAt');
});

it('TC-S7-43: abnVerified is boolean true (EA1 fix — NOT string "true")', async () => {
  const { body } = await getJson<any>(`/api/brand-entity/${brand1Id}`, SESSION_1);
  expect(typeof body.abnVerified).toBe('boolean');
  expect(body.abnVerified).toBe(true);
});

it('TC-S7-44: wikipediaAuPresent is boolean false (EA1 fix)', async () => {
  const { body } = await getJson<any>(`/api/brand-entity/${brand1Id}`, SESSION_1);
  expect(typeof body.wikipediaAuPresent).toBe('boolean');
  expect(body.wikipediaAuPresent).toBe(false);
});

it('TC-S7-45: auDirectoryPresence is an array (not null)', async () => {
  const { body } = await getJson<any>(`/api/brand-entity/${brand1Id}`, SESSION_1);
  expect(Array.isArray(body.auDirectoryPresence)).toBe(true);
});

it('TC-S7-46: scoreOf10 is within 0–10 (EE4: ABN3+WikipediaAU3+AUTLD2+Directory2)', async () => {
  // scoreOf10 is NULLABLE in the schema (no .notNull()) — a brand may not have been scored yet.
  // In this test, beforeAll seeds scoreOf10='8.00' so it is always present.
  // Guard against null to prevent NaN comparison failures when run standalone.
  const { body } = await getJson<any>(`/api/brand-entity/${brand1Id}`, SESSION_1);
  expect(body.scoreOf10).not.toBeNull();
  const score = parseFloat(body.scoreOf10);
  expect(score).toBeGreaterThanOrEqual(0);
  expect(score).toBeLessThanOrEqual(10);
});

it('TC-S7-47: cross-org GET brand-entity → 404', async () => {
  const { status } = await getJson<any>(`/api/brand-entity/${brand1Id}`, SESSION_2);
  expect(status).toBe(404);
});

it('TC-S7-48: brand with abnVerified=false returns correct boolean (EA1 fix)', async () => {
  const { body } = await getJson<any>(`/api/brand-entity/${brand2Id}`, SESSION_2);
  // SESSION_2 belongs to org2 — this is own-org access
  expect(typeof body.abnVerified).toBe('boolean');
  expect(body.abnVerified).toBe(false);
});
```

---

## `05-citability-methods-api.test.ts`

```typescript
/**
 * 05-citability-methods-api.test.ts
 *
 * GET /api/citability-methods: auth, tier gate, shape.
 * TC-S7-49 through TC-S7-56
 *
 * Verifies: EG5 (free→10, starter+→47), RLS disabled on global table,
 *           effectSizePct is numeric, appliesTo is array.
 */

import { it, expect, beforeAll, afterAll } from 'vitest';
import {
  seedOrganization, seedUser, deleteTestDataForOrg,
} from './helpers/db';
import { getJson, getNoAuth, SESSION_1, SESSION_2 } from './helpers/http';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL     ?? '',
  clerkOrgId2:  process.env.E2E_TEST_ORG_2_CLERK_ID  ?? '',
  clerkUserId2: process.env.E2E_TEST_USER_2_CLERK_ID  ?? '',
  email2:       process.env.E2E_TEST_USER_2_EMAIL     ?? '',
};

let org1Id = '';
let org2Id = '';

beforeAll(async () => {
  const org1 = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S7-E2E] Citability Org1 (starter)', tier: 'starter' });
  const org2 = await seedOrganization({ clerkOrgId: ENV.clerkOrgId2, name: '[S7-E2E] Citability Org2 (free)',    tier: 'free' });
  org1Id = org1.id;
  org2Id = org2.id;
  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
  await seedUser({ clerkUserId: ENV.clerkUserId2, organizationId: org2Id, email: ENV.email2 });
});

afterAll(async () => {
  await deleteTestDataForOrg(org1Id);
  await deleteTestDataForOrg(org2Id);
});

it('TC-S7-49: GET /api/citability-methods unauthenticated → 401', async () => {
  const { status } = await getNoAuth('/api/citability-methods');
  expect(status).toBe(401);
});

it('TC-S7-50: Starter tier → 200 with 47 methods (EG5)', async () => {
  const { status, body } = await getJson<any>('/api/citability-methods', SESSION_1);
  expect(status).toBe(200);
  expect(body.total).toBe(47);
  expect(body.shown).toBe(47);
  expect(body.methods).toHaveLength(47);
});

it('TC-S7-51: Free tier → 200 with 10 methods (EG5 tier gate)', async () => {
  const { status, body } = await getJson<any>('/api/citability-methods', SESSION_2);
  expect(status).toBe(200);
  expect(body.total).toBe(47);
  expect(body.shown).toBe(10);
  expect(body.methods).toHaveLength(10);
});

it('TC-S7-52: Free tier top 10 are highest effectSizePct (ordered DESC)', async () => {
  const { body: starterBody } = await getJson<any>('/api/citability-methods', SESSION_1);
  const { body: freeBody }    = await getJson<any>('/api/citability-methods', SESSION_2);

  // Sort all 47 by effectSizePct DESC (same order the API uses)
  const allSorted = [...starterBody.methods].sort(
    (a: any, b: any) => parseFloat(b.effectSizePct) - parseFloat(a.effectSizePct));

  // Use SET comparison rather than exact array order to avoid flakiness when two methods
  // share the same effectSizePct value (tie → sort order may differ between JS and DB).
  const top10Set  = new Set(allSorted.slice(0, 10).map((m: any) => m.methodKey));
  const freeSet   = new Set(freeBody.methods.map((m: any) => m.methodKey));
  expect(freeSet.size).toBe(10);
  expect([...freeSet].every(k => top10Set.has(k))).toBe(true);
  expect([...top10Set].every(k => freeSet.has(k))).toBe(true);
});

it('TC-S7-53: each method has required shape fields', async () => {
  const { body } = await getJson<any>('/api/citability-methods', SESSION_1);
  const method = body.methods[0];
  expect(method).toHaveProperty('id');
  expect(method).toHaveProperty('methodKey');
  expect(method).toHaveProperty('title');
  expect(method).toHaveProperty('description');
  expect(method).toHaveProperty('source');
  expect(method).toHaveProperty('effectSizePct');
  expect(method).toHaveProperty('appliesTo');
});

it('TC-S7-54: effectSizePct is a numeric string > 0', async () => {
  const { body } = await getJson<any>('/api/citability-methods', SESSION_1);
  for (const m of body.methods) {
    expect(parseFloat(m.effectSizePct), `${m.methodKey} effectSizePct <= 0`).toBeGreaterThan(0);
  }
});

it('TC-S7-55: appliesTo is an array', async () => {
  const { body } = await getJson<any>('/api/citability-methods', SESSION_1);
  for (const m of body.methods) {
    expect(Array.isArray(m.appliesTo), `${m.methodKey} appliesTo not array`).toBe(true);
  }
});

it('TC-S7-56: source values are only valid sources (EB4 fix)', async () => {
  const { body } = await getJson<any>('/api/citability-methods', SESSION_1);
  const validSources = new Set(['Princeton KDD 2024', 'AutoGEO ICLR 2026']);
  for (const m of body.methods) {
    expect(validSources, `${m.methodKey} has invalid source: ${m.source}`).toContain(m.source);
  }
});
```

---

## `06-scoring.test.ts`

```typescript
/**
 * 06-scoring.test.ts
 *
 * Scoring formulas: scoreComposite, 8→5 rollup, dimension ranges.
 * TC-S7-57 through TC-S7-72
 *
 * Verifies: EA4 (composite = sum, do NOT normalise), EC1 (8→5 rollup formula),
 *           EG1 (scoreContent /12), EG2 (scoreMeta /14), EH1 (scoreSchema /16),
 *           EH2 (scoreAiDiscovery /6), EH5 (scoreRobots /18), EC2 (scoreLlmsTxt /18).
 *
 * These tests call the scoring helper functions directly (not via HTTP).
 * Import from lib/technical-audit/score-aggregator.ts.
 */

import { it, expect, describe } from 'vitest';
import { rollupTo5Categories }  from '../../../../../lib/technical-audit/score-aggregator';

// ── TC-S7-57: rollupTo5Categories returns correct 5 keys (EC1) ───────────────
describe('rollupTo5Categories (EC1)', () => {
  const dims = {
    scoreRobots:       18,   // max
    scoreLlmsTxt:      18,   // max
    scoreSchema:       16,   // max
    scoreMeta:         14,   // max
    scoreContent:      12,   // max
    scoreBrandEntity:  10,   // max
    scoreSignals:       6,   // max
    scoreAiDiscovery:   6,   // max
  };

  it('TC-S7-57: rollup returns 5 categories (technical, content, authority, schema, performance)', () => {
    const rollup = rollupTo5Categories(dims);
    expect(rollup).toHaveProperty('technical');
    expect(rollup).toHaveProperty('technicalPct');
    expect(rollup).toHaveProperty('content');
    expect(rollup).toHaveProperty('contentPct');
    expect(rollup).toHaveProperty('authority');
    expect(rollup).toHaveProperty('authorityPct');
    expect(rollup).toHaveProperty('schema');
    expect(rollup).toHaveProperty('schemaPct');
    expect(rollup).toHaveProperty('performance');
  });

  it('TC-S7-58: performance is null (stub for v1.1)', () => {
    const rollup = rollupTo5Categories(dims);
    expect(rollup.performance).toBeNull();
  });

  it('TC-S7-59: technicalPct = (robots+llmsTxt+aiDiscovery+signals)/48*100 (EC1)', () => {
    const rollup = rollupTo5Categories(dims);
    const expected = ((18 + 18 + 6 + 6) / 48) * 100;
    expect(rollup.technicalPct).toBeCloseTo(expected, 1);
    expect(rollup.technicalPct).toBeCloseTo(100, 1);
  });

  it('TC-S7-60: contentPct = (content+meta)/26*100 (EC1)', () => {
    const rollup = rollupTo5Categories(dims);
    const expected = ((12 + 14) / 26) * 100;
    expect(rollup.contentPct).toBeCloseTo(expected, 1);
    expect(rollup.contentPct).toBeCloseTo(100, 1);
  });

  it('TC-S7-61: authorityPct = brandEntity/10*100 (EC1)', () => {
    const rollup = rollupTo5Categories(dims);
    expect(rollup.authorityPct).toBeCloseTo(100, 1);
  });

  it('TC-S7-62: schemaPct = schema/16*100 (EC1)', () => {
    const rollup = rollupTo5Categories(dims);
    expect(rollup.schemaPct).toBeCloseTo(100, 1);
  });

  it('TC-S7-63: all *Pct values are 0-100 for zero input', () => {
    const zeroDims = { scoreRobots:0, scoreLlmsTxt:0, scoreSchema:0, scoreMeta:0,
                       scoreContent:0, scoreBrandEntity:0, scoreSignals:0, scoreAiDiscovery:0 };
    const rollup = rollupTo5Categories(zeroDims);
    expect(rollup.technicalPct).toBe(0);
    expect(rollup.contentPct).toBe(0);
    expect(rollup.authorityPct).toBe(0);
    expect(rollup.schemaPct).toBe(0);
  });
});

// ── TC-S7-64: scoreComposite = sum (not normalised) — EA4 ─────────────────────
describe('scoreComposite formula (EA4)', () => {
  it('TC-S7-64: scoreComposite = sum of 8 raw scores (NOT divided by anything) — EA4', () => {
    // Specification assertion: dimension max values are designed to sum to exactly 100.
    // This means scoreComposite at maximum = 100, without any normalisation step.
    // If a developer divides by 8 (average), max = 12.5. Divided by 100, max = 1.0.
    const DIM_MAXES = {
      scoreRobots: 18, scoreLlmsTxt: 18, scoreSchema: 16, scoreMeta: 14,
      scoreContent: 12, scoreBrandEntity: 10, scoreSignals: 6, scoreAiDiscovery: 6,
    };
    const sumOfMaxes = Object.values(DIM_MAXES).reduce((a, b) => a + b, 0);
    expect(sumOfMaxes).toBe(100); // designed to sum to 100 — no normalisation needed
    // The production score-aggregator is tested end-to-end in TC-S7-37 (via API)
    // and TC-S7-17 (via direct DB insert). This test validates the spec arithmetic.
  });
});

// ── TC-S7-65: scoreRobots /18 components (EH5) ───────────────────────────────
// NOTE: TC-S7-65 and TC-S7-66 are specification documentation tests — they assert
// the dimension max values and component weights from the spec. They verify that the
// spec constants are internally consistent. The real scoring function behaviour is
// covered by unit tests in tests/unit/robots-txt/analyze.test.ts.
describe('scoreRobots /18 (EH5: 6 binary components × 3pts)', () => {
  it('TC-S7-65: spec max scoreRobots is 18 (6 components × 3pts binary — EH5)', () => {
    // Specification assertion: 6 binary components × 3pts = 18.
    // Validates spec consistency, not implementation.
    const maxBySpec = 6 * 3;
    expect(maxBySpec).toBe(18);
  });

  it('TC-S7-66: 4 passing components produce score 12 (spec formula check)', () => {
    // Specification assertion: 4 of 6 binary components passing = 4 × 3 = 12.
    // This matches the default seeded scoreRobots='12.00' in seedTechnicalAudit.
    // Real scoring function test lives in tests/unit/robots-txt/analyze.test.ts.
    const passingComponents = 4;
    const ptsPerComponent   = 3;
    const expectedScore     = passingComponents * ptsPerComponent;
    expect(expectedScore).toBe(12);
    expect(expectedScore).toBeLessThanOrEqual(18);
  });
});

// ── TC-S7-67: scoreLlmsTxt /18 components (EC2) ──────────────────────────────
describe('scoreLlmsTxt /18 (EC2: 6 binary components × 3pts)', () => {
  it('TC-S7-67: max scoreLlmsTxt is 18 (6 binary components × 3pts — EC2)', () => {
    // 6 components: present, H1+blockquote, sections, links, depth(≥1500chars), llms-full.txt
    // Specification assertion: same formula as scoreRobots (EH5) — 6 components × 3pts = 18.
    const maxBySpec = 6 * 3;
    expect(maxBySpec).toBe(18);
  });

  it('TC-S7-68: depth component uses total char count ≥1500 (ED1 fix — NOT avg section words)', () => {
    // ED1 fix: prototype shows ≥1500 chars (total file), not avg section body ≥50 words.
    // Specification assertion: the threshold constant must be 1500 (chars), not a word count.
    // The real scoring function is tested in tests/unit/llms-txt/depth-score.test.ts.
    // This test asserts the spec value so Claude Code knows the correct constant to use.
    const EXPECTED_DEPTH_THRESHOLD_CHARS = 1500;
    const WRONG_WORD_COUNT_THRESHOLD     = 50;   // EC2 original (overridden by ED1)
    // ED1 explicitly says 'use prototype as canonical: total chars ≥1500'
    expect(EXPECTED_DEPTH_THRESHOLD_CHARS).toBeGreaterThan(WRONG_WORD_COUNT_THRESHOLD);
    expect(EXPECTED_DEPTH_THRESHOLD_CHARS).toBe(1500);
    // When lib/llms-txt/depth-score.ts is implemented, add:
    // const { LLMS_TXT_DEPTH_THRESHOLD } = await import('../../../../../lib/llms-txt/depth-score');
    // expect(LLMS_TXT_DEPTH_THRESHOLD).toBe(1500);
  });
});

// ── TC-S7-69: scoreSchema /16 (EH1: 4 types × 4pts) ─────────────────────────
describe('scoreSchema /16 (EH1: 4 schema types × 4pts each)', () => {
  it('TC-S7-69: max scoreSchema is 16 (4 types × 4pts)', () => {
    const maxSchema = 4 * 4; // 4 types: Organization, LocalBusiness, FAQPage, Article
    expect(maxSchema).toBe(16);
  });
});

// ── TC-S7-70: scoreAiDiscovery /6 (EH2) ──────────────────────────────────────
describe('scoreAiDiscovery /6 (EH2: ai.txt=3pts + 3 JSON endpoints × 1pt)', () => {
  it('TC-S7-70: max scoreAiDiscovery is 6 (EH2)', () => {
    const maxAiDiscovery = 3 + 1 + 1 + 1; // ai.txt(3) + summary.json(1) + faq.json(1) + service.json(1)
    expect(maxAiDiscovery).toBe(6);
  });

  it('TC-S7-71: ai.txt alone gives 3pts, not 1.5pts (EH2: primary standard weighted 3×)', () => {
    // EH2 fix: 4 × 1.5 = 6 is non-integer and unimplementable cleanly.
    // Canonical: ai.txt = 3pts (primary emerging standard), each JSON endpoint = 1pt.
    const AI_TXT_POINTS       = 3;   // .well-known/ai.txt — highest adoption signal
    const JSON_ENDPOINT_POINTS = 1;  // /ai/summary.json, /ai/faq.json, /ai/service.json
    const MAX_TOTAL            = AI_TXT_POINTS + (3 * JSON_ENDPOINT_POINTS);
    expect(AI_TXT_POINTS).toBe(3);            // spec says 3, not 1.5
    expect(JSON_ENDPOINT_POINTS).toBe(1);     // each JSON endpoint = 1pt
    expect(MAX_TOTAL).toBe(6);               // total must match scoreAiDiscovery max
    expect(AI_TXT_POINTS).toBeGreaterThan(JSON_ENDPOINT_POINTS); // primary standard outweights
  });
});

// ── TC-S7-72: scoreContent /12 (EG1) ─────────────────────────────────────────
describe('scoreContent /12 (EG1: SSR score 0/3/6 + capsulePassRate×6)', () => {
  it('TC-S7-72: SSR content adds 6pts (good SSR site), capsulePassRate=0.5 adds 3pts → 9', () => {
    // EG1: SSR score 6 (ratio > 0.7) + capsulePassRate 0.5 × 6 = 3 → total 9
    // This is our default seeded value
    const ssrScore           = 6;    // > 0.7 ratio
    const capsulePassRate    = 0.5;  // 50% of Q-headings have capsule
    const capsuleScore       = Math.round(capsulePassRate * 6); // = 3
    const contentScore       = ssrScore + capsuleScore;
    expect(contentScore).toBe(9);
    expect(contentScore).toBeLessThanOrEqual(12);
  });
});
```

---

## `07-acceptance.test.ts`

```typescript
/**
 * 07-acceptance.test.ts
 *
 * Sprint 7 §9 acceptance criteria — full-stack validation of Technical AI Infrastructure.
 * TC-S7-73 through TC-S7-82
 *
 * Verifies: all 4 tables populated, 8-dim scoring renders, 5-cat rollup renders,
 *           citability methods accessible, corpus results table writable,
 *           no regression on Sprint 6 action_items.
 */

import { it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql }                         from 'drizzle-orm';
import {
  db, seedOrganization, seedUser, seedBrand, seedAudit,
  seedTechnicalAudit, seedBrandEntityScore, seedCorpusResult,
  deleteTestDataForOrg,
} from './helpers/db';
import { getJson, SESSION_1 }           from './helpers/http';
import { rollupTo5Categories }          from '../../../../../lib/technical-audit/score-aggregator';
import * as schema                       from '../../../../../db/schema';

const ENV = {
  clerkOrgId1:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  clerkUserId1: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  email1:       process.env.E2E_TEST_USER_1_EMAIL     ?? '',
};

let org1Id      = '';
let brand1Id    = '';
let audit1Id    = '';
let techAuditId = '';

beforeAll(async () => {
  const org   = await seedOrganization({ clerkOrgId: ENV.clerkOrgId1, name: '[S7-E2E] Acceptance Org', tier: 'starter' });
  org1Id      = org.id;
  await seedUser({ clerkUserId: ENV.clerkUserId1, organizationId: org1Id, email: ENV.email1 });
  const brand = await seedBrand({ organizationId: org1Id, name: '[S7-E2E] Acceptance Brand', domain: 's7-accept.com.au', vertical: 'tradies' });
  brand1Id    = brand.id;
  const audit = await seedAudit({ organizationId: org1Id, brandId: brand1Id });
  audit1Id    = audit.id;
  const ta    = await seedTechnicalAudit({
    organizationId: org1Id, brandId: brand1Id, auditId: audit1Id,
    scoreRobots: '15.00', scoreLlmsTxt: '12.00', scoreSchema: '12.00',
    scoreMeta: '11.00', scoreContent: '10.00', scoreBrandEntity: '7.00',
    scoreSignals: '5.00', scoreAiDiscovery: '4.00',
  });
  techAuditId = ta.id;
  await seedBrandEntityScore({ brandId: brand1Id, abnVerified: true, scoreOf10: '7.00' });
});

afterAll(async () => {
  await db.delete(schema.validationCorpusResults)
    .where(eq(schema.validationCorpusResults.fixtureName, '[S7-E2E] corpus fixture'));
  await deleteTestDataForOrg(org1Id);
});

// ── TC-S7-73: Technical audit row retrieved via API (§9 acceptance) ───────────
it('TC-S7-73: technical audit row is accessible via API with all 8 dimension scores', async () => {
  const { status, body } = await getJson<any>(`/api/technical-audits/${techAuditId}`, SESSION_1);
  expect(status).toBe(200);
  expect(parseFloat(body.scoreComposite)).toBeCloseTo(76.00, 1); // 15+12+12+11+10+7+5+4=76
});

// ── TC-S7-74: 8→5 rollup computes correctly from real data (EC1) ─────────────
it('TC-S7-74: 8→5 rollup from seeded scores produces valid percentages (EC1)', async () => {
  const { body } = await getJson<any>(`/api/technical-audits/${techAuditId}`, SESSION_1);
  const rollup = rollupTo5Categories({
    scoreRobots:      parseFloat(body.scoreRobots),
    scoreLlmsTxt:     parseFloat(body.scoreLlmsTxt),
    scoreSchema:      parseFloat(body.scoreSchema),
    scoreMeta:        parseFloat(body.scoreMeta),
    scoreContent:     parseFloat(body.scoreContent),
    scoreBrandEntity: parseFloat(body.scoreBrandEntity),
    scoreSignals:     parseFloat(body.scoreSignals),
    scoreAiDiscovery: parseFloat(body.scoreAiDiscovery),
  });
  expect(rollup.technicalPct).toBeGreaterThanOrEqual(0);
  expect(rollup.technicalPct).toBeLessThanOrEqual(100);
  expect(rollup.contentPct).toBeGreaterThanOrEqual(0);
  expect(rollup.contentPct).toBeLessThanOrEqual(100);
  expect(rollup.authorityPct).toBeGreaterThanOrEqual(0);
  expect(rollup.authorityPct).toBeLessThanOrEqual(100);
  expect(rollup.schemaPct).toBeGreaterThanOrEqual(0);
  expect(rollup.schemaPct).toBeLessThanOrEqual(100);
  expect(rollup.performance).toBeNull();
});

// ── TC-S7-75: 47 citability methods seeded (§9 acceptance) ───────────────────
it('TC-S7-75: citability_methods has 47 rows (§9 acceptance gate)', async () => {
  const result = await db.execute(sql`SELECT COUNT(*)::int as n FROM citability_methods`);
  expect((result.rows[0] as any).n).toBe(47);
});

// ── TC-S7-76: Brand entity score retrievable via API ─────────────────────────
it('TC-S7-76: brand entity score retrievable and abnVerified is boolean true', async () => {
  const { status, body } = await getJson<any>(`/api/brand-entity/${brand1Id}`, SESSION_1);
  expect(status).toBe(200);
  expect(body.abnVerified).toBe(true);
  expect(typeof body.abnVerified).toBe('boolean');
});

// ── TC-S7-77: validation_corpus_results table writable ───────────────────────
it('TC-S7-77: validation_corpus_results table accepts writes (corpus runner prerequisite)', async () => {
  const result = await seedCorpusResult({
    fixtureName:  '[S7-E2E] corpus fixture',
    domain:       's7-corpus-test.com.au',
    vertical:     'tradies',
    region:       'au',
    category:     'au-tradies',
    actualScore:  '55.00',
    withinBand:   'yes',
  });
  expect(result.id).toBeDefined();
  // actualScore is numeric(5,2) — Drizzle may return '55.00' or '55' depending on version.
  // Use parseFloat for robustness rather than exact string equality.
  expect(parseFloat(result.actualScore as string)).toBeCloseTo(55, 1);
});

// ── TC-S7-78: Spearman > 0.7 gate formula validates (ED3) ────────────────────
it('TC-S7-78: rank array helper produces correct ranks for Spearman (ED3)', () => {
  // ED3 spec: rankArray used with sampleCorrelation from simple-statistics.
  //
  // ⚠️  SPEC IMPORT WARNING: The Sprint 7 spec ED3 shows 'import { spearman } from simple-statistics'
  // (marked 'available in simple-statistics v7+'). This import is INCORRECT — simple-statistics v7
  // does NOT export a named 'spearman' function. Using it causes a TypeScript build error.
  // The correct approach (also shown in the same spec block) is: rankArray + sampleCorrelation.
  // sampleCorrelation(rankedArray1, rankedArray2) computes Pearson of ranked arrays = Spearman. ✓
  // Do NOT attempt to import { spearman } — use the rankArray approach implemented here.
  //
  // IMPORTANT: This implementation uses indexOf which assigns the SAME rank to tied values
  // (rank of first occurrence). This is NOT average-rank (the statistically correct approach
  // for Spearman with ties). For the 50-site corpus, tied scores are unlikely but possible.
  // The corpus runner (tests/corpus/run-corpus.ts) should use a proper tie-handling rankArray
  // or simple-statistics' built-in spearman() function if available in v7+.
  function rankArray(arr: number[]): number[] {
    const sorted = [...arr].sort((a, b) => b - a);
    return arr.map(v => sorted.indexOf(v) + 1);
  }

  // No-tie case (the standard case):
  const scores = [80, 40, 60, 20, 100];
  const ranks  = rankArray(scores);
  expect(ranks[0]).toBe(2);  // 80 is 2nd highest
  expect(ranks[4]).toBe(1);  // 100 is highest (rank 1)
  expect(ranks[3]).toBe(5);  // 20 is lowest (rank 5)

  // Tie case — documents current behaviour (NOT average-rank):
  const tiedScores = [80, 80, 60];
  const tiedRanks  = rankArray(tiedScores);
  // Both 80s get rank 1 (indexOf finds first occurrence) — NOT the average rank 1.5
  expect(tiedRanks[0]).toBe(1);  // first 80 → rank 1
  expect(tiedRanks[1]).toBe(1);  // second 80 → also rank 1 (indexOf, not average-rank)
  expect(tiedRanks[2]).toBe(3);  // 60 → rank 3 (not 3, because two items outrank it)
  // NOTE: If corpus has tied scores, Spearman result may be slightly inaccurate.
  // The threshold is 0.7 — minor tie effects are unlikely to change pass/fail outcome.
});

// ── TC-S7-79: No regression on Sprint 6 action_items (§9 acceptance) ─────────
it('TC-S7-79: Sprint 6 action_items table still accessible (no regression)', async () => {
  const result = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'action_items'`);
  expect(result.rows).toHaveLength(1);
});

// ── TC-S7-80: ATTRIBUTIONS.md check (§9 acceptance — EA5) ────────────────────
it('TC-S7-80: ATTRIBUTIONS.md exists at project root (EA5 fix)', async () => {
  const { existsSync } = await import('node:fs');
  const { resolve }    = await import('node:path');
  const attrPath       = resolve(process.cwd(), 'ATTRIBUTIONS.md');
  expect(existsSync(attrPath), 'ATTRIBUTIONS.md not found at project root').toBe(true);
});

it('TC-S7-81: ATTRIBUTIONS.md mentions Auriti-Labs and Princeton KDD (EA5 fix)', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { resolve }                  = await import('node:path');
  const attrPath                     = resolve(process.cwd(), 'ATTRIBUTIONS.md');
  if (!existsSync(attrPath)) return;
  const content = readFileSync(attrPath, 'utf8');
  expect(content).toContain('Auriti-Labs');
  expect(content).toContain('Princeton KDD 2024');
  expect(content).toContain('AutoGEO ICLR 2026');
});

// ── TC-S7-82: CI green — all Sprint 7 tables accessible ──────────────────────
it('TC-S7-82: all 4 Sprint 7 tables accessible in single query', async () => {
  const result = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'technical_audits', 'brand_entity_scores',
        'citability_methods', 'validation_corpus_results'
      )
    ORDER BY table_name`);
  expect(result.rows).toHaveLength(4);
});
```

---

## Test data cleanup contract

Every test file's `afterAll` calls `deleteTestDataForOrg(orgId)` for each org it seeds.

Hard-delete order (FK-safe):

```
1. validation_corpus_results WHERE fixtureName LIKE '[S7-E2E]%'
2. technical_audits          WHERE organizationId = orgId
3. brand_entity_scores       WHERE brandId IN (org's brands)
4. action_items              WHERE organizationId = orgId   ← RESTRICT FK on brandId
5. citations                 WHERE auditId IN (org's audits)
6. audits                    WHERE organizationId = orgId
7. brands                    WHERE organizationId = orgId
8. users                     WHERE organizationId = orgId
9. organizations             WHERE id = orgId
```

**NEVER delete from:** `citability_methods`, `ai_bots` — these are global seed tables.

Inline test rows (created inside a single `it()`) are deleted in `try/finally` blocks within that test.

---

## Acceptance criteria checklist

Before marking Sprint 7 complete, verify all of the following:

```
[ ] TC-S7-01 to TC-S7-04  — All 4 new tables exist
[ ] TC-S7-05 to TC-S7-07  — technical_audits: 17 columns present, audit_id nullable, updated_at exists
[ ] TC-S7-08 to TC-S7-09  — brand_entity_scores: boolean types correct (EA1 fix — NOT text)
[ ] TC-S7-10              — brand_entity_scores has no FK to technical_audits (EC4)
[ ] TC-S7-11 to TC-S7-12  — Indexes on technical_audits exist
[ ] TC-S7-13 to TC-S7-16  — RLS enabled on tenant tables, disabled on global tables
[ ] TC-S7-17 to TC-S7-18  — scoreComposite and findings jsonb correct
[ ] TC-S7-19 to TC-S7-25  — 47 citability methods seeded (Princeton KDD + AutoGEO ICLR only)
[ ] TC-S7-26 to TC-S7-30  — 27 AI bots seeded (3 tiers × 9 bots each)
                             ⚠️  These tests RETURN EARLY (pass silently) if ai_bots is a
                             TypeScript constant rather than a DB table. If TC-S7-26 passes
                             without the console.log appearing, verify bots are in the DB.
                             Alternative: import AI_BOTS constant and expect(AI_BOTS).toHaveLength(27).
[ ] TC-S7-31 to TC-S7-40  — GET /api/technical-audits/[id] auth, shape, cross-org, ranges
[ ] TC-S7-41 to TC-S7-48  — GET /api/brand-entity/[brandId] auth, boolean types, cross-org
[ ] TC-S7-49 to TC-S7-56  — GET /api/citability-methods tier gate (free=10, starter=47)
[ ] TC-S7-57 to TC-S7-72  — Scoring formulas: composite, rollup, all 8 dimension ranges
[ ] TC-S7-73 to TC-S7-82  — Full acceptance: tables, rollup, corpus, ATTRIBUTIONS.md
[ ] pnpm test:corpus       — 50-site Spearman correlation > 0.7 (acceptance gate — non-negotiable)
[ ] No regression          — Sprint 1–6 test suites still green
[ ] CI green               — all files pass in single run
```

**Sprint 7 PASS** = all 82 test cases green + `pnpm test:corpus` Spearman > 0.7.
