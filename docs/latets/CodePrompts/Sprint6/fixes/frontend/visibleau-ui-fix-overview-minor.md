# VisibleAU UI Fix — Overview Dashboard Minor Patches
**Claude Code prompt — two targeted edits only, do not rewrite any file.**

---

## Patch 1 — Region format in recent audits feed

**File:** `app/(auth)/dashboard/page.tsx`

**Problem:** The region displays as "NSW.Bondi" — it's reading the raw DB value
`"NSW:Bondi"` without formatting. Should display as "NSW · Bondi".

**Fix:** Find the region line inside the recent audits feed row and replace it:

```tsx
// BEFORE — raw DB value, shows "NSW:Bondi" or "NSW.Bondi"
<div>{audit.primaryRegions?.[0]}</div>

// AFTER — split on ':' and join with ' · '
<div className="text-[11px] mt-0.5 flex items-center gap-1.5"
     style={{ color: 'var(--text-tertiary)' }}>
  <MapPin className="w-3 h-3" />
  {(audit.region ?? audit.primaryRegions?.[0] ?? '').replace(':', ' · ')}
</div>
```

The `primaryRegions` array stores values in `"STATE:Suburb"` format
(e.g. `"NSW:Bondi"`). Split on `":"` produces `["NSW", "Bondi"]` — join with
`" · "` gives the correct display `"NSW · Bondi"`.

If the feed row already has a MapPin icon and the region text, just change
the text content to:

```tsx
{region.replace(':', ' · ')}
```

---

## Patch 2 — KPI card values in mono font

**File:** `app/(auth)/dashboard/page.tsx` or `components/domain/dashboard/kpi-card.tsx`
(whichever file renders the big number in the KPI cards)

**Problem:** The KPI values (1, —, US$2.45) are rendering in the default sans-serif
font. The prototype specifies `var(--font-mono)` for all KPI values.

**Fix:** Find the element that renders the big KPI number and add `fontFamily`:

```tsx
// BEFORE
<div className="text-2xl font-semibold tracking-tight"
     style={{ color: 'var(--text-primary)' }}>
  {value}
</div>

// AFTER — add fontFamily to the style object
<div className="text-2xl font-semibold tracking-tight"
     style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
  {value}
</div>
```

This applies to ALL four KPI cards (Brands tracked, Audits this month,
Avg visibility, LLM spend). If the value is rendered in a shared `<KpiCard>`
component, make the change once there and it fixes all four.

---

## Acceptance checklist

- [ ] Recent audits feed shows "NSW · Bondi" (with space-dot-space separator), not "NSW.Bondi" or "NSW:Bondi"
- [ ] All 4 KPI card values render in monospace font (visually distinct from the label text above them)
- [ ] No other changes made to any file
