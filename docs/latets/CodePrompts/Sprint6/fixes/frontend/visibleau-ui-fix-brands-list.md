# VisibleAU UI Fix — Brands List Page
**Claude Code prompt — drop this file into your session and run it.**

---

## Context

The Brands list page (`app/(auth)/brands/page.tsx`) renders each brand as its own separate card. The prototype specifies a **table layout inside one wrapping Card** with column headers and each brand as a full-width clickable row. This is the Sprint 4 BrandList spec (BF1 fix — lateral subquery for last audit data).

Fix this file: `app/(auth)/brands/page.tsx`

Rewrite the page content completely. Keep your existing auth, `getCurrentUser()`, `setRlsContext()`, and tier-limit logic. Replace only the brands query and the render section.

---

## Step 1 — Replace the brands DB query

The current query returns brands without last-audit data. Replace it with a lateral subquery pattern (BF1 fix) so each brand row includes its last audit score, time, and status without N+1 queries.

```typescript
import { desc, and, eq, isNull, sql } from 'drizzle-orm';
import { formatDistanceToNow } from 'date-fns';

const brandsWithAudit = await db
  .select({
    id: brands.id,
    name: brands.name,
    domain: brands.domain,
    vertical: brands.vertical,
    primaryRegions: brands.primaryRegions,
    // Lateral subquery — one DB round trip for all brands
    lastAuditScore: sql<string | null>`(
      SELECT score_composite::text
      FROM audits
      WHERE brand_id = ${brands.id}
        AND status = 'complete'
        AND deleted_at IS NULL
      ORDER BY completed_at DESC
      LIMIT 1
    )`,
    lastAuditAt: sql<string | null>`(
      SELECT created_at::text
      FROM audits
      WHERE brand_id = ${brands.id}
      ORDER BY created_at DESC
      LIMIT 1
    )`,
    lastAuditStatus: sql<string | null>`(
      SELECT status
      FROM audits
      WHERE brand_id = ${brands.id}
      ORDER BY created_at DESC
      LIMIT 1
    )`,
  })
  .from(brands)
  .where(
    and(
      eq(brands.organizationId, currentUser.organizationId),
      isNull(brands.deletedAt)
    )
  )
  .orderBy(desc(brands.createdAt));
```

---

## Step 2 — Replace the render section

Remove the card-per-brand layout entirely. Render one wrapping `Card` with column headers and table rows.

```tsx
{/* PAGE HEADER */}
<div className="mb-8 flex items-baseline justify-between">
  <div>
    <h1
      className="text-2xl font-semibold tracking-tight"
      style={{ color: 'var(--text-primary)' }}
    >
      Brands
    </h1>
    <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
      {brandsWithAudit.length} of {tierBrandLimit} brands · {currentUser.tier} tier
    </p>
  </div>
</div>

{/* BRANDS TABLE — one Card wrapping all rows */}
<Card>
  {/* Column headers */}
  <div
    className="grid grid-cols-12 px-5 py-3 text-[10px] font-semibold
               uppercase tracking-wider border-b"
    style={{
      color: 'var(--text-tertiary)',
      borderColor: 'var(--border-subtle)',
    }}
  >
    <div className="col-span-4">Brand</div>
    <div className="col-span-2">Vertical</div>
    <div className="col-span-2">Region</div>
    <div className="col-span-2 text-right">Last score</div>
    <div className="col-span-2 text-right">Last audit</div>
  </div>

  {/* Brand rows */}
  {brandsWithAudit.map((brand, i) => {
    // Gradient cycle — matches the prototype pattern (up to 5 gradients)
    const gradients = [
      'linear-gradient(135deg, #f97316, #ea580c)',
      'linear-gradient(135deg, #06b6d4, #0891b2)',
      'linear-gradient(135deg, #8b5cf6, #6366f1)',
      'linear-gradient(135deg, #22c55e, #16a34a)',
      'linear-gradient(135deg, #ec4899, #db2777)',
    ];

    // Status → badge tone
    const statusTone =
      brand.lastAuditStatus === 'complete' ? 'success' :
      brand.lastAuditStatus === 'running'  ? 'info'    :
      brand.lastAuditStatus === 'failed'   ? 'danger'  : 'neutral';

    // Time label — "2h ago" / "Never"
    const timeLabel = brand.lastAuditAt
      ? formatDistanceToNow(new Date(brand.lastAuditAt), { addSuffix: true })
      : 'Never';

    // Region — show first suburb only (e.g. 'NSW:Bondi' → 'Bondi')
    const regionLabel = (brand.primaryRegions as string[])?.[0]
      ?.split(':')[1] ?? '—';

    return (
      <Link
        key={brand.id}
        href={`/brands/${brand.id}`}
        className="w-full grid grid-cols-12 px-5 py-3.5 items-center
                   border-b last:border-b-0 transition-colors
                   hover:bg-[var(--bg-hover)]"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {/* Col 1 — gradient avatar + brand name + domain (4/12) */}
        <div className="col-span-4 flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center
                       text-xs font-semibold shrink-0"
            style={{
              background: gradients[i % gradients.length],
              color: '#fff',
            }}
          >
            {brand.name[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <div
              className="text-sm font-medium truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {brand.name}
            </div>
            <div
              className="text-[11px] truncate"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {brand.domain}
            </div>
          </div>
        </div>

        {/* Col 2 — vertical badge (2/12) */}
        <div className="col-span-2">
          <Badge>{brand.vertical}</Badge>
        </div>

        {/* Col 3 — MapPin + region (2/12) */}
        <div
          className="col-span-2 text-[12.5px] flex items-center gap-1.5"
          style={{ color: 'var(--text-secondary)' }}
        >
          <MapPin className="w-3 h-3" />
          {regionLabel}
        </div>

        {/* Col 4 — last score in mono font (2/12, right-aligned) */}
        <div
          className="col-span-2 text-right text-sm font-semibold"
          style={{
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {brand.lastAuditScore
            ? parseFloat(brand.lastAuditScore).toFixed(1)
            : '—'}
        </div>

        {/* Col 5 — last audit time badge + chevron (2/12, right-aligned) */}
        <div className="col-span-2 flex items-center justify-end gap-2">
          <Badge tone={statusTone}>{timeLabel}</Badge>
          <ChevronRight
            className="w-3.5 h-3.5"
            style={{ color: 'var(--text-tertiary)' }}
          />
        </div>
      </Link>
    );
  })}
</Card>
```

---

## Step 3 — Imports to add

Make sure these are imported at the top of the file:

```typescript
import Link from 'next/link';
import { MapPin, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { desc, and, eq, isNull, sql } from 'drizzle-orm';
import { Card, Badge } from '@/components/ui'; // adjust to your actual import path
```

---

## Acceptance checklist

After implementing, verify each item visually:

- [ ] Brands page renders a single Card with column headers: Brand / Vertical / Region / Last score / Last audit
- [ ] Each brand is a full-width row (not a separate card) with `grid-cols-12` layout
- [ ] Brand column shows: gradient avatar (first letter, white text) + brand name (text-sm font-medium) + domain (text-[11px] --text-tertiary)
- [ ] Vertical column shows a Badge with the vertical name
- [ ] Region column shows MapPin icon + first suburb from primaryRegions
- [ ] Last score column is right-aligned, mono font, 1 decimal place — shows "—" if no audits
- [ ] Last audit column shows a time-distance badge ("2h ago", "Never") + ChevronRight icon
- [ ] Clicking any row navigates to `/brands/[id]`
- [ ] Row hover applies `var(--bg-hover)` background
- [ ] "Never audited" text is removed — replaced by "—" in the Last score column and "Never" badge in Last audit column
