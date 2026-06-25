# VisibleAU UI Fix — Vertical Pack Detail Page
**Claude Code prompt — targeted edits to `app/(auth)/vertical-packs/[packId]/page.tsx`**

---

## Issues found (7 total)

1. Breadcrumb last item is "Detail" — should be the pack name (e.g. "Tradies")
2. h1 shows "AU Tradies v1.0" — should be "Tradies (AU)", version moves to meta line
3. Standalone "v1.0" badge above the h1 — remove it; version belongs in the meta line
4. Meta line only shows "Last updated X ago" — should show "124 prompts · 1 active brand · last updated X ago"
5. Missing "Customise prompts" disabled button (top-right actions slot)
6. KPI card 2 label is "Categories" — should be "Sub-verticals"
7. KPI card 3 label is "Active brands" — should be "Categories"
8. Category rows missing italic sample text below each category name
9. Category row counts are plain right-aligned text — should be a `Badge tone="neutral"`
10. Missing "Vertical-specific patterns" card at the bottom
11. Info banner at bottom has wrong style — should use `bg-subtle` background + Lightbulb amber icon

---

## Fix 1 — Breadcrumb

```tsx
// BEFORE
breadcrumbs={['Workspace', 'Vertical packs', 'Detail']}

// AFTER — use the real pack name from DB
breadcrumbs={['Workspace', 'Vertical packs', pack.name]}
```

---

## Fix 2 — Page header (h1 + meta + actions)

Replace the current header with this exact structure:

```tsx
<div className="flex items-center justify-between mb-8">
  <div>
    {/* h1 — pack name + (AU) suffix, NO version in the title */}
    <h1
      className="text-2xl font-semibold mb-1"
      style={{ color: 'var(--text-primary)' }}
    >
      {pack.name} (AU)
    </h1>

    {/* Meta line — prompts · brands · updated */}
    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
      {pack.promptCount} prompts
      {' · '}
      {pack.activeBrands} active brand{pack.activeBrands !== 1 ? 's' : ''}
      {' · '}
      last updated {formatDistanceToNow(new Date(pack.updatedAt), { addSuffix: true })}
    </p>
  </div>

  {/* Customise prompts — disabled in v1, ships in v1.1 (CC2 fix) */}
  <button
    disabled
    title="Prompt authoring — Coming v1.1"
    className="inline-flex items-center gap-1.5 h-8 px-3 text-[13px]
               font-medium rounded-md border opacity-50 cursor-not-allowed"
    style={{
      background: 'var(--bg-elevated)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-default)',
    }}
  >
    <Edit3 className="w-3.5 h-3.5" />
    Customise prompts
    <span
      className="ml-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
      style={{
        background: 'var(--accent-muted)',
        color: 'var(--text-tertiary)',
      }}
    >
      v1.1
    </span>
  </button>
</div>
```

Also **remove** the standalone `v1.0` badge that currently sits above the h1.

---

## Fix 3 — KPI cards (labels and descriptions)

Replace the 3 KPI cards with these exact labels:

```tsx
{[
  { label: 'Prompts',       value: pack.promptCount,    desc: `Across ${pack.categoryCount} categories` },
  { label: 'Sub-verticals', value: pack.subVerticals,   desc: 'Plumber, electrician, builder...' },
  { label: 'Categories',    value: pack.categoryCount,  desc: 'Service discovery, reviews, pricing...' },
].map(s => (
  <div
    key={s.label}
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
      {s.label}
    </div>
    <div
      className="text-2xl font-semibold mb-0.5"
      style={{ color: 'var(--text-primary)' }}
    >
      {s.value}
    </div>
    <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
      {s.desc}
    </div>
  </div>
))}
```

If `subVerticals` isn't a column in your `vertical_packs` schema, use `categoryCount`
for both and label card 2 "Sub-verticals" with a hardcoded value of `8` for the
Tradies pack — it maps to the 8 trade types (plumber, electrician, builder, etc.).

---

## Fix 4 — Category rows: add italic sample text + Badge count

Each row in the "Prompt categories" / "Categories" card must have:
- Category name (text-sm font-medium)
- Italic sample prompt below it (text-[12px] italic, text-tertiary)
- `Badge tone="neutral"` on the right with the count

```tsx
{categories.map((c, i) => (
  <div
    key={i}
    className="px-3 py-3 rounded-md flex items-start justify-between"
    style={{ background: 'transparent' }}
  >
    <div className="flex-1 min-w-0 mr-3">
      {/* Category name */}
      <div
        className="text-sm font-medium mb-1"
        style={{ color: 'var(--text-primary)' }}
      >
        {c.name}
      </div>
      {/* Italic sample prompt — if stored in DB, use c.samplePrompt;
          if not stored, derive from the category name or leave blank */}
      {c.samplePrompt && (
        <div
          className="text-[12px] italic truncate"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {c.samplePrompt}
        </div>
      )}
    </div>

    {/* Count as a Badge, not plain text */}
    <span
      className="text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0"
      style={{
        background: 'var(--accent-muted)',
        color: 'var(--text-tertiary)',
      }}
    >
      {c.count}
    </span>
  </div>
))}
```

---

## Fix 5 — Add "Vertical-specific patterns" card

Add this card **below** the categories card:

```tsx
<div
  className="rounded-lg p-5 mt-4"
  style={{
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
  }}
>
  <h3
    className="text-sm font-semibold mb-3"
    style={{ color: 'var(--text-primary)' }}
  >
    Vertical-specific patterns
  </h3>
  <div className="space-y-3 text-sm">
    {[
      'AU directories prioritised: hipages, Yellow Pages AU, ServiceSeeking, Word of Mouth',
      'NSW/VIC license verification weighted higher in Accuracy dimension',
      'Suburb-specific prompts auto-generated from primary_regions',
      'After-hours/emergency framing checked separately (high-intent)',
      'NAP (Name/Address/Phone) consistency check vs ASIC business register',
    ].map((pattern, i) => (
      <div
        key={i}
        className="flex items-start gap-2"
        style={{ color: 'var(--text-secondary)' }}
      >
        <CheckCircle2
          className="w-4 h-4 mt-0.5 flex-shrink-0"
          style={{ color: 'var(--success)' }}
        />
        <span>{pattern}</span>
      </div>
    ))}
  </div>
</div>
```

---

## Fix 6 — Info banner style

Replace the current blue/teal info banner with the prototype's `bg-subtle` + Lightbulb style:

```tsx
{/* BEFORE — blue banner */}
<div className="bg-blue-... p-4">Prompt editing ships in v1.1...</div>

{/* AFTER — bg-subtle + amber Lightbulb icon */}
<div
  className="mt-6 p-4 rounded-md flex items-start gap-3"
  style={{
    background: 'var(--bg-subtle)',
    border: '1px solid var(--border-subtle)',
  }}
>
  <Lightbulb
    className="w-4 h-4 mt-0.5 flex-shrink-0"
    style={{ color: 'var(--warning)' }}
  />
  <div className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
    Vertical packs are continuously updated based on AU search behaviour.
    New prompts added monthly. Prompt editing ships in v1.1 — packs are
    currently curated by the VisibleAU team.
  </div>
</div>
```

---

## Imports to add if missing

```typescript
import { Edit3, CheckCircle2, Lightbulb } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
```

---

## Acceptance checklist

- [ ] Breadcrumb: `Workspace > Vertical packs > Tradies` (pack name, not "Detail")
- [ ] h1 shows "Tradies (AU)" — no version number in the title
- [ ] Standalone "v1.0" badge above h1 is removed
- [ ] Meta line shows: "124 prompts · 1 active brand · last updated X ago"
- [ ] "Customise prompts" button appears top-right, disabled, with "v1.1" badge
- [ ] KPI card labels: Prompts · Sub-verticals · Categories (not Active brands)
- [ ] Each KPI card has a description line below the number
- [ ] Category rows show italic sample text below the category name
- [ ] Category count is a pill/badge, not plain text
- [ ] "Vertical-specific patterns" card renders below the categories card with CheckCircle2 bullets
- [ ] Info banner uses `var(--bg-subtle)` background + amber Lightbulb icon
