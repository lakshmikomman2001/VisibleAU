# VisibleAU — Sprint 1 Frontend E2E Tests

Playwright test suite covering all browser-facing acceptance criteria from Sprint 1 §11.

---

## Test structure

| File | Coverage |
|---|---|
| `01-auth.spec.ts` | Sign-in → dashboard redirect, sidebar present, sign-out, unauthenticated redirect |
| `02-brands-list.spec.ts` | Brand list page, empty state, Create Brand button, brand card rendering |
| `03-brand-create.spec.ts` | Create form fields, validation, cancel, success → list, tier limit (403 UI) |
| `04-brand-detail.spec.ts` | Detail page, inline edit, save, cancel edit, delete confirmation dialog, soft-delete |
| `05-cross-org-isolation.spec.ts` | User 2 cannot see User 1 brands; API 404 on cross-org GET/DELETE |
| `06-region-and-pricing.spec.ts` | Region headers for all 6 regions, AU shows Free tier, UK hides it |
| `07-acceptance.spec.ts` | Full §11 acceptance smoke test in Sprint 1 order |

---

## Prerequisites

### 1. App running

```bash
pnpm dev   # or pnpm build && pnpm start
```

Or let `playwright.config.ts` start it automatically (`webServer` config).

### 2. Test Postgres running

```bash
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=visibleau_test postgres:16
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/visibleau_test \
  pnpm db:migrate
```

### 3. Two test users in Clerk dashboard

Create in Clerk test-mode (not production):

| User | Org | Email |
|---|---|---|
| User 1 | Org 1 (AU, agency tier) | `e2e-user-1@visibleau.test` |
| User 2 | Org 2 (AU, starter tier) | `e2e-user-2@visibleau.test` |

Each user must belong to a **different** Clerk org (critical for cross-org isolation tests).

### 4. Environment variables

Create `.env.test.local`:

```bash
# App
E2E_APP_URL=http://localhost:3000

# Database (test project, separate from production)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/visibleau_test
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/visibleau_test

# Clerk test mode
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

# Test User 1 — Org 1
E2E_TEST_USER_EMAIL=e2e-user-1@visibleau.test
E2E_TEST_USER_PASSWORD=Test1234!
E2E_TEST_USER_1_CLERK_ID=user_...
E2E_TEST_ORG_1_CLERK_ID=org_...

# Test User 2 — Org 2 (DIFFERENT org — required for cross-org isolation)
E2E_TEST_USER_2_EMAIL=e2e-user-2@visibleau.test
E2E_TEST_USER_2_PASSWORD=Test1234!
E2E_TEST_USER_2_CLERK_ID=user_...
E2E_TEST_ORG_2_CLERK_ID=org_...

# Feature flags (match your dev .env.local)
FREE_TIER_ENABLED_AU=true
FREE_TIER_ENABLED_NZ=true
FREE_TIER_ENABLED_UK=false
FREE_TIER_ENABLED_US=false
FREE_TIER_ENABLED_CA=false
FREE_TIER_ENABLED_EU=false

LLM_MODE=mock
```

---

## Running the tests

```bash
# Install Playwright browsers (once)
pnpm exec playwright install --with-deps chromium

# Run all E2E tests
pnpm test:e2e

# Run a single spec
pnpm exec playwright test tests/e2e/04-brand-detail.spec.ts

# Interactive UI mode
pnpm test:e2e:ui

# Debug mode (pauses at each step)
pnpm exec playwright test --debug

# Headed mode (shows the browser window)
pnpm exec playwright test --headed
```

---

## Test data and teardown

Every test that creates a brand records its ID and deletes it after the test via:

1. **afterEach**: Delete via `page.request.delete('/api/brands/[id]')` — uses the browser session, same auth as the test
2. **afterAll**: `deleteAllBrandsForOrg(orgId)` — direct DB hard-delete as a final safety net

This means:
- The DB is **left clean after every test run** — no orphan rows
- Re-running tests always starts from a known-clean state
- Org and user rows are **preserved between runs** (created once, not deleted) — they're seeded idempotently

The `ensureOrganization()` and `ensureUser()` helpers use upsert semantics — safe to call on every run.

---

## Auth strategy

Uses `@clerk/testing/playwright`:

```bash
pnpm add -D @clerk/testing
```

`clerk.signIn({ page, signInParams })` injects the `__session` cookie directly into the browser context — **no UI interaction with Clerk's hosted sign-in page**. This is the W3-fix approach from Sprint 1 §10: Playwright cannot drive Clerk's iframe/OAuth flow reliably.

---

## Sprint 1 §11 acceptance coverage

| §11 Criterion | Spec file | Test name |
|---|---|---|
| /dashboard renders layout with sidebar | `01-auth` + `07-acceptance` | "dashboard renders app shell" |
| Create brand → fill form → see in list | `03-brand-create` + `07-acceptance` | "fills form and submits" |
| Click brand → detail → edit → save | `04-brand-detail` + `07-acceptance` | "editing brand name and saving" |
| Delete brand → disappears from list | `04-brand-detail` + `07-acceptance` | "confirming delete soft-deletes" |
| Soft-delete: deletedAt set in DB | `04-brand-detail` | "soft-delete sets deletedAt" |
| Second org: brand URL returns 404 | `05-cross-org-isolation` | "User 2 visiting /brands/[id] sees 404" |
| Cross-org DELETE returns 404 | `05-cross-org-isolation` | "User 2 API: DELETE cross-org returns 404" |
| /au/* → x-visibleau-region: au | `06-region` + `07-acceptance` | "region detection" |
| /uk/* → x-visibleau-region: uk | `06-region` + `07-acceptance` | "region detection" |
| UK pricing hides Free tier | `06-region` + `07-acceptance` | "UK pricing hides Free card" |
| AU pricing shows Free tier | `06-region` | "AU pricing shows Free tier" |
| Unauthenticated /dashboard → sign-in | `01-auth` | "unauthenticated visit redirects" |
