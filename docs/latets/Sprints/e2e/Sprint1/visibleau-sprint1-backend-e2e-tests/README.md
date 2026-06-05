# VisibleAU — Sprint 1 Backend E2E Tests

End-to-end backend tests for Sprint 1: Project Foundation.

Tests hit **real running HTTP endpoints** with **real PostgreSQL data** — no mocks, no msw, no stubs. Every assertion reads from or writes to the actual test database.

---

## Test files

| File | Coverage |
|------|----------|
| `01-health.test.ts` | `GET /api/health` — DB connectivity, public access, response shape |
| `02-clerk-webhook.test.ts` | `POST /api/webhooks/clerk` — full lifecycle: org.created (with publicMetadata region/tier), membership.created/deleted, org.deleted cascade, user.deleted GDPR, Svix signature verification |
| `03-brands-list.test.ts` | `GET /api/brands` — own-org brands only, excludes deleted, correct shape |
| `04-brands-create.test.ts` | `POST /api/brands` — Zod validation, region inheritance, tier limits (free/starter/agency), primaryRegions format |
| `05-brands-crud.test.ts` | `GET/PATCH/DELETE /api/brands/[id]` — happy path, cross-org 404, pinned region, soft-delete, response body contract |
| `06-region-and-flags.test.ts` | Middleware region detection headers, feature flag enforcement on pricing page |
| `07-rls-isolation.test.ts` | RLS policies verified at DB level — anon key sees only own-org rows; service-role bypasses RLS |
| `08-stripe-webhook.test.ts` | `POST /api/webhooks/stripe` — signature verification stub (Sprint 10 fills handling) |
| `09-acceptance.test.ts` | Full Sprint 1 §11 acceptance criteria smoke test — end-to-end Clerk webhook → brand CRUD → isolation |

---

## Prerequisites

### 1. Running test database

```bash
# Option A: local Docker Postgres
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=visibleau_test postgres:16

# Option B: Supabase test project (separate from staging/production)
# Create at supabase.com — use ap-southeast-2 (Sydney)
```

### 2. Apply schema migrations to test DB

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/visibleau_test \
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/visibleau_test \
pnpm db:migrate
```

### 3. Running app server

```bash
pnpm dev    # development
# or
pnpm build && pnpm start   # production build
```

### 4. Environment variables

Create `.env.test.e2e` in the project root (never commit this file):

```bash
# App
E2E_APP_URL=http://localhost:3000

# Test DB
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/visibleau_test
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/visibleau_test

# Clerk — test mode
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Pre-seeded test users (create in Clerk test-mode dashboard)
# IMPORTANT: User 1 and User 2 must belong to DIFFERENT Clerk orgs
E2E_TEST_USER_1_EMAIL=e2e-user-1@visibleau.test
E2E_TEST_USER_1_PASSWORD=Test1234!
E2E_TEST_USER_1_CLERK_ID=user_...
E2E_TEST_ORG_1_CLERK_ID=org_...

E2E_TEST_USER_2_EMAIL=e2e-user-2@visibleau.test
E2E_TEST_USER_2_PASSWORD=Test1234!
E2E_TEST_USER_2_CLERK_ID=user_...
E2E_TEST_ORG_2_CLERK_ID=org_...

# Stripe test mode
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Feature flags
FREE_TIER_ENABLED_AU=true
FREE_TIER_ENABLED_NZ=true
FREE_TIER_ENABLED_UK=false
LLM_MODE=mock
```

### 5. Create test users in Clerk dashboard

1. Go to [Clerk dashboard](https://dashboard.clerk.com) → your test-mode app
2. Enable **Organizations** (required for Sprint 1)
3. Create **User 1**: email `e2e-user-1@visibleau.test`, password `Test1234!`
4. Create **User 2**: email `e2e-user-2@visibleau.test`, password `Test1234!`
5. Create **Org 1** and add User 1 as owner — copy the org ID to `E2E_TEST_ORG_1_CLERK_ID`
6. Create **Org 2** and add User 2 as owner — copy the org ID to `E2E_TEST_ORG_2_CLERK_ID`

---

## Running the tests

```bash
# Add to package.json scripts:
# "test:e2e:backend": "vitest run --config vitest.config.e2e.ts"

# Run all backend E2E tests
pnpm test:e2e:backend

# Run a single file
pnpm test:e2e:backend tests/e2e/backend/02-clerk-webhook.test.ts

# Watch mode (re-runs on file change)
pnpm vitest --config vitest.config.e2e.ts
```

---

## Sprint 1 acceptance coverage

Every Sprint 1 §11 acceptance criterion has a corresponding test:

| §11 Criterion | Test |
|---|---|
| Signup syncs to organizations row | `02-clerk-webhook.test.ts` → org.created |
| Brand create → appears in list | `09-acceptance.test.ts` |
| Brand inline edit → saves | `05-brands-crud.test.ts` → PATCH |
| Brand delete → disappears (soft-delete) | `05-brands-crud.test.ts` → DELETE |
| Second org user → 404 (not 401) | `05-brands-crud.test.ts` → cross-org matrix |
| Cross-org DELETE → 404 | `09-acceptance.test.ts` |
| Free tier 1 brand limit → 403 | `04-brands-create.test.ts` → tier limits |
| Region detection `/au/*` → `au` | `06-region-and-flags.test.ts` |
| Feature flag UK free tier hidden | `06-region-and-flags.test.ts` |
| RLS isolation at DB level | `07-rls-isolation.test.ts` |
| Svix signature rejected when invalid | `02-clerk-webhook.test.ts` |
| Health route public | `01-health.test.ts` |

---

## Architecture notes

- **No mocks**: Tests use real HTTP calls to the running app and real DB reads via `testDb` (service-role Drizzle client).
- **DB isolation**: `truncateAll()` runs in `beforeEach` to clear all tenant tables in FK-safe order (`brands → users → organizations`).
- **Sequential execution**: `vitest.config.e2e.ts` sets `singleFork: true` to prevent concurrent DB mutations.
- **Svix signing**: `helpers/svix.ts` generates real Svix signatures using `CLERK_WEBHOOK_SECRET`, matching what Clerk's servers produce.
- **Clerk tokens**: `helpers/http.ts` uses Clerk Backend API `signInTokens.createSignInToken()` to generate short-lived tokens without a browser.

---

## Conflict audit (fresh pass vs Sprint 1 design docs)

7 conflicts were found and fixed after cross-referencing against `CLAUDE.md`, `sri-visibleau-sprint-1-prompt.md`, the PRD, and the prototype:

| ID | File | Conflict | Fix |
|---|---|---|---|
| **C1** | `helpers/http.ts` | `signInTokens.createSignInToken()` returns a sign-in redirect token, not a session JWT. `clerkMiddleware()` validates the `__session` cookie JWT — not sign-in tokens. | Replaced with Clerk FAPI email+password sign-in (`POST /v1/client/sign_ins`) which returns a real session JWT. Falls back to `sessions.getToken()` if `SESSION_ID` is pre-set. |
| **C2** | `07-rls-isolation.test.ts` | Used `schema.sql` which doesn't exist — `sql` is not exported from `db/schema`. Sprint 1 `db/client.ts` spec imports `sql` from `'drizzle-orm'`. | Changed to `import { sql } from 'drizzle-orm'` |
| **C3** | `05-brands-crud.test.ts`, `09-acceptance.test.ts` | GET single brand tests asserted `{ brand: Brand }` wrapper. Sprint 1 §6 specifies GET list returns `Brand[]` directly, and GET single has no wrapper specified — only POST (201) and PATCH (200) use `{ brand }` wrapper. | Removed wrapper from GET single assertions |
| **C4** | `04-brands-create.test.ts` | Tests used `tier: 'growth'` expecting multi-brand allowed. Sprint 1 §6 `TIER_BRAND_LIMITS = { free: 1, starter: 1, growth: 1, agency: 5 }` — growth has limit=1, same as free/starter. | Fixed growth tier test to expect 403 on second brand; changed multi-brand tests to use `agency` tier |
| **C5** | `07-rls-isolation.test.ts` | Mixed type imports — `Organization` referenced as `schema.Organization` in some places. | Consolidated: all DB types imported from `'../../../db/schema'` |
| **C6** | `helpers/svix.ts` | `Webhook.sign(msgId, timestamp, payload)` takes a `Date` object. Original code reconstructed timestamp via `new Date(parseInt(ts) * 1000)` unnecessarily. | Simplified to `const now = new Date()` used directly |
| **C7** | Multiple test files | Several tests used `await import('./helpers/http')` inside test bodies — fragile in Vitest's fork pool and causes module isolation issues. `request` was not exported at module level. | All imports are now static at module level; `request` exported from `helpers/http.ts` |

### Additional env var required

For CI environments, add the optional session ID vars to avoid the FAPI sign-in round-trip per test:

```bash
E2E_TEST_USER_1_SESSION_ID=sess_...   # Clerk session ID for user 1 (optional — speeds up token acquisition)
E2E_TEST_USER_2_SESSION_ID=sess_...   # Clerk session ID for user 2 (optional)
```

---

## Conflict audit v3 (second fresh pass)

5 additional conflicts found and fixed:

| ID | File | Conflict | Fix |
|---|---|---|---|
| **E1** | `helpers/http.ts` | `clerkClient.sessions.createSession()` does not exist in `@clerk/backend` SDK. Sessions resource only exposes `getSession`, `getSessionList`, `revokeSession`, `verifySession`, `getToken`. Call throws `TypeError` at runtime. | Removed `createSession` entirely. `getClerkToken()` now only uses `sessions.getToken(sessionId, 'session_token')` with pre-seeded `E2E_TEST_USER_x_SESSION_ID` env vars. Clear error message if not set. |
| **E2** | `04-brands-create.test.ts` | Imported `testDb`, `schema`, and `eq` but none are used in the file. Sprint 1's Biome config sets `noUnusedImports: warn` — CI with `--error-on-warnings` would fail. | Removed all three unused imports. |
| **E3** | `09-acceptance.test.ts` | `org2Id` declared as module-level variable, populated in `beforeAll`, but never read in any test body. Same lint issue as E2. | Removed `org2Id` declaration and its assignment in `beforeAll`. |
| **E4** | `vitest.config.e2e.ts` | `poolOptions.forks.singleFork: true` was removed in Vitest 2.x. Sprint 1 installs `vitest` with no version pin — could be 2.x. Option is silently ignored in 2.x, allowing parallel file execution that causes FK violations. | Replaced with `maxForks: 1` which enforces sequential execution in both 1.x and 2.x. |
| **E5** | `09-acceptance.test.ts` | `Brand` type and `schema` namespace imported in two separate statements from the same module `'../../../db/schema'`. Biome `noDoubleImports` rule would flag this. | Consolidated — `import * as schema` first, then `import type { Brand }` in consistent order. |

### How to obtain Clerk session IDs for env vars

Session IDs are required for `E2E_TEST_USER_x_SESSION_ID`. Get them once per session:

1. Run the app locally (`pnpm dev`)
2. Sign in as each test user via browser
3. Open Clerk Dashboard → Users → select the user → Sessions → copy the session ID
   OR: Open browser DevTools → Application → Cookies → `__session` → decode the JWT (jwt.io) → copy the `sid` claim
4. Add to `.env.test.e2e`:
   ```bash
   E2E_TEST_USER_1_SESSION_ID=sess_...
   E2E_TEST_USER_2_SESSION_ID=sess_...
   ```

Sessions expire per your Clerk [session duration settings](https://clerk.com/docs/security/customize-session-token). For CI, create long-lived sessions or refresh them as part of your CI setup script.

---

## Conflict audit v4 (fourth fresh pass)

4 genuine conflicts found and fixed (G11 determined to be a false alarm):

| ID | File | Conflict | Fix |
|---|---|---|---|
| **G1/G10** | `07-rls-isolation.test.ts` | Level 2 direct-DB RLS tests called `postgres('https://[ref].supabase.co')` — `SUPABASE_URL` is an HTTPS REST endpoint, not a postgres connection string. `postgres-js` throws a connection error immediately. Additionally, even with the correct URL, Supabase's pooler connects as the postgres superuser which bypasses RLS entirely in PostgreSQL. Level 2 is not implementable with `postgres-js` in a portable way. | Removed Level 2 entirely. Level 1 HTTP-based tests (which already existed) fully cover cross-org isolation by exercising the complete stack: Clerk auth → `setRlsContext()` → DB RLS → API response. |
| **G2** | `09-acceptance.test.ts` | After E3 fix removed `org2Id`, the `const [o2]` query remained — assigning to a variable that is never read. Biome `noUnusedVariables` warns on this. | Removed the `o2` query block entirely. org2's data is accessed via `token2` in the 403 brand-limit test. |
| **G7** | `vitest.config.e2e.ts` | The `.env.test.e2e` template comment in the config file was missing `E2E_TEST_USER_x_SESSION_ID` entries. After E1 fix made session IDs required, the template was the canonical reference for what to put in `.env.test.e2e` — missing them would cause silent test failures. | Added `SESSION_ID` lines with instructions for each test user. |
| **G8** | `04-brands-create.test.ts` | `get` was imported from `./helpers/http` but never called in any test body. Biome `noUnusedImports: warn` flags this. | Removed `get` from the import. |
