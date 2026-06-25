# VisibleAU UI Fix — Action Center Detail Page
**Claude Code prompt — targeted edits to `app/(auth)/action-center/[id]/page.tsx`**

---

## What's already correct (do not change)

- "Confirmed" / "Likely" / "Hypothesis" confidence badge at the top ✅
- Action title h1 ✅
- "Brand · Dimension" sub-line ✅
- "WHAT TO DO" section with action text ✅
- "View research (N citation)" expandable EvidenceLink ✅
- "Mark as done" + "Dismiss" ActionStatusButtons ✅

---

## Issues found (3 fixes needed)

1. **Breadcrumb last item** is "Detail" — should be a short version of the action title
2. **Priority badge missing** — prototype shows a "High priority" danger badge ABOVE the h1, before the confidence badge
3. **Meta line** — impact estimate is missing; should show impact score + confidence evidence below the h1

---

## Fix 1 — Breadcrumb

```tsx
// BEFORE
breadcrumbs={['Workspace', 'Action Center', 'Detail']}

// AFTER — use a short title (first 4 words of action title + ellipsis if longer)
const shortTitle = item.title.split(' ').slice(0, 4).join(' ') +
  (item.title.split(' ').length > 4 ? '…' : '');

breadcrumbs={['Workspace', 'Action Center', shortTitle]}
```

---

## Fix 2 — Add priority badge above the h1

Find the page header section and add a priority badge **before** the confidence badge
and h1:

```tsx
<div className="mb-6">

  {/* Priority badge — FIRST, above the h1 */}
  <span
    className="inline-flex items-center text-[11px] font-medium
               px-2.5 py-1 rounded-full mb-3"
    style={{
      background: item.expectedImpactScore === 'high'
        ? 'var(--danger-soft)'
        : item.expectedImpactScore === 'medium'
        ? 'var(--warning-soft)'
        : 'var(--info-soft)',
      color: item.expectedImpactScore === 'high'
        ? 'var(--danger)'
        : item.expectedImpactScore === 'medium'
        ? 'var(--warning)'
        : 'var(--info)',
    }}
  >
    {item.expectedImpactScore === 'high'   ? 'High priority'   :
     item.expectedImpactScore === 'medium' ? 'Medium priority' : 'Low priority'}
  </span>

  {/* h1 — action title */}
  <h1
    className="text-2xl font-semibold mt-2 mb-2"
    style={{ color: 'var(--text-primary)' }}
  >
    {item.title}
  </h1>

  {/* Meta line — impact estimate + confidence label */}
  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
    {IMPACT_LINE[item.expectedImpactScore]} · {' '}
    {item.confidenceLabel.charAt(0).toUpperCase() + item.confidenceLabel.slice(1)}
    {' '}evidence
  </p>

  {/* Brand + Dimension (keep existing) */}
  <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
    {brand.name} · {item.dimension.charAt(0).toUpperCase() + item.dimension.slice(1)}
  </p>

</div>
```

The `IMPACT_LINE` map:

```typescript
const IMPACT_LINE: Record<string, string> = {
  high:   'Significant visibility lift expected',
  medium: 'Moderate visibility improvement',
  low:    'Incremental improvement',
};
```

---

## Fix 3 — Keep Confidence badge in correct position

The existing "Confirmed" / "Likely" / "Hypothesis" badge should stay — just make
sure it renders **after** the priority badge, not instead of it. The layout should be:

```
[High priority]          ← danger pill (new)
Add a Wikipedia entry…   ← h1
Significant visibility lift expected · Confirmed evidence  ← meta line
Bondi Plumbing · Frequency  ← brand + dimension

WHAT TO DO
...action text...

> View research (1 citation)

[Mark as done]  [Dismiss]
```

The build currently puts "Confirmed" at the very top — move it inline to the meta
line (as done in Fix 2 above) and remove the standalone confidence badge at the top.

---

## Acceptance checklist

- [ ] Breadcrumb reads: `Workspace > Action Center > Add a Wikipedia…` (short title)
- [ ] "High priority" / "Medium priority" / "Low priority" badge renders in a danger/warning/info pill above the h1
- [ ] h1 still shows the full action title
- [ ] Meta line shows impact description + confidence label (e.g., "Significant visibility lift expected · Confirmed evidence")
- [ ] "Bondi Plumbing · Frequency" (brand + dimension) sub-line still present
- [ ] "WHAT TO DO" section, EvidenceLink, and ActionStatusButtons all unchanged
- [ ] No standalone "Confirmed" badge floating at the very top of the page
