# VisibleAU — Comprehensive Sprint 9 AGENCY-SURFACE audit — Claude Code prompt
# Why: 3 agency pages so far were "built but unlinked" (/agency, /agency/reports/pdf-builder, and
#   client portals). The Agency Dashboard is missing the entry-point CARDS the prototype specifies, so
#   pages exist with no nav to them. This prompt MAPS the entire Sprint 9 agency surface in one pass:
#   what exists, what's unlinked, what's unbuilt — plus two real data questions.
# This is a VERIFICATION/AUDIT pass — inspect & REPORT, do NOT fix in this run (we'll scope fixes after
#   we see the full map). No paid API calls needed except the optional one PDF-export check.
# Pins: canon Sprint 9 route list (§4), prototype AgencyDashboard cards, DoD checklist (L1095-1111).

═══════════════════════════════════════════════════════════════════════════════
PART 1 — Which agency PAGES exist? (route-by-route: built / unlinked / 404)
═══════════════════════════════════════════════════════════════════════════════
> For EACH canonical Sprint 9 route below, report: (a) does the page file exist? (b) does it render
> without error for an agency-tier user? (c) is it reachable via any UI nav, or only by typing the URL?
> Canon §4 agency routes:
> - `/agency`                          (agency dashboard)            — KNOWN: built, reachable via switcher "All brands"
> - `/agency/reports/pdf-builder`      (white-label PDF preview)     — KNOWN: built, was URL-only
> - `/agency/branding`                 (logo + colours upload)       — ??? check
> - `/agency/bulk`                     (bulk operations)             — ??? check
> - `/agency/client-portals`           (invite management)          — ??? check
> - `/agency/client-portals/new`       (issue new invite)           — ??? check
> - `/brands/[brandId]/schedule`       (per-brand scheduling UI)     — ??? check
> - `/brands/[brandId]/branding`       (per-brand white-label override) — ??? check
> - `/portfolio`                       (Sprint 4 stub, now populated) — ??? check
> - `/settings/notifications`          (weekly digest preference)    — ??? check
> - `/client-portal/[inviteToken]`     (public client portal view)   — ??? check (no-login route group)
> **Report** a table: route · file exists? · renders? · reachable via UI? (yes/url-only/no).

═══════════════════════════════════════════════════════════════════════════════
PART 2 — Agency Dashboard: which entry-point CARDS are missing?
═══════════════════════════════════════════════════════════════════════════════
> The current /agency dashboard shows: KPI cards (Total Brands / Avg Composite / Pending Drift / LLM
> Spend) + Top Movers + Scheduled Audits. The PROTOTYPE's AgencyDashboard ALSO has two cards that are
> the nav handles to the unlinked pages:
> 1. **"Bulk actions" card** — with: "Run audits across all brands", "Generate client reports
>    (white-label)" → should link to /agency/reports/pdf-builder, "Export to CSV", "Schedule weekly
>    recurring audits". (This is why the PDF builder had no nav — this card isn't built.)
> 2. **"Client-facing portals" card** — active-portals count + "Preview portal" / manage → should link
>    to /agency/client-portals. (This is why client portals had no nav.)
> Also canon §4 lists agency components: `portfolio-grid.tsx`, `top-movers.tsx`.
> **Report:** which of these cards/components are present on the built /agency dashboard vs missing.
> Confirm the hypothesis: the unlinked pages are unreachable because these entry-point cards weren't
> built. List exactly which entry points are absent.

═══════════════════════════════════════════════════════════════════════════════
PART 3 — White-label PDF: does it EXPORT, or only preview? + branding wiring
═══════════════════════════════════════════════════════════════════════════════
> The /agency/reports/pdf-builder page currently shows an on-screen PREVIEW with a hardcoded "Agency"
> header. Canon DoD requires actual EXPORT with custom branding. Check:
> 1. **Logo/colours upload:** does `/agency/branding` exist and let an agency upload a logo (to Supabase
>    Storage) + set custom colours? Is there an `agency_brand_assets` table? (DoD: "Logo upload to
>    Supabase Storage works"; "Color picker updates PDF template preview".)
> 2. **Branding wired into the report:** does the PDF builder read the agency's logo/name/colours from
>    agency_brand_assets (so "Agency" becomes the real agency name + logo), or is "Agency" a hardcoded
>    placeholder with no wiring?
> 3. **Actual export:** can the preview be EXPORTED/downloaded as a PDF (DoD: "White-label PDF exports
>    with custom logo + colors"), or is it preview-only with no download? Find the export route/handler
>    (lib/pdf/theme.ts, render.ts per canon).
> **Report:** branding upload exists? · branding wired into report (or hardcoded)? · PDF actually
> exports/downloads? (If export exists, you MAY do one export of the Bondi preview to confirm it
> produces a valid PDF — that's the only optional spend, trivial.)

═══════════════════════════════════════════════════════════════════════════════
PART 4 — DATA QUESTION: the 72.4 vs 88.3 score discrepancy
═══════════════════════════════════════════════════════════════════════════════
> The PDF preview shows Bondi Plumbing at **72.4**, but the dashboard/brand pages consistently show
> Bondi at **88.3**. Same brand, different number — a credibility risk for a client-facing report.
> Investigate WHICH audit each surface reads:
> 1. What audit does the PDF builder source for a brand? (latest completed? a specific one? a different
>    score field than scoreComposite?) Find the query.
> 2. What does the dashboard/brand-detail use for the 88.3? (presumably latest completed audit's
>    scoreComposite.)
> 3. Are they reading DIFFERENT audits (e.g. PDF picks an older one) or the SAME audit but a DIFFERENT
>    field/calculation? The dimension values on the PDF (Frequency 68.2 / Position 74.1 / Sentiment
>    81.5 / Accuracy 65.8) — do they match the latest audit or an older one?
> **Report:** the root of the discrepancy — different audit vs different field — with the query each
> surface uses. (Do NOT fix yet; just diagnose. A client report MUST match the dashboard, so this needs
> resolving, but we'll scope the fix once we know the cause.)

═══════════════════════════════════════════════════════════════════════════════
PART 5 — Remaining Sprint 9 DoD surfaces (quick existence check)
═══════════════════════════════════════════════════════════════════════════════
> Confirm presence (built/partial/missing) of the other Sprint 9 deliverables, so the map is complete.
> Don't deep-test — just whether each exists and is wired:
> - **Bulk operations** (/agency/bulk): bulk re-audit (parallel, concurrency 4) + bulk CSV export.
> - **Scheduled audits:** /brands/[brandId]/schedule UI + the cron/quota gate; the Agency Dashboard's
>   "Scheduled Audits" card currently says "0 active schedules" — is the scheduling UI built to create
>   one?
> - **Client portal end-to-end:** invite generation (the "copy portal link"/issue-invite flow) +
>   the public /client-portal/[token] read-only view + token verify route.
> - **GA4 + Looker Studio** exports (config routes).
> - **Weekly digest** (Tuesday 09:00 AEST) + /settings/notifications preference.
> - **Tier limits** per PRD §7 (Free/Starter/Growth=1, Agency=5, Agency Pro=25).
> **Report:** built / partial / missing for each.

═══════════════════════════════════════════════════════════════════════════════
FINAL REPORT — the agency surface map
═══════════════════════════════════════════════════════════════════════════════
> Produce ONE consolidated map:
> - **Table 1 (pages):** every agency route → exists? renders? reachable via UI?
> - **Table 2 (entry points):** which Agency Dashboard cards/components are present vs missing.
> - **PDF export:** preview-only vs real export; branding wired vs hardcoded.
> - **Score discrepancy:** the diagnosed cause (72.4 vs 88.3).
> - **DoD coverage:** built / partial / missing for each Sprint 9 deliverable.
> - **The three buckets:** clearly list what is (A) BUILT & REACHABLE, (B) BUILT BUT UNLINKED (needs a
>   nav handle), (C) UNBUILT (genuine gap). This is the deliverable — a complete picture so fixes can be
>   scoped in priority order.
> Apply NO fixes in this run.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **This is an audit, not a fix run** — deliberately. You've found 3 unlinked agency pages by hitting
  walls one at a time; this maps the WHOLE surface so we stop discovering gaps reactively. Once we have
  the three buckets (built-reachable / built-unlinked / unbuilt), I'll write the right fixes in order —
  most likely (1) add the missing Agency Dashboard cards (which fixes nav to several pages at once),
  (2) the score-discrepancy fix, (3) anything genuinely unbuilt.
- **The score discrepancy (Part 4) is the one with client-facing risk** — a white-label report showing
  72.4 when your dashboard shows 88.3 would undermine an agency's credibility with their client. Worth
  resolving before the PDF export is used for real. Likely the PDF is reading a different/older audit.
- **Likely outcome:** most agency pages are BUILT but UNLINKED (the recurring pattern), and the real
  gap is the Agency Dashboard's missing entry-point cards (Bulk actions + Client-facing portals) plus
  possibly the actual PDF export + branding-upload wiring. Part 2 + Part 3 will confirm.
- Free of charge except the optional single PDF export in Part 3.
