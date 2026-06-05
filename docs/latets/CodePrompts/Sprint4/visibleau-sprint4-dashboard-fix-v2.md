# VisibleAU Sprint 4 — Dashboard Visual Fix v2
# 8 remaining gaps after first round of fixes
# Source: visibleau-prototype-v2.59.jsx comparison
# Dark theme, logo, org card, section labels, nav items, welcome header,
# KPI grid, audit feed card wrapper are all CORRECT — do not touch them.

---

## STATUS AFTER ROUND 1

### ✅ Correct — do NOT change
- Dark background (#09090b base, #18181b cards)
- Logo — V-mark square + "visible·au" two-tone wordmark
- Org card — present with avatar, org name, tier/region
- Section labels WORKSPACE / ACCOUNT — uppercase, correct grouping
- Nav items — Overview (active), Brands, View plans with icons
- Welcome header — "Welcome back, Sri." h1 + subtitle
- "All systems normal" badge — green, pulsing dot, top-right
- KPI cards — 4-column grid, icons top-right, values render
- Recent audits — Card wrapper, "View all →" button
- Audit rows — MapPin + region below brand name, ChevronRight
- Bell icon — present, left of ThemeToggle
- ThemeToggle pill — correct

### ❌ Fix these 8 items

---

## FIX 1 — Org card avatar gradient

**Where:** `app-sidebar.tsx` — the org switcher card avatar  
**Problem:** Shows solid purple fill  
**Prototype spec:** `linear-gradient(135deg, #8b5cf6, #ec4899)` purple→pink

```tsx
// Find the org avatar div and change background:
style={{
  background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
  // ... other styles unchanged
}}
```

---

## FIX 2 — User footer avatar gradient + initials

**Where:** `app-sidebar.tsx` — the user footer card at the bottom  
**Problem 1:** Avatar shows plain dark background instead of gradient  
**Problem 2:** Shows "N" (first letter only) instead of two-letter initials  
**Prototype spec:** `linear-gradient(135deg, #f97316, #ec4899)` orange→pink, initials = first letter of first name + first letter of last name

```tsx
// Compute initials from currentUser.name:
const nameParts = (currentUser?.name ?? '').trim().split(/\s+/);
const initials = (
  (nameParts[0]?.[0] ?? '') +
  (nameParts[1]?.[0] ?? '')
).toUpperCase() || '??';

// Avatar div:
<div style={{
  width: 28,
  height: 28,
  borderRadius: '50%',
  flexShrink: 0,
  background: 'linear-gradient(135deg, #f97316, #ec4899)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 600,
  color: '#fff',
}}>
  {initials}
</div>
```

---

## FIX 3 — User footer tier label

**Where:** `app-sidebar.tsx` — under the user name in the footer card  
**Problem:** Hardcoded "Agency tier" regardless of actual user tier  
**Prototype spec:** Read from DB, capitalise first letter, format as "Starter tier · AU"

```tsx
// Read tier from currentUser (passed as prop or from auth context):
const tierLabel =
  (currentUser?.organization?.tier ?? 'free')
    .charAt(0).toUpperCase() +
  (currentUser?.organization?.tier ?? 'free').slice(1);

// Footer sub-text:
<div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
  {tierLabel} tier · AU
</div>

// A new Starter user shows: "Starter tier · AU"
// A free user shows: "Free tier · AU"
// Agency shows: "Agency tier · AU"
```

---

## FIX 4 — Topbar breadcrumbs

**Where:** Topbar component + `app/(auth)/dashboard/page.tsx`  
**Problem:** Left side of topbar is completely empty  
**Prototype spec:** "Workspace › Overview" — breadcrumbs array with ChevronRight separators, last crumb in text-primary font-medium, earlier crumbs in text-tertiary

### Step A — Pass breadcrumbs from dashboard page

```tsx
// In app/(auth)/dashboard/page.tsx:
// Pass breadcrumbs to the layout or topbar via props/context:
// If your layout accepts a breadcrumbs prop, set it there.
// If your topbar is in app/(auth)/layout.tsx, use searchParams or
// a layout-level prop pattern.

// Simplest approach — add to the layout.tsx shell:
// The dashboard page exports metadata that the layout reads.
// OR: pass directly if your layout accepts children props.

// Dashboard page example — if topbar accepts breadcrumbs as a prop:
<AppTopbar breadcrumbs={['Workspace', 'Overview']} />

// Each page sets its own breadcrumbs:
// Brands page:       ['Workspace', 'Brands']
// Brand detail:      ['Workspace', 'Brands', brandName]
// Audit results:     ['Workspace', 'Brands', brandName, 'Audit #N']
```

### Step B — Render breadcrumbs in topbar

```tsx
// In app-topbar.tsx (or wherever the <header> lives):
// Import: import { ChevronRight } from 'lucide-react'
// Import: import { Fragment } from 'react'

// Props: breadcrumbs?: string[]

// Left side of header:
<div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
  {(breadcrumbs ?? []).map((crumb, i) => (
    <Fragment key={i}>
      {i > 0 && (
        <ChevronRight
          style={{ width: 14, height: 14, color: 'var(--text-tertiary)', flexShrink: 0 }}
        />
      )}
      <span style={{
        color: i === breadcrumbs.length - 1
          ? 'var(--text-primary)'
          : 'var(--text-tertiary)',
        fontWeight: i === breadcrumbs.length - 1 ? 500 : 400,
      }}>
        {crumb}
      </span>
    </Fragment>
  ))}
</div>
```

---

## FIX 5 — KPI card values — mono font

**Where:** `dashboard/page.tsx` or `components/domain/dashboard/kpi-card.tsx`  
**Problem:** Numbers (12, 9, —, US$0.00) render in sans-serif  
**Prototype spec:** `fontFamily: 'var(--font-mono)'` on all KPI value elements

```tsx
// Find the value div in each KPI card and add fontFamily:
<div style={{
  fontSize: 24,
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',   // ← ADD THIS
}}>
  {value}
</div>

// Also applies to the sub-text numbers if they contain figures:
// e.g. "≈ A$0.00 · 9 audits" — the whole sub-line can stay sans-serif,
// but if you want pixel-perfect match, wrap just the numbers in:
// <span style={{ fontFamily: 'var(--font-mono)' }}>US$0.00</span>
```

---

## FIX 6 — Audit count badge — wrong colour

**Where:** Recent audits card header  
**Problem:** "5" badge renders with blue/info background  
**Prototype spec:** `tone="neutral"` — accent-muted background, text-tertiary text

```tsx
// Change the badge from info/blue to neutral:

// WRONG (what you have):
<span style={{
  background: 'var(--info-soft)',   // blue
  color: 'var(--info)',
  // ...
}}>5</span>

// CORRECT (prototype tone="neutral"):
<span style={{
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 6px',
  borderRadius: 9999,
  fontSize: 11,
  fontWeight: 500,
  background: 'var(--accent-muted)',    // dark zinc in dark mode
  color: 'var(--text-tertiary)',
}}>
  {totalAuditCount}
</span>
```

---

## FIX 7 — Pending badge — wrong colour

**Where:** Each audit row in the recent audits feed  
**Problem:** "pending" badge shows as dark grey — not clearly styled  
**Prototype spec:** Status badge tone mapping:

```tsx
// Correct tone mapping — apply to every audit status badge:
const badgeTone = {
  complete: {
    background: 'var(--success-soft)',
    color: 'var(--success)',
  },
  running: {
    background: 'var(--info-soft)',
    color: 'var(--info)',
  },
  pending: {
    background: 'var(--accent-muted)',    // neutral — same as count badge
    color: 'var(--text-secondary)',
  },
  failed: {
    background: 'var(--danger-soft)',
    color: 'var(--danger)',
  },
};

// Render:
<span style={{
  padding: '2px 8px',
  borderRadius: 9999,
  fontSize: 11,
  fontWeight: 500,
  ...badgeTone[audit.status] ?? badgeTone.pending,
}}>
  {audit.status}
</span>
```

---

## FIX 8 — "New brand" button placement

**Where:** Currently inside the dashboard page body content  
**Problem:** The button sits in the page content area below the header  
**Prototype spec:** The "New brand" button is in the **topbar actions area** (right side of the header, left of the divider), NOT in the page body

### Step A — Remove button from dashboard page body

```tsx
// In dashboard/page.tsx — remove the standalone "New brand" button
// that appears in the page content. It should not be here.
```

### Step B — Pass button as topbar actions

```tsx
// In dashboard/page.tsx or app/(auth)/layout.tsx:
// Pass the New brand button as the `actions` prop to AppTopbar

// Import: import { Plus } from 'lucide-react'
// Import: import { useRouter } from 'next/navigation'

const router = useRouter();

// Actions element:
const actions = (
  <button
    onClick={() => router.push('/brands/new')}
    style={{
      height: 32,
      padding: '0 12px',
      borderRadius: 6,
      background: 'var(--accent-primary)',
      color: 'var(--accent-primary-fg)',
      border: 'none',
      cursor: 'pointer',
      fontSize: 13,
      fontWeight: 500,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
    }}
  >
    <Plus style={{ width: 14, height: 14 }} />
    New brand
  </button>
);

// Pass to topbar:
<AppTopbar breadcrumbs={['Workspace', 'Overview']} actions={actions} />
```

### Topbar renders actions before the divider:

```tsx
// In app-topbar.tsx right side:
<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
  {actions}                               {/* ← New brand button */}
  <div style={{ width: 1, height: 20, background: 'var(--border-default)', margin: '0 4px' }} />
  {/* Bell icon */}
  {/* ThemeToggle */}
</div>
```

---

## VERIFY AFTER pnpm dev

- [ ] Org card avatar: purple→pink gradient (not solid purple)
- [ ] User footer avatar: orange→pink gradient (not dark/black)
- [ ] User footer initials: two letters e.g. "SK" not single "N"
- [ ] User footer tier: reads from DB e.g. "Starter tier · AU" not "Agency tier"
- [ ] Topbar left: "Workspace › Overview" breadcrumbs with ChevronRight
- [ ] KPI values: mono font (12, 9, —, US$0.00 all in Geist Mono)
- [ ] Audit count badge: zinc/muted background, NOT blue
- [ ] Pending badge: zinc/muted background, NOT dark grey flat
- [ ] "New brand" button: in topbar right side, left of Bell icon divider
- [ ] "New brand" NOT duplicated in the page body
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes

