# Sprint 4 — First UI Layer

**Sprint:** 4 of 12
**Estimated effort:** 56-72 hours (~7-9 weekends at 8 hrs/week)
**Goal:** Turn the working audit engine into a usable product. 11 prototype screens become real React components fed by Sprint 3's `/api/audits/:id/full` payload.
**Prerequisites:** Sprint 3 complete. Full multi-engine audit working. `GET /api/audits/[auditId]/full` returns rich payload. Tier-aware model selector tested.
**Out of scope:** Vertical pack management UI (Sprint 5), Action Center (Sprint 6), drift detection alerts (Sprint 8), Stripe checkout flow (Sprint 10), pre-launch marketing polish (Sprint 11).

---

## 0. Read first

1. `CLAUDE.md`
2. `visibleau-prototype.jsx` — 44-screen React prototype, Babel-validated. Visual + UX reference. Sprint 4 implements 11 of these screens. The prototype is NOT production code — re-implement with real data.
3. `sri-visibleau-foundations.md` v1.9 §2 — folder structure for `app/(auth)/*` routes
4. `sri-visibleau-sprint-3-frontend-e2e-tests.md` v1.3 — defines the visual + interaction test surface

---

## 1. What ships this sprint

- ✓ Dashboard layout (sidebar + topbar + breadcrumbs) — `app/(auth)/layout.tsx`
- ✓ Dashboard page with 3 KPI cards + Recent audits feed + Quick actions
- ✓ Brand list page (grid of brand cards with vertical + region badges + last audit score)
- ✓ Brand create page (single-page form for power users)
- ✓ Brand setup wizard (4-step guided flow for first-time users; first-time signup redirects here, not dashboard)
- ✓ Brand detail page (metadata + audit history + run audit CTA)
- ✓ Audit running screen (polls `/api/audits/[auditId]` every 5s; 8-step progress UI)
- ✓ Audit results basic page (Sprint 2-mode single-engine audits)
- ✓ Audit results rich page (Sprint 3-mode multidimensional + Wilson CI display)
- ✓ Audit list page (sortable, filterable, paginated)
- ✓ Audit compare page (2 audits side-by-side; foundation for Sprint 8 drift)
- ✓ Portfolio overview page (multi-brand summary; only accessible when org has ≥2 brands)
- ✓ PDF / CSV / JSON export endpoints — **basic PDF (no theming, no logo swap)**. White-label PDF (logo + colors swappable) deferred to Sprint 9 Agency tier per PRD §11. SARIF / JUnit / GHA exports stubbed with "Coming Sprint 8" tooltip; Sprint 8 ships the working versions.
- ✓ Mobile responsive (sidebar → drawer via shadcn Sheet)
- ✓ All routes cross-org → 404 (consistent with Sprint 1 pattern)

**Definition of done:** A user signs up → lands on `/brands/wizard` (4-step) → creates first brand → audit triggers → audit running screen polls until complete → results render with composite score + 5 dimension cards + Wilson CIs + per-engine breakdown + citations feed + cited sources by domain → PDF/CSV/JSON exports download correctly.

---

## 2. Dependencies to install

```bash
# PDF generation
pnpm add @react-pdf/renderer

# Charts (used in dimension tiles + KPI cards)
pnpm add recharts

# Date utilities
pnpm add date-fns

# Form handling
pnpm add react-hook-form @hookform/resolvers

# Toast notifications (shadcn helper, already installed if you ran Sprint 1)
# Verify @radix-ui/react-toast present
```

---

## 3. Environment variables

No new env vars this sprint.

---

## 4. Project structure additions

```
app/(auth)/
├── dashboard/
│   └── page.tsx                          # KPI cards + recent audits + quick actions
├── brands/
│   ├── page.tsx                          # Brand list (enhanced from Sprint 1)
│   ├── new/page.tsx                      # Single-page create form
│   ├── wizard/page.tsx                   # NEW — 4-step setup wizard
│   └── [brandId]/page.tsx                # Brand detail with audit history
├── audits/
│   ├── page.tsx                          # Audit list with sort/filter
│   ├── [auditId]/page.tsx                # Dispatches Basic | Rich | Running based on status + mode
│   └── compare/page.tsx                  # ?ids=A,B side-by-side
└── portfolio/
    └── page.tsx                          # Multi-brand summary (≥2 brands)

app/api/audits/[auditId]/
└── export/route.ts                       # ?format=pdf|csv|json

components/domain/
├── audit/
│   ├── audit-running.tsx                 # 8-step progress with polling
│   ├── audit-results-basic.tsx           # Sprint 2-mode display
│   ├── audit-results-rich.tsx            # Sprint 3-mode multidim display
│   ├── dimension-tile.tsx                # Single dimension card with CI band
│   ├── composite-score.tsx               # Big number + CI text
│   ├── per-engine-card.tsx               # 4 cards (ChatGPT/Claude/Gemini/Perplexity)
│   ├── citations-feed.tsx                # List of all mentions
│   ├── cited-sources.tsx                 # Grouped by domain
│   └── export-dropdown.tsx               # PDF/CSV/JSON dropdown
├── brand/
│   ├── brand-card.tsx                    # Used in list + portfolio
│   ├── brand-form.tsx                    # Used in /new + /wizard step 1
│   ├── vertical-pack-browser.tsx         # 3 cards (Tradies/Allied Health/SaaS)
│   ├── region-picker.tsx                 # Suburb autocomplete
│   └── competitors-input.tsx
├── dashboard/
│   ├── kpi-card.tsx
│   ├── recent-audits-feed.tsx
│   └── quick-actions.tsx
└── shared/
    ├── score-bar.tsx                     # Score + CI band visualization
    └── status-badge.tsx
```

---

## 5. Database schema changes

None. Sprint 4 is read-only on the schema.

---

## 6. API additions

### `GET /api/audits/[auditId]/export?format=pdf|csv|json`

- Auth + cross-org → 404
- `format=pdf` returns `application/pdf` with `Content-Disposition: attachment; filename="visibleau-audit-{auditNumber}.pdf"`
- `format=csv` returns `text/csv` with flat rows of citations
- `format=json` returns full audit payload as downloadable JSON

Use `@react-pdf/renderer` for PDF. Server-side rendering, no PDF library shells. Sprint 4 ships a single fixed template (VisibleAU brand). Sprint 9 (Agency tier) extends with `pdf_templates` table + `agency_brand_assets` for logo/colors/footer swap per agency org.

---

## 7. Background jobs

No new Inngest functions this sprint.

---

## 8. Frontend — the meat of Sprint 4

### Dashboard layout (`app/(auth)/layout.tsx`)

- Persistent sidebar (300px wide desktop, drawer on mobile via shadcn Sheet)
- Top navbar with workspace switcher (single-workspace v1 — just shows org name), avatar dropdown
- Sidebar groups:
  - **Workspace:** Dashboard, Brands, Audits
  - **Insights:** Action Center (Sprint 6 placeholder), Local SEO (Sprint 8 placeholder)
  - **Settings:** Account, Billing (stub linking `/settings/billing`), Anti-pattern filter (Sprint 6 placeholder)
- Each sidebar item: lucide-react icon + label + optional count badge

### Dashboard page

- 3 KPI cards (server components, query DB directly):
  - Active brands count
  - Audits this month count
  - LLM spend this month (sum of `audits.totalCostUsd` × ~1.5 USD→AUD)
- Recent audits feed: last 5 audits across all brands, sorted by `createdAt DESC`
- Quick actions: "New brand" button + "Run audit" (disabled if 0 brands with tooltip)

### Brand list (`/brands`)

- Grid of brand cards (3 columns desktop, 1 column mobile)
- Each card: brand name, domain (link), vertical badge, region badge, last audit composite score (or "Never audited")
- Empty state: "No brands yet" + "Create your first brand" CTA → `/brands/wizard`
- Card click → `/brands/[brandId]`

### Brand create (`/brands/new`)

- Single-page form for users who know what they want
- Fields: name (required), domain (required, hostname validation), vertical (select), primaryRegions (multi-select), competitors (free text array)
- POST `/api/brands` → redirect to `/brands/[newId]` AND auto-trigger first audit

### Brand wizard (`/brands/wizard`) — NEW

- 4-step guided flow with step indicator
- **Step 1:** Brand name + domain + region — with logo/favicon auto-detect (`<favicon src="https://${domain}/favicon.ico">`) + AU region default. `brand-form.tsx` reused here.
- **Step 2:** Choose vertical pack — 3 active v1 pack cards (Tradies 124, Allied Health 104, SaaS 108) pulled from DB. v1.1 packs (Professional Services, Real Estate) shown as disabled/locked cards with "Coming v1.1" badge — NOT selectable. Data-driven from `vertical_packs` table (Sprint 5 seeds).
- **Step 3:** Locations & competitors — primary suburbs (up to 3, autocomplete from `lib/locations/`); optional competitor brand name input (can skip). Combined on one step per prototype UX.
- **Step 4:** Confirm & run first audit — summary card (brand, vertical, locations, estimated first-audit cost ~A$2.50-3); info box explaining engines × prompts × runs based on user's tier; CTA = "Create brand & run first audit".
- "Back" buttons on steps 2-4; "Continue" on 1-3; "Create brand & run first audit" on step 4
- Persists draft in React state (no DB writes until final submit)
- **First-time signup** (org has 0 brands) redirects to `/brands/wizard` NOT `/dashboard`

### Brand detail (`/brands/[brandId]`)

- Brand metadata (editable inline)
- Audit history table: last 20 audits with status, composite score, delta vs prior, Wilson CI as `±X.X`, createdAt
- "Run new audit" CTA at top
- "Delete brand" with confirm dialog

### Audit running (`/audits/[auditId]` when `status='pending' | 'running'`)

- Polls GET `/api/audits/[auditId]` every 5 seconds
- Dispatches on `audit.status`:
  - `pending` | `running` → show 8-step progress UI (see steps below)
  - `complete` → redirect to `/audits/[auditId]` (results page)
  - `failed` → **(U6 fix — seventh-pass audit)** render failed state card: title "Audit failed", `audit.metadata.error` message, "No charge applied", Retry + Back-to-brand buttons. **CLAUDE.md §7 canonical: "Audit job errors persist to `audits.metadata.error` and set `status='failed'`."** Not handling this means a failed audit shows a frozen progress screen with no recovery path.
- 8 step progress UI matching prototype's `AuditRunning` component, with text rendered from `audit.engineCount`:
  1. Loading brand context (complete)
  2. Generating prompts (10 from vertical pack) (complete)
  3. `Querying {audit.engineCount} engines × 5 runs ({callsCompleted}/{audit.engineCount × 10 × 5} LLM calls)` — current. Paid tier renders "4 engines × 5 runs (X/200)"; Free tier renders "2 engines × 5 runs (X/100)".
  4. Detecting brand mentions across engines (pending)
  5. Detecting competitors (pending)
  6. Extracting cited sources (pending)
  7. Calculating multidimensional scores + 95% CIs (pending)
  8. Persisting citations + audit row (pending)
- Live metrics: `LLM calls so far: X of {expectedCalls}` + `Cost so far: US${X.XX} of ~US${budget} budget` where budget = paid tier $3.00 / Free $1.50
- Estimated time: 4-6 minutes (paid), 2-3 minutes (Free)

### Audit results rich (`/audits/[auditId]` when multidimensional)

Sections top to bottom:

1. **Header (templated):** `Audit #{auditNumber} · {engineCount} engines · 10 prompts × 5 runs = {engineCount × 50} LLM calls · ran in Zm Ws · cost US$X.XX (≈A$Y.YY)` — engines/calls/cost driven by schema, NOT hardcoded
2. **Composite score:** big number (e.g., "71/100") + Wilson 95% CI text ("95% CI: 67.8 — 75.0")
3. **5 dimension cards grid:** each with name, score 0-100, weight badge (25%, 25%, 20%, 15%, 15%), CI band on score bar
4. **Per-engine breakdown:** render `engineCount` cards (paid = 4 cards ChatGPT/Claude/Gemini/Perplexity; Free = 2 cards ChatGPT/Perplexity) showing frequency, avg position, sentiment label, sample mentions. Empty engines (e.g., Claude+Gemini for Free) do NOT render.
5. **Citations feed:** every detected mention with prompt, engine, position, surrounding context
6. **Cited sources:** grouped by domain
7. **Export dropdown:** PDF / CSV / JSON (working) + SARIF / JUnit / GHA (stubbed, "Coming Sprint 8" tooltip)

### Audit results basic (`/audits/[auditId]` when Sprint 2 single-engine)

- Simpler view: prompt list + response + brand mentioned per prompt
- "Refresh audit" button at top

### Audit list (`/audits`)

- Table view across all brands in org
- Columns: audit number, brand, status, composite score, cost, createdAt, **technical-audit badge** (rendered when a row in `technical_audits` matches `audit_id` — shows "+ tech ✓" or "+ tech ⏳" pill; absent if no technical audit ran for this audit). The badge becomes interactive in Sprint 7 (links to `/brands/[brandId]/technical-audit?id={technical_audit.id}`); for Sprint 4 it renders inertly as a placeholder.
- Sortable by audit number, status, composite score, cost, createdAt (default: createdAt DESC)
- Filter by: brand (multi-select), status (multi-select), date range
- Pagination 50 per page
- Row click → `/audits/[id]`

### Audit compare (`/audits/compare?ids=A,B`)

- Side-by-side 2-audit view
- Dimension comparison with delta indicators (↑ +3.2 / ↓ -1.4)
- Wilson CI overlap detection (highlights stable vs significant differences)
- Used by Sprint 8 drift detection

### Portfolio overview (`/portfolio`)

- Only accessible when org has ≥2 brands (otherwise redirect to dashboard with toast)
- Grid of brand cards with composite score + delta
- Aggregate KPIs: avg portfolio score, total audits this month, total LLM spend

---

## 9. Claude Code prompt (paste this when starting Sprint 4)

```
We're building VisibleAU Sprint 4: the first UI layer. Sprint 3 ships rich audit
data; Sprint 4 makes it visible to users. Read CLAUDE.md + visibleau-prototype.jsx
(reference only, not production code).

11 screens to implement. Order matters — layout first, then dashboard, then brand
flows, then audit flows.

Sprint 4 deliverables, in order:

1. LAYOUT (foundation for everything)
   - app/(auth)/layout.tsx with sidebar + topbar
   - Sidebar groups per §8: Workspace, Insights, Settings
   - Mobile: drawer via shadcn Sheet
   - Breadcrumbs in main content area

2. DASHBOARD PAGE
   - 3 KPI cards (server components fetching real data)
   - Recent audits feed (last 5)
   - Quick actions
   - Match prototype Dashboard line 870-948

3. BRAND CRUD ENHANCEMENT
   - Brand list at /brands: enhanced from Sprint 1 with grid cards
   - Brand create at /brands/new: enhanced single-page form
   - NEW: Brand wizard at /brands/wizard (4-step flow)
   - Brand detail at /brands/[brandId]: audit history table + run-audit CTA
   - First-time signup (org has 0 brands): redirect /dashboard → /brands/wizard

4. AUDIT RUNNING SCREEN
   - Polls GET /api/audits/[auditId] every 5s
   - 8-step progress matching prototype AuditRunning (4-engine reality)
   - Live LLM call count + cost
   - 4-6 minute estimate

5. AUDIT RESULTS
   - Dispatch at /audits/[auditId]: render AuditRunning | AuditResultsBasic | AuditResultsRich
     based on audit.status + audit.metadata.mode + audit.engines.length
   - AuditResultsRich is the big one — composite + 5 dim cards + per-engine + citations + sources
   - Match prototype AuditResultsRich line 1463-1908

6. EXPORTS
   - app/api/audits/[auditId]/export/route.ts handles format=pdf|csv|json
   - PDF: use @react-pdf/renderer with branded template
   - CSV: flat citations rows
   - JSON: same payload as /full endpoint but Content-Disposition: attachment
   - SARIF / JUnit / GHA: stubbed button + "Coming Sprint 8" tooltip

7. AUDIT LIST + COMPARE
   - /audits with sort/filter/pagination
   - /audits/compare?ids=A,B side-by-side

8. PORTFOLIO
   - /portfolio (≥2 brands required)
   - Aggregate KPIs + brand cards

9. ACCESSIBILITY + RESPONSIVE
   - All forms keyboard-navigable
   - Mobile sidebar → drawer
   - WCAG AA color contrast (use existing prototype tokens: var(--text-primary), var(--accent-blue))

10. TESTS
    - Component tests: render with valid props for each major component
    - Integration: each page checks cross-org → 404
    - E2E per sri-visibleau-sprint-3-frontend-e2e-tests.md v1.3

POTENTIAL BLOCKERS:
- @react-pdf/renderer Next.js 15 compatibility (may need 'use client' wrapper)
- Recharts v3 server-component rendering quirks
- shadcn Sheet keyboard accessibility on mobile

Start with step 1 (layout). After layout renders cleanly, confirm before step 2.
```

---

## 10. Tests required

Per `sri-visibleau-sprint-3-frontend-e2e-tests.md` v1.3:

- ~30 acceptance items spanning: layout/nav, dashboard, brand CRUD, audit results basic + rich, list/compare, portfolio, exports
- Cross-org authorization: every protected route returns 404 on cross-org access
- Mock LLM scenarios drive E2E with deterministic data (`happy_path` for typical assertions; per-engine variance handled via fixture authoring per Round 32 Option A)

---

## 11. Acceptance criteria

Same checklist as `sri-visibleau-sprint-4-prompt.md` v1.0 §10 (existing 30+ item acceptance list). Highlights:

- [ ] Dashboard sidebar collapses to drawer on mobile (<768px)
- [ ] 3 KPI cards display correct data
- [ ] Brand wizard 4-step works (back/next, draft state preserved across steps)
- [ ] First-time signup (org has 0 brands) redirects to /brands/wizard
- [ ] Brand delete soft-deletes (list excludes; DB row has `deletedAt`)
- [ ] Cross-org access returns 404 (not 401, not blank page)
- [ ] Audit running polls every 5s
- [ ] AuditResultsRich shows composite + 5 dim cards + Wilson CIs
- [ ] PDF export downloads as branded PDF
- [ ] CSV export downloads as flat citations CSV
- [ ] Portfolio only accessible with ≥2 brands

---

## 12. Common pitfalls / Sprint 4 anti-patterns

- **Do not** copy-paste the prototype JSX as-is. The prototype uses fixture data and inline styles for design exploration. Re-implement with real data + shadcn components.
- **Do not** use `'use client'` everywhere. Server components by default; only `'use client'` when interaction (forms, polling, etc.) requires it.
- **Do not** poll faster than 5s on the audit running screen. Inngest takes time; aggressive polling wastes DB queries.
- **Do not** ship the SARIF/JUnit/GHA export buttons without the "Coming Sprint 8" tooltip. The PDF/CSV/JSON ship working; the others are stubbed.
- **Do not** render the PDF client-side. Use `@react-pdf/renderer` server-side via an API route response stream.

---

## 13. Handoff to Sprint 5

Ready:
- ✓ Brand wizard step 2 ("Choose vertical pack") shows 3 cards — Sprint 5 makes those cards data-driven from `vertical_packs` table
- ✓ Audit history table shows past audits — Sprint 5 lets you re-run with different vertical pack versions
- ✓ Sidebar "Action Center" placeholder exists — Sprint 6 wires it up

Not ready:
- Vertical pack management UI (Sprint 5)
- Recommendation generation (Sprint 6)

---

## Changelog

- v1.5 (15 May 2026): **Seventh-pass audit U6.** AuditRunning spec now explicitly handles `status='failed'`: "Dispatches on audit.status: pending|running → 8-step progress; complete → redirect; **failed → failed state card**." Failed card shows `audit.metadata.error` message, no-charge note, Retry + Back-to-brand CTAs. CLAUDE.md §7 canonical: "Audit job errors persist to `audits.metadata.error` and set `status='failed'`." Without this, a failed audit leaves the user on a frozen progress screen with no recovery path. Prototype AuditRunning updated to show the failed state card as implementation reference.
- v1.4 (15 May 2026): **Fourth-pass audit F5 — wizard step spec aligned to prototype.** The wizard step descriptions were out of sync with the prototype's better UX: Sprint spec had 4 steps (name/domain, vertical, regions, competitors-separately). Prototype has Step 3 combining regions+competitors and Step 4 as a confirm screen. The prototype's flow is adopted as canonical — a confirm step before the irreversible "run first audit" action is better UX. Step 2 description now explicitly says v1.1 verticals are shown as disabled/locked (not selectable). Step 1 retains the favicon/logo auto-detect spec. Acceptance checklist updated accordingly.
- v1.3 (13 May 2026): **Third-pass-fix audit B1+B2.** Audit running screen + audit results rich header + per-engine breakdown made tier-aware (template-driven from `audit.engineCount`, not hardcoded "4 engines / 200 calls"). Free tier audits now render correctly with 2 engines / 100 calls / ~US$1.50 budget. Audit-list table gains a "+ tech" badge column rendered when `technical_audits.audit_id` matches the multidim audit's id — captures the v1.3 design decision from Sprint 7 v2.1.
- v1.2 (12 May 2026): Conflict-resolution fix. PDF export deliverable clarified: Sprint 4 ships basic PDF (fixed VisibleAU template, no theming, no logo swap). White-label PDF (logo + colors swappable per agency) deferred to Sprint 9 Agency tier per PRD §11 and conflict-audit H4.
- v1.1 (12 May 2026): Aligned with new comprehensive sprint prompt template. References existing v1.0 acceptance checklist; otherwise same scope.
- v1.0 (9 May 2026): Initial draft (Round 30).
