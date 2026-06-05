# VisibleAU Sprint 6 — Frontend E2E Tests (Playwright)

## What these tests cover

Sprint 6 ships the Action Center UI. These Playwright tests exercise the browser
against a **live local app** with **real test data seeded directly into Postgres**
using Drizzle (service-role, bypasses RLS). Every test file cleans up its data in
an `afterAll` teardown — the DB is left identical to how it was found.

| File | What it tests |
|---|---|
| `01-action-center-page.spec.ts` | Navigation, page load, header count, dimension groups render |
| `02-recommendation-cards.spec.ts` | Card shape, confidence badge colours, impact badge, evidence link expand |
| `03-tier-gate.spec.ts` | Free tier blur, upgrade CTA visible, Starter+ sees full content |
| `04-action-detail-page.spec.ts` | Detail navigation, full content, evidence link, breadcrumb |
| `05-mark-done-dismiss.spec.ts` | Mark done flow, dismiss with reason, item disappears from list |
| `06-filters.spec.ts` | Brand filter, dimension filter, filter persists on reload |
| `07-sidebar-navigation.spec.ts` | Sidebar Action Center link active, badge removed |
| `08-cross-org-isolation.spec.ts` | Cross-org /action-center/[id] shows 404 not-found page |
| `09-unauthenticated.spec.ts` | Unauthenticated /action-center redirects to /sign-in |

---

## Prerequisites

```bash
# 1. Sprints 1–5 complete + Sprint 6 migrations applied:
#    pnpm drizzle-kit generate && pnpm drizzle-kit migrate
#    Verify: action_items and recommendation_research tables exist.

# 2. Sprint 6 RLS applied:
#    action_items → ENABLE ROW LEVEL SECURITY + org_isolation policy
#    recommendation_research → DISABLE ROW LEVEL SECURITY

# 3. Sprint 6 research citations seeded:
#    pnpm seed
#    Verify: SELECT COUNT(*) FROM recommendation_research → ≥11

# 4. App running with mock LLM:
#    LLM_MODE=mock MOCK_SCENARIO=happy_path pnpm dev

# 5. Playwright installed:
#    pnpm add -D @playwright/test @clerk/testing
#    pnpm exec playwright install --with-deps chromium

# 6. .env.test.local populated — see template below.

# 7. Two Clerk test-mode users created in Clerk dashboard:
#    User 1: starter tier org (sees full recommendations, can mark done/dismiss)
#    User 2: free tier org (sees blurred content + upgrade CTA)
```

---

## .env.test.local additions for frontend E2E

```bash
# App
E2E_APP_URL=http://localhost:3000

# Database — USE a TEST project, never production
DATABASE_URL=postgresql://postgres.[ref]:[pass]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres

# Clerk — test mode keys
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...

# Test User 1 — Org 1 (starter tier)
E2E_TEST_USER_1_EMAIL=e2e-s6-user-1@visibleau.test
E2E_TEST_USER_1_PASSWORD=S6TestUser1!
E2E_TEST_USER_1_CLERK_ID=user_...
E2E_TEST_ORG_1_CLERK_ID=org_...
E2E_TEST_ORG_1_TIER=starter

# Test User 2 — Org 2 (free tier — for tier gate tests)
E2E_TEST_USER_2_EMAIL=e2e-s6-user-2@visibleau.test
E2E_TEST_USER_2_PASSWORD=S6TestUser2!
E2E_TEST_USER_2_CLERK_ID=user_...
E2E_TEST_ORG_2_CLERK_ID=org_...
E2E_TEST_ORG_2_TIER=free
```

---

## How to run

```bash
# Full suite (headless)
pnpm exec playwright test tests/e2e/frontend/sprint6/ --config tests/e2e/frontend/sprint6/playwright.config.ts

# Single file
pnpm exec playwright test tests/e2e/frontend/sprint6/01-action-center-page.spec.ts \
  --config tests/e2e/frontend/sprint6/playwright.config.ts

# Interactive UI mode (debug)
pnpm exec playwright test --ui --config tests/e2e/frontend/sprint6/playwright.config.ts

# Add to package.json:
# "test:e2e:s6:fe": "playwright test tests/e2e/frontend/sprint6/ --config tests/e2e/frontend/sprint6/playwright.config.ts"
```

---

## Sprint 6 UI facts (for selectors and assertions)

### Routes
```
/action-center              → Action Center list page
/action-center/[id]         → Action Detail page
/sign-in                    → Auth redirect target
```

### Page structure (/action-center)
```
h1 "Action Center"
Header paragraph: "{N} open recommendations across {M} brands"
Filter bar: Brand picker, Dimension filter
Dimension sections: Frequency | Position | Sentiment | Context | Accuracy (rendered only if items exist)
Recommendation cards: title + impact line + confidence badge + citation count + ChevronRight
Tier gate (Free only): blur overlay + "Upgrade to Starter to unlock" button
```

### Recommendation card
```
Badge: "High" | "Medium" | "Low" (expectedImpactScore)
Title: item.title text
Impact line: "High impact — significant visibility lift expected" | "Medium impact..." | "Low impact..."
Citation count: "N citation(s)"
ConfidenceBadge: "Confirmed" (green) | "Likely" (amber) | "Hypothesis" (gray)
ChevronRight icon (navigates to ActionDetail)
```

### ActionDetail page (/action-center/[id])
```
ConfidenceBadge at top
h1: item.title
Subtitle: "{brandName} · {dimension}"
"What to do" section: item.action text (blurred for Free)
EvidenceLink: "View research (N citations)" → expands to source links + summaries
Mark as done / Dismiss buttons (Starter+ only, status open/in_progress only)
```

### Confidence badge colours (spec DG3)
```
confirmed  → tone='success' → green
likely     → tone='warning' → amber/yellow
hypothesis → tone='neutral' → gray
```

### Tier gate behaviour (spec §10)
```
Free:    title visible, action text blurred (filter:blur(4px)), upgrade CTA shows
Starter: full content visible, mark done/dismiss buttons shown
```

### Sidebar
```
Action Center item: href='/action-center', icon=Sparkles, label='Action Center'
Active when: pathname starts with /action-center
No 'Sprint 6' badge (DI2+DI5 fix: placeholder removed)
```

---

## Test data strategy

Each spec file:
1. Seeds orgs/users/brands/audits/action_items directly via Drizzle (service-role)
2. Uses `@clerk/testing/playwright` to sign in as the pre-seeded test user
3. Cleans up ALL seeded rows in `afterAll` via `deleteTestDataForOrg()`

Seeding is via the shared `helpers/db.ts` (same helpers as backend E2E).
The Playwright tests import the helpers using the TypeScript project config.
