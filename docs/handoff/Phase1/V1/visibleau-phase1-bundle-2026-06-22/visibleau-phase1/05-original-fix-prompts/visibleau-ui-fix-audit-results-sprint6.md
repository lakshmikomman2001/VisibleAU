# VisibleAU UI Fix — Audit Results Rich Page + Sidebar Active State
**Claude Code prompt — drop this file into your session and run it.**

---

## Context

Six UI issues were found across two screens during Sprint 6 testing. All fixes are **frontend only** — no schema or API changes. The DB queries reference exact Drizzle column names from the canonical schema.

Fix these files:
- `app/(auth)/audits/[auditId]/page.tsx` — Audit Results Rich page (7 issues)
- `components/domain/app-sidebar.tsx` — Sidebar active state (1 issue)

---

## File 1 — `app/(auth)/audits/[auditId]/page.tsx`

Rewrite this file completely. Do not patch it. The current implementation has structural and visual issues that require a full rebuild of the component.

### Data fetching (server component — keep existing pattern)

```typescript
// Keep your existing getCurrentUser(), setRlsContext(), and audit fetch.
// Add this query for top 3 action items (Sprint 6):
const topActions = await db
  .select({
    id: actionItems.id,
    title: actionItems.title,
    expectedImpactScore: actionItems.expectedImpactScore,
    confidenceLabel: actionItems.confidenceLabel,
    dimension: actionItems.dimension,
  })
  .from(actionItems)
  .where(
    and(
      eq(actionItems.auditId, auditId),
      eq(actionItems.organizationId, currentUser.organizationId),
      eq(actionItems.status, 'open')
    )
  )
  .orderBy(
    sql`CASE expected_impact_score WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`
  )
  .limit(3);
```

### Section 1 — Page header (REPLACE current header)

The composite score must be in the **top-right of the header**, not in its own centred card below.

```tsx
{/* HEADER — two-column: left=meta, right=score */}
<div className="flex items-start justify-between mb-10">

  {/* LEFT — badge + brand name + meta line */}
  <div>
    <Badge tone="success" dot>
      Complete · {audit.engines.length} engines · {audit.promptsCount} prompts
    </Badge>
    <h1
      className="text-3xl font-semibold tracking-tight mt-3"
      style={{ color: 'var(--text-primary)' }}
    >
      {brand.name}
    </h1>
    <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
      Audit #{audit.auditNumber}
      {audit.completedAt && ` · ${format(new Date(audit.completedAt), 'd MMM yyyy')}`}
      {audit.totalCostUsd && ` · US$${parseFloat(audit.totalCostUsd).toFixed(2)} cost`}
      {` · ${(audit.engines.length) * (audit.promptsCount ?? 10) * (audit.runsPerPrompt ?? 5)} LLM calls`}
    </p>
  </div>

  {/* RIGHT — big composite score + CI */}
  <div className="text-right shrink-0 ml-8">
    <div
      className="text-[10px] uppercase tracking-wider"
      style={{ color: 'var(--text-tertiary)' }}
    >
      Visibility Score
    </div>
    <div
      className="text-5xl font-semibold tracking-tight mt-1"
      style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
    >
      {audit.scoreComposite ? parseFloat(audit.scoreComposite).toFixed(1) : '—'}
    </div>
    {audit.scoreConfidenceLow && audit.scoreConfidenceHigh && (
      <div
        className="text-[10px] mt-1"
        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}
      >
        95% CI: {parseFloat(audit.scoreConfidenceLow).toFixed(1)}
        {' — '}
        {parseFloat(audit.scoreConfidenceHigh).toFixed(1)}
      </div>
    )}
  </div>
</div>
```

### Section 2 — Multidimensional breakdown card (REPLACE current dimension cards)

All 5 dimensions in a **single `grid-cols-5` row** inside one wrapping Card. Not a 3+2 grid across two rows.

```tsx
{/* MULTIDIMENSIONAL BREAKDOWN — one card, 5 columns */}
<Card className="p-6 mb-6">
  <h3
    className="text-sm font-semibold mb-1"
    style={{ color: 'var(--text-primary)' }}
  >
    Multidimensional breakdown
  </h3>
  <p
    className="text-[12px] mb-6"
    style={{ color: 'var(--text-secondary)' }}
  >
    Each dimension is scored 0–100 with 95% confidence intervals.
  </p>

  <div className="grid grid-cols-5 gap-4">
    {dimensions.map((d) => {
      // Parse CI from audit.confidenceIntervals JSONB:
      // { frequency:{lower,upper}, position:{lower,upper}, ... composite:{lower,upper} }
      const ci = (audit.confidenceIntervals as Record<string, {lower:number; upper:number}> | null)
                 ?.[d.key] ?? { lower: 0, upper: 0 };

      return (
        <div key={d.name} className="space-y-3">
          <div>
            <div
              className="text-[12px] font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {d.name}
            </div>
            <div
              className="text-[10px]"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {d.desc}
            </div>
          </div>

          {/* Score number */}
          <div
            className="text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
          >
            {d.score !== null ? parseFloat(String(d.score)).toFixed(1) : '—'}
          </div>

          {/* Score bar — DOT MARKER + CI BAND (BG4 fix) */}
          {/* DO NOT use a filled progress bar. Use this exact pattern: */}
          <div
            className="h-1 rounded-full relative overflow-hidden"
            style={{ background: 'var(--accent-muted)' }}
          >
            {/* CI band — semi-transparent blue between lower% and upper% */}
            <div
              className="absolute inset-y-0 rounded-full"
              style={{
                left: `${ci.lower}%`,
                width: `${ci.upper - ci.lower}%`,
                background: 'var(--accent-blue-soft)', // rgba(59,130,246,0.15)
              }}
            />
            {/* Dot marker at the score position */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
              style={{
                left: `calc(${d.score ?? 0}% - 4px)`,
                background: 'var(--accent-blue)',
                boxShadow: '0 0 0 2px var(--bg-elevated)',
              }}
            />
          </div>

          {/* CI numbers below bar */}
          <div
            className="flex justify-between text-[9px] mt-1.5"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}
          >
            <span>{ci.lower.toFixed(0)}</span>
            <span>{ci.upper.toFixed(0)}</span>
          </div>

          {/* Weight badge */}
          <div
            className="text-[10px] flex items-center gap-1"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <span>Weight:</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{d.weight}%</span>
          </div>
        </div>
      );
    })}
  </div>
</Card>
```

The `dimensions` array to use above:

```typescript
// Build from the audit object — use exact Drizzle column names
const dimensions = [
  {
    key: 'frequency',
    name: 'Frequency',
    weight: 25,
    desc: 'How often you appear',
    score: audit.scoreFrequency,
  },
  {
    key: 'position',
    name: 'Position',
    weight: 25,
    desc: 'Average rank when mentioned',
    score: audit.scorePosition,
  },
  {
    key: 'sentiment',
    name: 'Sentiment',
    weight: 20,
    desc: 'Tone of mentions',
    score: audit.scoreSentimentNumeric, // use the numeric column, not the text label
  },
  {
    key: 'context',
    name: 'Context',
    weight: 15,
    desc: 'Recommended vs listed',
    score: audit.scoreContextNumeric, // use the numeric column, not the text label
  },
  {
    key: 'accuracy',
    name: 'Accuracy',
    weight: 15,
    desc: 'Factual correctness',
    score: audit.scoreAccuracy,
  },
];
```

### Section 3 — 3-column grid (REPLACE — was missing 2 of 3 cards)

```tsx
{/* 3-COL GRID: Per-engine · Sentiment breakdown · Competitor context */}
<div className="grid grid-cols-3 gap-4 mb-6">

  {/* Card 1 — Per-engine performance */}
  <Card className="p-6">
    <h3
      className="text-sm font-semibold mb-5"
      style={{ color: 'var(--text-primary)' }}
    >
      Per-engine performance
    </h3>
    <div className="space-y-4">
      {perEngineData.map((e) => (
        <div key={e.engine}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span
                className="text-[12.5px] font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {/* Capitalise engine name for display */}
                {e.engine.charAt(0).toUpperCase() + e.engine.slice(1)}
              </span>
              <span
                className="text-[10px]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {e.mentionRate}% mention rate
              </span>
            </div>
            <span
              className="text-[12px] font-semibold"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
            >
              {e.score.toFixed(1)}
            </span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--accent-muted)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${e.score}%`,
                background: e.score >= 60 ? 'var(--success)' : 'var(--warning)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  </Card>

  {/* Card 2 — Sentiment breakdown */}
  <Card className="p-6">
    <h3
      className="text-sm font-semibold mb-5"
      style={{ color: 'var(--text-primary)' }}
    >
      Sentiment
    </h3>
    <div className="text-center mb-5">
      <div
        className="text-3xl font-semibold tracking-tight"
        style={{ color: 'var(--success)', fontFamily: 'var(--font-mono)' }}
      >
        {audit.scoreSentimentNumeric
          ? parseFloat(audit.scoreSentimentNumeric).toFixed(1)
          : '—'}
      </div>
      <div
        className="text-[11px] mt-1"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Sentiment score (0–100)
      </div>
    </div>
    {/* Sentiment breakdown bars — compute from citations table */}
    {sentimentBreakdown && (
      <div className="space-y-2">
        {[
          { label: 'Positive', count: sentimentBreakdown.positive, color: 'var(--success)' },
          { label: 'Neutral',  count: sentimentBreakdown.neutral,  color: 'var(--text-tertiary)' },
          { label: 'Negative', count: sentimentBreakdown.negative, color: 'var(--danger)' },
        ].map((s) => {
          const total = sentimentBreakdown.positive + sentimentBreakdown.neutral + sentimentBreakdown.negative;
          const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
          return (
            <div key={s.label} className="flex items-center gap-3 text-[12px]">
              <span className="w-16" style={{ color: 'var(--text-secondary)' }}>
                {s.label}
              </span>
              <div
                className="flex-1 h-1.5 rounded-full overflow-hidden"
                style={{ background: 'var(--accent-muted)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: s.color }}
                />
              </div>
              <span
                className="text-[11px]"
                style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}
              >
                {s.count}
              </span>
            </div>
          );
        })}
      </div>
    )}
  </Card>

  {/* Card 3 — Competitor context */}
  <Card className="p-6">
    <h3
      className="text-sm font-semibold mb-5"
      style={{ color: 'var(--text-primary)' }}
    >
      Competitor context
    </h3>
    {competitorData.length === 0 ? (
      <p
        className="text-[12px]"
        style={{ color: 'var(--text-tertiary)' }}
      >
        No competitor data for this audit. Add competitors to your brand profile.
      </p>
    ) : (
      <div className="space-y-3">
        {competitorData
          .sort((a, b) => b.mentions - a.mentions)
          .map((c, i) => (
            <div
              key={c.name}
              className="flex items-center justify-between p-2.5 rounded-md"
              style={{
                background: c.isYou ? 'var(--accent-blue-soft)' : 'transparent',
              }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="text-[10px] w-4 text-center"
                  style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}
                >
                  #{i + 1}
                </span>
                <span
                  className="text-[12.5px] font-medium"
                  style={{
                    color: c.isYou ? 'var(--accent-blue)' : 'var(--text-primary)',
                  }}
                >
                  {c.name}
                  {c.isYou && (
                    <span
                      className="text-[10px] ml-1"
                      style={{ color: 'var(--accent-blue)' }}
                    >
                      (you)
                    </span>
                  )}
                </span>
              </div>
              <span
                className="text-[12px] font-semibold"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
              >
                {c.mentions}
              </span>
            </div>
          ))}
      </div>
    )}
  </Card>
</div>
```

**Data for the 3-col grid** — fetch from citations at the top of the server component:

```typescript
// Sentiment breakdown — count by scoreSentiment label
const sentimentRows = await db
  .select({
    sentiment: citations.scoreSentiment,
    count: count(),
  })
  .from(citations)
  .where(eq(citations.auditId, auditId))
  .groupBy(citations.scoreSentiment);

const sentimentBreakdown = {
  positive: sentimentRows.find(r => r.sentiment === 'positive')?.count ?? 0,
  neutral:  sentimentRows.find(r => r.sentiment === 'neutral')?.count ?? 0,
  negative: sentimentRows.find(r => r.sentiment === 'negative')?.count ?? 0,
};

// Per-engine data — group citations by engine
const engineRows = await db
  .select({
    engine: citations.engine,
    mentionCount: count(),  // total citations (brandMentioned = true)
    totalRuns: sql<number>`COUNT(*) FILTER (WHERE ${citations.runNumber} IS NOT NULL)`,
  })
  .from(citations)
  .where(and(eq(citations.auditId, auditId), eq(citations.brandMentioned, true)))
  .groupBy(citations.engine);

// Build perEngineData — score = brandMentioned/totalRuns × 100 as a proxy
const perEngineData = (audit.engines ?? []).map(engine => {
  const row = engineRows.find(r => r.engine === engine);
  const totalRunsForEngine = (audit.promptsCount ?? 10) * (audit.runsPerPrompt ?? 5);
  const mentionCount = Number(row?.mentionCount ?? 0);
  const mentionRate = totalRunsForEngine > 0
    ? Math.round((mentionCount / totalRunsForEngine) * 100)
    : 0;
  return {
    engine,
    mentionRate,
    score: mentionRate, // use mention rate as the score proxy until per-engine composite is stored
    isYou: false,
  };
});

// Competitor context — derive from citations WHERE brand_mentioned = true, grouped by domain
// competitors listed in brand.competitors TEXT[]
const competitorData = [
  { name: brand.name, mentions: Number(engineRows.reduce((s, r) => s + Number(r.mentionCount), 0)), isYou: true },
  // Add competitor mention counts from citations.citedSources JSONB if you track them,
  // or show empty state if brand.competitors is empty
];
```

### Section 4 — Action Center preview (ADD — Sprint 6, completely missing)

Add this **below** the 3-col grid. This replaces the "Coming Sprint 6" teaser from the prototype.

```tsx
{/* ACTION CENTER SECTION — Sprint 6 real data */}
{topActions.length > 0 && (
  <Card className="p-6" style={{ borderColor: 'var(--accent-blue)' }}>
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-blue)' }} />
        <h3
          className="text-sm font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          Recommended actions
        </h3>
        <span
          className="text-[11px] px-2 py-0.5 rounded-full font-medium"
          style={{
            background: 'var(--accent-blue-soft)',
            color: 'var(--accent-blue)',
          }}
        >
          {topActions.length} from this audit
        </span>
      </div>
      <Link
        href="/action-center"
        className="text-[12px] flex items-center gap-1 hover:opacity-70"
        style={{ color: 'var(--accent-blue)' }}
      >
        View all <ArrowRight className="w-3 h-3" />
      </Link>
    </div>

    <div className="space-y-3">
      {topActions.map((a) => {
        const priorityTone: Record<string, string> = {
          high: 'var(--danger)',
          medium: 'var(--warning)',
          low: 'var(--info)',
        };
        const priorityLabel: Record<string, string> = {
          high: 'High',
          medium: 'Med',
          low: 'Low',
        };
        const tone = priorityTone[a.expectedImpactScore] ?? 'var(--text-tertiary)';
        const label = priorityLabel[a.expectedImpactScore] ?? a.expectedImpactScore;

        return (
          <Link
            key={a.id}
            href={`/action-center/${a.id}`}
            className="block p-3.5 rounded-md flex items-start gap-3.5
                       hover:opacity-80 transition-opacity cursor-pointer"
            style={{
              border: '1px solid var(--border-default)',
              background: 'var(--bg-base)',
            }}
          >
            {/* Priority badge */}
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5"
              style={{
                background: tone + '20',  // 12% opacity version of the colour
                color: tone,
              }}
            >
              {label}
            </span>

            <div className="flex-1 min-w-0">
              <div
                className="text-[13px] font-semibold mb-0.5"
                style={{ color: 'var(--text-primary)' }}
              >
                {a.title}
              </div>
              <div
                className="text-[11px]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {a.dimension} · {a.confidenceLabel}
              </div>
            </div>

            <ChevronRight
              className="w-4 h-4 shrink-0 mt-0.5"
              style={{ color: 'var(--text-tertiary)' }}
            />
          </Link>
        );
      })}
    </div>
  </Card>
)}
```

### Section 5 — Export button in TopBar actions slot

```tsx
// Pass to the layout's actions slot:
actions={
  <Button variant="secondary" size="sm" asChild>
    <Link href={`/api/audits/${auditId}/export?format=pdf`}>
      <Download className="w-3.5 h-3.5 mr-1.5" />
      Export ▾
    </Link>
  </Button>
}
```

---

## File 2 — `components/domain/app-sidebar.tsx`

Two fixes: active state background, and `aria-current` for accessibility.

### Fix — active nav item style

Find the nav link/button for each sidebar item and change the active styles to match the prototype exactly:

```tsx
// For each nav item, apply these styles:
<Link
  href={item.href}
  aria-current={isActive ? 'page' : undefined}  // BK4 fix — accessibility
  className="w-full px-3 py-1.5 rounded-md flex items-center gap-2.5
             text-[13px] font-medium transition-all"
  style={{
    // ACTIVE: full-row background fill + border (not just left border or text colour change)
    color:      isActive ? 'var(--text-primary)'   : 'var(--text-secondary)',
    background: isActive ? 'var(--bg-elevated)'    : 'transparent',
    border:     isActive ? '1px solid var(--border-default)' : '1px solid transparent',
    fontWeight: isActive ? 500 : 400,
  }}
  onMouseEnter={e => {
    if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
  }}
  onMouseLeave={e => {
    if (!isActive) e.currentTarget.style.background = 'transparent';
  }}
>
  <Icon className="w-3.5 h-3.5 shrink-0" />
  <span className="flex-1 text-left">{item.label}</span>
</Link>
```

The `isActive` check should match the current `pathname` using Next.js `usePathname()`:

```typescript
'use client';
import { usePathname } from 'next/navigation';

// Inside the sidebar component:
const pathname = usePathname();

const isActive = (href: string) => {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname.startsWith(href);
};
```

---

## Acceptance checklist

After implementing, verify each item visually:

- [ ] Audit Results header: brand name on left, big composite score number (5xl, mono font) on top-right
- [ ] Composite score CI text appears below the score in `text-[10px] font-mono` at `--text-tertiary`
- [ ] Cost shows 2 decimal places (e.g. `US$2.45` not `US$2.4500`)
- [ ] All 5 dimension cards are in a single horizontal `grid-cols-5` row, not wrapped
- [ ] Each dimension score bar is a thin `h-1` track with a **circular dot marker** at the score position, NOT a filled bar
- [ ] Each dimension score bar has a semi-transparent blue CI band between the lower and upper bounds
- [ ] The 3-col grid shows: Per-engine card | Sentiment breakdown card | Competitor context card
- [ ] Action Center section appears at the bottom with real `action_items` rows from the DB
- [ ] Each action card in the section links to `/action-center/[id]`
- [ ] "View all" link in the Action Center section goes to `/action-center`
- [ ] Sidebar active item has a full-row background (`var(--bg-elevated)`) + border, not just text colour
- [ ] Active sidebar link has `aria-current="page"` attribute
