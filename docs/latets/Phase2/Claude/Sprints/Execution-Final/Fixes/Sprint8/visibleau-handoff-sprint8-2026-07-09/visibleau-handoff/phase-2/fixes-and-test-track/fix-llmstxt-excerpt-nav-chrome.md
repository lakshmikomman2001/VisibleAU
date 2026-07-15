# Claude Code — FIX [HIGH]: llms.txt (+ content scoring) excerpt extracts NAV CHROME, not page content

The GTM-iframe fix worked (no more `<iframe googletagmanager>`). But regenerating REVEALED a second bug hiding under it:
every page's description is now IDENTICAL nav/header chrome — "No Extra Charge After Hours Skip to content Plumbing
Electrical Air Conditioning Home About Us Blog" — the site's promo banner + skip-link + nav menu, NOT the page's actual
content. Every page (Blocked Drains, Gas Fitting, About Us…) shows the SAME text — the signature of extracting shared
template chrome instead of unique page content. The `excerpt` grabs "first N chars of body text," which on this site
(DOM order: banner → skip-link → nav → content) is the chrome. FIX: extract the excerpt from the actual CONTENT region
(main/article), not the page chrome.

⚠️ SAME SHARED extractContent as the iframe fix (lib/crawler/index.ts) → SAME Phase 1 blast radius. content-structure-
audit + entity-home-auditor also use this excerpt/content — so citation_probability + answer_capsule scoring may be
computing on NAV CHROME too. Fixing this improves llms.txt AND the accuracy of content-structure/entity-home scoring.
Re-verify those consumers after.

Env: Windows repo `C:\startup\VisibleAU\src\`. App on LOCAL PROD `visibleau_prod`. Never real prod. Brand: Metropolitan
418f321f-2489-4560-aaa9-895728580465.

## STEP 1 — Diagnose the extraction: where does `excerpt`/content come from?
```bash
grep -n "excerpt\|textContent\|\.text()\|main\|article\|body\|slice\|first\|content" lib/crawler/index.ts
sed -n '1,60p' lib/crawler/index.ts   # the fetchPage/extractContent region + the current strip selector
```
Report: (a) how `excerpt` is currently built (first-N-chars of what? body text after stripping script/style/nav/…?);
(b) the current cheerio strip selector; (c) why the nav/banner survives (the site's nav isn't semantic `<nav>`, OR the
skip-link + promo banner are outside the stripped tags, OR excerpt is taken from `<body>` before the content region).

## STEP 2 — Fix the extraction to pull CONTENT, not chrome (in priority order)
Apply the strongest available, in order:
1. **Extract from the content region FIRST:** prefer `<main>`, then `<article>`, then the largest text block / a content
   container — take the excerpt from THERE, not from the whole `<body>`. If `<main>`/`<article>` exists, the nav/banner
   are outside it → excerpt is real content.
2. **Strip more chrome:** extend the removal selector beyond `nav, header, footer, aside` to also drop:
   - skip-links (`a[href="#content"]`, `a[href^="#"]` with "skip" text, `.skip-link`, `.sr-only` skip links)
   - common nav/banner containers by class/role: `[role="navigation"]`, `[role="banner"]`, `.nav`, `.navbar`, `.menu`,
     `.header`, `.top-bar`, `.announcement`, `.promo`, `.banner` (be reasonably conservative — don't strip content).
3. **Prefer the meta description when present:** many pages have `<meta name="description">` or og:description — a clean,
   per-page summary that's FAR better than body-text-slicing. If present, use it for the llms.txt description (and as a
   content signal). Fall back to the content-region text only if no meta description.
Combine: meta description if present → else `<main>`/`<article>` text → else stripped body text. The excerpt must be
PER-PAGE distinct (that's the test — see STEP 4).

## STEP 3 — Re-verify the SHARED consumers (blast radius)
Since this is the shared extractContent/excerpt:
- **content-structure-audit:** citation_probability + answer_capsule now compute on real content, not nav chrome — this
  should IMPROVE accuracy. Re-run for Metropolitan; confirm the scores are still sane (they may CHANGE — that's the point,
  they were computing on chrome before). Report any large shifts.
- **entity-home-auditor:** @id/sameAs detection reads schema (not excerpt) so likely unaffected — confirm it still
  detects the entity home.
Report the consumers still work + note any score changes (improvements expected).

## STEP 4 — Regenerate llms.txt + verify PER-PAGE distinct descriptions on screen
```bash
# Regenerate llms.txt for Metropolitan (Generate New / the generator fn), then reload /retrieval/llmstxt
```
- Each page's description is now **DISTINCT and relevant** — Blocked Drains describes blocked drains, Gas Fitting
  describes gas fitting — NOT the identical "Skip to content... Home About Us Blog" chrome on every line.
- NO nav/banner/skip-link text as the description.
- Still no `<iframe>`/markup (the prior fix holds).
- The `## Generated` footer + version history intact.
Report: the descriptions are per-page distinct + relevant (paste 3-4 example lines showing they DIFFER).

## STEP 5 — Report + test
- STEP 1: how excerpt was built + why chrome leaked.
- STEP 2: the fix (content-region extraction / meta description / extended strip) + which strategy applied.
- STEP 3: shared consumers re-verified; any citation/capsule score changes noted (improvements expected).
- STEP 4: per-page distinct descriptions on screen.
- Add a test: **the llms.txt descriptions are NOT all identical** (assert ≥2 pages have DIFFERENT description text — the
  chrome signature is identical-across-pages) AND no nav-chrome markers ("Skip to content", "Home About Us Blog") appear
  as a description. Re-break: point excerpt back at raw body text → the descriptions become identical chrome → the
  "distinct descriptions" assertion FAILS. (This guards the chrome-extraction class the iframe test didn't cover.)

## Constraints
- HIGH — same class + severity as the iframe bug (extraction pulling non-content); the llms.txt description must describe
  the PAGE, not the site chrome. And the shared-extractContent blast radius means content scoring benefits too.
- Prefer meta description → `<main>`/`<article>` content region → stripped body text. The excerpt MUST be per-page
  distinct.
- SHARED code (lib/crawler) — re-verify content-structure-audit + entity-home after (scores may improve/shift; confirm
  sane).
- The guard test asserts descriptions are NOT identical across pages (the chrome signature) — re-break to the raw body →
  fails.
- Regenerate + verify per-page distinct on screen. Local prod, never real prod. LLD v8.70 / §6.4 win.

## NOTE
The iframe fix revealed a second extraction bug hiding under it: the llms.txt `excerpt` pulls NAV CHROME (promo banner +
"Skip to content" skip-link + "Home About Us Blog" menu) instead of page content — every page shows the IDENTICAL
description (the signature of extracting shared template chrome). Same shared extractContent (lib/crawler) as the iframe
fix → same Phase 1 blast radius, so content-structure citation/capsule scoring is ALSO computing on chrome (fixing this
improves it). Fix: extract the excerpt from the CONTENT region (prefer meta description → `<main>`/`<article>` → stripped
body), extending the strip to skip-links/nav/banner containers. Re-verify the shared consumers (scores may improve).
Regenerate + confirm per-page DISTINCT descriptions on screen. Add a test asserting descriptions aren't identical across
pages (+ no "Skip to content"/nav-menu text) with re-break — the guard for the chrome-extraction class the iframe test
didn't cover.
