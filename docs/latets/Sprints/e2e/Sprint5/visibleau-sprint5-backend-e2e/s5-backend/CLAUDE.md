# VisibleAU Sprint 5 — Backend E2E Tests (Database + API)

## What these tests cover

Sprint 5 ships two new tables (`vertical_packs`, `vertical_pack_prompts`), two new API
routes (`GET /api/vertical-packs`, `GET /api/vertical-packs/[id]/prompts`), the seed
runner that populates 336 prompts across 3 vertical packs, and the audit job changes
that load prompts from DB instead of inline arrays.

These tests run against a **live local app + real Postgres DB**. Test data is seeded in
`beforeAll` using Drizzle directly, and **hard-deleted in `afterAll`**.

> **IMPORTANT:** Sprint 5 adds its own seed data. These E2E tests do NOT re-run `pnpm seed`
> — they seed only minimal test rows (a test pack with a handful of prompts) and clean up
> afterward. The production seed (124+104+108 prompts) is assumed already present from
> `pnpm seed`. Tests verify the production seed counts in the acceptance suite (TC-S5-43–48).

| File | What it tests | Test IDs |
|---|---|---|
| `01-vertical-packs-list.test.ts` | GET /api/vertical-packs: active packs, shape, brandsCount, RLS global | TC-S5-01–TC-S5-12 |
| `02-vertical-packs-prompts-preview.test.ts` | GET /api/vertical-packs/[id]/prompts?preview=true: expansion, auth, 404 | TC-S5-13–TC-S5-24 |
| `03-schema-seed-verification.test.ts` | DB: table structure, constraints, seed counts (124/104/108/336) | TC-S5-25–TC-S5-36 |
| `04-expand-prompt-integration.test.ts` | expandPrompt via API: {brand}/{location}/{competitors} placeholders | TC-S5-37–TC-S5-42 |
| `05-acceptance.test.ts` | Sprint 5 §12 acceptance checklist, audit job prompt-source regression | TC-S5-43–TC-S5-56 |

---

## Prerequisites

```bash
# 1. Sprints 1-4 complete. Sprint 5 migrations applied:
#    pnpm drizzle-kit migrate
#    Verify: vertical_packs and vertical_pack_prompts tables exist.

# 2. Sprint 5 seed run:
#    pnpm seed
#    Verify: SELECT COUNT(*) FROM vertical_pack_prompts GROUP BY pack_id → 124, 104, 108

# 3. App running:
#    LLM_MODE=mock MOCK_SCENARIO=happy_path pnpm dev

# 4. Inngest dev server (required ONLY for TC-S5-53 — full audit regression):
#    npx inngest-cli@latest dev

# 5. .env.test.local populated — see template below.

# 6. pnpm packages installed:
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

# Test User 1 — Org 1 (agency tier: 5 brand slots, 4 engines)
E2E_TEST_USER_1_EMAIL=e2e-s5-user-1@visibleau.test
E2E_TEST_USER_1_CLERK_ID=user_...
E2E_TEST_ORG_1_CLERK_ID=org_...
E2E_TEST_USER_1_SESSION_ID=sess_...

# Test User 2 — Org 2 (free tier: 1 brand slot, 2 engines)
# Used for cross-org isolation checks only
E2E_TEST_USER_2_EMAIL=e2e-s5-user-2@visibleau.test
E2E_TEST_USER_2_CLERK_ID=user_...
E2E_TEST_ORG_2_CLERK_ID=org_...
E2E_TEST_USER_2_SESSION_ID=sess_...
```

---

## How to run

```bash
# Full suite
npx vitest run --config tests/e2e/backend/sprint5/vitest.config.e2e.ts

# Single file
npx vitest run tests/e2e/backend/sprint5/01-vertical-packs-list.test.ts \
  --config tests/e2e/backend/sprint5/vitest.config.e2e.ts

# package.json script to add:
# "test:e2e:s5": "vitest run --config tests/e2e/backend/sprint5/vitest.config.e2e.ts"
```

---

## Sprint 5 Key Spec Facts (for assertions)

### Test Data Region Strategy

> **Critical:** `vertical_packs.region` uses a Postgres native `regionEnum` with values
> `'au' | 'nz' | 'uk' | 'us' | 'ca' | 'eu'`. Values like `'test'` or `'test-preview'`
> are **not valid** and cause `invalid input value for enum region` on every INSERT.
>
> Production packs always use `region='au'`. Test packs use **other valid enum values** so
> they satisfy the Postgres constraint and never conflict with the
> `UNIQUE(vertical, region)` index on production data:
>
> | Test file / test | Vertical | Region | Rationale |
> |---|---|---|---|
> | 01 TC-S5-08 (inline) | tradies | nz | Retired pack test — deleted inline |
> | 02 beforeAll | tradies | nz | Preview endpoint tests — deleted in afterAll |
> | 02 TC-S5-15 (inline) | tradies | uk | Retired pack test — deleted inline |
> | 03 TC-S5-34 (inline) | saas | nz | Cascade test — deleted inline |
> | 04 beforeAll | allied_health | nz | Expand integration tests — deleted in afterAll |
> | 04 TC-S5-39 (inline) | allied_health | us | CB3 competitors fallback — deleted in finally |
> | 05 TC-S5-50 (inline) | saas | nz | Empty prompts guard — deleted inline |
> | 05 TC-S5-51 (inline) | tradies | nz | CB2 cap test — deleted inline |
> | 05 TC-S5-52 (inline) | saas | uk | CG5 retired filter — deleted inline |
> | 05 TC-S5-54 (inline) | allied_health | nz | Anti-pattern filter test — deleted inline |
> | 05 TC-S5-56 (inline) | allied_health | uk | CC1 idempotency test — deleted inline |
>
> Tests run **sequentially** (Vitest singleFork). Combos used by one test and deleted
> inline are available for reuse by a later test without conflict.

### Tables
```
vertical_packs:         id, vertical, region, version, name, promptsCount,
                        metadata, publishedAt, retiredAt, updatedAt
                        UNIQUE(vertical, region) — one active pack per vertical per region
                        RLS: DISABLED (global data, no organizationId)

vertical_pack_prompts:  id, packId, promptTemplate, rank, category, topic,
                        expectedMentionType, notes, createdAt
                        FK: packId → vertical_packs.id ON DELETE CASCADE
                        RLS: DISABLED
```

### Seed counts (production seed)
```
AU Tradies:      vertical='tradies'      region='au'  → 124 prompts
AU Allied Health: vertical='allied_health' region='au' → 104 prompts
AU SaaS:         vertical='saas'         region='au'  → 108 prompts
Total:           336 prompts
```

### Category values (canonical)
```
'service-discovery' | 'service-specific' | 'recommendation' | 'comparison' |
'pricing' | 'emergency' | 'reviews' | 'compliance' | 'problem-driven'
```

### expandPrompt rules (§7)
```
{brand}       → brand.name
{domain}      → brand.domain
{location}    → formatLocation(loc) = 'STATE:Suburb' → 'Suburb, STATE'
              → one expanded prompt per location
              → returns [] when locations is empty
{competitors} → competitors.join(', ') OR 'other local providers' when empty
```

### GET /api/vertical-packs response shape
```typescript
VerticalPack[]:
  id, name, vertical, region, version, promptsCount,
  publishedAt, updatedAt, brandsCount  // brandsCount is org-scoped
Ordered by vertical ASC; filtered WHERE retired_at IS NULL
```

### GET /api/vertical-packs/[id]/prompts?preview=true
```
Query params: brandName, primaryRegion (raw 'STATE:Suburb' format)
Returns: { expandedPrompts: string[] }  — top 3 only (preview mode)
Auth: getCurrentUser() + 401; no RLS needed (global data)
404 when packId doesn't exist or retiredAt IS NOT NULL
```

### Audit job prompt loading (§8)
```
1. getVerticalPack(brand.vertical, brand.region)
   → WHERE retired_at IS NULL (active packs only)
2. SELECT top 10 prompts ORDER BY rank ASC
3. expandPrompt each template with brand/competitors/primaryRegions
4. allExpanded.slice(0, 10)  ← hard cap on final prompt count
5. prompts.length === 0 → audit status='failed', metadata.error set
6. pack is null → audit status='failed', metadata.error set
```
