# VisibleAU Sprint 4 — Backend E2E Tests (Database + API)

## What these tests cover

Sprint 4 is read-only on the schema — **no new DB columns or tables**. All changes are
in new and extended API routes. This package tests every Sprint 4 API contract, including
the extended GET /api/brands lateral-join shape, POST /api/brands tier-limit enforcement,
the new GET /api/audits list endpoint, GET /api/audits/[id]/export (pdf/csv/json),
DELETE /api/brands soft delete, and cross-org security isolation on all new routes.

| File | What it tests |
|---|---|
| `01-get-brands-extended.test.ts` | GET /api/brands lateral JOIN: lastAuditScore, lastAuditAt, lastAuditStatus |
| `02-post-brands-tier-limits.test.ts` | POST /api/brands: BJ5 brand-limit enforcement per tier |
| `03-delete-brand-soft.test.ts` | DELETE /api/brands/[id]: soft delete, 204, deletedAt set, slot freed |
| `04-get-audits-list.test.ts` | GET /api/audits: pagination, sort, brandId filter, status filter, brandName join |
| `05-get-audits-export-csv.test.ts` | GET /api/audits/[id]/export?format=csv: 14-column header, pipe-separated domains |
| `06-get-audits-export-json.test.ts` | GET /api/audits/[id]/export?format=json: full payload, Content-Disposition attachment |
| `07-get-audits-export-pdf.test.ts` | GET /api/audits/[id]/export?format=pdf: Content-Type, filename header |
| `08-cross-org-isolation.test.ts` | All Sprint 4 routes → 404 (not 401) cross-org; unauthenticated → 401 |
| `09-acceptance.test.ts` | Sprint 4 §11 acceptance checklist items verifiable at API/DB layer |

---

## Prerequisites

```bash
# 1. Sprints 1-3 complete and all migrations applied.
#    Sprint 4 adds NO new migrations — schema is unchanged.
#    Verify: pnpm drizzle-kit studio — audits table must have Sprint 3 score_* columns.

# 2. App running with mock LLM:
#    LLM_MODE=mock MOCK_SCENARIO=happy_path pnpm dev

# 3. Inngest dev server (required ONLY for tests that trigger full audit flow):
#    npx inngest-cli@latest dev
#    Tests 01-09 use DB-seeded data — Inngest NOT required.

# 4. .env.test.local populated — see template below.

# 5. pnpm packages installed:
#    pnpm add -D vitest vite-tsconfig-paths dotenv
#    pnpm add @clerk/backend postgres drizzle-orm
```

---

## .env.test.local required variables

```bash
# ── App ─────────────────────────────────────────────────────────────────────
E2E_APP_URL=http://localhost:3000

# ── Database (USE a TEST project — never production) ─────────────────────────
DATABASE_URL=postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres

# ── Clerk (test-mode keys) ────────────────────────────────────────────────────
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

# ── Test User 1 — Org 1 (agency tier: 5 brand slots, 4 engines) ─────────────
E2E_TEST_USER_1_EMAIL=e2e-s4-user-1@visibleau.test
E2E_TEST_USER_1_PASSWORD=Test1234!
E2E_TEST_USER_1_CLERK_ID=user_...
E2E_TEST_ORG_1_CLERK_ID=org_...
E2E_TEST_USER_1_SESSION_ID=sess_...      # Clerk Dashboard → Users → Sessions

# ── Test User 2 — Org 2 (free tier: 1 brand slot, 2 engines) ────────────────
E2E_TEST_USER_2_EMAIL=e2e-s4-user-2@visibleau.test
E2E_TEST_USER_2_PASSWORD=Test1234!
E2E_TEST_USER_2_CLERK_ID=user_...
E2E_TEST_ORG_2_CLERK_ID=org_...
E2E_TEST_USER_2_SESSION_ID=sess_...

# ── Test User 3 (NOT REQUIRED) ───────────────────────────────────────────────
# E20 FIX: TEST_USER_3 is not used by any test. Only 2 users needed:
#   User 1 (agency tier) and User 2 (free tier).
# Do NOT create a third Clerk test account.

# ── LLM ──────────────────────────────────────────────────────────────────────
LLM_MODE=mock
MOCK_SCENARIO=happy_path
E2E_USE_REAL_LLM=false

# ── Inngest ───────────────────────────────────────────────────────────────────
INNGEST_EVENT_KEY=local
INNGEST_SIGNING_KEY=local

# ── Sprint 3 API keys (dummy — mock mode doesn't call real APIs) ─────────────
ANTHROPIC_API_KEY=sk-ant-dummy-for-mock-mode
GOOGLE_AI_API_KEY=dummy-for-mock-mode
PERPLEXITY_API_KEY=pplx-dummy-for-mock-mode
```

---

## How to run

```bash
# All Sprint 4 backend E2E tests
LLM_MODE=mock npx vitest run \
  --config tests/e2e/backend/sprint4/vitest.config.e2e.ts \
  tests/e2e/backend/sprint4/

# Single file
npx vitest run \
  --config tests/e2e/backend/sprint4/vitest.config.e2e.ts \
  tests/e2e/backend/sprint4/04-get-audits-list.test.ts

# Watch mode during development
npx vitest \
  --config tests/e2e/backend/sprint4/vitest.config.e2e.ts \
  tests/e2e/backend/sprint4/
```

## package.json script to add

```json
{
  "scripts": {
    "test:e2e:backend:sprint4": "LLM_MODE=mock npx vitest run --config tests/e2e/backend/sprint4/vitest.config.e2e.ts tests/e2e/backend/sprint4/"
  }
}
```

---

## Test data strategy

- **Organisations + users**: seeded idempotently in `beforeAll` — preserved across runs
- **Brands**: created in `beforeAll` with prefix `[S4-E2E]`, hard-deleted in `afterAll`
- **Audits + citations**: created in `beforeAll`, hard-deleted in `afterAll`
- `deletedAt` brands (soft-deleted in tests): explicitly hard-deleted in `afterAll` via direct DB query
- `afterAll` guards: always check `if (orgId)` before teardown (prevents double-delete crashes)
- All test domains use `*.e2e-s4.test` suffix for easy identification

---

## Sprint 4 canonical spec facts

### Brand tier limits (BJ5 fix — PRD §7)
```typescript
const BRAND_LIMITS = {
  free:        1,
  starter:     1,
  growth:      1,
  agency:      5,
  agency_pro:  25,
  enterprise:  Infinity,
};
```
POST /api/brands with `brandCount >= limit` → 403 with upgrade error message.
Brand limit count = live brands only (WHERE `deletedAt IS NULL`). Deleted brands don't count.

### GET /api/brands Sprint 4 extension (BF1+BF5 fix)
Response now includes per-brand:
- `lastAuditScore: string | null` — `scoreComposite` from most recent audit
- `lastAuditAt: string | null` — `completedAt` from most recent audit
- `lastAuditStatus: string | null` — `'pending'|'running'|'complete'|'failed'`
Via a Postgres `LEFT JOIN LATERAL` subquery. Soft-deleted brands excluded (`deletedAt IS NULL`).

### GET /api/audits list (BB3 fix — new in Sprint 4)
- Query params: `?page=1&limit=50&sort=createdAt&order=desc&brandId=X&status=Y`
- Sort column mapping (BH2 fix):
  - `auditNumber` → `audit_number`
  - `status` → `status`
  - `scoreComposite` → `score_composite`
  - `totalCostUsd` → `total_cost_usd`
  - `createdAt` → `created_at` (default)
- Response: `{ audits: AuditRow[], total: number, page: number, totalPages: number }`
- Each audit row includes `brandName` (from JOIN to brands)
- Max limit server-enforced at 100

### DELETE /api/brands/[id] — soft delete
- Returns 204 on success
- Sets `deletedAt = NOW()` on brand row (does NOT delete audit rows — no cascade)
- Cross-org → 404; own brand → 204
- After delete: brand excluded from GET /api/brands list
- After delete: org's active brand count drops — slot freed for new brand

### GET /api/audits/[id]/export — 3 formats (BD1+BB2 fix)
- `?format=pdf` → `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="visibleau-audit-{auditNumber}.pdf"`
- `?format=csv` → `Content-Type: text/csv`, 14 columns:
  `audit_number,brand_name,engine,prompt,run_number,brand_mentioned,position,sentiment_label,context_label,response_snippet,cited_sources_domains,llm_model,llm_cost_usd,created_at`
  - `cited_sources_domains` = pipe-separated list from `citedSources` jsonb
  - `response_snippet` = first 200 chars, newlines replaced with space
- `?format=json` → `Content-Type: application/json`, `Content-Disposition: attachment; filename="visibleau-audit-{auditNumber}.json"`, full audit payload

### Audit dispatch logic (BC5c fix)
```typescript
const isRich = (audit.runsPerPrompt ?? 1) >= 5 && (audit.engines?.length ?? 1) > 1;
// → AuditResultsRich if true, AuditResultsBasic if false
```
Do NOT use `audit.metadata.mode` — never set by any job.

### Cross-org security (consistent with Sprint 1-3 pattern)
- Wrong org → **404** (not 401 — 401 reveals resource existence)
- Unauthenticated → 401

---

## Anti-patterns (Sprint 4 §12)

- **Do not** query `vertical_packs` table — does not exist until Sprint 5 (BC5a)
- **Do not** use `audit.engineCount` as progress bar denominator — null until finalize (BC5b)
- **Do not** dispatch results view via `audit.metadata.mode` — never set (BC5c)
- **Do not** render PDF client-side — server-side only via `renderToBuffer` (BB2)
- **Do not** import recharts in server components — browser APIs crash Node (BH1)
- **Do not** enforce brand limits without counting only non-deleted brands (BJ5)
