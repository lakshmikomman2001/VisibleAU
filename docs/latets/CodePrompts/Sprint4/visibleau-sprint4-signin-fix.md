# VisibleAU Sprint 4 — Sign-In Page Fix
# Fixes the sign-in page to match visibleau-prototype-v2.59.jsx AuthLayout + SignIn
# Prototype reference lines: AuthLayout 636–682, SignIn 684–700

---

## GAP SUMMARY

Your screen vs prototype:

| Element | Your screen | Prototype |
|---------|------------|-----------|
| Layout | Single centred column, plain black bg | Two-column split: left marketing panel + right form |
| Left panel | ❌ Missing entirely | Grid-bg pattern, Logo, blue badge, headline, 4 feature bullets, ThemeToggle |
| Right panel | Form centred on screen | Form on the right half, max-w-sm, fade-in-up animation |
| Page title | "Sign in to VisibleAU" | "Welcome back" (h1, text-2xl) |
| Subtitle | ❌ Missing | "Sign in to continue to your workspace." (text-[13px] text-secondary) |
| Error box | White bg + red text | Should use var(--danger-soft) bg + var(--danger) text |
| Input fields | Plain black bg, large border | bg-base, border-default, h-9, shadow-soft, label text-secondary |
| Sign in button | Plain text, no styling | var(--accent-primary) bg, var(--accent-primary-fg) text, h-10, LogIn icon |
| Footer link | Plain text | text-[13px] text-tertiary, "Sign up" in text-primary font-medium |

---

## FULL REPLACEMENT — app/sign-in/[[...sign-in]]/page.tsx

Replace the entire file with this:

```tsx
'use client';
import { useState, Fragment } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from '@/lib/auth/client';
import { LogIn, Check } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/shared/theme-toggle';

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/dashboard';

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn.email({ email, password, callbackURL: redirectTo });

    if (result.error) {
      setError(result.error.message ?? 'Sign in failed');
      setLoading(false);
    } else {
      router.push(redirectTo);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-base)' }}>

      {/* ── LEFT PANEL — marketing ──────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 40,
        position: 'relative',
        overflow: 'hidden',
        borderRight: '1px solid var(--border-subtle)',
      }}>
        {/* Grid background pattern */}
        <div
          className="grid-bg"
          style={{
            position: 'absolute', inset: 0,
            opacity: 0.4, pointerEvents: 'none',
          }}
        />

        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1, alignSelf: 'flex-start' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <LogoMark />
          </Link>
        </div>

        {/* Headline + feature bullets */}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 400 }}>
          {/* Blue badge */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '2px 8px', borderRadius: 9999,
            fontSize: 11, fontWeight: 500,
            background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--accent-blue)',
              animation: 'pulse-soft 2.4s ease-in-out infinite',
            }} />
            Sydney · ap-southeast-2
          </span>

          <h2 style={{
            marginTop: 20,
            fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.25,
            color: 'var(--text-primary)',
          }}>
            The first GEO platform built for the Australian market.
          </h2>

          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              'AU-first vertical content & compliance',
              'Suburb-level tracking, not just metro',
              'Flat agency tiers — no per-brand surprises',
              'Research-backed Action Center',
            ].map((text, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                fontSize: 13, color: 'var(--text-secondary)',
              }}>
                <Check style={{ width: 16, height: 16, color: 'var(--accent-blue)', flexShrink: 0 }} />
                {text}
              </div>
            ))}
          </div>
        </div>

        {/* ThemeToggle at bottom-left */}
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <ThemeToggle />
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Theme</span>
        </div>
      </div>

      {/* ── RIGHT PANEL — form ──────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 40,
      }}>
        <div
          className="anim-fade-in-up"
          style={{ width: '100%', maxWidth: 360 }}
        >
          {/* Title + subtitle */}
          <h1 style={{
            fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em',
            color: 'var(--text-primary)', margin: 0,
          }}>
            Welcome back
          </h1>
          <p style={{
            marginTop: 6, fontSize: 13, color: 'var(--text-secondary)',
          }}>
            Sign in to continue to your workspace.
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Error message */}
            {error && (
              <div style={{
                padding: '10px 12px', borderRadius: 6, fontSize: 13,
                background: 'var(--danger-soft)', color: 'var(--danger)',
              }}>
                {error}
              </div>
            )}

            {/* Email field */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@agency.com.au"
                required
                style={{
                  height: 36, borderRadius: 6, fontSize: 14,
                  padding: '0 12px', outline: 'none',
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  boxShadow: 'var(--shadow-soft)',
                }}
              />
            </div>

            {/* Password field */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  height: 36, borderRadius: 6, fontSize: 14,
                  padding: '0 12px', outline: 'none',
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  boxShadow: 'var(--shadow-soft)',
                }}
              />
            </div>

            {/* Sign in button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 8,
                height: 40, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                fontSize: 14, fontWeight: 500,
                background: 'var(--accent-primary)',
                color: 'var(--accent-primary-fg)',
                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
                width: '100%',
              }}
            >
              <LogIn style={{ width: 14, height: 14 }} />
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Footer link */}
          <div style={{
            marginTop: 24, textAlign: 'center',
            fontSize: 13, color: 'var(--text-tertiary)',
          }}>
            Don't have an account?{' '}
            <Link
              href="/sign-up"
              style={{ fontWeight: 500, color: 'var(--text-primary)', textDecoration: 'none' }}
            >
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Logo mark component ──────────────────────────────────────────────
// Matches prototype Logo component lines 274–292
function LogoMark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* V-mark square */}
      <div style={{
        width: 28, height: 28,
        background: 'var(--accent-primary)',
        color: 'var(--accent-primary-fg)',
        borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14,
          position: 'relative', zIndex: 1,
        }}>V</span>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.15), transparent 50%)',
        }} />
      </div>
      {/* Wordmark */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <span style={{
          fontWeight: 600, fontSize: 16, letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
        }}>visible</span>
        <span style={{
          fontWeight: 600, fontSize: 16, letterSpacing: '-0.02em',
          color: 'var(--text-tertiary)',
        }}>au</span>
      </div>
    </div>
  );
}
```

---

## SAME LAYOUT APPLIES TO SIGN-UP PAGE

The sign-up page (`app/sign-up/[[...sign-up]]/page.tsx`) uses the same
two-column AuthLayout. Apply the identical left panel and replace the right
panel with the sign-up form fields.

Sign-up form differences from sign-in:
- Title: "Create your account" (h1)
- Subtitle: "Start tracking AI visibility for your agency."
- Fields: Full name → Agency name → Email → Password (min 8 chars)
- Button: UserPlus icon + "Create account" text
- Footer: "Already have an account?" → Link to /sign-in

---

## VERIFY AFTER pnpm dev

- [ ] Sign-in page is two-column split (50% / 50%)
- [ ] Left panel: grid-bg pattern at 40% opacity behind content
- [ ] Left panel: Logo V-mark (28px) + "visible·au" wordmark at top-left
- [ ] Left panel: pulsing blue "Sydney · ap-southeast-2" badge
- [ ] Left panel: "The first GEO platform..." h2 in text-3xl
- [ ] Left panel: 4 feature bullets with blue Check icons
- [ ] Left panel: ThemeToggle pill + "Theme" label at bottom-left
- [ ] Right panel: "Welcome back" h1 (not "Sign in to VisibleAU")
- [ ] Right panel: subtitle "Sign in to continue to your workspace."
- [ ] Right panel: error uses var(--danger-soft) bg + var(--danger) text (not white+red)
- [ ] Right panel: inputs use var(--bg-base), border-default, h-9 (36px)
- [ ] Right panel: Sign in button uses var(--accent-primary) bg + LogIn icon
- [ ] Right panel: footer "Don't have an account?" in text-tertiary + "Sign up" in text-primary
- [ ] anim-fade-in-up animation plays on the form panel on page load
- [ ] Page works at both dark and light theme (ThemeToggle on left panel)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes

