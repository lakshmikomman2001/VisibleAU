# VisibleAU Sprint 5 — Frontend E2E Tests (Browser / Playwright)

## What these tests cover

Sprint 5 ships three UI surfaces that require browser-level verification:

1. **Brand wizard step 2** — vertical pack selection replaces the old hardcoded
   `V1_VERTICAL_PACKS` array with live API data. Cards must show real prompt counts,
   selecting a card must set `form.vertical` (CJ1), a PromptPreview component appears
   below the selected card (CJ4), and the confirm screen (step 4) must show the Pack row.

2. **`/verticals` pack browser** — read-only operator view reachable from the sidebar
   (Insights → Vertical packs, CB4). Shows 8 cards: 3 active (Tradies/SaaS/Allied Health)
   + 2 coming-v1.1 + 3 coming-soon. Clicking an active card navigates to the detail page.

3. **`/verticals/[packId]` pack detail** — breadcrumb, header, KPI cards (124 prompts /
   8 sub-verticals / 8 categories), category breakdown table, "Customise prompts" button
   must be disabled with v1.1 badge (CC2 + Sprint 5 §1 F6 read-only requirement).

These are **browser E2E tests using Playwright**. They run against a live Next.js dev
server (`pnpm dev`) and a real Postgres test database. All test data is seeded before each
spec and hard-deleted in `afterEach`/`afterAll` cleanup hooks.

---

## Test IDs and file map

| File | Covers | IDs |
|---|---|---|
| `01-wizard-step2-pack-selection.spec.ts` | Wizard step 2: pack cards from API, selection, vertical set on form, PromptPreview, step 4 Pack row | FE-S5-01 – FE-S5-12 |
| `02-verticals-browser.spec.ts` | `/verticals` page: 8 cards, badges, sidebar link, navigation to detail | FE-S5-13 – FE-S5-22 |
| `03-vertical-pack-detail.spec.ts` | `/verticals/[packId]`: breadcrumb, header counts, KPI cards, category table, disabled Customise button | FE-S5-23 – FE-S5-33 |
| `04-sidebar-verticals-link.spec.ts` | Sidebar Insights group contains "Vertical packs" link → /verticals (CB4) | FE-S5-34 – FE-S5-36 |
| `05-acceptance.spec.ts` | Sprint 5 §12 frontend acceptance checklist: full wizard create brand flow, POST vertical correct, PromptPreview visible | FE-S5-37 – FE-S5-44 |

---

## Test Data Region Strategy

All test organisations and brands use `region='au'`. The production seed packs are at
`region='au'`. Tests that need to navigate to a specific pack detail page resolve the
`packId` from the DB at runtime (not hardcoded) so the UUID never drifts.

Test brands are created via `helpers/db.ts` direct Drizzle INSERT (same service-role
connection as the backend E2E suite). The test org uses dedicated Clerk IDs from
`.env.test.local`. Test brands are hard-deleted in `afterEach` so re-runs are clean.

---

## Playwright auth — Clerk session cookie

Playwright authenticates by injecting Clerk's `__session` cookie. The helper
`helpers/auth.ts` reads the session token from `.env.test.local` and calls
`page.context().addCookies(...)` before navigation. The app's middleware sees a valid
Clerk session and renders the authenticated shell.

**Never hardcode session tokens.** All credentials live in `.env.test.local`.

---

## Prerequisites

```bash
# 1. Sprint 5 complete — migrations applied, seed run:
#    pnpm drizzle-kit migrate
#    pnpm seed
#    Verify: SELECT COUNT(*) FROM vertical_pack_prompts → 336

# 2. App running in mock LLM mode:
#    LLM_MODE=mock MOCK_SCENARIO=happy_path pnpm dev

# 3. Playwright installed:
#    pnpm add -D @playwright/test
#    pnpm exec playwright install --with-deps chromium

# 4. .env.test.local populated (see template below)

# 5. Backend E2E packages present (shared db helpers):
#    pnpm add postgres drizzle-orm
```

---

## .env.test.local

```bash
# App URL
E2E_APP_URL=http://localhost:3000

# Database — USE a TEST project, never production
DATABASE_URL=postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres

# Clerk — test user credentials
E2E_TEST_ORG_1_CLERK_ID=org_...          # Clerk Dashboard → Organizations
E2E_TEST_USER_1_CLERK_ID=user_...        # Clerk Dashboard → Users
E2E_TEST_USER_1_SESSION_TOKEN=eyJhbGc... # Clerk Dashboard → Users → Sessions → JWT
E2E_TEST_USER_1_EMAIL=e2e-s5-fe@visibleau.test
```

> **Session token vs Session ID:**
> The Playwright auth helper injects the raw Clerk JWT (not the session ID `sess_xxx`).
> Obtain it from Clerk Dashboard → Users → click user → Sessions → click session
> → "View JWT". It expires — regenerate if tests start returning 401.

---

## Running the suite

```bash
# Full suite (headless)
pnpm exec playwright test --config tests/e2e/frontend/sprint5/playwright.config.ts

# Single file
pnpm exec playwright test tests/e2e/frontend/sprint5/01-wizard-step2-pack-selection.spec.ts \
  --config tests/e2e/frontend/sprint5/playwright.config.ts

# Headed (see the browser)
pnpm exec playwright test --config tests/e2e/frontend/sprint5/playwright.config.ts --headed

# Debug mode
pnpm exec playwright test --config tests/e2e/frontend/sprint5/playwright.config.ts --debug
```

---

## Schema quick-reference (Sprint 5)

```
vertical_packs:
  id uuid PK, vertical verticalEnum, region regionEnum,
  version text, name text, promptsCount integer,
  publishedAt timestamptz, updatedAt timestamptz, retiredAt timestamptz?

vertical_pack_prompts:
  id uuid PK, packId uuid FK→vertical_packs,
  promptTemplate text, rank integer, category text?

brands:
  id uuid PK, organizationId uuid FK, name text, domain text,
  vertical verticalEnum, region regionEnum,
  competitors text[], primaryRegions text[], deletedAt timestamptz?
```

---

## Test Data Region Strategy table

| Test file | Pack used | How resolved |
|---|---|---|
| 01 wizard | tradies+au (production) | `getProductionPack('tradies')` → UUID |
| 02 browser | all 8 cards (3 prod + 5 hardcoded v1.1/coming-soon) | page assertion only |
| 03 detail | tradies+au (production) | `getProductionPack('tradies')` → navigate to `/verticals/${id}` |
| 04 sidebar | n/a | page navigation only |
| 05 acceptance | tradies+au (production) | test brand created via DB, deleted after |
