# VisibleAU — Sprint 7 fixes: Signals page  (/brands/[brandId]/signals)
# Prototype: SignalsAudit (v3). Source: Gate-2 Signals-page review. The page PASSED structurally;
# these address: (1) mis-cased pattern labels, (2) a page-specific console "6 Issues" indicator,
# (3) injection rows missing the page. (#4 false-positive detection is a separate detector call — see
# the review notes.) Three standalone pastes below, separated by ─── rulers.

═══════════════════════════════════════════════════════════════════════════════
FIX 1 — UI: pattern label casing (display-name map)
═══════════════════════════════════════════════════════════════════════════════

> On the Signals page (`/brands/[brandId]/signals`, component `signals-detail.tsx` / `SignalsAudit`),
> the negative-signal and prompt-injection **pattern labels** are auto-title-cased from their stored
> slug, which breaks acronyms ("Cta Overload", "Html Comment Injection") and uses Title Case where the
> prototype uses sentence case ("Keyword Stuffing"). Add a **display-name map** (stored pattern →
> human label) and render the mapped label. First grep the actual `pattern` values the detectors emit
> (`lib/negative-signals/detect.ts`, `lib/prompt-injection/detect.ts`) and key the map on those exact
> values. Target labels (prototype casing — sentence case, correct acronyms):
>
> Negative signals: Keyword stuffing · CTA overload · Thin content · Popup density · Missing author ·
>   High boilerplate ratio · Broken outbound links · Ad density
> Prompt injections: Hidden text · Invisible Unicode · LLM-instruction injection · HTML comment injection ·
>   Monochrome text · Micro-font text · Data-attribute injection · aria-hidden abuse
>
> Fallback for any unmapped slug: title-case it, then upper-case known acronyms (CTA, HTML, LLM, SSR, AI,
> JSON, URL). Apply the same map to both lists.
> Verify: rows read "CTA overload" (not "Cta Overload"), "HTML comment injection" (not "Html Comment
> Injection"), "Keyword stuffing" (not "Keyword Stuffing"), "Hidden text", "Thin content"; "Invisible
> Unicode" unchanged. No slug leaks through unmapped.

─────────────────────────────────────────────────────────────────────────────

═══════════════════════════════════════════════════════════════════════════════
FIX 2 — UI: resolve the page-specific "6 Issues" console indicator
═══════════════════════════════════════════════════════════════════════════════

> The Signals page shows a red "6 Issues" indicator (bottom-left) that the overview and SSR pages do
> not — i.e. the Next.js dev error/warning overlay is surfacing ~6 console issues specific to this
> page. Open `/brands/[brandId]/signals` with the browser console open, enumerate all of them, and fix
> each. Most likely cause: **React `key` warnings** on the `.map` over `negativeSignals` and
> `promptInjections` — several rows share the same `pattern`, so a `pattern`-based or unstable key
> collides. Give each row a **stable unique key** (a row id if the data has one; otherwise a composite
> like `${pattern}-${page}-${index}`) for BOTH lists. Also resolve any other warnings shown (hydration
> mismatch, missing `alt`, invalid DOM nesting, etc.).
> Verify: the page loads with **0 issues** in the dev overlay and a clean console; both lists still
> render every row correctly; no duplicate-key warnings.

─────────────────────────────────────────────────────────────────────────────

═══════════════════════════════════════════════════════════════════════════════
FIX 3 — backend: include the page in each prompt-injection `detail`
═══════════════════════════════════════════════════════════════════════════════

> Negative-signal `detail` strings name the page they were found on ("… on /plumber-bondi"), but
> prompt-injection `detail` strings don't — so with many detections the injection rows are
> indistinguishable (e.g. two identical "HTML comment injection" rows). In the prompt-injection
> detector (`lib/prompt-injection/detect.ts`, emitted via the `score-signals` step), add the page path
> to each injection's `detail`, mirroring the negative-signal templates. Examples:
>   Hidden text → "Off-screen text hidden via CSS on {path} — may contain instructions targeting AI assistants."
>   HTML comment injection → "LLM-directed instruction in an HTML comment on {path} — invisible to users, readable by AI crawlers."
>   Invisible Unicode → "Zero-width characters in page content on {path} — often used to smuggle hidden instructions."
> Keep the `element` mono block unchanged. This is additive to the `detail` string only — no schema
> change, and `detail` does not feed `scoreSignals`/`scoreComposite`/the rollup (scores must stay
> identical on an unchanged site).
> Verify: every injection row's detail names the page it was found on; injections on different pages are
> now distinguishable; `scoreSignals` and the composite/rollup are unchanged.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- FIX 1 + FIX 2 are UI (the Signals page component); FIX 3 is the prompt-injection detector. FIX 1 and
  FIX 3 both touch the signal/injection display, so it's worth confirming the slug values once and
  reusing them across both.
- **#4 — false-positive hidden-text detections** (benign form status messages flagged Hidden Text /
  CRITICAL) is NOT in this file because it needs a domain decision: which hidden patterns to exclude
  (form success/error divs, `aria-hidden` tab/modal panels, JS-toggled content) and what should still
  qualify as CRITICAL (hidden text containing instruction-like phrasing). If you want it, I'll write a
  detector-tightening prompt for `lib/prompt-injection/detect.ts` on that basis.
- The data-source question (`findings.content.*` vs `findings.signals.*`) is resolved — the page
  renders 7 signals + 22 injections, so the fetch is reading the populated arrays. If you want the
  canon (EB5 type) reconciled to whichever key the build actually used, that's a small doc cleanup;
  tell me which key it reads and I'll align the addendum.
