# VisibleAU — Fix PDF builder LAYOUT (columns collapsed to a narrow strip) — Claude Code prompt
# Status: the P0-P3 content fix WORKED — the Branding panel, Sections checklist, Generate PDF button,
#   preview, and real-data ("No open action items" honest copy) are all present and correct.
# Bug: PURELY LAYOUT/CSS. The two-column builder is crushed into a ~150px-wide left strip — every
#   label wraps vertically ("Brand"/"Branding"/"Agency name" stacked, preview squished to a sliver) —
#   and ~70% of the screen is empty black. The grid isn't filling the page width.
# Pins: prototype WhiteLabelReport (proto L3744-3753): container `max-w-6xl mx-auto px-6 py-8`, grid
#   `grid grid-cols-12 gap-4`, left `col-span-4`, right `col-span-8`. NO content/data changes — layout only.
# str_replace/exact-literal only.

═══════════════════════════════════════════════════════════════════════════════
ROOT CAUSE
═══════════════════════════════════════════════════════════════════════════════
The page's two columns have collapsed to their MINIMUM content width instead of expanding to fill the
container. Symptoms: text wraps one-word-per-line, the A4 preview is a thin vertical sliver, huge empty
space to the right. This means either (a) the outer container has no width / isn't centered, (b) the
grid isn't `grid-cols-12` with proper `col-span-*`, or (c) the columns lack a width and are shrinking
to content. The prototype uses a fixed pattern that works — match it exactly.

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — Match the prototype's container + grid (the fix)
═══════════════════════════════════════════════════════════════════════════════
> In the PDF builder page/component (`app/(auth)/agency/reports/pdf-builder/page.tsx` or its view),
> make the layout match the prototype's `WhiteLabelReport` structure EXACTLY:
> 1. **Outer container:** a centered, width-constrained wrapper:
>    `<div className="max-w-6xl mx-auto px-6 py-8">` … `</div>`
>    (This gives the page a real width and centers it — without it, the grid has no width to divide.)
> 2. **The grid:** `<div className="grid grid-cols-12 gap-4">` wrapping the two columns.
> 3. **Left column (Branding + Sections + Generate PDF):** `<div className="col-span-4">` containing
>    the existing Card.
> 4. **Right column (A4 preview):** `<div className="col-span-8">` containing the existing preview Card.
> The content INSIDE each column is already correct — do NOT change the Branding inputs, the Sections
> checklist, the Generate PDF button, the preview, or any data wiring. ONLY fix the wrapping
> container/grid/column structure so the columns expand to 4/12 and 8/12 of the page width.
> - If the current code uses flthis or a different grid utility that isn't expanding, replace it with
>   the `grid-cols-12` + `col-span-4`/`col-span-8` pattern above.
> - Ensure the columns have proper width (the `col-span-*` classes provide it under `grid-cols-12`);
>   the children should NOT be `w-fit`/`inline`/`max-w-min` or anything that shrinks them to content.

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Verify the layout
═══════════════════════════════════════════════════════════════════════════════
> Load `/agency/reports/pdf-builder` (agency-tier user). Confirm:
> - The page fills the content width (centered, ~max-w-6xl) — NO large empty black area on the right.
> - **Left column (~1/3 width):** "Branding" Card with Agency name / Logo URL / Primary colour / Footer
>   contact inputs on their own lines (labels NOT wrapping one-word-per-line), the "Sections to include"
>   checklist, and the "Generate PDF" button — all readable at normal width.
> - **Right column (~2/3 width):** the A4 preview rendered at a sensible width (not a thin sliver),
>   showing "Prepared for: Bondi Plumbing", the composite score, etc.
> - Both light/dark themes; no horizontal scroll; `npm run typecheck` passes.
> - Nothing about the DATA changed (Bondi still shows its real score; Sections defaults unchanged;
>   Generate PDF still works).
> Report: a screenshot/description of the corrected two-column layout filling the page.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **This is cosmetic, not functional** — the P0-P3 fix actually worked: all the right elements + real
  data are there. The columns just collapsed because the grid/container wasn't expanding to page width.
  One layout fix (match the prototype's `max-w-6xl` + `grid-cols-12` / `col-span-4` / `col-span-8`) and
  it'll render properly.
- **No data risk** — this changes only the wrapping divs' classes, not the report content, the score
  query, or the export. The trust-critical part (real data, not the old 72.4 mock) is unaffected.
- After this renders correctly, the PDF builder PAGE is done (layout + real data + Generate PDF button).
  Then the next step is the dashboard-cards prompt to add the "Generate client reports" link so you
  reach this page from the Agency Dashboard instead of typing the URL.
- One thing to confirm in your verification screenshot: that Bondi's score in the preview reads its
  REAL value (the 88.3-range from the dashboard), not the old 72.4 — I couldn't fully read the score in
  the squished view. The layout fix will make it legible; confirm the number is right when you re-check.
