# VisibleAU — Fix the white-label PDF builder: real data + real export + branding — Claude Code prompt
# THREE problems, in priority order (the first is a trust-critical bug, not cosmetic):
#   P1 (CRITICAL): the PDF builder preview shows HARDCODED MOCK scores (72.4 etc. on ~line 143) — it
#       never queries any audit. This is a client-facing white-label report inventing numbers. MUST fix
#       first: wire it to REAL audit data (same scoreComposite + dimensions the dashboard uses).
#   P2: the export endpoint (/api/audits/[auditId]/export?format=pdf) serves raw HTML with
#       Content-Type: application/pdf — a broken "PDF". Make it produce a REAL PDF.
#   P3: branding (agency_brand_assets) is read into the PREVIEW but NOT into the EXPORT; logo is a
#       URL-paste, not the canon Supabase Storage upload. Wire branding into the export.
# Pins: canon agency_brand_assets schema (logo/primary/secondary/accent/footer/contact), theme.ts +
#   render.ts (wrap Sprint 4 PDF with theming), @react-pdf/renderer renderToBuffer→Response (BB2),
#   DoD L958/L67. TS strict; str_replace/exact-literal only. This is client-facing — verify on real data.

╔═══════════════════════════════════════════════════════════════════════════════╗
║ WHY P1 IS CRITICAL (read first): this is a WHITE-LABEL report an agency puts     ║
║ THEIR brand on and sends to THEIR client. Showing hardcoded fake scores (72.4    ║
║ for a brand that's really 88.3) means the agency unknowingly sends fabricated    ║
║ audit data under their own name. For a TRUST product, a report that invents      ║
║ numbers is the most damaging possible bug. Fix the data BEFORE the dashboard     ║
║ card that links here goes live — do not make a fake-data report more reachable.   ║
╚═══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════
P1 — Replace the hardcoded mock scores with REAL audit data (do this first)
═══════════════════════════════════════════════════════════════════════════════
> In the PDF builder page (`app/(auth)/agency/reports/pdf-builder/page.tsx` and/or its view component),
> the composite (72.4) and dimensions (Frequency 68.2 / Position 74.1 / Sentiment 81.5 / Accuracy
> 65.8) are LITERAL hardcoded numbers (~line 143). Replace them with a real query:
> 1. For the selected brand (the dropdown — currently Bondi Plumbing), fetch that brand's **latest
>    completed audit** — the SAME source the dashboard/brand-detail uses for its score (so the PDF and
>    the dashboard agree: Bondi must read 88.3, not 72.4). Use `scoreComposite` + the per-dimension
>    scores from that audit. Confirm which query the dashboard uses and match it exactly.
> 2. Populate every report field from real data: composite /100, the 4 dimension scores, "Prepared
>    for: {brand.name}", "Generated: {today}", and the Key Recommendations (pull real recommendations
>    for the brand if available; if the report's recommendations were also hardcoded, wire them to the
>    real Action Center data or omit rather than fabricate).
> 3. Brand-switching in the dropdown must re-fetch real data for the newly selected brand (each brand
>    shows ITS real latest score — Asset Plumbing, Marrickville, etc.).
> 4. If a brand has NO completed audit, show an honest empty/placeholder state ("No completed audit
>    yet") — do NOT fall back to mock numbers.
> **NO hardcoded scores may remain anywhere in the report.** Grep the file for the literals (72.4,
> 68.2, 74.1, 81.5, 65.8) and confirm none survive.
> **Verify:** the preview for Bondi Plumbing shows its REAL composite (should match the dashboard's
> 88.3, not 72.4); switching brands shows each brand's real score.

═══════════════════════════════════════════════════════════════════════════════
P2 — Fix the broken PDF export (serves HTML as application/pdf)
═══════════════════════════════════════════════════════════════════════════════
> The export at `/api/audits/[auditId]/export?format=pdf` currently returns raw HTML with
> `Content-Type: application/pdf` — not a real PDF (it won't open as one). Canon BB2 specifies the
> correct pattern: `@react-pdf/renderer` → `renderToBuffer(<Template/>)` → `new Response(buffer)`.
> 1. Make `format=pdf` render an actual PDF document (react-pdf `Document`/`Page`/`StyleSheet`), not an
>    HTML string. The PDF content should mirror the report (composite, dimensions, recommendations,
>    "Prepared for", footer) using the REAL audit data (same source as P1).
> 2. Return it with `Content-Type: application/pdf` AND `Content-Disposition: attachment;
>    filename="visibleau-audit-{auditNumber}.pdf"` (canon L270) so it downloads as a valid PDF.
> 3. Add an **Export/Download button** on the PDF builder preview page that triggers this export for the
>    selected brand's latest audit (the DoD requires the report to EXPORT, not just preview). Wire it to
>    the corrected endpoint.
> **Verify:** clicking Export downloads a file that opens as a real PDF (not HTML), with the brand's
> real scores and the correct filename.

═══════════════════════════════════════════════════════════════════════════════
P3 — Wire agency branding (agency_brand_assets) into the EXPORT
═══════════════════════════════════════════════════════════════════════════════
> Branding is read into the on-screen preview but NOT into the exported PDF (and the report header still
> shows the literal "Agency" placeholder). Per canon, the export must apply the agency's branding.
> 1. Confirm `agency_brand_assets` exists (per-org: logoUrl, primaryColor, secondaryColor, accentColor,
>    footerText, contactLine) — canon §30. If the table/fields differ, adapt to what exists.
> 2. In the export (and the preview), read the org's `agency_brand_assets` and apply via the canon
>    `theme.ts` (`assetToTheme(asset)` → react-pdf StyleSheet) + `render.ts` (wrap Sprint 4's PDF with
>    the theme). The header should show the agency's NAME + LOGO (not "Agency"), the colours should
>    apply, and the footer should use footerText/contactLine. If no assets are configured, fall back to
>    a neutral default (NOT a fake agency name).
> 3. **Per-brand override** (canon §"Per-brand override"): if a per-brand asset override exists, it
>    takes precedence over the org default for that brand. (Note: the per-brand branding PAGE
>    `/brands/[brandId]/branding` may not be built — that's a separate gap; here just RESPECT an
>    override if the data exists, don't build the page.)
> NOTE on logo upload: canon §"Logo upload UI" wants Supabase Storage drag-and-drop (2MB, PNG/SVG/JPG),
> but the build currently uses a URL-paste input. Wiring the EXPORT to read whatever logoUrl is stored
> works regardless of how the URL got there — so do NOT block this fix on the upload mechanism. Flag
> the URL-paste-vs-Supabase-upload gap for a separate fix; it's not required to make the export correct.

═══════════════════════════════════════════════════════════════════════════════
VERIFY (all three, on real data) before reporting done
═══════════════════════════════════════════════════════════════════════════════
> - P1: NO hardcoded scores remain (grep clean); Bondi preview shows its real composite (matches
>   dashboard 88.3, not 72.4); switching brands shows each brand's real latest score; no-audit brand
>   shows an honest empty state.
> - P2: Export button present; clicking it downloads a REAL PDF (opens as PDF, not HTML) with real
>   scores + correct filename.
> - P3: the exported PDF shows the agency's branding (name/logo/colours/footer) from agency_brand_assets
>   (or a neutral default if unset) — NOT the "Agency" placeholder; a per-brand override is respected if
>   present.
> - `npm run typecheck` passes; no regression on the Sprint 4 base PDF export for non-agency users.
> Report: the query wired in (P1, matching the dashboard's source), the export fix (P2, react-pdf
> buffer), the branding wiring (P3), and confirmation Bondi's PDF now reads its real score. List any
> hardcoded literals removed.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **P1 is the one that genuinely matters.** Everything else (unlinked pages, missing cards) is
  inconvenience; a white-label report showing FAKE numbers under an agency's brand is a trust breach.
  This is the same no-fabricated-data principle as the ABN honest-skip and the GMB-card "don't invent
  match badges" — violated here in the most client-facing place. Fixing it is non-negotiable before the
  report is used.
- **Sequencing matters:** fix this BEFORE adding the dashboard "Bulk actions" card that links to the
  PDF builder (the next prompt). You don't want to make a fake-data report one click more reachable.
  Once P1 is done, the card is safe to add.
- **P2/P3 are real but secondary** — a broken export and unbranded output are quality gaps; the
  fake-data is the integrity gap. All three touch the PDF subsystem so it's efficient to fix together,
  but if you had to ship incrementally, P1 alone removes the danger.
- **Two things deliberately left for separate fixes:** the Supabase Storage logo upload (vs URL-paste)
  and the missing `/brands/[brandId]/branding` page — neither blocks making the export correct; flagged
  so they're tracked, not silently dropped.
- Per your relay discipline: P1 changes what a client sees in a deliverable — verifying the PDF score
  MATCHES the dashboard (not just "a real number appears") is the bit worth the second look.
