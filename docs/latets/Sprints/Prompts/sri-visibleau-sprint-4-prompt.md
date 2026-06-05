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
3. `sri-visibleau-foundations.md` v1.12 §2 — folder structure for `app/(auth)/*` routes
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

# BJ1 fix: zod — required for brandFormSchema (BC4). NOT a transitive dep of react-hook-form.
# Without this, every 'import { z } from "zod"' fails at build.
pnpm add zod

# BJ2 fix: sonner — the toast library used in BE3 Portfolio redirect + BI5 Quick actions.
# Sprint 4 §2 said "verify @radix-ui/react-toast present" but BE3 spec used 'import { toast } from "sonner"'.
# Sonner and @radix-ui/react-toast have incompatible APIs — pick one.
# Sprint 4 canonical: use sonner (simpler API, works outside React tree, used by shadcn/ui v2).
pnpm add sonner
# In app/layout.tsx, add: <Toaster /> from 'sonner' inside the body tag.
# Call: toast('Message') or toast.error('Error') from any client component.

# BG1 fix: additional shadcn components needed in Sprint 4 (never listed; imports would fail):
# Region picker (combobox pattern) — Command + Popover + Input:
npx shadcn@latest add command popover
# Export dropdown menu:
npx shadcn@latest add dropdown-menu
# Loading skeletons (brand cards, audit list while fetching):
npx shadcn@latest add skeleton
# Separator (sidebar section dividers):
npx shadcn@latest add separator
```

**BK3 fix — `loading.tsx` files never specified; `<Skeleton>` installed but never placed:**

Next.js 15 App Router uses `loading.tsx` co-located with `page.tsx` as automatic Suspense wrappers. Create these files:

| Route | `loading.tsx` content |
|---|---|
| `app/(auth)/brands/page.tsx` | 3 × brand-card Skeleton (3-col grid, animated) |
| `app/(auth)/audits/page.tsx` | 5 × table-row Skeleton |
| `app/(auth)/dashboard/page.tsx` | 4 × KPI-card Skeleton + 5 × feed-row Skeleton |
| `app/(auth)/portfolio/page.tsx` | 4 × KPI-card Skeleton + 3 × brand-card Skeleton |

Pattern: `export default function Loading() { return <div className="grid grid-cols-3 gap-4">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div> }` — use `animate-pulse` via shadcn Skeleton's default className.

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

### `GET /api/brands` — Sprint 4 extension (BF1+BF5 fix)

Sprint 1 specified `GET /api/brands` returning `Brand[]` (brand metadata only). Sprint 4's brand list card shows "last audit composite score" — requiring a JOIN to `audits`. Without extending the endpoint, the brand list page would need N+1 queries (one `GET /api/audits?brandId=X&limit=1` per brand card).

Sprint 4 extends the response to include `lastAuditScore` and `lastAuditAt` via a Postgres lateral subquery:

```typescript
// Drizzle query pattern for GET /api/brands (Sprint 4 extension):
const brandsWithLatestAudit = await db.execute(sql`
  SELECT
    b.*,
    la.score_composite   AS last_audit_score,
    la.completed_at      AS last_audit_at,
    la.status            AS last_audit_status
  FROM brands b
  LEFT JOIN LATERAL (
    SELECT score_composite, completed_at, status
    FROM audits
    WHERE brand_id = b.id
      AND organization_id = ${currentUser.organizationId}
    ORDER BY created_at DESC
    LIMIT 1
  ) la ON true
  WHERE b.organization_id = ${currentUser.organizationId}
    AND b.deleted_at IS NULL
  ORDER BY b.created_at DESC
`);
```

Response shape per brand:
```typescript
{
  id: string, name: string, domain: string, vertical: string,
  primaryRegions: string[], competitors: string[],
  createdAt: string, updatedAt: string,
  lastAuditScore: string | null,   // scoreComposite from most recent audit
  lastAuditAt: string | null,      // completedAt from most recent audit
  lastAuditStatus: string | null,  // 'pending'|'running'|'complete'|'failed'
}
```

### `POST /api/brands` — create brand

Specified in Sprint 1. Sprint 4 adds: **BJ5 fix — PRD §7 brand limits never enforced.** A Free-tier user could create unlimited brands without this check.

```typescript
// PRD §7 canonical brand limits:
const BRAND_LIMITS: Record<string, number> = {
  free:        1,
  starter:     1,
  growth:      1,
  agency:      5,
  agency_pro:  25,
  enterprise:  Infinity,
};

// In POST /api/brands handler, after auth:
const currentUser = await getCurrentUser();
const [{ count: brandCount }] = await db.select({ count: count() })
  .from(brands)
  .where(and(eq(brands.organizationId, currentUser.organizationId), isNull(brands.deletedAt)));

const limit = BRAND_LIMITS[currentUser.tier] ?? 1;
if (brandCount >= limit) {
  return NextResponse.json(
    { error: `Your ${currentUser.tier} plan supports up to ${limit} brand${limit === 1 ? '' : 's'}. Upgrade to add more.` },
    { status: 403 }
  );
}
// ...proceed with brand creation
```

The brand create page (`/brands/new`) and wizard should also check this client-side on load and show an upgrade prompt rather than letting the user fill out the form only to get a 403 on submit:
```typescript
if (brandCount >= limit) redirect('/settings/billing?reason=brand-limit');
```

The audit list page at `/audits` requires this endpoint. All previous sprints only specified `GET /api/audits/[auditId]` and `GET /api/audits/[auditId]/full`.

- Auth: `getCurrentUser()` + `setRlsContext(db, currentUser.organizationId)` — mandatory
- Query params (see BB3 pagination spec): `?page=1&limit=50&sort=createdAt&order=desc&brandId=X&status=Y`
- Filters: `brandId` (single brand), `status` (`pending|running|complete|failed`), date range (`from`, `to`)
- **BH2 fix — sort param column mapping never specified:** §8 says "sortable by audit number, status, composite score, cost, createdAt" but the API only showed `sort=createdAt`. All 5 valid `sort` values and their DB column mappings:
  ```typescript
  const SORT_COLUMN_MAP: Record<string, string> = {
    auditNumber:    'audit_number',
    status:         'status',
    scoreComposite: 'score_composite',
    totalCostUsd:   'total_cost_usd',
    createdAt:      'created_at',   // default
  };
  // If sort param not in map, fall back to 'created_at'
  const sortCol = SORT_COLUMN_MAP[searchParams.sort ?? 'createdAt'] ?? 'created_at';
  const orderDir = searchParams.order === 'asc' ? 'ASC' : 'DESC';
  ```
- Response:
  ```typescript
  {
    audits: Array<{
      id: string, auditNumber: number, brandId: string, brandName: string,
      status: string, scoreComposite: string | null,
      engines: string[], engineCount: number | null,
      totalCostUsd: string | null, createdAt: string, completedAt: string | null,
    }>,
    total: number, page: number, totalPages: number,
  }
  ```
- Include `brandName` by joining to `brands.name` — the UI needs it to display the brand column without N+1 queries

### `GET /api/audits/[auditId]/export?format=pdf|csv|json`

- Auth + cross-org → 404
- `format=pdf` returns `application/pdf` with `Content-Disposition: attachment; filename="visibleau-audit-{auditNumber}.pdf"`
- `format=csv` returns `text/csv` with flat rows of citations. **BD1 fix — columns never specified:**
  ```
  audit_number,brand_name,engine,prompt,run_number,brand_mentioned,position,sentiment_label,context_label,response_snippet,cited_sources_domains,llm_model,llm_cost_usd,created_at
  ```
  - `cited_sources_domains` = pipe-separated domain list from `citedSources` jsonb (e.g. `"hipages.com.au|bondiplumbing.com.au"`)
  - `response_snippet` = first 200 chars, newlines replaced with space (CSV-safe)
  - Include header row; quote fields containing commas
- `format=json` returns full audit payload as downloadable JSON

Use `@react-pdf/renderer` for PDF. Server-side rendering via `renderToBuffer` (BB2 fix — never specified; the anti-patterns say "server-side" but don't show the API):

```typescript
// app/api/audits/[auditId]/export/route.ts
import { renderToBuffer } from '@react-pdf/renderer';
import { AuditPDFTemplate } from '@/components/domain/audit/audit-pdf-template';

// format=pdf handler:
const pdfBuffer = await renderToBuffer(
  <AuditPDFTemplate audit={audit} citations={citations} />
);
return new Response(pdfBuffer, {
  headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="visibleau-audit-${audit.auditNumber}.pdf"`,
    'Cache-Control': 'no-store',
  },
});
```

**Important:** `@react-pdf/renderer` components live in `components/domain/audit/audit-pdf-template.tsx` — this file uses JSX for PDF primitives (`Document`, `Page`, `View`, `Text`, `StyleSheet` from `@react-pdf/renderer`), NOT shadcn/Tailwind components. Mark it `'use client'` only if needed for dynamic data; the API route itself stays server-side. Sprint 4 ships a single fixed template (VisibleAU brand). Sprint 9 (Agency tier) extends with `pdf_templates` table + `agency_brand_assets` for logo/colors/footer swap per agency org.

---

## 7. Background jobs

No new Inngest functions this sprint.

---

## 8. Frontend — the meat of Sprint 4

### Dashboard layout (`app/(auth)/layout.tsx`)

- Persistent sidebar (300px wide desktop, drawer on mobile via shadcn Sheet)
- Top navbar with workspace switcher (single-workspace v1 — just shows org name), avatar dropdown
- Sidebar groups:
  - **Workspace:** Dashboard, Brands, Audits, **Portfolio** (BB4 fix: Portfolio is a Sprint 4 deliverable at `/portfolio` but was absent from all sidebar groups — users could only reach it via direct URL. Shown conditionally: hide when org has <2 brands, show when ≥2 brands. Or always show with tooltip "Available with 2+ brands" when disabled.)
  - **Insights:** Action Center (Sprint 6 placeholder), Local SEO (Sprint 8 placeholder)
  - **Settings:** Account, Billing (stub at `/settings/billing` — **BH3 fix: content never specified**), Anti-pattern filter (Sprint 6 placeholder)
  - `/settings/billing` Sprint 4 stub renders:
    1. **BK5 fix — billing stub must read `searchParams.reason` for contextual messages.** BJ5 fix redirects to `/settings/billing?reason=brand-limit` when the brand limit is exceeded, but the stub never reads that param:
       ```tsx
       // app/(auth)/settings/billing/page.tsx
       export default function BillingPage({ searchParams }: { searchParams: { reason?: string } }) {
         const reasonMessages: Record<string, string> = {
           'brand-limit': 'You\'ve reached your plan\'s brand limit. Upgrade to track more brands.',
         };
         const message = searchParams.reason ? reasonMessages[searchParams.reason] : null;
         return (
           <PageShell breadcrumbs={['Settings', 'Billing']}>
             {message && <Banner tone="warning">{message}</Banner>}
             {/* ...rest of billing stub */}
           </PageShell>
         );
       }
       ```
    2. Current plan card: plan name (from `currentUser.tier`), billing period "Monthly", next renewal date (stubbed as "—"), price from tier pricing table
    3. Disabled "Upgrade plan" button with tooltip "Billing portal available Sprint 10"
    4. Info banner: "Full billing management — invoice history, plan changes, payment methods — ships with Sprint 10 (Stripe Checkout integration)."
    5. No Stripe elements, no API calls. Pure static display of tier data already in the DB.
- Each sidebar item: lucide-react icon + label + optional count badge

### Dashboard page

- 4 KPI cards (server components, query DB directly) — **BD2 fix: prototype shows 4 cards; spec said 3, omitting "Avg visibility":**
  - **Brands tracked:** `COUNT(*) FROM brands WHERE organizationId=X AND deletedAt IS NULL`
  - **Audits this month:** `COUNT(*) FROM audits WHERE organizationId=X AND createdAt >= startOfMonth(now)`
  - **Avg visibility:** avg of the most recent completed audit's `scoreComposite` per brand (using a `DISTINCT ON (brand_id) ORDER BY brand_id, completed_at DESC` subquery). Renders as e.g. "64.2" with "+8.4 pts vs last month" delta
  - **LLM spend this month:** see BD5 for SQL pattern
  - **BH5 fix — LLM spend sub-text shows `· 12 audits` which must match "Audits this month" count.** All 4 KPIs must be computed in a **single parallel query block** in `dashboard/page.tsx` (the server page component), not in independent `<KpiCard>` server components. Pass the results as props:
    ```typescript
    // dashboard/page.tsx
    const [brandCount, auditCount, avgVisibility, spendData] = await Promise.all([
      getBrandCount(orgId),
      getAuditsThisMonth(orgId, monthStart, monthEnd),
      getAvgVisibility(orgId),
      getLlmSpendThisMonth(orgId, monthStart, monthEnd),
    ]);
    // Pass auditCount into the LLM spend card sub-text:
    const spendSubText = `this month (≈ A$${(spendData.usd * 1.5).toFixed(2)} · ${auditCount} audits)`;
    ```
    If KPI cards were truly independent server components, the audit count would require a second DB round-trip inside the spend card — wasteful and fragile.
- Recent audits feed: last 5 audits across all brands, sorted by `createdAt DESC`. **BI2 fix — fields, endpoint, and click behaviour never specified:**
  - Fields per row: brand name (from JOIN to brands), region badge (first value of `brand.primaryRegions`, or org region), composite score (or "—" if null), status badge, relative time ("2h ago" via `date-fns formatDistanceToNow`).
  - Query directly in `dashboard/page.tsx` server component alongside KPIs (no separate API call needed — same page, same auth context):
    ```typescript
    const recentAudits = await db.select({ id: audits.id, brandName: brands.name, primaryRegions: brands.primaryRegions, scoreComposite: audits.scoreComposite, status: audits.status, createdAt: audits.createdAt })
      .from(audits).innerJoin(brands, eq(audits.brandId, brands.id))
      .where(eq(audits.organizationId, currentUser.organizationId))
      .orderBy(desc(audits.createdAt)).limit(5);
    ```
  - Click behaviour: `status === 'running' || status === 'pending'` → navigate to `/audits/[id]` (running screen); otherwise → `/audits/[id]` (results page). Same URL — the dispatch logic in `[auditId]/page.tsx` handles the difference.
- Quick actions: "New brand" button → `/brands/new`; "Run audit" button — **BI5 fix — tooltip content and enabled click never specified:**
  - Disabled state (0 brands): `disabled` with `title="Add a brand first to run an audit"` tooltip.
  - Enabled state (≥1 brand): clicking "Run audit" navigates to `/brands` with a `?runAudit=true` query param which causes the brand list page to show a brand picker modal (user selects which brand to audit), OR if the org has exactly 1 brand, directly calls `POST /api/audits { brandId: brands[0].id }` and navigates to the new audit's running screen. For Sprint 4 with typically 1 brand, the single-brand shortcut is sufficient.

### Brand list (`/brands`)

- Grid of brand cards (3 columns desktop, 1 column mobile)
- Each card: brand name, domain (link), vertical badge, region badge, last audit composite score (or "Never audited")
- Empty state: "No brands yet" + "Create your first brand" CTA → `/brands/wizard`
- Card click → `/brands/[brandId]`

### Brand create (`/brands/new`)

- Single-page form for users who know what they want
- Fields: name (required), domain (required, hostname validation), vertical (select), primaryRegions (multi-select), competitors (free text array). **BK1 fix — competitors input UX never specified:**
  `competitors-input.tsx` implements a tag-style input: type a name → press **Enter** or **Tab** to add it as a badge chip; click **×** on a badge to remove it. Up to 10 competitors (Zod `max(10)`). The `react-hook-form` field value is a `string[]`. Implementation:
  ```tsx
  // competitors-input.tsx — 'use client'
  function CompetitorsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
    const [input, setInput] = useState('');
    const add = () => {
      const trimmed = input.trim();
      if (trimmed && !value.includes(trimmed) && value.length < 10) {
        onChange([...value, trimmed]);
        setInput('');
      }
    };
    return (
      <div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map(c => (
            <Badge key={c} tone="info">{c}
              <button aria-label={`Remove ${c}`} onClick={() => onChange(value.filter(v => v !== c))}>
                <X className="w-3 h-3 ml-1.5 inline-block" />
              </button>
            </Badge>
          ))}
        </div>
        <Input placeholder="Eastern Plumbing Co" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); add(); } }}
        />
      </div>
    );
  }
  ```
- **BC4 fix — Zod schema never specified; `@hookform/resolvers` requires one:**
  ```typescript
  // lib/schemas/brand.ts
  import { z } from 'zod';

  export const brandFormSchema = z.object({
    name: z.string().min(2, 'Brand name must be at least 2 characters').max(100),
    domain: z.string()
      .min(1, 'Domain is required')
      // Accept "example.com" or "subdomain.example.com.au" — NOT full URLs with https://
      .regex(/^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/, {
        message: 'Enter a domain without http:// (e.g. bondiplumbing.com.au)',
      })
      // BG2 fix: normalise www prefix before storing.
      // 'www.bondiplumbing.com.au' and 'bondiplumbing.com.au' are the same brand.
      // Strip www. so favicon fetches, audit prompts, and deduplication all use the canonical form.
      .transform(d => d.replace(/^www\./i, '')),
    vertical: z.enum(['tradies', 'allied_health', 'saas']),
    primaryRegions: z.array(z.string()).min(1, 'Select at least one region').max(5),
    competitors: z.array(z.string().max(100)).max(10).default([]),
  });

  export type BrandFormValues = z.infer<typeof brandFormSchema>;
  ```
  Wire with: `const form = useForm<BrandFormValues>({ resolver: zodResolver(brandFormSchema) })`
- POST `/api/brands` → on success, **BC3 fix: frontend immediately calls `POST /api/audits { brandId: newBrand.id }` as a second request** (NOT triggered inside `POST /api/brands` — keeps concerns separate and allows the user to cancel before the audit fires if needed). After both calls succeed, redirect to `/audits/[auditId]?brand=[brandId]` so the audit running screen starts polling immediately.

  ```typescript
  // /brands/new page submit handler:
  const brand = await fetch('/api/brands', { method: 'POST', body: JSON.stringify(formData) }).then(r => r.json());
  const audit = await fetch('/api/audits', { method: 'POST', body: JSON.stringify({ brandId: brand.id }) }).then(r => r.json());
  router.push(`/audits/${audit.auditId}`);
  ```

### Brand wizard (`/brands/wizard`) — NEW

- 4-step guided flow with step indicator
- **Step 1:** Brand name + domain + region — with logo/favicon auto-detect + AU region default. `brand-form.tsx` reused here.
  - **BF2 fix — `<favicon src=...>` is not a valid HTML element:** Implement as a standard `<img>` with `onError` fallback:
    ```tsx
    // components/domain/brand/brand-favicon.tsx
    function BrandFavicon({ domain }: { domain: string }) {
      const [error, setError] = useState(false);
      const initials = domain.split('.')[0].slice(0, 2).toUpperCase();
      if (!domain || error) {
        return (
          <div className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold"
               style={{ background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)' }}>
            {initials}
          </div>
        );
      }
      return (
        <img
          src={`https://${domain}/favicon.ico`}
          alt={`${domain} logo`}
          width={32} height={32}
          className="rounded"
          onError={() => setError(true)}
        />
      );
    }
    ```
    Show this component in step 1 once the domain field has a valid hostname value. The `onError` handles 404 favicon (falls back to initials) and CORS errors silently. Note: `next/image` with unoptimised external URLs requires `domains` config — use plain `<img>` here to avoid the config requirement.
- **Step 2:** Choose vertical pack — 3 active v1 pack cards (Tradies 124, Allied Health 104, SaaS 108). v1.1 packs (Professional Services, Real Estate) shown as disabled/locked cards with "Coming v1.1" badge — NOT selectable.
  - **BB1 fix:** `vertical_packs` table does NOT exist until Sprint 5 seeds it. Do NOT query DB — crashes with "relation does not exist". Hardcode the 3 v1 packs as a constant array in the wizard component; add `// TODO Sprint 5: fetch from vertical_packs table` comment.
- **Step 3:** Locations & competitors — primary suburbs (up to 3, autocomplete from `lib/locations/`); optional competitor brand name input (can skip). Combined on one step per prototype UX.
  - **BE1 fix — `lib/locations/` never specified:** Create `lib/locations/index.ts` with a hardcoded list of the most common AU suburbs for v1. Sprint 8 (Local SEO module) expands to a full GNAF-backed dataset. For Sprint 4, seed with ~50 high-population AU suburbs covering the primary metros:

    ```typescript
    // lib/locations/index.ts
    // Format: 'STATE:Suburb Name' matching brands.primaryRegions[] column format.
    // Sprint 8 replaces with DB-backed GNAF suburb table + API autocomplete.
    export const AU_LOCATIONS: { value: string; label: string }[] = [
      // NSW
      { value: 'NSW:Sydney CBD',        label: 'Sydney CBD, NSW' },
      { value: 'NSW:Bondi',             label: 'Bondi, NSW' },
      { value: 'NSW:Parramatta',        label: 'Parramatta, NSW' },
      { value: 'NSW:Chatswood',         label: 'Chatswood, NSW' },
      { value: 'NSW:Newtown',           label: 'Newtown, NSW' },
      { value: 'NSW:North Sydney',      label: 'North Sydney, NSW' },
      { value: 'NSW:Manly',             label: 'Manly, NSW' },
      { value: 'NSW:Surry Hills',       label: 'Surry Hills, NSW' },
      { value: 'NSW:Newcastle',         label: 'Newcastle, NSW' },
      { value: 'NSW:Wollongong',        label: 'Wollongong, NSW' },
      // VIC
      { value: 'VIC:Melbourne CBD',     label: 'Melbourne CBD, VIC' },
      { value: 'VIC:Fitzroy',           label: 'Fitzroy, VIC' },
      { value: 'VIC:Richmond',          label: 'Richmond, VIC' },
      { value: 'VIC:St Kilda',          label: 'St Kilda, VIC' },
      { value: 'VIC:South Yarra',       label: 'South Yarra, VIC' },
      { value: 'VIC:Brunswick',         label: 'Brunswick, VIC' },
      { value: 'VIC:Geelong',           label: 'Geelong, VIC' },
      // QLD
      { value: 'QLD:Brisbane CBD',      label: 'Brisbane CBD, QLD' },
      { value: 'QLD:Fortitude Valley',  label: 'Fortitude Valley, QLD' },
      { value: 'QLD:Gold Coast',        label: 'Gold Coast, QLD' },
      { value: 'QLD:Sunshine Coast',    label: 'Sunshine Coast, QLD' },
      { value: 'QLD:Toowoomba',         label: 'Toowoomba, QLD' },
      // WA
      { value: 'WA:Perth CBD',          label: 'Perth CBD, WA' },
      { value: 'WA:Fremantle',          label: 'Fremantle, WA' },
      { value: 'WA:Subiaco',            label: 'Subiaco, WA' },
      // SA
      { value: 'SA:Adelaide CBD',       label: 'Adelaide CBD, SA' },
      { value: 'SA:Norwood',            label: 'Norwood, SA' },
      // ACT
      { value: 'ACT:Canberra CBD',      label: 'Canberra CBD, ACT' },
    ];

    export function searchLocations(query: string): typeof AU_LOCATIONS {
      const q = query.toLowerCase();
      return AU_LOCATIONS.filter(l => l.label.toLowerCase().includes(q)).slice(0, 10);
    }
    ```

    `region-picker.tsx` imports `searchLocations` and renders a combobox with debounced filtering. Values stored to `brands.primaryRegions[]` as `'NSW:Bondi'` format.
- **Step 4:** Confirm & run first audit — summary card (brand, vertical, locations, estimated first-audit cost; **BA3 fix: cost is tier-aware — Free: ~A$0.30-0.50 (40 calls); Paid: ~A$2.50-3 (200 calls)**. Show the user's actual tier estimate, not a flat A$2.50-3 which is wrong for Free-tier users). Info box explaining engines × prompts × runs based on user's tier; CTA = "Create brand & run first audit".
- "Back" buttons on steps 2-4; "Continue" on 1-3; "Create brand & run first audit" on step 4
- Persists draft in React state (no DB writes until final submit). **BE4 fix — refresh behaviour never specified:** React state is lost on page reload. Sprint 4 behaviour: if user refreshes mid-wizard, they return to step 1 with blank state. Add a `beforeunload` warning if step > 1 and form is non-empty:
  ```typescript
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (step > 1) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [step]);
  ```
  Sprint 9 (Agency tier) persists wizard drafts to `brand_drafts` table for multi-session recovery. For Sprint 4, browser warning is sufficient.
- **First-time signup** (org has 0 brands) redirects to `/brands/wizard` NOT `/dashboard`.
  **BC1 fix — redirect implementation never specified:** The redirect must live in `app/(auth)/dashboard/page.tsx` as a server-side check, NOT in middleware (middleware doesn't have DB access) and NOT in the auth layout (that would redirect away from every auth route including `/brands/wizard` itself):

  ```tsx
  // app/(auth)/dashboard/page.tsx
  import { getCurrentUser } from '@/lib/auth/current-user';
  import { db } from '@/db/client';
  import { brands } from '@/db/schema';
  import { eq, isNull, count } from 'drizzle-orm';
  import { redirect } from 'next/navigation';
  import { setRlsContext } from '@/db/client';

  export default async function DashboardPage() {
    const currentUser = await getCurrentUser();
    if (!currentUser) redirect('/sign-in');
    await setRlsContext(db, currentUser.organizationId);

    const [{ count: brandCount }] = await db
      .select({ count: count() })
      .from(brands)
      .where(eq(brands.organizationId, currentUser.organizationId))
      .where(isNull(brands.deletedAt));

    if (brandCount === 0) redirect('/brands/wizard');

    // ...render real dashboard content
  }
  ```

### Brand detail (`/brands/[brandId]`)

- Brand metadata (**BH4 fix — "editable inline" never specified which fields or how**):
  - Editable fields: `name`, `vertical`, `primaryRegions`, `competitors`. Use the same `brandFormSchema` fields (BC4 fix) rendered in a `react-hook-form` form that submits `PATCH /api/brands/[brandId]`.
  - `domain` is editable but triggers a favicon re-render immediately in the UI. Store stripped (no `www.`) per BG2 transform.
  - `region` is NOT editable (locked at org level per Sprint 1 PATCH spec — "NOT region").
  - UX: inline form always visible (not click-to-edit). "Save changes" button calls `PATCH /api/brands/[brandId]` → returns `200 + { brand }` → update local state with new brand data. Show success toast on save.
- Audit history table: last 20 audits with status, composite score, delta vs prior, Wilson CI as `±X.X`, createdAt.
  **BI3 fix — `±X.X` computation never specified:**
  ```typescript
  // Wilson CI half-width = (scoreConfidenceHigh - scoreConfidenceLow) / 2
  // Displayed as ±4.3 (one decimal place)
  // Null guard: if either bound is null (Sprint 2 audits have no Wilson CI), render '—'
  function ciHalfWidth(audit: Audit): string {
    const lo = audit.scoreConfidenceLow, hi = audit.scoreConfidenceHigh;
    if (!lo || !hi) return '—';
    return `±${((parseFloat(hi) - parseFloat(lo)) / 2).toFixed(1)}`;
  }
  ```
  Example: scoreConfidenceLow=59.1, scoreConfidenceHigh=67.7 → `±4.3`
  ```typescript
  // Sort audits by completedAt DESC (most recent first).
  // Delta for row[i] = row[i].scoreComposite - row[i+1].scoreComposite
  // (i+1 = the chronologically earlier audit in the sorted list)
  // First row (most recent) delta vs second row; last row delta = null (no prior).
  const auditsDesc = audits.sort((a, b) =>
    new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime()
  );
  const withDelta = auditsDesc.map((a, i) => ({
    ...a,
    delta: i < auditsDesc.length - 1 && a.scoreComposite && auditsDesc[i+1].scoreComposite
      ? (parseFloat(a.scoreComposite) - parseFloat(auditsDesc[i+1].scoreComposite)).toFixed(1)
      : null,
  }));
  // Display: "+6.2" in green, "-3.1" in red, "—" if null or either score missing
  ```
- "Run new audit" CTA at top
- "Delete brand" with confirm dialog. **BJ3 fix — dialog content never specified:**
  ```
  Title: "Delete {brand.name}?"
  Body: "This will remove the brand from your workspace. Your audit history is preserved
         and accessible via direct links, but this brand will no longer appear in your
         brand list or portfolio. This action cannot be undone."
  Buttons: [Cancel] [Delete brand] (destructive/red)
  ```
  On confirm: `DELETE /api/brands/[brandId]` → 204 → navigate to `/brands`. The brand row gets `deletedAt = NOW()`; all audit rows for that brand remain in the DB (soft delete means no cascade). Freeing the brand slot means the org's brand count drops — a Free-tier user who deleted their only brand can create a new one.

### Audit running (`/audits/[auditId]` when `status='pending' | 'running'`)

- Polls GET `/api/audits/[auditId]` every 5 seconds. **BI1 fix — stop conditions never specified:**
  ```typescript
  // 'use client' component
  const MAX_NETWORK_ERRORS = 3;
  let networkErrorCount = 0;

  const interval = setInterval(async () => {
    try {
      const res = await fetch(`/api/audits/${auditId}`);
      if (res.status === 401) { clearInterval(interval); router.push('/sign-in'); return; }
      if (res.status === 404) { clearInterval(interval); router.push('/audits'); return; }
      if (!res.ok) { networkErrorCount++; if (networkErrorCount >= MAX_NETWORK_ERRORS) { clearInterval(interval); setError('Poll failed — refresh the page'); } return; }
      networkErrorCount = 0;  // reset on success
      const { audit, citationCount } = await res.json();
      setAuditData({ audit, citationCount });

      // Terminal states — stop polling:
      if (audit.status === 'complete') { clearInterval(interval); router.push(`/audits/${auditId}`); }
      if (audit.status === 'failed')   { clearInterval(interval); /* stay on page, render error card per U6 fix */ }
    } catch (err) {
      networkErrorCount++;
      if (networkErrorCount >= MAX_NETWORK_ERRORS) { clearInterval(interval); setError('Network error — check connection'); }
    }
  }, 5000);

  // Always clear on unmount:
  return () => clearInterval(interval);
  ```
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
- Live metrics: `LLM calls so far: {citationCount} of {expectedCalls}` + `Cost so far: US${audit.totalCostUsd ?? '0.00'} of ~US${budget} budget`
  - `expectedCalls = (audit.engines?.length ?? 2) × 10 × 5` (BA6 fix: `audit.engineCount` is null during `status='running'` because it is only written by the `finalize` step at the end of the job. Using `engineCount` as the denominator would produce `null × 50 = NaN`, breaking the progress bar. Use `audit.engines.length` instead — the `engines` string array IS set at audit creation time and is always non-null.)
  - `budget` = paid tier US$3.00 / Free US$1.50 (derived from `audit.engines.length ≥ 4 ? 3.00 : 1.50`)
- Estimated time: 4-6 minutes (paid), 2-3 minutes (Free)

### Audit results rich (`/audits/[auditId]` when multidimensional)

Sections top to bottom:

1. **Header (templated):** `Audit #{auditNumber} · {engineCount} engines · 10 prompts × 5 runs = {engineCount × 50} LLM calls · ran in Zm Ws · cost US$X.XX (≈A$Y.YY)` — engines/calls/cost driven by schema, NOT hardcoded
2. **Composite score:** big number (e.g., "71/100") + Wilson 95% CI text ("95% CI: 67.8 — 75.0")
3. **5 dimension cards grid:** each with name, score 0-100, weight badge (25%, 25%, 20%, 15%, 15%), CI band on score bar.
   **BG4 fix — CI visual format never specified:** Match prototype exactly:
   - Score bar: full-width track, filled to `score%` in `var(--accent-blue)`, with a **semi-transparent shaded band** from `lower%` to `upper%` in `rgba(37,99,235,0.15)` overlaid on the track to show the CI range.
   - Below each score bar: `95% CI: {lower.toFixed(1)} — {upper.toFixed(1)}` in `var(--text-tertiary)` at `text-[11px]`.
   - Under the composite score header: single line `95% CI: {compositeCI.lower.toFixed(1)} — {compositeCI.upper.toFixed(1)}` in `var(--text-tertiary)`.
   - Wilson CI bounds come from `audit.confidenceIntervals.{dimension}.lower` and `.upper` (0-100 scale, already stored).
4. **Per-engine breakdown:** render `engineCount` cards (paid = 4 cards ChatGPT/Claude/Gemini/Perplexity; Free = 2 cards ChatGPT/Perplexity) showing frequency, avg position, sentiment label, sample mentions. Empty engines (e.g., Claude+Gemini for Free) do NOT render.
5. **Citations feed:** every detected mention with prompt, engine, position, surrounding context
6. **Cited sources:** grouped by domain
7. **Export dropdown:** PDF / CSV / JSON (working) + SARIF / JUnit / GHA (stubbed, "Coming Sprint 8" tooltip)

### Audit results basic (`/audits/[auditId]` when Sprint 2 single-engine)

- Simpler view: prompt list + response + brand mentioned per prompt
- **"Re-run audit" button at top** (BD3 fix: spec said "Refresh audit" — ambiguous. "Refresh" in UI means page reload. The J fix comments in the prototype call this "Re-run — Sprint 4 scope." Sprint 4 ships this as a working Re-run: clicking it calls `POST /api/audits { brandId: audit.brandId }` and redirects to the new audit's running screen. NOT a page reload.)

### LLM spend KPI month filter (BD5 fix — never specified)

All "this month" KPI queries use `date-fns` `startOfMonth` / `addMonths`:

```typescript
import { startOfMonth, addMonths } from 'date-fns';

const now = new Date();
const monthStart = startOfMonth(now);
const monthEnd = addMonths(monthStart, 1);

// Drizzle query:
await db.select({ total: sum(audits.totalCostUsd) })
  .from(audits)
  .where(and(
    eq(audits.organizationId, currentUser.organizationId),
    gte(audits.createdAt, monthStart),
    lt(audits.createdAt, monthEnd),
    eq(audits.status, 'complete'),  // only count completed audits
  ));

// Convert USD → AUD display: multiply by 1.5 (≈ actual rate A$1.56/USD)
const aud = (usdTotal * 1.5).toFixed(2);
```

This pattern applies to Dashboard KPI, Portfolio aggregate KPI, and any future monthly spend reports.

**Prior-month deltas (BF3 fix — "+4 vs last" and "+8.4 pts" require two queries each):**

```typescript
import { startOfMonth, addMonths, subMonths } from 'date-fns';

const now = new Date();
const thisMonthStart = startOfMonth(now);
const thisMonthEnd = addMonths(thisMonthStart, 1);
const lastMonthStart = subMonths(thisMonthStart, 1);
const lastMonthEnd = thisMonthStart;  // exclusive upper bound = start of this month

// Audits this month + last month count:
const [thisMonthCount, lastMonthCount] = await Promise.all([
  db.select({ count: count() }).from(audits).where(and(
    eq(audits.organizationId, currentUser.organizationId),
    gte(audits.createdAt, thisMonthStart), lt(audits.createdAt, thisMonthEnd),
  )),
  db.select({ count: count() }).from(audits).where(and(
    eq(audits.organizationId, currentUser.organizationId),
    gte(audits.createdAt, lastMonthStart), lt(audits.createdAt, lastMonthEnd),
  )),
]);
const delta = thisMonthCount[0].count - lastMonthCount[0].count;
const deltaLabel = delta >= 0 ? `+${delta} vs last` : `${delta} vs last`;

// Avg visibility delta: compute this month's avg and last month's avg, subtract
// (uses DISTINCT ON lateral join per brand, filtered by completed_at in the relevant month)
```

For the Avg visibility delta, compute the avg `scoreComposite` across brands' most recent audits in *this* month vs *last* month. This is an approximation — a brand's most recent audit may have run last month, so the avg could include stale data. Sprint 4 acceptable; Sprint 8 introduces time-bounded visibility snapshots.

### Audit list (`/audits`)

- Table view across all brands in org
- Columns: audit number, brand, status, composite score, cost, createdAt, **technical-audit badge** (BA5 fix: `technical_audits` table does NOT exist until Sprint 7. Do NOT `LEFT JOIN technical_audits` — Postgres will throw "relation does not exist" and crash every audit list load. In Sprint 4, omit this column entirely or render it as always-empty. Add a code comment `// TODO Sprint 7: add tech badge via LEFT JOIN technical_audits ON ta.audit_id = audits.id`. The column header and badge logic ships in Sprint 7 when the table is created.)
- Sortable by audit number, status, composite score, cost, createdAt (default: createdAt DESC)
- Filter by: brand (multi-select), status (multi-select), date range. **BJ4 fix — filter state never specified as URL or React state:**
  Filters MUST be stored in the URL as `searchParams` — not React state. URL-based filters allow bookmarking (`/audits?status=complete&brandId=xxx`), sharing filtered views between teammates, and surviving page refresh.
  - `app/(auth)/audits/page.tsx` is a server component that reads `searchParams` directly:
    ```typescript
    export default async function AuditsPage({ searchParams }: { searchParams: Record<string, string> }) {
      const { page = '1', sort = 'createdAt', order = 'desc', brandId, status } = searchParams;
      // fetch with filters...
    }
    ```
  - Filter UI controls call `router.push('/audits?' + new URLSearchParams({ ...currentFilters, [key]: value }))` on change.
- Pagination 50 per page. **BB3 fix — query params never specified:**
  `GET /api/audits?page=1&limit=50&sort=createdAt&order=desc&brandId=X&status=complete`
  Response shape: `{ audits: AuditRow[], total: number, page: number, totalPages: number }`
  Default: `page=1`, `limit=50`, `sort=createdAt`, `order=desc`. Max `limit=100` (server-enforced).
- Row click → `/audits/[id]`

### Audit compare (`/audits/compare?ids=A,B`)

- Side-by-side 2-audit view
- Dimension comparison with delta indicators (↑ +3.2 / ↓ -1.4)
- Wilson CI overlap detection (highlights stable vs significant differences)
- Used by Sprint 8 drift detection
- **BD4 fix — `?ids=A,B` parsing never specified:**

  ```tsx
  // app/(auth)/audits/compare/page.tsx
  import { notFound, redirect } from 'next/navigation';

  interface Props { searchParams: { ids?: string } }

  export default async function ComparePage({ searchParams }: Props) {
    const currentUser = await getCurrentUser();
    if (!currentUser) redirect('/sign-in');
    await setRlsContext(db, currentUser.organizationId);

    const ids = (searchParams.ids ?? '').split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length !== 2) redirect('/audits');  // malformed URL → back to list

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!ids.every(id => UUID_RE.test(id))) notFound();

    // Fetch both audits — RLS already scoped to current org, cross-org → empty result → 404
    const [auditA, auditB] = await Promise.all(ids.map(id =>
      fetch(`/api/audits/${id}/full`).then(r => r.ok ? r.json() : null)
    ));
    if (!auditA || !auditB) notFound();

    return <AuditCompare auditA={auditA} auditB={auditB} />;
  }
  ```

  The "Compare" link in the audit list and audit detail page appends `?ids=currentId,previousId` to navigate to this page.

### Portfolio overview (`/portfolio`)

- Only accessible when org has ≥2 brands. **BE3 fix — redirect implementation never specified (same gap as BC1 for dashboard):**

  ```tsx
  // app/(auth)/portfolio/page.tsx
  export default async function PortfolioPage() {
    const currentUser = await getCurrentUser();
    if (!currentUser) redirect('/sign-in');
    await setRlsContext(db, currentUser.organizationId);

    const [{ count: brandCount }] = await db
      .select({ count: count() }).from(brands)
      .where(and(eq(brands.organizationId, currentUser.organizationId), isNull(brands.deletedAt)));

    // Redirect with query param; Dashboard page reads ?toast= and shows sonner toast on mount
    if (brandCount < 2) redirect('/dashboard?toast=need-2-brands');
    // ...render portfolio content
  }
  ```

  Dashboard page checks `searchParams.toast === 'need-2-brands'` and calls `toast('Portfolio requires 2+ brands')` in a `useEffect`. This avoids a server-component → client toast coupling problem.
- Grid of brand cards with composite score + delta
- Aggregate KPIs: avg portfolio score, total audits this month, total LLM spend. **BK2 fix — Portfolio KPIs need the same `startOfMonth`/`addMonths` month filter as Dashboard (BD5 fix). Without the filter, KPIs show all-time totals, not this month's.** Use identical `date-fns` pattern from BD5 in `portfolio/page.tsx`. All three KPIs are computed in one `Promise.all` alongside the brand count check (re-use the same `monthStart`/`monthEnd` bounds).

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
   - 8-step progress rendered tier-aware from `audit.engineCount` (BA2 fix: was "4-engine reality" — hardcoded; §8 spec says tier-aware. Free=2 engines/100 calls, paid=4 engines/200 calls)
   - Live LLM call count: use `citationCount` from poll response as `callsCompleted`; `expectedCalls = audit.engines.length × 10 × 5` (NOT `engineCount` which is null during running — see BA6 fix)
   - Live cost from `audit.totalCostUsd` (updates as citations are written)
   - Failed state: per U6 fix — detect `status='failed'` → render error card, not frozen progress
   - 4-6 minute estimate (paid), 2-3 minutes (Free)

5. AUDIT RESULTS
   - Dispatch at /audits/[auditId]: render AuditRunning | AuditResultsBasic | AuditResultsRich
     based on audit.status + audit data (BA4 fix: `audit.metadata.mode` was never defined in Sprints 2 or 3 — no code sets it; dispatch would always fall through to a default):

     ```typescript
     // Dispatch logic (canonical):
     if (audit.status === 'pending' || audit.status === 'running') return <AuditRunning />;
     if (audit.status === 'failed') return <AuditFailedCard />;
     // Completed: Basic = Sprint 2 (1 engine, 1 run); Rich = Sprint 3 (multi-engine, 5 runs)
     const isRich = (audit.runsPerPrompt ?? 1) >= 5 && (audit.engines?.length ?? 1) > 1;
     return isRich ? <AuditResultsRich /> : <AuditResultsBasic />;
     ```
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
   - **BK4 fix — no ARIA guidance; three critical patterns for Sprint 4:**
     - **(a) Region picker combobox:** `<div role="combobox" aria-expanded={open} aria-controls="region-listbox" aria-haspopup="listbox">` on the trigger; `<ul id="region-listbox" role="listbox">` on the dropdown; `role="option" aria-selected={isSelected}` on each item
     - **(b) Sidebar nav active state:** `<a aria-current="page">` on the active sidebar link — screen readers announce "current page" instead of just the link label
     - **(c) Score bars with CI bands:** Score bars are visual-only; add `aria-label="Frequency score: 14 out of 100, 95% CI 9 to 20"` on the bar container so screen readers convey the data without seeing the visual

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

**BE5 fix: previously referenced an external v1.0 acceptance list not included in this prompt. Full self-contained list below:**

- [ ] Dashboard sidebar collapses to drawer on mobile (<768px)
- [ ] 4 KPI cards display correct data: Brands tracked, Audits this month, Avg visibility, LLM spend this month
- [ ] Brand wizard 4-step works (back/next, draft state preserved across steps; beforeunload warning on step >1)
- [ ] First-time signup (org has 0 brands) redirects to /brands/wizard (logic in dashboard/page.tsx server component)
- [ ] Brand wizard step 2 uses hardcoded V1_VERTICAL_PACKS constant (NOT vertical_packs DB query — table not created until Sprint 5)
- [ ] Region picker uses lib/locations/index.ts searchLocations() with AU_LOCATIONS dataset
- [ ] Brand delete soft-deletes (list excludes; DB row has `deletedAt` set)
- [ ] Cross-org access returns 404 on all protected routes (not 401, not blank page)
- [ ] Audit running polls every 5s; expectedCalls = `audit.engines.length × 10 × 5` (not engineCount)
- [ ] Audit dispatch: `runsPerPrompt >= 5 && engines.length > 1` → AuditResultsRich; otherwise → AuditResultsBasic
- [ ] Audit failed state renders error card (not frozen progress) with Retry + Back-to-brand buttons
- [ ] AuditResultsRich shows composite score + 5 dimension cards + Wilson CIs + per-engine breakdown
- [ ] Re-run audit button on AuditResultsBasic calls POST /api/audits and redirects to running screen
- [ ] PDF export downloads as branded PDF (Content-Type: application/pdf, correct filename)
- [ ] CSV export downloads 14-column flat citations file
- [ ] JSON export downloads full audit payload with Content-Disposition: attachment
- [ ] SARIF/JUnit/GHA buttons stubbed with "Coming Sprint 8" tooltip (not hidden, not working)
- [ ] Portfolio requires ≥2 brands; <2 brands redirects to /dashboard?toast=need-2-brands
- [ ] GET /api/audits?page=1 returns paginated list with brandName included
- [ ] Compare page parses ?ids=A,B, validates UUIDs, returns redirect('/audits') on malformed
- [ ] Mobile responsive at <768px: sidebar → drawer, grid → single column

---

## 12. Common pitfalls / Sprint 4 anti-patterns

- **Do not** copy-paste the prototype JSX as-is. The prototype uses fixture data and inline styles for design exploration. Re-implement with real data + shadcn components.
- **Do not** use `'use client'` everywhere. Server components by default; only `'use client'` when interaction (forms, polling, etc.) requires it.
- **Do not** poll faster than 5s on the audit running screen. Inngest takes time; aggressive polling wastes DB queries.
- **Do not** ship the SARIF/JUnit/GHA export buttons without the "Coming Sprint 8" tooltip. The PDF/CSV/JSON ship working; the others are stubbed.
- **Do not** render the PDF client-side. Use `@react-pdf/renderer` server-side via an API route response stream.
- **(BC5a) Do not** query `vertical_packs` table in the brand wizard step 2. This table does not exist until Sprint 5 seeds it. Use the hardcoded `V1_VERTICAL_PACKS` constant instead and add a `// TODO Sprint 5` comment. Querying this table crashes with "relation does not exist" and blocks the entire onboarding flow.
- **(BC5b) Do not** use `audit.engineCount` as the progress bar denominator during the `status='running'` state. `engineCount` is null until the finalize step writes it. Use `audit.engines.length × 10 × 5` instead — the `engines` string array is set at audit creation and is always non-null.
- **(BC5c) Do not** dispatch audit results view based on `audit.metadata.mode`. That field is never set by any audit job. Use `(audit.runsPerPrompt ?? 1) >= 5 && (audit.engines?.length ?? 1) > 1` to distinguish Rich (Sprint 3) from Basic (Sprint 2) audits.
- **(BH1) Do not** import recharts in a server component or forget `'use client'`. recharts uses `ResizeObserver`, `document`, and other browser APIs that don't exist in Node — the page crashes with "ResizeObserver is not defined" at runtime with no TypeScript warning. Every file that imports from recharts must have `'use client'` at the top, OR use Next.js dynamic import with `ssr: false`:
  ```typescript
  // Option A — mark the whole component client:
  'use client';
  import { LineChart, Line, XAxis, YAxis } from 'recharts';

  // Option B — dynamic import (keeps parent as server component):
  import dynamic from 'next/dynamic';
  const SparklineChart = dynamic(() => import('@/components/domain/dashboard/sparkline-chart'), { ssr: false });
  ```
  The §9 Claude Code prompt listed this as a "Potential Blocker" but provided no resolution. Use Option A for dedicated chart components; Option B when a mostly-server page needs one chart widget.

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

- v1.16 (17 May 2026): **Eleventh-pass audit — competitors tag-input, Portfolio month filter, loading.tsx, ARIA patterns, billing reason param (BK1-BK5).** **(BK1)** §8 brand form: competitors tag-input UX now specified — type name + Enter/Tab → badge chip appears; × removes; `onChange(string[])` for react-hook-form; `aria-label` on remove buttons. **(BK2)** §8 portfolio: KPI aggregate queries now cross-reference BD5 month filter — Portfolio "total audits this month" and "total LLM spend" must use `startOfMonth`/`addMonths` bounds, computed in one `Promise.all` alongside brand count. **(BK3)** §2 + §4: `loading.tsx` files now specified for brands, audits, dashboard, portfolio routes — each renders Skeleton layout matching real page structure; Skeleton was installed in BG1 but never placed. **(BK4)** §9 Claude Code accessibility: three critical ARIA patterns specified — (a) region picker combobox roles; (b) `aria-current="page"` on active sidebar link; (c) `aria-label` on score bars with CI data for screen reader access. **(BK5)** §8 billing stub: `searchParams.reason` now read and mapped to contextual message — BJ5 redirects to `?reason=brand-limit` but the stub page never read it; user arrived with no explanation of the redirect.
- v1.15 (17 May 2026): **Tenth-pass audit — missing zod+sonner deps, delete dialog, URL filter state, brand tier limits (BJ1-BJ5).** **(BJ1)** §2: `pnpm add zod` added — BC4 introduced `brandFormSchema` using `z.object()` but zod is not a transitive dep; the import fails at build without an explicit install. **(BJ2)** §2: `pnpm add sonner` added — BE3 used `import { toast } from 'sonner'` in the portfolio redirect handler but sonner was never installed; `@radix-ui/react-toast` (the old shadcn toast) has an incompatible API; Sprint 4 canonically uses sonner. **(BJ3)** §8 BrandDetail: delete confirm dialog content now specified — title "Delete {brand.name}?", body explains audit history is preserved (soft delete), Cancel + destructive Delete button; navigates to /brands on 204. **(BJ4)** §8 audit list: filter state now specified as URL `searchParams` — not React state; URL filters survive refresh, enable bookmark/share; filter changes call `router.push` with `URLSearchParams`. **(BJ5)** §6: brand tier limit guard added to `POST /api/brands` — PRD §7 canonical limits (Free/Starter/Growth=1, Agency=5, Agency Pro=25) enforced; 403 with upgrade message if over limit; brand create page redirects to billing on load if limit reached.
- v1.14 (17 May 2026): **Ninth-pass audit — polling stop conditions, recent feed spec, Wilson CI half-width, dashboard feed score, quick actions (BI1-BI5).** **(BI1)** §8 audit running: polling stop conditions now specified — `setInterval` clears on `complete` (redirect), `failed` (stay, render error card), `404` (redirect to /audits), `401` (redirect to /sign-in); network errors retry up to 3 times before stopping; `clearInterval` always called on component unmount. **(BI2)** §8 dashboard: recent audits feed now fully specified — fields (brandName, primaryRegions, scoreComposite, status, createdAt), DB query pattern in server component alongside KPIs, click behaviour (all → `/audits/[id]`, dispatch handles running vs results). **(BI3)** §8 BrandDetail audit history: `±X.X` Wilson CI format now specified — `(scoreConfidenceHigh - scoreConfidenceLow) / 2`, one decimal, `'—'` null guard for Sprint 2 audits with no CI bounds. **(BI4)** Prototype Dashboard recent feed: Bondi Plumbing score 71.4 → 63.4. **(BI5)** §8 dashboard quick actions: "Run audit" disabled tooltip `"Add a brand first to run an audit"`; enabled click: single brand → directly POST /api/audits + navigate to running screen; multiple brands → navigate to /brands for brand picker.
- v1.13 (17 May 2026): **Eighth-pass audit — recharts client boundary, sort mapping, billing stub, inline edit, KPI shared query (BH1-BH5).** **(BH1)** §12 anti-patterns: recharts `'use client'` requirement added — recharts uses ResizeObserver/document APIs; any file importing recharts without `'use client'` crashes at runtime with no TypeScript warning; both the direct-mark and `dynamic({ ssr: false })` patterns specified. **(BH2)** §6 GET /api/audits: sort param column mapping now specified — 5 valid values (`auditNumber`, `status`, `scoreComposite`, `totalCostUsd`, `createdAt`) with snake_case DB column mapping; unknown sort values fall back to `created_at`. **(BH3)** §8 sidebar: `/settings/billing` stub content now specified — current plan card + disabled "Upgrade" button with tooltip + "Full billing ships Sprint 10" info banner; no Stripe elements. **(BH4)** §8 BrandDetail: inline edit fields now specified — `name`, `vertical`, `primaryRegions`, `competitors`, `domain` editable via PATCH; `region` NOT editable (org-level); inline form always visible (not click-to-edit); `200 + { brand }` response updates local state. **(BH5)** §8 dashboard KPIs: parallel query pattern now specified in `dashboard/page.tsx` — all 4 KPI values computed in one `Promise.all`, `auditCount` passed into LLM spend sub-text to produce `· 12 audits` without a second DB round-trip.
- v1.12 (17 May 2026): **Seventh-pass audit — shadcn deps, domain normalisation, delta computation, CI visual format, SelfServeSetup engines (BG1-BG5).** **(BG1)** §2: added missing shadcn components — `command`, `popover` (region picker combobox), `dropdown-menu` (export button), `skeleton` (loading states), `separator` (sidebar dividers); all used in Sprint 4 UI but absent from install list. **(BG2)** BC4 Zod schema: added `.transform(d => d.replace(/^www\./i, ''))` on domain field — `www.example.com` and `example.com` are the same brand; without normalisation two records represent the same entity. **(BG3)** §8 BrandDetail audit history: delta vs prior computation now specified — `audits sorted DESC by completedAt; delta[i] = scoreComposite[i] - scoreComposite[i+1]`; null for the oldest audit with no prior. **(BG4)** §8 AuditResultsRich §3: Wilson CI visual format now specified — CI band as semi-transparent overlay on score bar (`rgba(37,99,235,0.15)` from `lower%` to `upper%`) + text line `95% CI: X — Y` below each bar + under composite header. **(BG5)** Prototype `SelfServeSetup` step 3: engine list corrected to tier-aware copy.
- v1.11 (17 May 2026): **Sixth-pass audit — GET /api/brands extension, favicon impl, prior-month deltas, brand card score (BF1-BF5).** **(BF1+BF5)** §6: `GET /api/brands` Sprint 4 extension now specified — Sprint 1 returned `Brand[]` without audit data; brand list cards need `lastAuditScore`, `lastAuditAt`, `lastAuditStatus` to avoid N+1 queries. Postgres lateral subquery pattern now specified. **(BF2)** §8 wizard step 1: `<favicon src=...>` is not a valid HTML element; replaced with `<img onError={...}>` + initials fallback pattern; plain `<img>` not `next/image` (avoids `domains` config requirement). **(BF3)** BD5 month filter section: prior-month delta query pattern now specified — `subMonths(startOfMonth(now), 1)` gives last month bounds; two parallel queries per KPI yield the delta for "+4 vs last" and "+8.4 pts" badges. **(BF4)** Prototype `BrandList`: Bondi Plumbing score 71.4 → 63.4; consistent with BrandDetail, AuditResultsRich, AuditCompare corrections.
- v1.10 (17 May 2026): **Fifth-pass audit — lib/locations, acceptance completeness, Portfolio redirect, wizard refresh, self-contained acceptance (BE1-BE5).** **(BE1)** §8 wizard step 3: `lib/locations/index.ts` content now specified — `AU_LOCATIONS` array of 28 `{ value: 'STATE:Suburb', label: 'Suburb, STATE' }` entries covering NSW/VIC/QLD/WA/SA/ACT major metros + `searchLocations(query)` filter function. Sprint 8 replaces with GNAF-backed dataset. Without this file the region picker import crashes at build. **(BE2)** §11 acceptance: "3 KPI cards" corrected to "4 KPI cards" — BD2 added Avg visibility as the 4th card but acceptance was not updated. **(BE3)** §8 portfolio: redirect implementation now specified — `portfolio/page.tsx` server component queries brand count, redirects to `/dashboard?toast=need-2-brands`; dashboard client component reads `searchParams.toast` and shows sonner toast in `useEffect`. **(BE4)** §8 wizard: `beforeunload` warning specified for step >1 to prevent silent data loss on page refresh; Sprint 9 adds DB-backed draft persistence. **(BE5)** §11 acceptance: replaced reference to missing external "v1.0 §10 acceptance list" with full self-contained 21-item checklist incorporating all fixes from passes 1-5.
- v1.9 (17 May 2026): **Fourth-pass audit — CSV columns, 4th KPI card, Re-run button, compare parsing, month filter, export dropdown (BD1-BD6).** **(BD1)** §6 CSV export: 14-column header row now specified — `audit_number,brand_name,engine,prompt,run_number,brand_mentioned,position,sentiment_label,context_label,response_snippet,cited_sources_domains,llm_model,llm_cost_usd,created_at`. **(BD2)** §8 dashboard: 4th KPI card "Avg visibility" added — prototype shows 4 cards; spec said 3, omitting avg composite across most recent audits per brand. DB query pattern specified (DISTINCT ON subquery). **(BD3)** §8 audit results basic: "Refresh audit" renamed to "Re-run audit" — "Refresh" is ambiguous (implies page reload); Sprint 4 ships a working Re-run that calls `POST /api/audits` for the same brand. **(BD4)** §8 audit compare: `?ids=A,B` searchParams parsing now specified — split on comma, UUID validation, parallel fetch of both `/full` payloads, RLS cross-org protection, `redirect('/audits')` on malformed URL. **(BD5)** §8 dashboard + portfolio: LLM spend month filter now specified — `date-fns` `startOfMonth`/`addMonths` pattern for `createdAt` range query; only count `status='complete'` audits; USD → AUD at 1.5×. **(BD6)** Prototype `AuditResultsRich` export button: enabled for PDF/CSV/JSON; SARIF/JUnit/GHA remain stubbed inside the dropdown.
- v1.8 (17 May 2026): **Third-pass audit — redirect implementation, missing list route, auto-trigger, form validation, anti-patterns, BrandDetail score (BC1-BC6).** **(BC1)** §8 wizard + §9 Claude Code: first-time redirect implementation now specified — must live in `dashboard/page.tsx` as a server-component brand count query + `redirect('/brands/wizard')`, NOT middleware (no DB access) or auth layout (would redirect away from `/brands/wizard` itself). **(BC2)** §6: `GET /api/audits` list route now specified — was missing from all sprints; audit list page `/audits` has no endpoint to fetch from without it. Response includes `brandName` from JOIN to avoid N+1 queries. **(BC3)** §8 brand create: auto-trigger mechanism now specified — frontend calls `POST /api/audits { brandId }` as an explicit second request after `POST /api/brands` succeeds, then redirects to `/audits/[auditId]`. Not triggered inside `POST /api/brands`. **(BC4)** §8 brand form: Zod schema now specified — `brandFormSchema` with `domain` regex (`/^([a-z0-9...]\.)+[a-z]{2,}$/`), rejects full URLs with `https://`. **(BC5)** §12 anti-patterns: three new entries — `vertical_packs` crash (BB1), `engineCount` null denominator (BA6), `metadata.mode` undefined dispatch (BA4). **(BC6)** Prototype `BrandDetail`: KPI composite 71.4 → 63.4; sparkline peak 71.4 → 63.4.
- v1.7 (17 May 2026): **Second-pass audit — vertical_packs crash, PDF API, pagination spec, Portfolio sidebar, compare score consistency (BB1-BB6).** **(BB1)** §8 wizard step 2: `vertical_packs` table does not exist until Sprint 5 seeds it; "pulled from DB" removed and replaced with hardcoded constant array + `// TODO Sprint 5` comment — same crash class as `technical_audits` (BA5). **(BB2)** §6 PDF export: `renderToBuffer(<Template />)` → `new Response(buffer)` pattern now specified — anti-pattern said "server-side" but never showed the `@react-pdf/renderer` API call; Claude Code would invent the wrong method. **(BB3)** §8 audit list: pagination query params now specified — `?page=N&limit=50&sort=createdAt&order=desc&brandId=X&status=Y`; response shape `{ audits, total, page, totalPages }`. **(BB4)** §8 dashboard layout sidebar: Portfolio added to Workspace group — it was a Sprint 4 deliverable at `/portfolio` but absent from all sidebar groups; users had no navigation path. **(BB5+BB6)** Prototype `AuditCompare`: scores updated to match corrected AuditResultsRich composite=63.4 (from AA5/X8 fixes); #143 was 73.5 → 63.4; #142 was 68.4 → 57.2; dimension scores updated for consistency.
- v1.6 (16 May 2026): **First-pass audit — Foundations version, tier-aware audit running, dispatch logic, technical_audits crash (BA1-BA7).** **(BA1)** §0: Foundations v1.9 → v1.12. **(BA2)** §9 step 4: "4-engine reality" removed from Claude Code audit running step — §8 spec says tier-aware from `audit.engineCount`; hardcoded text contradicted it. **(BA3)** §8 wizard step 4: "~A$2.50-3" corrected to tier-aware — Free tier costs A$0.30-0.50 (40 calls), not A$2.50-3. **(BA4)** §9 step 5: dispatch based on `audit.metadata.mode` changed to `runsPerPrompt ≥ 5 && engines.length > 1` — `metadata.mode` was never defined in Sprints 2 or 3; dispatch would always use the default path. **(BA5)** §8 audit list: `technical_audits` LEFT JOIN removed — table doesn't exist until Sprint 7; querying it crashes Postgres with "relation does not exist". Badge column deferred to Sprint 7 with TODO comment. **(BA6)** §8 audit running live metrics: `expectedCalls` changed from `audit.engineCount × 50` to `audit.engines.length × 50` — `engineCount` is null during `status='running'` (only set by finalize step), producing NaN for the progress denominator. **(BA7)** Prototype `AuditRunning` cost card updated for Sprint 3 production values.
- v1.5 (15 May 2026): **Seventh-pass audit U6.** AuditRunning spec now explicitly handles `status='failed'`: "Dispatches on audit.status: pending|running → 8-step progress; complete → redirect; **failed → failed state card**." Failed card shows `audit.metadata.error` message, no-charge note, Retry + Back-to-brand CTAs. CLAUDE.md §7 canonical: "Audit job errors persist to `audits.metadata.error` and set `status='failed'`." Without this, a failed audit leaves the user on a frozen progress screen with no recovery path. Prototype AuditRunning updated to show the failed state card as implementation reference.
- v1.4 (15 May 2026): **Fourth-pass audit F5 — wizard step spec aligned to prototype.** The wizard step descriptions were out of sync with the prototype's better UX: Sprint spec had 4 steps (name/domain, vertical, regions, competitors-separately). Prototype has Step 3 combining regions+competitors and Step 4 as a confirm screen. The prototype's flow is adopted as canonical — a confirm step before the irreversible "run first audit" action is better UX. Step 2 description now explicitly says v1.1 verticals are shown as disabled/locked (not selectable). Step 1 retains the favicon/logo auto-detect spec. Acceptance checklist updated accordingly.
- v1.3 (13 May 2026): **Third-pass-fix audit B1+B2.** Audit running screen + audit results rich header + per-engine breakdown made tier-aware (template-driven from `audit.engineCount`, not hardcoded "4 engines / 200 calls"). Free tier audits now render correctly with 2 engines / 100 calls / ~US$1.50 budget. Audit-list table gains a "+ tech" badge column rendered when `technical_audits.audit_id` matches the multidim audit's id — captures the v1.3 design decision from Sprint 7 v2.1.
- v1.2 (12 May 2026): Conflict-resolution fix. PDF export deliverable clarified: Sprint 4 ships basic PDF (fixed VisibleAU template, no theming, no logo swap). White-label PDF (logo + colors swappable per agency) deferred to Sprint 9 Agency tier per PRD §11 and conflict-audit H4.
- v1.1 (12 May 2026): Aligned with new comprehensive sprint prompt template. References existing v1.0 acceptance checklist; otherwise same scope.
- v1.0 (9 May 2026): Initial draft (Round 30).
