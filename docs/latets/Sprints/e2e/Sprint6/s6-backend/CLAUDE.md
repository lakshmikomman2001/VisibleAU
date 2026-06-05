# VisibleAU Sprint 6 — Backend E2E Tests (Database + API)

## What these tests cover

Sprint 6 ships the Action Center: two new tables (`action_items`,
`recommendation_research`), three API routes (`GET /api/action-items`,
`GET /api/action-items/[id]`, `PATCH /api/action-items/[id]/status`), the
recommendation generation engine (`buildRecommendations`), and the Inngest function
that fires on `audit/complete` and persists recommendations.

These tests run against a **live local app + real Postgres DB**. Test data is seeded
in `beforeAll` using Drizzle directly (service-role, bypasses RLS), and
**hard-deleted in `afterAll`** or inline `try/finally` blocks where noted.

> **IMPORTANT:** These E2E tests do NOT trigger real audits or real Inngest jobs.
> They seed `action_items` directly to simulate what `generate-recommendations` would
> persist. The Inngest integration is tested separately via `@inngest/test` unit tests.
> Sprint 5 production seed (336 prompts, 3 packs) is assumed already present.

---

## Test file map

| File | What it tests | Test IDs |
|---|---|---|
| `01-schema-constraints.test.ts` | DB: table structure, unique constraint, RLS, FK, NOT NULL | TC-S6-01–TC-S6-12 |
| `02-recommendation-research-seed.test.ts` | DB: research citations seeded, all 11 keys, shape | TC-S6-13–TC-S6-20 |
| `03-action-items-list.test.ts` | GET /api/action-items: auth, shape, filters, pagination, ordering, RLS | TC-S6-21–TC-S6-35 |
| `04-action-items-detail.test.ts` | GET /api/action-items/[id]: shape, 404, cross-org | TC-S6-36–TC-S6-42 |
| `05-action-items-status.test.ts` | PATCH /api/action-items/[id]/status: done, dismissed, validation, idempotency | TC-S6-43–TC-S6-54 |
| `06-acceptance.test.ts` | §13 acceptance checklist, anti-pattern filter, confidence labels, tier gate | TC-S6-55–TC-S6-68 |

---

## Prerequisites

```bash
# 1. Sprints 1–5 complete. Sprint 6 migrations applied:
#    pnpm drizzle-kit generate && pnpm drizzle-kit migrate
#    Verify: action_items and recommendation_research tables exist.

# 2. Sprint 6 RLS applied (must match migration SQL from §11 step 1):
#    action_items         → RLS ENABLED with org_isolation policy
#    recommendation_research → RLS DISABLED (global operator data)

# 3. Sprint 5 seed already run (production packs present):
#    pnpm seed
#    Verify: SELECT COUNT(*) FROM vertical_pack_prompts → 336

# 4. Sprint 6 research seed run:
#    pnpm seed   (extends Sprint 5 seed to include RESEARCH_CITATIONS)
#    Verify: SELECT COUNT(*) FROM recommendation_research → ≥11

# 5. App running:
#    LLM_MODE=mock MOCK_SCENARIO=happy_path pnpm dev

# 6. .env.test.local populated — see template below.

# 7. pnpm packages (should be present from Sprint 5):
#    pnpm add -D vitest vite-tsconfig-paths dotenv
#    pnpm add @clerk/backend postgres drizzle-orm
```

---

## .env.test.local

```bash
# App
E2E_APP_URL=http://localhost:3000

# Database — USE a TEST project, never production
DATABASE_URL=postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres

# Clerk (test-mode keys)
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

# Test User 1 — Org 1 (starter tier: sees full recommendations)
E2E_TEST_USER_1_EMAIL=e2e-s6-user-1@visibleau.test
E2E_TEST_USER_1_CLERK_ID=user_...
E2E_TEST_ORG_1_CLERK_ID=org_...
E2E_TEST_USER_1_SESSION_ID=sess_...

# Test User 2 — Org 2 (free tier: sees blurred content, used for cross-org isolation)
E2E_TEST_USER_2_EMAIL=e2e-s6-user-2@visibleau.test
E2E_TEST_USER_2_CLERK_ID=user_...
E2E_TEST_ORG_2_CLERK_ID=org_...
E2E_TEST_USER_2_SESSION_ID=sess_...
```

---

## How to run

```bash
# Full suite
npx vitest run --config tests/e2e/backend/sprint6/vitest.config.e2e.ts

# Single file
npx vitest run tests/e2e/backend/sprint6/03-action-items-list.test.ts \
  --config tests/e2e/backend/sprint6/vitest.config.e2e.ts

# Add to package.json:
# "test:e2e:s6": "vitest run --config tests/e2e/backend/sprint6/vitest.config.e2e.ts"
```

---

## Sprint 6 Key Spec Facts (for assertions)

### Schema — `action_items`
```
id                  uuid PK defaultRandom
organizationId      uuid FK → organizations.id NOT NULL
brandId             uuid FK → brands.id NOT NULL (onDelete: RESTRICT — brands are soft-deleted)
auditId             uuid FK → audits.id NOT NULL
recommendationKey   text NOT NULL   e.g. 'wikipedia-article', 'reddit-absence'
dimension           text NOT NULL   'frequency'|'position'|'sentiment'|'context'|'accuracy'
title               text NOT NULL
action              text NOT NULL
confidenceLabel     text NOT NULL   'confirmed'|'likely'|'hypothesis'
expectedImpactScore text NOT NULL   'high'|'medium'|'low'  (was nullable — DM4 fixed)
evidenceRefs        jsonb NOT NULL default '[]'
status              text NOT NULL default 'open'  'open'|'in_progress'|'done'|'dismissed'
dismissedReason     text (nullable)
doneAt              timestamp with tz (nullable)
dismissedAt         timestamp with tz (nullable)
createdAt           timestamp with tz NOT NULL defaultNow
updatedAt           timestamp with tz NOT NULL defaultNow
UNIQUE(auditId, recommendationKey)  ← action_items_audit_rec_idx (DC3 fix)
RLS: ENABLED — policy: organization_id = current_setting('app.current_organization_id')::uuid
```

### Schema — `recommendation_research`
```
id                  uuid PK defaultRandom
recommendationKey   text NOT NULL   e.g. 'wikipedia-article'
source              text NOT NULL   e.g. 'Princeton GEO study (2024)'
url                 text (nullable)
summary             text NOT NULL
confidenceLevel     text NOT NULL   (display-only metadata; DL4: NOT read by buildRecommendations)
citedAt             timestamp with tz (nullable)
retrievedAt         timestamp with tz NOT NULL defaultNow
INDEX: recommendation_research_key_idx ON (recommendationKey)  ← DE4 fix
RLS: DISABLED (global operator data)
```

### The 11 universal recommendation keys
```
'wikipedia-article'  | dimension='frequency' | confidence='confirmed'
'au-local-citations' | dimension='frequency' | confidence='confirmed'
'stale-content'      | dimension='accuracy'  | confidence='confirmed'
'faq-content'        | dimension='context'   | confidence='likely'
'expert-quotes'      | dimension='accuracy'  | confidence='likely'
'cited-statistics'   | dimension='accuracy'  | confidence='likely'
'reddit-absence'     | dimension='frequency' | confidence='likely'
'press-mentions'     | dimension='frequency' | confidence='likely'
'comparison-article' | dimension='position'  | confidence='hypothesis'
'medium-presence'    | dimension='frequency' | confidence='hypothesis'
'linkedin-presence'  | dimension='frequency' | confidence='hypothesis'
```

### The 12 blocked anti-pattern keys (applyAntiPatternFilter)
```
'add-more-keywords'           'pay-for-ai-ads'
'submit-to-ai-engines'        'get-more-backlinks'
'use-ai-to-write-content'     'update-meta-tags-for-ai'
'improve-seo-generic'         'buy-reviews'
'create-ai-generated-reviews' 'add-schema-without-entity'
'target-competitor-terms'     'run-more-audits'
```

### GET /api/action-items response shape (DA5 fix)
```typescript
{
  items: Array<{
    id: string,
    recommendationKey: string,
    dimension: string,
    title: string,
    action: string,
    confidenceLabel: string,      // 'confirmed'|'likely'|'hypothesis'
    expectedImpactScore: string,  // 'high'|'medium'|'low'
    evidenceRefs: Array<{ source: string; url: string; summary: string }>,
    status: string,               // 'open'|'in_progress'|'done'|'dismissed'
    brandId: string,
    brandName: string,            // JOIN to brands (needed for section headers)
    auditId: string,
    createdAt: string,
    updatedAt: string,
  }>,
  total: number,
  page: number,
  totalPages: number,
}
```

### GET /api/action-items query params (DK1, DK4)
```
?brandId=X       filter by brandId
?status=open     filter by status (default: 'open' + 'in_progress')
?dimension=X     filter by dimension
?limit=50        default 50, max 200 (DK1 pagination fix)
?page=1          1-based page number
ORDER BY dimension ASC, created_at DESC (DK4 fix)
Auth: getCurrentUser() + 401; setRlsContext for org isolation
```

### PATCH /api/action-items/[id]/status body (DB3, DJ1 fixes)
```typescript
{
  status: 'in_progress' | 'done' | 'dismissed',
  dismissedReason?: string   // required when status='dismissed'
}
```
- status='done'      → sets doneAt=NOW(), updatedAt=NOW()
- status='dismissed' → sets dismissedAt=NOW(), dismissedReason, updatedAt=NOW()
- status='in_progress' → clears doneAt, dismissedAt
- Returns: { id, status }
- Cross-org → 404 (RLS: rows not visible → UPDATE returns 0 rows)

### Confidence label classification (classifyConfidence)
```
wikipedia-article → confirmed
au-local-citations → confirmed
stale-content → confirmed
faq-content → likely
expert-quotes → likely
cited-statistics → likely
reddit-absence → likely
press-mentions → likely
comparison-article → hypothesis
medium-presence → hypothesis
linkedin-presence → hypothesis
unknown-key → hypothesis (default)
```

### Tier gating (Sprint 6 §10)
```
free tier:    title visible, action text blurred, upgrade CTA shown
              API returns full data; tier gate is UI-only
starter+:     full content visible, mark done / dismiss enabled
```

### Test data region strategy (same as Sprint 5)
```
All test action_items use organisations/brands/audits created in beforeAll.
No collision with production packs or real org data.
Every test organisation uses clerkOrgId from .env.test.local.
Hard-delete order: citations → action_items → audits → brands → users → orgs
(FK-safe: action_items.brandId has onDelete RESTRICT so brands deleted last)
```

### Test pack used across files
```
Test org1 (starter tier) seeds:
  - 1 brand (vertical=tradies)
  - 1 completed audit
  - Multiple action_items covering all 5 dimensions and all 3 confidence labels

Test org2 (free tier) seeds:
  - 1 brand (vertical=saas)
  - 1 completed audit
  - 2 action_items (for cross-org isolation tests)
```

---

## Test data cleanup contract

Every test file's `afterAll` calls `deleteTestDataForOrg(orgId)` for each org it seeds.
`deleteTestDataForOrg` deletes in FK-safe order:

```
1. recommendation_research rows with '[S6-E2E]' prefix source (if any)
2. action_items WHERE organizationId = orgId
3. citations WHERE auditId IN (auditIds for orgId)
4. audits WHERE organizationId = orgId
5. brands WHERE organizationId = orgId
6. users WHERE organizationId = orgId
7. organizations WHERE id = orgId
```

Inline test rows (created inside a single `it()`) are deleted in `try/finally`
blocks within that test so they never pollute later tests.
