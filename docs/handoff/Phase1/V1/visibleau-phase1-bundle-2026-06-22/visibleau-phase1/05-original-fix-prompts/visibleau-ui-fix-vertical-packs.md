# VisibleAU UI Fix — Vertical Packs Page
**Claude Code prompt — targeted edit to the pack card component only.**

---

## File to edit
`app/(auth)/vertical-packs/page.tsx`
(or wherever the pack card grid is rendered — could also be
`components/domain/vertical-packs/pack-card.tsx` if extracted)

---

## What's wrong

The active pack cards (AU Tradies v1.0, AU Allied Health v1.0, AU SaaS v1.0) are
missing two things the prototype specifies:

1. **"Active" success badge** — top-right of each active card header
2. **Book icon background** — the book icon needs a `var(--accent-blue-soft)` rounded
   square wrapper, not a bare icon

The locked (v1.1) and coming-soon cards are rendering correctly — do not change them.

---

## Fix — update the active pack card header only

Find the card render for active packs and update the header section to match this
exact structure:

```tsx
<Card
  key={pack.id}
  className="p-5 cursor-pointer hover:opacity-90 transition-opacity"
  onClick={() => router.push(`/vertical-packs/${pack.id}`)}
>
  {/* Card header — icon left, badge right */}
  <div className="flex items-center justify-between mb-3">

    {/* Book icon in accent-blue-soft rounded square */}
    <div
      className="w-8 h-8 rounded-md flex items-center justify-center"
      style={{ background: 'var(--accent-blue-soft)' }}
    >
      <BookOpen className="w-4 h-4" style={{ color: 'var(--accent-blue)' }} />
    </div>

    {/* Active badge — success tone */}
    <span
      className="inline-flex items-center text-[11px] font-medium
                 px-2 py-0.5 rounded-full"
      style={{
        background: 'var(--success-soft)',
        color: 'var(--success)',
      }}
    >
      Active
    </span>
  </div>

  {/* Pack name */}
  <h3
    className="text-base font-semibold mb-1"
    style={{ color: 'var(--text-primary)' }}
  >
    {pack.name}
  </h3>

  {/* Description */}
  <p
    className="text-[13px] mb-4"
    style={{ color: 'var(--text-secondary)' }}
  >
    {pack.description}
  </p>

  {/* Footer — prompt count + active brands */}
  <div
    className="flex items-center gap-2 text-[12px]"
    style={{ color: 'var(--text-tertiary)' }}
  >
    <span>{pack.promptCount} prompts · v{pack.version}</span>
    <span>·</span>
    <span>
      {pack.activeBrands} active brand{pack.activeBrands !== 1 ? 's' : ''}
    </span>
  </div>
</Card>
```

**Do not change the locked (v1.1) or coming-soon cards** — those are already correct.

---

## Import to add if missing

```typescript
import { BookOpen } from 'lucide-react';
```

---

## Acceptance checklist

- [ ] AU Tradies v1.0 card shows a book icon inside an `accent-blue-soft` rounded square (top-left)
- [ ] AU Tradies v1.0 card shows an "Active" green badge (top-right of header)
- [ ] AU Allied Health v1.0 card — same: book icon wrapper + Active badge
- [ ] AU SaaS v1.0 card — same: book icon wrapper + Active badge
- [ ] Locked v1.1 cards (Professional Services, Real Estate) unchanged
- [ ] Coming soon cards (Hospitality, Retail / E-commerce, Beauty) unchanged
- [ ] Clicking an active pack card navigates to `/vertical-packs/[id]`
