# VisibleAU Sprint 4 — Frontend E2E Tests (Browser / Playwright)

## What these tests cover

Sprint 4 ships the first UI layer: 11 screens rendered from real DB data.
These tests run a headed Chromium browser via Playwright, authenticate as a real
Clerk test user, seed test data directly into the database before each feature,
and hard-delete all test data in `afterAll`.

| Feature file | Sprint 4 screen | Key assertions |
|---|---|---|
| `F01-layout-nav.spec.ts` | Auth layout — sidebar + topbar + breadcrumbs | Sidebar visible, all nav links present, breadcrumb text |
| `F02-dashboard.spec.ts` | Dashboard — 4 KPI cards + recent feed + quick actions | KPI numbers match seeded data, feed rows, button states |
| `F03-brand-list.spec.ts` | Brand list `/brands` — grid cards with scores | Cards visible, lastAuditScore shown, never-audited empty state |
| `F04-brand-create.spec.ts` | Brand create `/brands/new` — form, validation, submit | Zod validation errors, successful create → running screen |
| `F05-brand-wizard.spec.ts` | Brand wizard `/brands/wizard` — 4-step flow | Step navigation, back/next, vertical cards, confirm + run |
| `F06-brand-detail.spec.ts` | Brand detail `/brands/[id]` — audit history, delete | Score table visible, delete confirm dialog, soft-delete |
| `F07-audit-running.spec.ts` | Audit running screen — polling, progress, failed state | Progress UI visible, failed card with Retry button |
| `F08-audit-results-rich.spec.ts` | AuditResultsRich — composite + 5 dims + Wilson CIs | Score displayed, 5 dimension cards, CI text, export dropdown |
| `F09-audit-results-basic.spec.ts` | AuditResultsBasic — Sprint 2 single-engine view | Score, citations table, Re-run audit button |
| `F10-audit-list.spec.ts` | Audit list `/audits` — table, sort, filter, pagination | Rows visible, brandName column, filter by status |
| `F11-audit-compare.spec.ts` | Audit compare `/audits/compare?ids=A,B` | Side-by-side scores visible, malformed URL redirect |
| `F12-portfolio.spec.ts` | Portfolio `/portfolio` — ≥2 brands required | Redirect with 1 brand, KPI grid with 2+ brands |
| `F13-exports.spec.ts` | Export PDF / CSV / JSON + SARIF stub | Downloads trigger, content-type, Coming Sprint 8 tooltip |
| `F14-mobile-responsive.spec.ts` | Mobile viewport — sidebar → drawer | Drawer opens, nav items accessible, grid collapses |
| `F15-cross-org-404.spec.ts` | Cross-org protection — 404 not 401 | Wrong-org URL returns 404 page |
| `F16-first-time-signup.spec.ts` | First-time signup redirect — 0 brands → /brands/wizard | Dashboard redirects when org has no brands |

---

## Prerequisites

```bash
# 1. Sprint 3 complete. All DB migrations applied (Sprint 4 adds no new schema).
# 2. App running with mock LLM:
#    LLM_MODE=mock MOCK_SCENARIO=happy_path pnpm dev
# 3. Inngest dev server (required for F07 full-flow poll test):
#    npx inngest-cli@latest dev
# 4. .env.test.local populated (see template below).
# 5. Install Playwright and helpers:
#    pnpm add -D @playwright/test
#    pnpm add -D @clerk/backend postgres drizzle-orm
#    npx playwright install chromium
```

---

## .env.test.local

```bash
# App
E2E_APP_URL=http://localhost:3000

# Database — USE a TEST project, never production
DATABASE_URL=postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres

# Clerk (test-mode keys)
CLERK_SECRET_KEY=sk_test_...

# Test User 1 — Org 1 (agency tier: 5 brand slots, 4 engines)
E2E_TEST_USER_1_EMAIL=e2e-s4ui-user1@visibleau.test
E2E_TEST_USER_1_PASSWORD=Test1234!
E2E_TEST_USER_1_CLERK_ID=user_...
E2E_TEST_ORG_1_CLERK_ID=org_...
E2E_TEST_USER_1_SESSION_ID=sess_...  # Clerk Dashboard → Users → Sessions

# Test User 2 — Org 2 (free tier: 1 brand slot, 2 engines)
# Used for cross-org tests only
E2E_TEST_USER_2_EMAIL=e2e-s4ui-user2@visibleau.test
E2E_TEST_USER_2_PASSWORD=Test1234!
E2E_TEST_USER_2_CLERK_ID=user_...
E2E_TEST_ORG_2_CLERK_ID=org_...
E2E_TEST_USER_2_SESSION_ID=sess_...

# LLM
LLM_MODE=mock
MOCK_SCENARIO=happy_path
```

---

## How to run

```bash
# Full suite (all features)
LLM_MODE=mock npx playwright test \
  --config tests/e2e/frontend/sprint4/playwright.config.ts

# Single feature
npx playwright test tests/e2e/frontend/sprint4/specs/F02-dashboard.spec.ts \
  --config tests/e2e/frontend/sprint4/playwright.config.ts

# Headed (see the browser)
npx playwright test --headed \
  --config tests/e2e/frontend/sprint4/playwright.config.ts

# Single feature headed with slowMo for debugging
npx playwright test specs/F05-brand-wizard.spec.ts \
  --headed --project=chromium
```

## package.json scripts to add

```json
{
  "scripts": {
    "test:e2e:ui:sprint4": "LLM_MODE=mock npx playwright test --config tests/e2e/frontend/sprint4/playwright.config.ts",
    "test:e2e:ui:sprint4:headed": "LLM_MODE=mock npx playwright test --headed --config tests/e2e/frontend/sprint4/playwright.config.ts"
  }
}
```

---

## Test data strategy

- **Orgs + users**: seeded idempotently in `beforeAll` — preserved across runs
- **Brands + audits + citations**: seeded fresh in `beforeAll`, hard-deleted in `afterAll`
- All test brand names use prefix `[S4-UI]`, all domains use `*.e2e-s4ui.test`
- `afterAll` always guards with `if (orgId)` to prevent crashes on setup failure
- Tests NEVER share mutable state across features — each spec file is fully self-contained
- Browser auth state is saved in `helpers/auth-state/` and reused across tests (avoids re-login)

---

## Sprint 4 spec facts for assertions

### Audit dispatch (BC5c)
```
isRich = runsPerPrompt >= 5 && engines.length > 1
→ AuditResultsRich (Sprint 3 paid audit)
→ AuditResultsBasic (Sprint 2 single-engine)
```
Do NOT dispatch on `audit.metadata.mode` — never set by any job.

### BRAND_LIMITS (BJ5)
```
free=1  starter=1  growth=1  agency=5  agency_pro=25
```

### CSV 14 columns (BD1)
```
audit_number, brand_name, engine, prompt, run_number, brand_mentioned,
position, sentiment_label, context_label, response_snippet,
cited_sources_domains, llm_model, llm_cost_usd, created_at
```

### Portfolio redirect (BE3)
```
brandCount < 2  →  redirect('/dashboard?toast=need-2-brands')
```

### Polling stop (BI1)
```
status=complete  →  clearInterval + router.push('/audits/[id]')
status=failed    →  clearInterval + render failed card
404              →  clearInterval + router.push('/audits')
```

### Wizard vertical packs (BB1)
```
Step 2 uses hardcoded V1_VERTICAL_PACKS constant.
Do NOT query vertical_packs table (Sprint 5).
```
