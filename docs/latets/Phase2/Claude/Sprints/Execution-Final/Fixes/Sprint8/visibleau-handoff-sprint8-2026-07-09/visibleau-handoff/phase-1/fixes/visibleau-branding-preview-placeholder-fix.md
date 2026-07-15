# VisibleAU — Replace fake "Score: 72.4" in Agency Branding preview — Claude Code prompt
# Issue: the /agency/branding page's PREVIEW panel (the "here's how your report will look" sample) shows
#   a hardcoded "Score: 72.4" — the SAME fake number we removed from the PDF builder. This preview is a
#   STYLING MOCKUP (not a client deliverable), so it's low-severity — but 72.4 risks looking like real
#   data and is inconsistent with the no-fake-data discipline everywhere else. Replace it with a neutral
#   placeholder.
# Scope: ONLY the branding preview's sample score. Tiny, cosmetic. No data wiring, no schema change.
# str_replace/exact-literal only.

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — Replace the hardcoded "72.4" with a neutral placeholder
═══════════════════════════════════════════════════════════════════════════════
> In the Agency Branding page (`app/(auth)/agency/branding/...`), the preview panel renders a sample
> report card containing "Score: 72.4" (a hardcoded literal). This preview's PURPOSE is to show how the
> agency's colours/logo/footer will look — it is NOT meant to show a real audit score. Replace the fake
> 72.4 so it can't be mistaken for real data. Options (pick the cleanest):
> - **A label that's obviously a placeholder:** "Score: 00.0" or "Score: —" or "Sample score".
> - **Or drop the number entirely** and show a neutral sample row (e.g. "Composite Visibility Score" with
>   a styled placeholder bar/box, no number).
> Whichever reads best as "this is a layout sample" rather than a real figure. Keep the styling/colours
> exactly as-is (the preview's whole job is to demonstrate the branding) — only the fake NUMBER changes.
> Grep the branding page for "72.4" and confirm it's gone.

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Verify
═══════════════════════════════════════════════════════════════════════════════
> - /agency/branding preview no longer shows "72.4" — shows a neutral placeholder/sample instead.
> - The branding preview still demonstrates the colours, logo position, agency name, footer, contact
>   line (its actual purpose is unaffected).
> - No "72.4" literal remains in the branding page (grep clean).
> - `npm run typecheck` passes.
> Report: the before/after of the preview's score line.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **Low-severity but worth doing** — this preview is a styling sample, not a client report, so 72.4 here
  isn't sent to anyone. But it's the same fake number we removed from the PDF builder, and a neutral
  placeholder removes any chance of it being mistaken for a real score. Consistency with the
  no-fake-data principle.
- **Separate, NOT fixed here (deferred):** the logo input on this page is URL-paste
  ("https://example.com/logo.png"), but canon L33 specifies **drag-and-drop Supabase Storage upload**
  (2MB, PNG/SVG/JPG). That's a real canon gap but a bigger piece (Supabase Storage integration), and
  URL-paste is functional meanwhile — left on the deferred list. Flag it if/when you want it built.
- After this, the branding page is clean apart from the deferred logo-upload mechanism. The branding it
  saves (name/colours/logo/footer) already flows into the PDF report header (the P3 wiring from the PDF
  builder fixes) — worth an end-to-end check sometime: set an agency name here → save → confirm the PDF
  report header shows it.
