# VisibleAU — Sprint 7 UI Fix: llms.txt page (D1)
# Page: /brands/[brandId]/technical/llms-txt  (prototype component: LlmsTxtGenerator, lines 2765–2849)
# Source: Sprint 7 Gate-2 sub-page validation vs prototype `visibleau-prototype.jsx`.
# Paste everything below the line into a fresh Claude Code session on the VisibleAU repo.

---

> You are fixing the **llms.txt page** of the Technical Audit
> (`app/(auth)/brands/[brandId]/technical/llms-txt/...`). Authority: the prototype `LlmsTxtGenerator`
> (lines 2765–2849). The built page is currently **audit-only** (just a "Depth Scoring (6 components)"
> card); the prototype is a **generator** — audit **+ generate + deploy**. The 6 depth components and
> the 9/18 scoring are correct — **do not change the scoring**. These fixes restore the missing
> sections and fix the 0-score colour. Presentation only — no schema/migration/scoring changes.
>
> **If any section below is already present (e.g. below the fold), skip that fix.** The validation was
> from a screenshot that appeared to end after the Depth Scoring card.
>
> Target layout (match the prototype):
> 1. Header — title + subtitle (+ keep the 18-point score in the header)
> 2. 2-column grid: **Current state** card | **Why this matters** card
> 3. **Generated llms.txt (preview)** card (Copy + Download)
> 4. **Deployment instructions** card
>
> ### FIX 1 — [HIGH] Add the "Generated llms.txt (preview)" card with Copy + Download
> **Problem:** the page never generates an llms.txt — the core actionable output is absent. (The
> robots.txt page already has its equivalent generated-snippet card; mirror that pattern.)
> **Fix:** add a card titled **"Generated llms.txt (preview)"** with a header row containing **Copy**
> and **Download** buttons, and a `var(--font-mono)` `<pre>` rendering a structured llms.txt
> *generated from the brand's actual data* (name, domain, service pages, FAQs). Follow the prototype's
> structure exactly:
> ```
> # <Brand Name>
> > <one-line description of the business>
> > <second line: key services / coverage>
>
> ## About
> - [About us](<canonical /about URL>): <short fact, e.g. founded year, licence #>
> - [Service areas](<URL>): <suburbs/regions>
> - [Reviews](<URL>): <rating + sources>
>
> ## Services
> - [<Service 1>](<URL>): <short desc>
> - [<Service 2>](<URL>): <short desc>
> - [<Service 3>](<URL>): <short desc>
>
> ## FAQs
> - [<Question 1>](<URL>#anchor)
> - [<Question 2>](<URL>#anchor)
> - [<Question 3>](<URL>#anchor)
>
> ## Optional
> - [Blog](<URL>): <short desc>
> ```
> Copy must put the full generated text on the clipboard; Download must save it as `llms.txt`.
>
> ### FIX 2 — [MOD] Add the "Deployment instructions" card
> **Fix:** a card titled **"Deployment instructions"** with a 4-step ordered list (match the
> prototype):
> 1. Download the generated llms.txt
> 2. Upload to your website root: `/llms.txt`
> 3. Verify accessible at `https://<domain>/llms.txt`
> 4. We'll automatically re-check on your next audit
> (Render `/llms.txt` and the URL as inline `code` on `var(--bg-subtle)`.)
>
> ### FIX 3 — [MOD] Add the discovery-endpoint checks to the Current state card
> **Problem:** the prototype's Current state card lists 4 discovery/bonus checks below the 6 depth
> components; the build omits them.
> **Fix:** below the 6 depth components, add a divider (`var(--border-subtle)`), then 4 rows:
> - `Sitemap.xml present` → green `Yes · bonus` when present
> - `.well-known/ai.txt` → amber `Not found` when absent
> - `/ai/summary.json` → amber `Not found` when absent
> - `/ai/faq.json` → amber `Not found` when absent
> (Colours: present/bonus = `var(--accent-green)`, not-found = `var(--accent-amber)`. These are
> bonus/discovery signals — they are NOT part of the /18 depth score; keep the score as-is.)
>
> ### FIX 4 — [MOD] Failing (0/3) depth components must render red, not grey
> **Problem:** the three failing components (≥5 internal links, ≥1500 chars depth, llms-full.txt
> companion) show a **grey** "0/3" and a grey ✗. The prototype renders failing components in **red**
> ("No · 0/3"), and this matches the 0-score = danger convention already applied on the overview page.
> **Fix:** when a component scores 0/3 (failing), render both the ✗ icon and the "0/3" in
> `var(--accent-red)`. Passing (3/3) stays green. (Add an `aria-label` like "≥5 internal links:
> failing, 0 of 3" so severity isn't colour-only.)
>
> ### FIX 5 — [LOW] Add the "Why this matters" card
> **Fix:** the second column of the grid — a card titled **"Why this matters"** with the prototype's
> copy: "llms.txt is an emerging standard (think robots.txt for LLMs). Anthropic, Perplexity, and
> others are starting to honour it. A well-structured llms.txt boosts the chance your most-citable
> pages are found and used in answers."
>
> ### FIX 6 — [LOW] Add the depth-tier badge + align the title/breadcrumb
> **Fix:** in the Current state card header, show the graduated **depth-tier badge** (e.g.
> `Foundation`, warning/amber tone) alongside a `depth score {n}/18 · graduated` mono sub-label, per
> the prototype. Align the page **title → "llms.txt generator"**, the **subtitle → "Generate a
> structured llms.txt for <domain>. Helps LLM crawlers find your most-citable content."**, and the
> **breadcrumb leaf → "llms.txt generator"**. (If Sri intends this page to stay framed as an "Audit",
> keep that title — but the generate/deploy sections above are still required.)
>
> ---
> **Verification (run before reporting done):**
> - All four sections render: Current state (6 components + 4 discovery checks + tier badge) + Why this
>   matters; Generated llms.txt preview (Copy/Download); Deployment instructions.
> - The generated preview uses the brand's real pages/FAQs (not hardcoded Bondi Plumbing), has `#`,
>   `>`, and `## About / ## Services / ## FAQs / ## Optional` sections with markdown links; Copy and
>   Download emit the full file.
> - Failing depth components (0/3) are red with an aria-label; passing (3/3) green; discovery checks
>   green/amber as specified; the score header still shows {n}/18 and reconciles to the components.
> - Both themes; no console errors; TS strict, no `any`; design tokens only; page tier unchanged.
>
> Report the files changed and confirm each fix + the verification.

---

## Notes for Sri (not part of the paste)
- The depth scoring itself is correct — the gap is that the page was built as audit-only and dropped
  the prototype's generator, deploy steps, discovery checks, and explainer. FIX 1 (the generated
  llms.txt) is the one that matters most — it's the actionable output, and it's the same pattern your
  robots.txt page already has.
- FIX 4 (0/3 → red) is the same severity convention you applied on the overview page, now needed here.
- Please confirm whether those sections were truly absent or just below the fold in the screenshot —
  if any were present, skip the matching fix.
- Remaining sub-pages after this: D2 Schema auditor, D3 SSR, D4 Answer capsules, D6 Brand & Entity,
  D7 citability.
