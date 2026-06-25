# VisibleAU — Add the missing Agency Dashboard entry-point cards (fix navigation) — Claude Code prompt
# Why: the agency-surface audit confirmed 6 pages are "built but unlinked" because the Agency Dashboard
#   is missing the two entry-point CARDS the prototype specifies (Bulk actions + Client-facing portals).
#   The root-cause analysis traced this to the prototype→prompt navigation-flattening gap. This adds the
#   cards so the unlinked pages become reachable — no more typing URLs.
# Pins: prototype AgencyDashboard cards (Bulk actions L3624-3643, Client-facing portals L3644-3654);
#   the audit's CONFIRMED existing routes (so we map each button to a REAL page — no phantom routes like
#   the earlier GH2 /brands/[id]/audits mistake). TS strict; design tokens; both themes;
#   str_replace/exact-literal only. UI/nav only — no data/scoring changes.

╔═══════════════════════════════════════════════════════════════════════════════╗
║ CRITICAL — map each button to a ROUTE THAT EXISTS. The audit confirmed these     ║
║ agency pages are BUILT: /agency/reports/pdf-builder, /agency/bulk,                ║
║ /agency/branding, /agency/client-portals, /brands/[brandId]/schedule,             ║
║ /settings/notifications. Do NOT invent routes (the GH2 bug pointed at a           ║
║ non-existent /brands/[id]/audits → 404). Verify each target exists before wiring. ║
╚═══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════
STEP 0 — Confirm the target routes exist (avoid phantom links)
═══════════════════════════════════════════════════════════════════════════════
> Before wiring, confirm each of these page files exists and renders (the audit says they do — verify):
> - /agency/reports/pdf-builder  (PDF builder — now built & working)
> - /agency/bulk                 (bulk operations)
> - /agency/branding             (logo + colours)
> - /agency/client-portals       (invite management)
> - /brands/[brandId]/schedule   (per-brand scheduling — needs a brandId; see note in Step 1)
> - /settings/notifications      (weekly digest prefs)
> Report which exist. Only wire links to routes that exist; for any that don't, omit the link and flag it
> (do NOT create a dead link).

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — Add the "Bulk actions" card to the Agency Dashboard
═══════════════════════════════════════════════════════════════════════════════
> On `/agency` (the AgencyDashboardView), add a "Bulk actions" card per the prototype (L3624). It's a
> Card titled "Bulk actions" containing a vertical list of action buttons (icon + label + sub-text +
> chevron), each navigating to its page. Wire each to the REAL route (Step 0):
> - **"Run audits across all {N} brands"** (icon: Activity, sub: cost estimate) → `/agency/bulk`
> - **"Generate client reports (white-label)"** (icon: FileText, sub: "PDF") → `/agency/reports/pdf-builder`
>   ← THIS is the link that makes the PDF builder reachable (the navigation you've been chasing).
> - **"Export to CSV (all audits)"** (icon: Download, sub: audit count) → `/agency/bulk` (or the CSV
>   action there) — match where the build's bulk CSV lives.
> - **"Schedule weekly recurring audits"** (icon: Calendar, sub: "recurring") → if there's an agency-
>   level scheduling page use it; otherwise this links per-brand (`/brands/[brandId]/schedule` needs a
>   specific brand) — if there's no agency-wide schedule page, point this at /agency/bulk or omit and
>   flag, rather than a brandless /brands//schedule dead link.
> Use real values where available (N = actual brand count = 3; cost/counts from real data if cheap to
> compute, else omit the sub-text rather than show a fake estimate). Match the prototype's button
> styling (full-width, border, hover, ChevronRight). Use Next.js navigation (Link/router.push), not the
> prototype's `onNav`.

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Add the "Client-facing portals" card
═══════════════════════════════════════════════════════════════════════════════
> Add a "Client-facing portals" card per the prototype (L3644): titled "Client-facing portals", with
> the description "Each client gets a read-only portal showing their brand's data — your branding, no
> VisibleAU." and a button to manage them.
> - Show REAL stats if cheap (active portals count from client_portal_invites); if not readily
>   available, show a simpler version (just the description + button) rather than the prototype's mock
>   "18 of 23 / Custom domain seo.youragency.com.au" placeholders. Do NOT show fake portal counts.
> - **Button: "Manage portals"** (or "Preview portal") → `/agency/client-portals` (the invite
>   management page — confirmed built). This makes client portals reachable.

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — (Optional, low-cost) surface branding + notifications entry points
═══════════════════════════════════════════════════════════════════════════════
> The audit also found /agency/branding and /settings/notifications built-but-unlinked. While adding the
> cards, optionally add small entry points so they're reachable:
> - A link to **/agency/branding** ("Branding & logo") — logically belongs near the white-label/report
>   actions (the PDF builder reads this branding). Could be a button on the Bulk actions card or a small
>   "Agency settings" affordance.
> - A link to **/settings/notifications** ("Notification preferences" / weekly digest) — could live in
>   the existing settings/account area.
> These are lower priority than the two cards; add if straightforward, otherwise flag for later. Do not
> force them in awkwardly.

═══════════════════════════════════════════════════════════════════════════════
STEP 4 — Verify navigation end-to-end
═══════════════════════════════════════════════════════════════════════════════
> As the agency-tier user, from `/agency`:
> - The "Bulk actions" card and "Client-facing portals" card now render on the dashboard.
> - Clicking **"Generate client reports (white-label)"** → lands on `/agency/reports/pdf-builder` (the
>   PDF builder, showing Bondi 88.3). This is the headline check — the full path now works:
>   **Agency Dashboard → Generate client reports → PDF builder → Generate PDF → download.**
> - Clicking the bulk/CSV actions → lands on `/agency/bulk` (no 404).
> - Clicking "Manage portals" → lands on `/agency/client-portals` (no 404).
> - Every link goes to a route that EXISTS (no 404s — the GH2 phantom-route class of bug must not recur).
> - Layout fits the dashboard (the two new cards sit alongside/below the existing KPI + Top Movers +
>   Scheduled Audits cards without breaking the grid); both themes; `npm run typecheck` passes.
> - No fake stats shown (real counts or omitted, never fabricated).
> Report: a screenshot/description of the dashboard with the two new cards, and confirmation each link
> resolves to its real page (especially Generate client reports → PDF builder).

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **This is the fix the root-cause analysis pointed to** — adding these two cards makes ~4 of the 6
  unlinked agency pages reachable in one shot, because they were only unreachable due to the missing
  entry points. After this, you reach the PDF builder (and bulk/portals) from the Agency Dashboard
  instead of typing URLs.
- **The headline win:** "Generate client reports" on the Bulk actions card → the PDF builder. That
  completes the full navigation path you've been chasing this whole session.
- **No phantom routes:** Step 0 verifies each target exists before wiring — deliberately, because the
  GH2 bug (routing to a non-existent /brands/[id]/audits) caused a 404. Every link here must point at a
  confirmed-built page.
- **No fake data:** the prototype's cards show mock stats ("18 of 23", "A$65 estimated", "seo.youragency
  .com.au"). Use REAL values or omit — don't carry the mocks into the build (same no-fabrication
  principle that's run through everything).
- **Remaining genuine gaps** (separate, from the audit): /agency/client-portals/new (create-invite may
  be inline — confirm), /brands/[brandId]/branding (per-brand override page — unbuilt), the Supabase
  logo upload (vs URL-paste), and optionally enriching the PDF report body. None block this nav fix.
- Per your relay discipline: UI/nav only, low risk — the one thing worth a glance is that no link is a
  dead end (Step 0/4 guard against it).
