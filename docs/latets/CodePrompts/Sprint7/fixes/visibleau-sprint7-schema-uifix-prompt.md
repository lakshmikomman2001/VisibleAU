# VisibleAU — Sprint 7 UI Fix: Schema auditor page (D2)
# Page: /brands/[brandId]/technical/schema  (prototype component: SchemaAuditor, lines 2850–2906)
# Source: Sprint 7 Gate-2 sub-page validation vs prototype `visibleau-prototype.jsx`.
# NOTE: validated against a 0-schema brand (empty state). FIX 3 covers the populated state, which
# the screenshots could not exercise.
# Paste everything below the line into a fresh Claude Code session on the VisibleAU repo.

---

> You are fixing the **Schema auditor page** of the Technical Audit
> (`app/(auth)/brands/[brandId]/technical/schema/...`). Authority: the prototype `SchemaAuditor`
> (lines 2850–2906) and Sprint 7 §-schema scoring. The page was validated on a brand with **0 schema
> markup** (empty state). The "Reality Check — Impact by Engine" and "Missing Schema Types" sections
> are good — **keep them.** Presentation only — no schema/migration/scoring changes.
>
> ### FIX 1 — [MOD] 0-score and "Missing" schemas must render red (danger), not grey
> **Where:** the score header ("0/16") and the "Schema Types (… scored)" rows.
> **Problem:** the "0/16" renders white and each missing type shows a **grey** ✗ and grey "Missing".
> A 0/16 schema score is the worst case and a missing required schema is a danger-level finding, but
> they read as neutral. (Only the amber "Missing Schema Types" pills carry any colour.) This is the
> same 0-score = danger convention already applied on the overview and llms.txt pages, and the D2
> validation checklist requires it.
> **Fix:**
> - render the "0/16" score in `var(--accent-red)` when the schema score is 0 (and generally colour
>   the score by band — red for the lowest band — consistent with the other pages);
> - each **Missing** row's ✗ icon and "Missing" label render in `var(--accent-red)`;
> - add an `aria-label` (e.g. "Organization schema: missing") so severity isn't colour-only.
> (Passing/found schemas use green; partial use amber — see FIX 3's status scale.)
>
> ### FIX 2 — [LOW] Align the title / subtitle / breadcrumb to the prototype
> **Fix:**
> - Title → **"Schema markup audit"** (sentence case)
> - Breadcrumb leaf → **"Schema audit"**
> - Subtitle → **"Found and validated against schema.org. Reality-checked against your actual website
>   content."** (You may keep the "{n} schema types found · Score: {n}/16" as a secondary line, but the
>   primary subtitle should carry the prototype's framing — it signals the hallucination detection.)
>
> ### FIX 3 — [VERIFY → BUILD IF ABSENT] Populated-state: per-schema validation + hallucination detection + KPI row
> **Context:** the test brand has 0 schemas, so the populated state was not visible. The prototype's
> core value is in the populated state. **Verify the page renders the following when schemas ARE
> found; if any is missing, build it to match the prototype.**
> 1. **5 KPI stat cards** at the top (a `grid-cols-5` of Cards, each an uppercase label + a tone
>    Badge): **Total schemas** (neutral) · **Valid** (success) · **Warnings** (warning) ·
>    **Hallucinated** (danger) · **Schema richness** (e.g. "39/64", warning). These should render even
>    at 0 (all zeros), so the empty state shows "Hallucinated 0", etc.
> 2. **Per-schema cards** — one Card per found schema, each with:
>    - a status **Badge**: `valid` → success/green, `warning` → amber, `danger` → red;
>    - the schema **type** name + a mono sub-label `richness {n}/16 · {n} attrs`;
>    - a **View source** ghost button (ExternalLink);
>    - a **detail** line for clean schemas (e.g. "Name, address, phone all match website. NAP
>      consistent. 9 attributes populated (above 5+ threshold).");
>    - an **issues** list for warning/danger schemas, each row an `AlertCircle` (red if danger, amber
>      if warning) + the issue text.
> 3. **Hallucination detection (critical):** a schema whose claims contradict the live site must be
>    `danger` (red) with an explanation — e.g. "Schema claims 4.9★ across 200 reviews — actual hipages
>    page shows 4.7★ across 87 reviews" or "FAQPage includes a 'Do you offer 24/7 service?' Q&A but the
>    FAQ page has no such question → risk: LLM hallucination of service hours". This schema-vs-site
>    reality check is the page's primary value and must be present.
>
> ---
> **Verification (run before reporting done):**
> - 0-schema brand: the "0/16" and every "Missing" row are red with aria-labels; the KPI row shows
>   (zeros); the Reality-Check-by-Engine and Missing-pills sections still render.
> - A brand **with** schema markup: KPI counts populate; each schema shows status/richness/attrs;
>   warning/danger schemas list issues; a schema that contradicts the site renders `danger` red with
>   the contradiction spelled out (hallucination detection).
> - Both themes; no console errors; TS strict, no `any`; design tokens only; page tier unchanged.
>
> Report the files changed, confirm FIX 1 + FIX 2, and state whether FIX 3's populated-state elements
> already existed or were added.

---

## Notes for Sri (not part of the paste)
- The page's empty state is mostly fine (Reality-Check-by-Engine and Missing-pills are good additions).
  The one definite UI bug is the grey 0-score/Missing — FIX 1, the recurring danger-colour convention.
- FIX 3 is a **verify** more than a fix: I couldn't see the populated state because Bondi has no
  schema. If the build already renders per-schema cards + hallucination detection + the KPI row when
  schemas exist, FIX 3 is a no-op — but it's the most important part of this page, so it's worth
  confirming with a schema'd brand.
- Remaining sub-pages after this: D3 SSR, D4 Answer capsules, D6 Brand & Entity, D7 citability.
