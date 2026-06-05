# VisibleAU Sprint 4 — Brands Page Visual Fix
# Comparing screenshot vs visibleau-prototype-v2.59.jsx + Sprint 4 prompt spec
# Source truth: Sprint 4 §8 brand list spec + prototype BrandList component

---

## STATUS — What's correct ✅

- Dark background and card styling ✓
- 3-column grid layout ✓ (Sprint 4 spec: "grid of brand cards, 3 columns desktop")
- Brand name shown ✓
- Domain shown ✓
- Vertical text shown ✓
- Breadcrumbs "Workspace › Brands" ✓
- Sidebar correct ✓

---

## GAPS — 8 fixes needed

| # | Element | Problem | Fix |
|---|---------|---------|-----|
| 1 | Page header | "Brands" h1 missing subtitle | Add brand count + tier subtitle |
| 2 | Page header | "+ Create brand" is wrong label | Should be "New brand" in topbar actions |
| 3 | Brand card | No favicon/avatar | Add BrandFavicon component top-left |
| 4 | Brand card | Vertical is plain text | Should be a styled Badge |
| 5 | Brand card | Region badge missing | Add MapPin + primaryRegions badge |
| 6 | Brand card | Last audit score missing | Show scoreComposite or "Never audited" |
| 7 | Brand card | No hover state | Add bg-hover on mouse enter/leave |
| 8 | Brand card | No chevron / not clickable | Card should be clickable → /brands/[id] |

---

## FIX 1 — Page header subtitle

**Where:** `app/(auth)/brands/page.tsx`  
**Problem:** Just "Brands" h1 with no subtitle  
**Prototype spec:** Brand count + tier below the h1

```tsx
// Below the <h1>Brands</h1> add:
<p style={{ fontSize: 14, marginTop: 4, color: 'var(--text-secondary)' }}>
  {brands.length} of {tierLimit} brands · {capitalize(currentUser.organization.tier)} tier
</p>

// tierLimit by tier:
// free/starter/growth: 1  |  agency: 5  |  agency_pro: 25  |  enterprise: unlimited
const TIER_LIMITS: Record<string, number | string> = {
  free: 1, starter: 1, growth: 1,
  agency: 5, agency_pro: 25, enterprise: 'unlimited',
};
const tierLimit = TIER_LIMITS[currentUser.organization.tier] ?? 1;
```

---

## FIX 2 — "New brand" button in topbar, not page body

**Where:** `app/(auth)/brands/page.tsx` → pass to topbar  
**Problem:** "+ Create brand" button is inside the page content area with wrong label  
**Prototype spec:** "New brand" button is a topbar action (right side, left of Bell)

```tsx
// Remove the "+ Create brand" button from the page body.
// Pass the correct button as the topbar actions prop:

import { Plus } from 'lucide-react';

// Actions for topbar:
const actions = (
  <button
    onClick={() => router.push('/brands/wizard')}
    style={{
      height: 32, padding: '0 12px', borderRadius: 6,
      background: 'var(--accent-primary)',
      color: 'var(--accent-primary-fg)',
      border: 'none', cursor: 'pointer',
      fontSize: 13, fontWeight: 500,
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}
  >
    <Plus style={{ width: 14, height: 14 }} />
    New brand
  </button>
);

// Pass to AppTopbar:
<AppTopbar
  breadcrumbs={['Workspace', 'Brands']}
  actions={actions}
/>
```

---

## FIX 3 — Brand card favicon / avatar

**Where:** `components/domain/brand/brand-card.tsx`  
**Problem:** No brand logo or initials avatar shown in card  
**Sprint 4 BF2 fix spec:** `BrandFavicon` component — tries `favicon.ico`, falls back to initials

```tsx
// Create components/domain/brand/brand-favicon.tsx:
'use client';
import { useState } from 'react';

export function BrandFavicon({ domain }: { domain: string }) {
  const [error, setError] = useState(false);
  const initials = (domain ?? '').split('.')[0].slice(0, 2).toUpperCase() || '??';

  if (!domain || error) {
    return (
      <div style={{
        width: 32, height: 32, borderRadius: 6, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700,
        background: 'var(--accent-blue-soft)',
        color: 'var(--accent-blue)',
      }}>
        {initials}
      </div>
    );
  }

  return (
    <img
      src={`https://${domain}/favicon.ico`}
      alt={`${domain} logo`}
      width={32}
      height={32}
      style={{ borderRadius: 4, flexShrink: 0 }}
      onError={() => setError(true)}
    />
  );
}

// Use in brand-card.tsx — add to top of card content:
import { BrandFavicon } from './brand-favicon';

// Inside card, top row:
<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
  <BrandFavicon domain={brand.domain} />
  <div style={{ minWidth: 0, flex: 1 }}>
    <div style={{
      fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {brand.name}
    </div>
    <div style={{
      fontSize: 11, color: 'var(--text-tertiary)',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {brand.domain}
    </div>
  </div>
</div>
```

---

## FIX 4 — Vertical badge (styled, not plain text)

**Where:** `components/domain/brand/brand-card.tsx`  
**Problem:** "tradies" shown as plain text in white  
**Prototype spec:** Badge component — styled pill with accent-muted bg and text-secondary fg

```tsx
// Replace plain text vertical with a styled badge:

// WRONG (what you have):
<span>tradies</span>

// CORRECT — neutral badge:
<span style={{
  display: 'inline-flex', alignItems: 'center',
  padding: '2px 8px', borderRadius: 9999,
  fontSize: 11, fontWeight: 500,
  background: 'var(--accent-muted)',
  color: 'var(--text-secondary)',
}}>
  {capitalize(brand.vertical.replace('_', ' '))}
  {/* e.g. "tradies" → "Tradies", "allied_health" → "Allied health" */}
</span>

// capitalize helper:
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

---

## FIX 5 — Region badge (MapPin + primaryRegions)

**Where:** `components/domain/brand/brand-card.tsx`  
**Problem:** No region shown on the card  
**Sprint 4 spec:** "region badge" — show first value of `brand.primaryRegions`, or org region fallback

```tsx
// Import: import { MapPin } from 'lucide-react'

// Get the display region:
const regionDisplay = brand.primaryRegions?.[0]
  ?.split(':').pop()   // "NSW:Bondi" → "Bondi"
  ?? 'AU';

// Add below the vertical badge:
<div style={{
  display: 'flex', alignItems: 'center', gap: 4,
  fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6,
}}>
  <MapPin style={{ width: 11, height: 11, flexShrink: 0 }} />
  {regionDisplay}
</div>
```

---

## FIX 6 — Last audit score

**Where:** `components/domain/brand/brand-card.tsx`  
**Problem:** No audit score shown  
**Sprint 4 spec:** Show `lastAuditScore` as a large mono number, or "Never audited" text

```tsx
// This requires the API to return lastAuditScore per brand (Sprint 4 BF1 fix).
// See GET /api/brands lateral subquery spec in the Sprint 4 prompt §6.

// If API already returns lastAuditScore, add to card bottom:
<div style={{
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  marginTop: 12, paddingTop: 12,
  borderTop: '1px solid var(--border-subtle)',
}}>
  {brand.lastAuditScore != null ? (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>
        Visibility score
      </div>
      <div style={{
        fontSize: 20, fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-primary)',
      }}>
        {Number(brand.lastAuditScore).toFixed(1)}
      </div>
    </div>
  ) : (
    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
      Never audited
    </div>
  )}

  {/* Last audit relative time */}
  {brand.lastAuditAt && (
    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
      {formatDistanceToNow(new Date(brand.lastAuditAt), { addSuffix: true })}
      {/* import { formatDistanceToNow } from 'date-fns' */}
    </div>
  )}
</div>
```

---

## FIX 7 + 8 — Hover state + clickable card

**Where:** `components/domain/brand/brand-card.tsx`  
**Problem:** Cards have no hover state and clicking the card doesn't navigate  
**Prototype spec:** `onMouseEnter → bg-hover`, `onMouseLeave → transparent`, click → `/brands/[id]`

```tsx
// Wrap the card content in a button or Link:
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Option A — Link wrapper (preferred for accessibility):
<Link
  href={`/brands/${brand.id}`}
  style={{ textDecoration: 'none', display: 'block' }}
>
  <div
    style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
      borderRadius: 8,
      padding: 20,
      cursor: 'pointer',
      transition: 'background 0.15s ease',
    }}
    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
    onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
  >
    {/* card content here */}
  </div>
</Link>
```

---

## COMPLETE BRAND CARD — reference implementation

```tsx
// components/domain/brand/brand-card.tsx
'use client';
import { MapPin } from 'lucide-react';
import Link from 'next/link';
import { BrandFavicon } from './brand-favicon';
import { formatDistanceToNow } from 'date-fns';

interface BrandCardProps {
  id: string;
  name: string;
  domain: string;
  vertical: string;
  primaryRegions: string[];
  lastAuditScore: number | null;
  lastAuditAt: string | null;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ');
}

export function BrandCard({
  id, name, domain, vertical, primaryRegions,
  lastAuditScore, lastAuditAt,
}: BrandCardProps) {
  const regionDisplay = primaryRegions?.[0]?.split(':').pop() ?? 'AU';

  return (
    <Link href={`/brands/${id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 8, padding: 20, cursor: 'pointer',
          transition: 'background 0.15s ease',
          height: '100%',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
      >
        {/* Top row: favicon + name + domain */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <BrandFavicon domain={domain} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {name}
            </div>
            <div style={{
              fontSize: 11, color: 'var(--text-tertiary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {domain}
            </div>
          </div>
        </div>

        {/* Badges row: vertical + region */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Vertical badge */}
          <span style={{
            padding: '2px 8px', borderRadius: 9999,
            fontSize: 11, fontWeight: 500,
            background: 'var(--accent-muted)', color: 'var(--text-secondary)',
          }}>
            {capitalize(vertical)}
          </span>

          {/* Region badge */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 11, color: 'var(--text-tertiary)',
          }}>
            <MapPin style={{ width: 11, height: 11 }} />
            {regionDisplay}
          </span>
        </div>

        {/* Bottom: score + time */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 16, paddingTop: 14,
          borderTop: '1px solid var(--border-subtle)',
        }}>
          {lastAuditScore != null ? (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 1 }}>
                Visibility score
              </div>
              <div style={{
                fontSize: 22, fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-primary)',
              }}>
                {Number(lastAuditScore).toFixed(1)}
              </div>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              Never audited
            </span>
          )}

          {lastAuditAt && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {formatDistanceToNow(new Date(lastAuditAt), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
```

---

## VERIFY AFTER pnpm dev

- [ ] Page header: "Brands" h1 + "N of X brands · Tier" subtitle
- [ ] "New brand" button: in topbar actions (right side), NOT in page body
- [ ] Each brand card: favicon.ico attempt → initials fallback (blue-soft bg, accent-blue text)
- [ ] Vertical: styled badge (accent-muted bg, text-secondary, pill shape), NOT plain text
- [ ] Region: MapPin icon + suburb name (e.g. "Bondi" not "NSW:Bondi")
- [ ] Score: large mono number (e.g. "63.4") or "Never audited" italic text
- [ ] Last audit time: relative (e.g. "3 hours ago") at bottom-right of card
- [ ] Hover: card background changes to var(--bg-hover) on hover
- [ ] Click: navigates to /brands/[brandId]
- [ ] GET /api/brands returns lastAuditScore + lastAuditAt (lateral subquery)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes

