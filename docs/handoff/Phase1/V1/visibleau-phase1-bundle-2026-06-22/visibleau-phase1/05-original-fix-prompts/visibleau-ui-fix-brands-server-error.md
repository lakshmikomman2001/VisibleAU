# VisibleAU Fix — Brands Page Runtime Error
**Claude Code prompt — fix the server/client boundary error.**

---

## Error
```
Event handlers cannot be passed to Client Component props.
app\(auth)\brands\page.tsx (103:9) @ BrandsPage
```

## Root cause
`app/(auth)/brands/page.tsx` is a **server component** (no `'use client'` directive).
The patch added `onMouseEnter` and `onMouseLeave` event handlers on the brand row `<div>`.
Event handlers cannot exist in server components — Next.js App Router throws at runtime.

## Fix — two options, use Option A (simplest)

### Option A — Replace mouse handlers with Tailwind hover class (recommended)

Remove the `onMouseEnter` and `onMouseLeave` handlers entirely.
Use a Tailwind CSS hover class instead — no client component needed.

Find the brand row element (around line 103) that has `onMouseEnter` and `onMouseLeave`
and replace it with this:

```tsx
// BEFORE — causes the error
<div
  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
  style={{ borderColor: 'var(--border-subtle)' }}
  ...
>

// AFTER — pure CSS, works in server component
<Link
  key={brand.id}
  href={`/brands/${brand.id}`}
  className="w-full grid grid-cols-12 px-5 py-3.5 items-center
             border-b last:border-b-0 transition-colors
             hover:bg-[var(--bg-hover)]"
  style={{ borderColor: 'var(--border-subtle)' }}
>
```

**Key change:** `hover:bg-[var(--bg-hover)]` is a Tailwind arbitrary-value class that
applies the hover background purely in CSS — no JavaScript event handler, no client
component needed.

Also ensure the row uses `<Link href={...}>` not a `<div>` with an `onClick` handler,
since `onClick` also cannot exist on a server component.

### Option B — Extract row to a client component (only if Option A doesn't work)

If the row has other interactivity that requires client-side state, create a thin
wrapper:

```tsx
// components/domain/brand/brand-row.tsx
'use client';

export function BrandRow({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="w-full grid grid-cols-12 px-5 py-3.5 items-center
                 border-b last:border-b-0 transition-colors
                 hover:bg-[var(--bg-hover)]"
    >
      {children}
    </a>
  );
}
```

Then use `<BrandRow href={`/brands/${brand.id}`}>` in the server page.

---

## Acceptance checklist

- [ ] `localhost:3000/brands` loads without the runtime error
- [ ] Brand rows still show hover background on mouse-over
- [ ] Clicking a brand row navigates to `/brands/[id]`
- [ ] No `onMouseEnter` or `onMouseLeave` or `onClick` handlers remain in `brands/page.tsx`
