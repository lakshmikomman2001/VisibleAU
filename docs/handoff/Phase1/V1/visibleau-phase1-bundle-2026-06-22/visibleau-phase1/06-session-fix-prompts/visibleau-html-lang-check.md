# VisibleAU — Verify root <html lang> is English (browser offered French translation) — Claude Code
# Symptom: the browser popped "Translate page from French?" on /agency/client-portals. The app is
#   English-only. This usually means the page's <html lang="..."> is set to 'fr' (or a wrong value), or
#   stray non-English content is confusing the browser's language detector. Could also be a browser
#   false-positive on a sparse page — but worth ruling out a real lang misconfig (it affects screen
#   readers + SEO, not just the popup).
# Scope: verify (and fix only if wrong) the root html lang attribute + any locale config. Tiny.
# str_replace/exact-literal only.

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — Check the root <html lang> attribute
═══════════════════════════════════════════════════════════════════════════════
> 1. Find the root layout (`app/layout.tsx` in Next.js App Router) and read its `<html lang="...">`.
>    - Correct: `lang="en"` or `lang="en-AU"`.
>    - BUG if it's `lang="fr"`, a wrong locale, a dynamic value resolving wrong, or missing entirely.
> 2. Grep for any other `<html` tags or `lang=` attributes (nested layouts, a custom _document, etc.)
>    that might override it: `grep -rn 'lang=' app/ --include="*.tsx"`.
> 3. Check for any i18n/locale config (next-intl, next-i18next, a middleware locale, an env LOCALE) that
>    could be setting a non-English locale or a French default. The app is English-only (no i18n
>    expected) — if some locale scaffolding defaults to 'fr', that's the cause.
> **Report:** the current `<html lang>` value, any overrides found, and whether any locale config sets a
> non-English default.

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Fix only if wrong
═══════════════════════════════════════════════════════════════════════════════
> - If `<html lang>` is `fr`/wrong/missing → set it to **`en-AU`** (AU-first product) in the root layout.
> - If a locale config defaults to a non-English locale → set the default to English (en-AU).
> - If `<html lang>` is ALREADY `en`/`en-AU` and no override sets French → then the browser popup is just
>   a FALSE-POSITIVE (translate detectors misfire on sparse/near-empty pages like the empty Client
>   Portals list). In that case make NO change — just report that lang is correct and the popup is a
>   browser quirk, not an app bug.
> Do NOT add i18n scaffolding — this is English-only; the fix (if any) is just the correct lang value.

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — Quick scan for stray non-English content (only if lang was correct)
═══════════════════════════════════════════════════════════════════════════════
> If lang was already correct but you want to be thorough: quickly check the Client Portals page +
> shared layout/nav for any stray non-English (French) strings that could trip the detector (a stray
> placeholder, a copied snippet). Likely none — but a 10-second look. Report if anything found.

═══════════════════════════════════════════════════════════════════════════════
STEP 4 — Verify
═══════════════════════════════════════════════════════════════════════════════
> - `<html lang>` renders as `en-AU` (inspect the served HTML / view-source on any page).
> - `npm run typecheck` passes (if any file changed).
> Report: the final lang value and whether a fix was needed or it was a browser false-positive.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **Most likely a browser false-positive** — Chrome/Edge translate detectors misfire on sparse pages
  (the Client Portals page is mostly an empty "No invites yet" state, little text for the detector to
  judge). If `<html lang>` is already `en`/`en-AU`, there's nothing to fix.
- **But worth ruling out a real misconfig** — if the root layout somehow has `lang="fr"` or a wrong
  value, that's a genuine (if small) accessibility + SEO bug: screen readers would announce the page in
  the wrong language, and search engines would mis-tag it. The fix is one attribute → `en-AU`.
- English-only product (per your setup, Telugu off) → the fix is just the correct lang value, NOT adding
  any i18n/translation scaffolding.
- Lowest-priority item on the list — but since the browser flagged it, a 10-second check rules out the
  one real failure mode.
