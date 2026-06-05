# VisibleAU Sprint 4 — Dashboard Visual Fix v3
# Comparing screenshot (third iteration) vs prototype
# Reference: visibleau-prototype-v2.59.jsx lines 314–1022

---

## WHAT IS NOW CORRECT ✅ — do NOT change

- Dark background #09090b / cards #18181b ✓
- Logo V-mark + "visible·au" wordmark ✓
- Org card — "VisibleAU Dev" + "Agency · AU" ✓
- Section labels WORKSPACE / ACCOUNT ✓
- Nav items — Overview (active highlight), Brands, View plans ✓
- Breadcrumbs "Workspace › Overview" with ChevronRight ✓
- Welcome header "Welcome back, Sri." + subtitle ✓
- "All systems normal" green badge top-right ✓
- 4 KPI cards — layout, icons, values render ✓
- Recent audits — Card wrapper, rows, MapPin + region, ChevronRight ✓
- Bell icon present ✓
- ThemeToggle pill ✓
- "View all →" button on audit feed header ✓

---

## REMAINING GAPS — 6 fixes

---

## FIX 1 — "New brand" button style: should be PRIMARY not secondary

**Where:** Topbar actions (right side of header)
**Problem:** Button shows as secondary style — white border, dark text on dark bg
**Prototype spec:** `variant="primary"` = `background: var(--accent-primary)` (white in dark
mode) with `color: var(--accent-primary-fg)` (near-black). High-contrast white pill.

```tsx
// Topbar actions button — match prototype Btn variant="primary":
<button
  onClick={() => router.push('/brands/new')}
  style={{
    height: 32,
    padding: '0 12px',
    borderRadius: 6,
    background: 'var(--accent-primary)',       // white in dark mode
    color: 'var(--accent-primary-fg)',         // near-black in dark mode
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

// If using a Btn component:
<Btn icon={Plus} onClick={() => router.push('/brands/new')}>New brand</Btn>
// variant defaults to 'primary' — correct
```

---

## FIX 2 — Org card avatar: wrong gradient

**Where:** Sidebar org switcher card (below logo header)
**Problem:** Shows solid purple square — no gradient
**Prototype spec:** `linear-gradient(135deg, #8b5cf6, #ec4899)` — purple LEFT to pink RIGHT

```tsx
// Find the org avatar div and set:
style={{
  background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
  // ... other styles unchanged (w-6 h-6 rounded text-[10px] font-bold color:#fff)
}}
```

---

## FIX 3 — User footer avatar: wrong gradient + wrong initials

**Where:** Sidebar user footer card (bottom)
**Problem:** Shows "N" on plain dark background — should be two-letter initials on orange→pink gradient
**Prototype spec:** `linear-gradient(135deg, #f97316, #ec4899)` + initials from first+last name

```tsx
// Compute two-letter initials from currentUser.name:
const nameParts = (currentUser?.name ?? '').trim().split(/\s+/);
const initials = (
  (nameParts[0]?.[0] ?? '') +
  (nameParts[1]?.[0] ?? '')
).toUpperCase() || '??';
// "Sri" alone → "SR" (both from first name if no surname)
// "Sri Komman" → "SK"

// Avatar div:
<div style={{
  width: 28,
  height: 28,
  borderRadius: '50%',
  flexShrink: 0,
  background: 'linear-gradient(135deg, #f97316, #ec4899)',  // orange→pink
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

## FIX 4 — User footer tier label: hardcoded "Agency tier"

**Where:** Sidebar user footer — subtitle under user name
**Problem:** Shows "Agency tier · AU" regardless of actual DB tier
**Prototype spec:** Read from `currentUser.organization.tier`, capitalise first letter

```tsx
// Derive tier label from DB value:
const tier = currentUser?.organization?.tier ?? 'free';
const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

// Render:
<div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
  {tierLabel} tier · AU
</div>

// Examples:
// tier="starter"  → "Starter tier · AU"
// tier="agency"   → "Agency tier · AU"
// tier="free"     → "Free tier · AU"
```

---

## FIX 5 — KPI values not in mono font

**Where:** All 4 KPI cards — the large number value
**Problem:** Numbers "12", "9", "—", "US$0.00" render in sans-serif
**Prototype spec:** `fontFamily: 'var(--font-mono)'` on every KPI value element

```tsx
// In kpi-card.tsx (or wherever KPI values are rendered):
// Find the value <div> and add fontFamily:

<div style={{
  fontSize: 24,
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',   // ← THIS LINE — Geist Mono
}}>
  {value}
</div>

// All 4 cards need this: Brands tracked, Audits this month,
// Avg visibility, LLM spend
```

---

## FIX 6 — Audit feed badges: wrong colours

**Where:** Recent audits feed — status badges and count badge

### 6a — Count badge: blue → neutral

```
Problem: "5" count badge next to "Recent audits" is blue (info tone)
Prototype: Badge tone="neutral" = var(--accent-muted) bg + var(--text-secondary) fg
```

```tsx
// Change the count badge:
<span style={{
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 6px',
  borderRadius: 9999,
  fontSize: 11,
  fontWeight: 500,
  background: 'var(--accent-muted)',     // dark zinc — NOT info-soft blue
  color: 'var(--text-tertiary)',
}}>
  {totalAuditCount}
</span>
```

### 6b — Status badge tone mapping

```
Problem: "pending" badge is a dark flat grey with no padding/styling
Prototype: tone="neutral" for pending — same zinc pill as the count badge
```

```tsx
// Correct tone → style mapping for ALL status badges:
const statusStyle = {
  complete: { background: 'var(--success-soft)', color: 'var(--success)' },
  running:  { background: 'var(--info-soft)',    color: 'var(--info)'    },
  pending:  { background: 'var(--accent-muted)', color: 'var(--text-secondary)' },
  failed:   { background: 'var(--danger-soft)',  color: 'var(--danger)'  },
};

// Apply to every status badge in the audit feed rows:
<span style={{
  padding: '2px 8px',
  borderRadius: 9999,
  fontSize: 11,
  fontWeight: 500,
  whiteSpace: 'nowrap',
  ...(statusStyle[audit.status] ?? statusStyle.pending),
}}>
  {audit.status}
</span>
```

---

## FIX 7 — "Run audit" button: should not exist on dashboard

**Where:** Dashboard page body — below KPI cards
**Problem:** A standalone "Run audit" button appears in the page content. This is not
in the prototype Dashboard component at all.
**Prototype spec:** Dashboard actions = "New brand" button only (in topbar).
"Run audit" is triggered from the brand detail page, not the dashboard.

```tsx
// Remove the "Run audit" button from dashboard/page.tsx entirely.
// It does not belong in the dashboard page body.
// The prototype Dashboard component has no "Run audit" button.
```

---

## SUMMARY TABLE

| # | Element | Problem | Action |
|---|---------|---------|--------|
| 1 | "New brand" button | Secondary style (outlined) | Change to primary (white bg) |
| 2 | Org card avatar | Solid purple | Gradient: #8b5cf6 → #ec4899 |
| 3 | User footer avatar | Plain dark + "N" | Gradient: #f97316 → #ec4899 + two-letter initials |
| 4 | User footer tier | Hardcoded "Agency tier" | Read from `currentUser.organization.tier` |
| 5 | KPI values font | Sans-serif | Add `fontFamily: 'var(--font-mono)'` |
| 6a | Audit count badge | Blue info | Neutral: accent-muted bg + text-tertiary |
| 6b | Pending badge | Flat dark grey | Neutral: accent-muted bg + text-secondary |
| 7 | "Run audit" button | Exists in page body | Remove entirely — not in prototype |

---

## VERIFY AFTER pnpm dev

- [ ] "New brand" button: white bg, dark text (high contrast primary style)
- [ ] Org card avatar: purple → pink gradient diagonal
- [ ] User footer avatar: orange → pink gradient, correct two-letter initials
- [ ] User footer: tier reads from DB (e.g. "Starter tier · AU")
- [ ] KPI values: mono font on all four numbers (12, 9, —, US$0.00)
- [ ] Audit count "5" badge: zinc/muted background, NOT blue
- [ ] "pending" badge: zinc/muted background, pill shaped, NOT flat grey
- [ ] "Run audit" button: gone from dashboard page body
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes

