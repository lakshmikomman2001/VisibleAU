# VisibleAU UI Fix — Action Center Page
**Claude Code prompt — targeted edits to `app/(auth)/action-center/page.tsx`**

---

## Issues found (4 total)

1. **Missing 3 KPI summary cards** at the top (Open actions / Est. impact / Done this month)
2. **Missing "Filter settings" button** top-right
3. **Priority badge missing** on the left of each action card — only confidence badge on right exists; both are needed
4. **Sub-text** can stay as-is ("8 open recommendations across 1 brand") — it uses real DB counts which is accurate

---

## Fix 1 — Add "Filter settings" button to the page header

Find the page header section and add the button to the right:

```tsx
<div className="flex items-center justify-between mb-8">
  <div>
    <h1
      className="text-2xl font-semibold mb-1"
      style={{ color: 'var(--text-primary)' }}
    >
      Action Center
    </h1>
    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
      {totalOpen} open recommendation{totalOpen !== 1 ? 's' : ''} across {brandCount} brand{brandCount !== 1 ? 's' : ''}
    </p>
  </div>

  {/* Filter settings button — secondary, top-right */}
  <button
    className="inline-flex items-center gap-1.5 h-8 px-3 text-[13px]
               font-medium rounded-md border transition-all"
    style={{
      background: 'var(--bg-elevated)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-default)',
    }}
  >
    <Settings className="w-3.5 h-3.5" />
    Filter settings
  </button>
</div>
```

---

## Fix 2 — Add 3 KPI summary cards above the action groups

Insert this grid **between the header and the first dimension group**.
The data comes from the existing DB queries — count open/in_progress items and
done-this-month items.

```tsx
{/* ---- KPI SUMMARY CARDS ---- */}
<div className="grid grid-cols-3 gap-4 mb-6">

  {/* Open actions */}
  <div
    className="rounded-lg p-5"
    style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
    }}
  >
    <div
      className="text-[11px] uppercase tracking-wider mb-1"
      style={{ color: 'var(--text-tertiary)' }}
    >
      Open actions
    </div>
    <div
      className="text-2xl font-semibold mb-0.5"
      style={{ color: 'var(--text-primary)' }}
    >
      {totalOpen}
    </div>
    <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
      {highCount} high · {mediumCount} medium · {lowCount} low
    </div>
  </div>

  {/* Est. impact — static range for v1; Sprint 8 will compute this dynamically */}
  <div
    className="rounded-lg p-5"
    style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
    }}
  >
    <div
      className="text-[11px] uppercase tracking-wider mb-1"
      style={{ color: 'var(--text-tertiary)' }}
    >
      Est. impact if all done
    </div>
    <div
      className="text-2xl font-semibold mb-0.5"
      style={{ color: 'var(--success)' }}
    >
      High
    </div>
    <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
      To composite visibility score
    </div>
  </div>

  {/* Done this month */}
  <div
    className="rounded-lg p-5"
    style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
    }}
  >
    <div
      className="text-[11px] uppercase tracking-wider mb-1"
      style={{ color: 'var(--text-tertiary)' }}
    >
      Done this month
    </div>
    <div
      className="text-2xl font-semibold mb-0.5"
      style={{ color: 'var(--text-primary)' }}
    >
      {doneThisMonth}
    </div>
    <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
      Completed actions
    </div>
  </div>
</div>
```

**Data queries to add** to the server component (alongside your existing query):

```typescript
import { startOfMonth, addMonths } from 'date-fns';

const monthStart = startOfMonth(new Date());
const monthEnd   = addMonths(monthStart, 1);

// Count by impact level for the "X high · Y medium · Z low" line
const impactCounts = await db
  .select({
    expectedImpactScore: actionItems.expectedImpactScore,
    count: count(),
  })
  .from(actionItems)
  .where(
    and(
      eq(actionItems.organizationId, currentUser.organizationId),
      inArray(actionItems.status, ['open', 'in_progress'])
    )
  )
  .groupBy(actionItems.expectedImpactScore);

const highCount   = Number(impactCounts.find(r => r.expectedImpactScore === 'high')?.count   ?? 0);
const mediumCount = Number(impactCounts.find(r => r.expectedImpactScore === 'medium')?.count ?? 0);
const lowCount    = Number(impactCounts.find(r => r.expectedImpactScore === 'low')?.count    ?? 0);
const totalOpen   = highCount + mediumCount + lowCount;

// Done this month
const [{ doneThisMonth }] = await db
  .select({ doneThisMonth: count() })
  .from(actionItems)
  .where(
    and(
      eq(actionItems.organizationId, currentUser.organizationId),
      eq(actionItems.status, 'done'),
      gte(actionItems.doneAt, monthStart),
      lt(actionItems.doneAt, monthEnd)
    )
  );
```

---

## Fix 3 — Add priority badge to the LEFT of each action card

The prototype has a priority badge (High / Med / Low) on the LEFT of each card,
AND the confidence badge (Confirmed / Likely / Hypothesis) on the RIGHT.
Your build only has the confidence badge on the right — add the priority badge.

Find the action card render and update the card body:

```tsx
<Link
  href={`/action-center/${item.id}`}
  className="block p-5 rounded-lg transition-colors hover:opacity-90"
  style={{
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
  }}
>
  <div className="flex items-start gap-4">

    {/* Priority badge — LEFT */}
    <span
      className="inline-flex items-center text-[11px] font-medium
                 px-2 py-0.5 rounded-full shrink-0 mt-0.5"
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
      {item.expectedImpactScore === 'high'   ? 'High' :
       item.expectedImpactScore === 'medium' ? 'Med'  : 'Low'}
    </span>

    {/* Card body */}
    <div className="flex-1 min-w-0">
      <div
        className="text-sm font-semibold mb-1"
        style={{ color: 'var(--text-primary)' }}
      >
        {item.title}
      </div>

      {/* Impact line */}
      <div
        className="text-[13px] mb-2"
        style={{ color: 'var(--text-secondary)' }}
      >
        {IMPACT_LINE[item.expectedImpactScore] ?? 'Impact not specified'}
      </div>

      {/* Citation count + confidence inline */}
      <div
        className="flex items-center gap-4 text-[11px]"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <span className="flex items-center gap-1.5">
          <FileText className="w-3 h-3" />
          {(item.evidenceRefs as unknown[])?.length ?? 0} citation{(item.evidenceRefs as unknown[])?.length !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <Target className="w-3 h-3" />
          {item.confidenceLabel}
        </span>
      </div>
    </div>

    {/* Confidence badge — RIGHT (keep existing) */}
    <span
      className="inline-flex items-center text-[11px] font-medium
                 px-2 py-0.5 rounded-full shrink-0"
      style={{
        background: item.confidenceLabel === 'confirmed'
          ? 'var(--success-soft)'
          : item.confidenceLabel === 'likely'
          ? 'var(--warning-soft)'
          : 'var(--info-soft)',
        color: item.confidenceLabel === 'confirmed'
          ? 'var(--success)'
          : item.confidenceLabel === 'likely'
          ? 'var(--warning)'
          : 'var(--info)',
      }}
    >
      {item.confidenceLabel.charAt(0).toUpperCase() + item.confidenceLabel.slice(1)}
    </span>

    <ChevronRight
      className="w-5 h-5 shrink-0"
      style={{ color: 'var(--text-tertiary)' }}
    />
  </div>
</Link>
```

The `IMPACT_LINE` map (per DJ5 fix — narrative text is Sprint 8; use enum labels for now):

```typescript
const IMPACT_LINE: Record<string, string> = {
  high:   'High impact — significant visibility lift expected',
  medium: 'Medium impact — moderate visibility improvement',
  low:    'Low impact — incremental improvement',
};
```

---

## Imports to add if missing

```typescript
import { Settings, FileText, Target, ChevronRight } from 'lucide-react';
import { count, gte, lt, inArray } from 'drizzle-orm';
import { startOfMonth, addMonths } from 'date-fns';
```

---

## Acceptance checklist

- [ ] "Filter settings" secondary button appears top-right of the page header
- [ ] 3 KPI cards render above the action groups: Open actions · Est. impact · Done this month
- [ ] "Open actions" card shows the correct count with "X high · Y medium · Z low" breakdown
- [ ] "Done this month" card shows correct count from doneAt this calendar month
- [ ] Each action card has a priority badge (High/Med/Low) on the FAR LEFT
- [ ] Each action card still has the confidence badge (Confirmed/Likely/Hypothesis) on the RIGHT
- [ ] Impact line text renders below the title in each card
- [ ] Dimension group headers (FREQUENCY, POSITION, CONTEXT, ACCURACY) remain unchanged
- [ ] Clicking any action card navigates to `/action-center/[id]`
