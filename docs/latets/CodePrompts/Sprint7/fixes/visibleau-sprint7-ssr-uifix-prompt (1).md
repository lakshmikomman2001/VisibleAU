# VisibleAU — Sprint 7 UI Fix: SSR page (D3)
# Page: /brands/[brandId]/technical/ssr  (prototype component: SsrCheck, lines 2907–2961)
# Source: Sprint 7 Gate-2 sub-page validation vs prototype `visibleau-prototype.jsx`.
# Paste FIX 1 + FIX 2 into Claude Code now. FIX 3 needs Sri's structural decision first — do NOT
# implement it until confirmed.

---

> You are fixing the **SSR page** of the Technical Audit
> (`app/(auth)/brands/[brandId]/technical/ssr/...`). Authority: the prototype `SsrCheck`
> (lines 2907–2961). The page is currently titled "SSR & Content Quality" but contains **no SSR
> check** — it shows answer-capsule counts, negative signals, and prompt-injection detections instead.
> Presentation only — no schema/migration/scoring changes.
>
> ### FIX 1 — [HIGH] Add the server-side-rendering check (the page's missing core)
> **Problem:** the prototype's SsrCheck — an SSR status card + a page-by-page rendering table — is
> entirely absent. SSR is part of the Content-quality score shown here (6/12 = "SSR + answer capsule
> pattern"), so it must be present.
> **Fix:** add, near the top of the page (above or below the answer-capsule summary):
> 1. **SSR status card** — a `CheckCircle2` (green) + "SSR healthy" + "All {n} critical pages render
>    content server-side" when all pages pass; if any page fails, use a warning state
>    (`AlertCircle` amber + "{n} pages need review").
> 2. **"Page-by-page check" table** with columns **Page · JS-disabled content · Critical CTAs ·
>    Schema visible · Status**, one row per crawled page, populated from the brand's crawl:
>    - `Page` in mono (e.g. `/ (homepage)`, `/services`, `/about`, `/areas`, `/emergency`, `/reviews`);
>    - `JS-disabled content` as a percentage (e.g. 94%);
>    - `Critical CTAs` = Yes / Partial / No;
>    - `Schema visible` = Yes / No;
>    - `Status` = a `Badge` with a dot — `OK` (success/green) when the page renders well,
>      `Review` (warning/amber) when JS-disabled content is low or CTAs/schema aren't server-side.
> This is what explains the SSR portion of the 6/12 score.
>
> ### FIX 2 — [LOW] Title / subtitle / breadcrumb
> **Fix:**
> - Breadcrumb leaf → **"SSR check"**.
> - Subtitle → **"Many LLM crawlers don't execute JavaScript. We check if your most-important content
>   is visible without JS."** (keep "{n} words across crawled pages · Score: {n}/12" as a secondary
>   line if you like).
> - Title: if Sri keeps this as a combined page (see FIX 3), "SSR & Content Quality" is fine **once
>   the SSR check is actually present**; if it becomes SSR-only, use "Server-side rendering check".
>
> ### FIX 3 — [DO NOT IMPLEMENT YET — needs Sri's structural decision] Dimension separation
> **Problem:** the "Negative Signals" and "Prompt Injection Detections" sections are the **Signals /6**
> dimension ("Negative signals + prompt injection" on the overview), which is *separate* from the
> Content-quality /12 dimension this page is scored against. Showing them under the 6/12 score
> conflates two dimensions. The prototype has no dedicated Signals page, so where this content belongs
> is a design decision.
> **Pending Sri's choice, implement ONE of:**
> - (a) Move Negative Signals + Prompt Injection to a dedicated **Signals** surface that carries the
>   Signals /6 score; this page then shows SSR + answer capsules only (the Content-quality components).
> - (b) Keep them on this page but in a clearly-separated **"Signals (/6)"** section with its own
>   score and heading, visually distinct from the Content-quality 6/12 area, so users don't read the
>   injections as part of the 6/12.
> Do not implement until Sri confirms (a) or (b).
>
> ---
> **Verification (FIX 1 + FIX 2):**
> - The SSR status card and the page-by-page table render, populated from the brand's crawl; at least
>   one page with low JS-disabled content / Partial CTAs shows a "Review" amber badge.
> - Breadcrumb is "SSR check"; the subtitle carries the no-JavaScript framing.
> - Both themes; no console errors; TS strict, no `any`; design tokens only; page tier unchanged.
>
> Report the files changed, confirm FIX 1 + FIX 2, and leave FIX 3 until Sri decides.

---

## Notes for Sri (not part of the paste)
- The headline gap is that **the SSR check is gone** — the prototype's whole D3 page (status + page-by-
  page table) isn't there, even though "SSR" is in the title and SSR feeds the 6/12 score. FIX 1 adds
  it back.
- The negative-signals / prompt-injection content is good and worth keeping — the only question is
  **where** it lives, because it's the Signals /6 dimension, not Content quality /12. That's a
  page-structure call for you (FIX 3, options a/b). Related: the prototype also has a dedicated Answer
  capsules page (D4), so the answer-capsule detail may belong there rather than here — worth deciding
  alongside FIX 3.
- Remaining sub-pages: D4 Answer capsules, D6 Brand & Entity, D7 citability.
