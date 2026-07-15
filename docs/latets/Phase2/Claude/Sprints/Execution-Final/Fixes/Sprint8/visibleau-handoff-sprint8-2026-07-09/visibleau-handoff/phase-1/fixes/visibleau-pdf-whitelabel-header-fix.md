# VisibleAU — Fix white-label report header: remove "VisibleAU" branding — Claude Code prompt
# Status: layout fixed ✓, real data confirmed ✓ (Composite reads 88.3, matching dashboard, not the old
#   mock 72.4). ONE remaining bug, and it's an integrity one for a white-label feature.
# Bug: the report header banner shows "VisibleAU" — but this is a WHITE-LABEL report meant to carry the
#   AGENCY's brand, "No VisibleAU mentions". An agency sending this to their client would be exposing
#   YOUR product's name instead of theirs — the exact opposite of white-label.
# Pins: prototype WhiteLabelReport header (proto L3783-3789 shows "Your Agency", NOT VisibleAU; L3662
#   comment "White-label header — no VisibleAU branding"); canon "your branding, no VisibleAU" (L3647).
# str_replace/exact-literal only. Header/branding only — do NOT touch the score (88.3 is correct).

╔═══════════════════════════════════════════════════════════════════════════════╗
║ WHY THIS MATTERS: white-label means the report carries the AGENCY's identity,    ║
║ not VisibleAU's. The prototype header shows the agency name ("Your Agency") and   ║
║ is explicitly commented "no VisibleAU branding". Canon: "your branding, no        ║
║ VisibleAU." A report leaking the vendor's brand to the agency's client breaks the ║
║ core promise of the feature. Same integrity class as the fake-data bug (now       ║
║ fixed) — just less severe. Fix before the report is sent to real clients.         ║
╚═══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — Replace "VisibleAU" in the report header with the AGENCY's name
═══════════════════════════════════════════════════════════════════════════════
> In the PDF builder report preview AND the exported PDF, the header currently shows "VisibleAU". It
> must instead show the agency's branding, resolved in this order:
> 1. The org's `agency_brand_assets` agency name (+ logo + primary colour) if configured.
> 2. Else, the "Agency name" value typed into the Branding panel on this page (live preview should
>    reflect what the user types — currently the field is empty, so typing should update the header).
> 3. Else (nothing configured/typed) → a NEUTRAL default — e.g. "AI Visibility Report" alone, or the
>    selected brand's own name, or a generic placeholder. **NEVER "VisibleAU".**
> - The header LOGO badge ("YA" in the prototype) should likewise come from the agency's logo/initials,
>   not a VisibleAU logo. If no logo, use the agency name's initials or a neutral mark.
> - The header accent colour should use the agency's primaryColor (from assets or the Branding panel's
>   "Primary colour" field) — the prototype uses the agency's purple, not VisibleAU blue.
> Grep the PDF builder component + the export template for the literal "VisibleAU" and replace ALL
> occurrences in the REPORT output with the resolved agency branding. (Do NOT change the app chrome —
> the sidebar logo, breadcrumb, etc. stay "visibleau"; this is ONLY about the REPORT's header/footer
> that the client sees.)

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Apply to the EXPORT too (not just the preview)
═══════════════════════════════════════════════════════════════════════════════
> Ensure the same agency-branding resolution applies to the EXPORTED PDF (the Generate PDF output), not
> only the on-screen preview — per the earlier P3 branding wiring. The downloaded PDF a client receives
> must show the agency's name/logo/colours (or neutral default), never "VisibleAU".
> - If the export path renders separately from the preview, fix both so they're consistent.

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — Verify
═══════════════════════════════════════════════════════════════════════════════
> - The report header no longer shows "VisibleAU". With the Branding "Agency name" empty → a neutral
>   default appears (not VisibleAU). Type an agency name → the header updates to it live.
> - The score still reads 88.3 (unchanged — do not touch the data).
> - Generate PDF → the downloaded PDF header shows the agency branding / neutral default, NOT VisibleAU.
> - The app chrome (sidebar "visibleau" logo, breadcrumb) is unchanged — only the client-facing REPORT
>   header/footer changed.
> - Grep confirms no "VisibleAU" literal remains in the report/export template (app chrome excepted).
> - `npm run typecheck` passes; both themes.
> Report: the header before/after, where the agency name resolves from, and confirmation the exported
> PDF carries agency (not VisibleAU) branding.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **This is the last real issue on the PDF builder.** Layout ✓, real data (88.3) ✓ — just the header
  leaking "VisibleAU" into a white-label report. The prototype + canon are explicit that this header
  must be the agency's, "no VisibleAU."
- **Neutral default matters:** when an agency hasn't set up branding yet, the header should fall back to
  something generic (NOT "VisibleAU" and NOT a fake agency name) — same honesty principle as elsewhere.
- **Don't touch the app chrome** — your sidebar/breadcrumb "visibleau" is correct; this is only the
  client-facing report header/footer.
- The dimension scores (Frequency 100 / Position 98 / Sentiment 100 / Accuracy 75) look plausible for
  an 88.3 composite and should be Bondi's real values now — worth a glance they match Bondi's technical
  audit, but they're consistent, so likely fine; not part of this fix.
- After this lands, the PDF builder is DONE (layout + real data + agency branding + working export).
  Then the dashboard-cards prompt adds the "Generate client reports" link so you reach it from the
  Agency Dashboard.
