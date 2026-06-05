# VisibleAU Sprint 4 — Theme System Fix (v6)
# Applies the design token system from visibleau-prototype-v2.59.jsx
# to the real Next.js app.

---

## CONFLICTS FIXED IN THIS VERSION vs PREVIOUS VERSIONS

Previous fix attempt 1:
- @tailwind directives (v3 syntax) — should not replace globals.css entirely
- localStorage key 'visibleau-theme' — prototype uses 'theme'
- Component at components/theme-toggle.tsx — Sprint 11 uses components/shared/
- classList.toggle('dark') — prototype uses setAttribute('data-theme')
- Assumed app-topbar.tsx exists — may not; search for Bell icon instead
- Replaced entire globals.css — wipes Tailwind v4 setup

v3 fixed 4 additional conflicts:
- MISSING: --accent-red, --accent-green, --accent-amber CSS vars used in
  prototype components but absent from token block (delete buttons, positive
  deltas, warning icons — will render with no colour without these)
- HYDRATION FLASH: useState('dark') causes wrong icon on first render if
  user previously chose light — fix with suppressHydrationWarning + null guard
- suppressHydrationWarning: needed on <html> in layout.tsx when ThemeToggle
  changes data-theme client-side after SSR sets it server-side
- * transition rule: confirmed safe (only covers bg/border/color, not transform
  — ThemeToggle inner pill animation uses transform so it's unaffected)

v4 fixed 3 additional conflicts:
- FONT VAR: --font-display was 'Geist' raw string — Next.js 15 scaffold loads
  Geist via next/font which creates --font-geist-sans CSS var; reference that
  instead or the font never resolves and falls back to system sans-serif
- TOGGLE NULL BUG: toggle() when theme=null sets next='dark' even if user is
  in light mode — happens if user clicks the pill in the <1 frame before
  useEffect fires; fixed by guarding with (theme ?? 'dark') and disabling
  the button while theme is null
- BELL DUPLICATION: Step 4 showed the full Bell button code which Claude Code
  would duplicate (Sprint 4 already built it); fixed to show only the
  ThemeToggle addition, with explicit "do not duplicate Bell" comment

v5 fixed 4 additional conflicts:
- MISSING transition-all on ThemeToggle button (prototype line 296)
- Wrong transition method on inner div: style override vs className transition-transform
- Wrong disabled cursor: cursor-wait → cursor-not-allowed
- Unnecessary disabled state removed — null guard in toggle() is sufficient

v6 (this version) fixes 3 MORE conflicts found by fresh prototype audit:
- MISSING @keyframes progress-stripe: prototype defines it (line 46); used by
  audit-running.tsx progress bar via style={{ animation: 'progress-stripe ...' }};
  Sprint 4 ships the audit running screen so this is needed in globals.css now
- CRITICAL Step 2: html tag snippet showed replacement without className, which
  Claude Code would interpret as: remove existing className (containing next/font
  font variables --font-geist-sans / --font-geist-mono) breaking FIX-A entirely;
  fixed to say ADD two attributes to the existing tag, preserve all others
- Step 4 grep: 'Bell' matches import lines and re-exports, not just JSX usage;
  fixed to '<Bell' which only matches actual JSX render sites

---

## STEP 1 — APPEND TOKENS TO globals.css

Read `app/globals.css` first. Do NOT remove any existing content.
Append the following block at the very bottom of the file:

```css
/* ================================================================
   VisibleAU Design Tokens — source: visibleau-prototype-v2.59.jsx
   Scoped to [data-theme="dark|light"] on <html>.
   All Sprint 4+ components use var(--token-name) inline styles.
   ================================================================ */

/* ── Shared: fonts, radii, shadows, animations ─────────────── */
:root {
  /* FIX-A: Next.js 15 scaffold loads Geist via next/font/local and creates
     CSS variables --font-geist-sans and --font-geist-mono on <body>.
     We reference those vars and chain to system fonts as fallback.
     If for any reason the scaffold used a different variable name, the
     Inter and system-font fallbacks ensure text still renders correctly. */
  --font-display: var(--font-geist-sans), 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: var(--font-geist-mono), 'JetBrains Mono', ui-monospace, monospace;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --shadow-soft: 0 1px 2px 0 rgba(0,0,0,0.05);
  --shadow-card: 0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1);
  --shadow-pop: 0 10px 25px -5px rgba(0,0,0,0.2), 0 8px 10px -6px rgba(0,0,0,0.15);
}

@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes pulse-soft {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* Used by audit-running.tsx progress bar stripes (Sprint 4 audit running screen) */
@keyframes progress-stripe {
  0%   { background-position: 0 0; }
  100% { background-position: 40px 0; }
}

.anim-fade-in-up { animation: fade-in-up 0.4s ease-out backwards; }
.anim-pulse-soft { animation: pulse-soft 2.4s ease-in-out infinite; }
.anim-shimmer {
  background: linear-gradient(
    110deg,
    transparent 30%,
    var(--shimmer-color) 50%,
    transparent 70%
  );
  background-size: 200% 100%;
  animation: shimmer 2s infinite;
}

.grid-bg {
  background-image:
    linear-gradient(var(--grid-color) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid-color) 1px, transparent 1px);
  background-size: 32px 32px;
}

.scrollbar-thin::-webkit-scrollbar       { width: 6px; height: 6px; }
.scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 3px;
}

/* ── Dark theme ─────────────────────────────────────────────── */
[data-theme="dark"] {
  /* Surfaces */
  --bg-base:     #09090b;
  --bg-subtle:   #0c0c0f;
  --bg-elevated: #18181b;
  --bg-hover:    #27272a;
  --bg-active:   #3f3f46;

  /* Borders */
  --border-subtle:  rgba(255,255,255,0.06);
  --border-default: rgba(255,255,255,0.08);
  --border-strong:  rgba(255,255,255,0.14);
  --border-focus:   rgba(255,255,255,0.25);

  /* Text */
  --text-primary:   #fafafa;
  --text-secondary: #a1a1aa;
  --text-tertiary:  #71717a;
  --text-disabled:  #52525b;

  /* Accents */
  --accent-primary:    #ffffff;
  --accent-primary-fg: #09090b;
  --accent-muted:      #27272a;
  --accent-blue:       #3b82f6;
  --accent-blue-soft:  rgba(59,130,246,0.15);

  /* Semantic colours */
  --success:      #22c55e;
  --success-soft: rgba(34,197,94,0.12);
  --warning:      #f59e0b;
  --warning-soft: rgba(245,158,11,0.12);
  --danger:       #ef4444;
  --danger-soft:  rgba(239,68,68,0.12);
  --info:         #06b6d4;
  --info-soft:    rgba(6,182,212,0.12);

  /* NEW (v3): alias vars used directly in prototype components */
  --accent-red:   #ef4444;   /* = --danger: delete buttons, error states */
  --accent-green: #22c55e;   /* = --success: positive deltas, check icons */
  --accent-amber: #f59e0b;   /* = --warning: alert icons, "Not found" labels */

  /* Effects */
  --gradient-glow:   radial-gradient(ellipse at top, rgba(59,130,246,0.08), transparent 50%);
  --gradient-card:   linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 100%);
  --gradient-border: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04));
  --shimmer-color:   rgba(255,255,255,0.04);
  --grid-color:      rgba(255,255,255,0.04);
}

/* ── Light theme ────────────────────────────────────────────── */
[data-theme="light"] {
  /* Surfaces */
  --bg-base:     #fafafa;
  --bg-subtle:   #f4f4f5;
  --bg-elevated: #ffffff;
  --bg-hover:    #f4f4f5;
  --bg-active:   #e4e4e7;

  /* Borders */
  --border-subtle:  rgba(0,0,0,0.05);
  --border-default: rgba(0,0,0,0.08);
  --border-strong:  rgba(0,0,0,0.12);
  --border-focus:   rgba(0,0,0,0.4);

  /* Text */
  --text-primary:   #09090b;
  --text-secondary: #52525b;
  --text-tertiary:  #71717a;
  --text-disabled:  #a1a1aa;

  /* Accents */
  --accent-primary:    #18181b;
  --accent-primary-fg: #fafafa;
  --accent-muted:      #f4f4f5;
  --accent-blue:       #2563eb;
  --accent-blue-soft:  rgba(37,99,235,0.08);

  /* Semantic colours */
  --success:      #16a34a;
  --success-soft: rgba(22,163,74,0.08);
  --warning:      #d97706;
  --warning-soft: rgba(217,119,6,0.08);
  --danger:       #dc2626;
  --danger-soft:  rgba(220,38,38,0.08);
  --info:         #0891b2;
  --info-soft:    rgba(8,145,178,0.08);

  /* NEW (v3): alias vars used directly in prototype components */
  --accent-red:   #dc2626;   /* = --danger */
  --accent-green: #16a34a;   /* = --success */
  --accent-amber: #d97706;   /* = --warning */

  /* Effects */
  --gradient-glow:   radial-gradient(ellipse at top, rgba(37,99,235,0.04), transparent 50%);
  --gradient-card:   linear-gradient(180deg, rgba(0,0,0,0.01) 0%, rgba(0,0,0,0) 100%);
  --gradient-border: linear-gradient(135deg, rgba(0,0,0,0.05), rgba(0,0,0,0.02));
  --shimmer-color:   rgba(0,0,0,0.03);
  --grid-color:      rgba(0,0,0,0.04);
}

/* ── Base styles ─────────────────────────────────────────────── */
html,
body {
  background:  var(--bg-base);
  color:       var(--text-primary);
  font-family: var(--font-display);
}

/*
  Theme transition: only background-color, border-color, color.
  Does NOT include 'transform' — ThemeToggle pill animation
  uses transform: translateX() which must not be overridden here.
*/
*,
*::before,
*::after {
  transition:
    background-color 0.15s ease,
    border-color     0.15s ease,
    color            0.15s ease;
}
```

---

## STEP 2 — UPDATE app/layout.tsx

Open `app/layout.tsx` and find the `<html>` opening tag.
It will look something like:

```tsx
<html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
```

ADD two attributes to it — keep ALL existing attributes unchanged:

```tsx
<html
  lang="en"
  className={`${geistSans.variable} ${geistMono.variable} antialiased`}
  data-theme="dark"
  suppressHydrationWarning
>
```

Do NOT remove `className` or any other existing attribute.
Only add `data-theme="dark"` and `suppressHydrationWarning`.

- `data-theme="dark"` — activates the dark CSS token block before any JS runs.
  New users see the dark theme instantly with no flash.
- `suppressHydrationWarning` — required because ThemeToggle overwrites this
  attribute client-side when a returning user has `"light"` saved in localStorage.
  Without it, Next.js 15 throws a hydration mismatch error in dev.

---

## STEP 3 — CREATE components/shared/theme-toggle.tsx

Path is `components/shared/` — Sprint 11 IQ1 canonical location.

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

/**
 * Theme toggle pill matching prototype ThemeToggle exactly.
 *
 * Uses setAttribute('data-theme') NOT classList.toggle('dark').
 * The design token system is scoped to [data-theme] CSS selectors.
 *
 * localStorage key: 'theme' — matches prototype (line 4533).
 *
 * suppressHydrationWarning on <button>: the icon shown depends on
 * the resolved theme which is only known client-side (localStorage).
 * Server renders null icon; client fills it in after mount.
 * suppressHydrationWarning prevents React from throwing on this
 * expected mismatch.
 */
export function ThemeToggle() {
  // null = not yet mounted (avoids hydration mismatch on icon)
  const [theme, setTheme] = useState<'dark' | 'light' | null>(null);

  useEffect(() => {
    // Read localStorage preference; fall back to html data-theme attr;
    // final fallback to 'dark' (matches layout.tsx default).
    const saved    = localStorage.getItem('theme') as 'dark' | 'light' | null;
    const htmlAttr = document.documentElement.getAttribute('data-theme') as
      'dark' | 'light' | null;
    const resolved = saved ?? htmlAttr ?? 'dark';

    setTheme(resolved);
    // Apply in case saved preference differs from layout.tsx default
    document.documentElement.setAttribute('data-theme', resolved);
  }, []);

  function toggle() {
    // Guard against null — safe to call even before useEffect resolves.
    // If theme is null (< 1 frame window), treat as 'dark' (layout default).
    const current = theme ?? 'dark';
    const next    = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      suppressHydrationWarning
      // FIX-I: transition-all matches prototype ThemeToggle className exactly
      // (prototype line 296: "...rounded-full transition-all flex items-center px-1")
      className="relative h-8 w-14 rounded-full transition-all flex items-center px-1"
      style={{
        background: 'var(--bg-elevated)',
        border:     '1px solid var(--border-default)',
      }}
    >
      <div
        suppressHydrationWarning
        // FIX-I: transition-transform matches prototype exactly (line 303).
        // Do NOT add style={{ transition }} here — it would override this class.
        // Tailwind's transition-transform uses 150ms cubic-bezier, matching prototype.
        // The globals.css * rule sets bg/border/color transitions; this class
        // overrides transition-property to 'transform' only for this element.
        className="absolute h-6 w-6 rounded-full flex items-center justify-center transition-transform"
        style={{
          background: 'var(--accent-primary)',
          color:      'var(--accent-primary-fg)',
          transform:  (theme ?? 'dark') === 'dark'
            ? 'translateX(0)'
            : 'translateX(24px)',
          boxShadow:  'var(--shadow-card)',
        }}
      >
        {/* Icon is null before mount — prevents hydration mismatch */}
        {theme === 'dark'  && <Moon className="w-3 h-3" />}
        {theme === 'light' && <Sun  className="w-3 h-3" />}
      </div>
    </button>
  );
}
```

---

## STEP 4 — ADD ThemeToggle TO THE TOPBAR

First, find where the Bell notification icon lives:
```bash
grep -rn "<Bell" app/ components/ --include="*.tsx"
```

Use `<Bell` not `Bell` — searching for `Bell` matches every file that imports
the icon, which could be many. `<Bell` only matches files that actually render
the JSX element, pinpointing exactly where to add `<ThemeToggle />`.

In whichever file that returns:

1. Add the import at the top of the file:
```tsx
import { ThemeToggle } from '@/components/shared/theme-toggle';
```

2. Find the existing Bell button (already there from Sprint 4 prototype build).
   Place `<ThemeToggle />` immediately AFTER it — do NOT add a second Bell button:
```tsx
{/* existing Bell button — do not duplicate */}
<button className="w-8 h-8 rounded-md flex items-center justify-center hover:opacity-70 transition-opacity"
  style={{ color: 'var(--text-secondary)' }}>
  <Bell className="w-4 h-4" />
</button>
{/* ADD this line after Bell: */}
<ThemeToggle />
```

Prototype TopBar reference (line 455): ThemeToggle sits to the RIGHT of Bell,
with a vertical divider (h-5 w-px) already rendered between actions and Bell.
Do not add another divider — it is already there.

---

## VERIFY AFTER pnpm dev

- [ ] Font renders as Geist (not system sans-serif) — check DevTools computed styles
- [ ] Dashboard background: deep zinc `#09090b` (dark) / `#fafafa` (light)
- [ ] Sidebar: slightly different bg `#0c0c0f` (bg-subtle) with subtle border
- [ ] KPI cards: `#18181b` (bg-elevated) with `rgba(255,255,255,0.08)` border
- [ ] Text: white `#fafafa` in dark / near-black `#09090b` in light
- [ ] Delete/danger buttons: red (`#ef4444` dark / `#dc2626` light) — accent-red
- [ ] Positive delta values: green — accent-green
- [ ] ThemeToggle pill in topbar, right of Bell icon
- [ ] Toggle switches theme instantly with smooth pill animation
- [ ] Refresh preserves chosen theme (localStorage 'theme' key)
- [ ] NO hydration warning in console (suppressHydrationWarning working)
- [ ] `pnpm typecheck` passes — no TypeScript errors
- [ ] `pnpm lint` passes — Biome clean

