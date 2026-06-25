# VisibleAU — Fix bulk CSV export: header-only, no data rows — Claude Code prompt
# CONFIRMED BUG (not data, not dev/prod): exporting the bulk CSV for **Bondi Plumbing** — which has
#   MULTIPLE completed audits at 88.3 (visible on the Overview) — produces a CSV with ONLY the header
#   row ("Brand,Domain,Vertical,Audit Date,Composite Score") and ZERO data rows. Tested with Bondi
#   selected, in the same DB where the dashboard shows Bondi's audits. So the export's query isn't
#   finding audits that demonstrably exist → real export-query bug. (Marrickville also empty, but that's
#   separately explained by its stale artifact audit; Bondi is the proof this is a bug.)
# This mirrors the PDF builder regression: data exists, the query doesn't retrieve it. Diagnose by
#   comparing against the WORKING dashboard query, then fix.
# Secondary: the header is 5 columns; canon BD1 specifies a 14-column format — reconcile (see Part 3).
# Pins: canon BD1 CSV columns; the working dashboard/audits query. str_replace/exact-literal only.

═══════════════════════════════════════════════════════════════════════════════
PART 1 — Diagnose: why does the export return 0 rows when Bondi has audits?
═══════════════════════════════════════════════════════════════════════════════
> The bulk CSV export for selected brands returns header-only. Bondi has completed audits (the
> dashboard/Overview shows 88.3 from them), so the export's query is failing to find them. Find the bug:
> 1. Find the bulk CSV export handler (canon: `/api/agency/bulk-export/route.ts` is canonical per GH4;
>    there may also be a `/api/bulk/csv` — GH4 says bulk-export is the canonical one, the other a
>    duplicate). Identify which one the /agency/bulk page actually calls, and read its query.
> 2. Find the WORKING query that the Overview/dashboard uses to fetch Bondi's completed audits (the one
>    producing 88.3). Note its filters: brand match, status value, org scoping, date range, joins.
> 3. Compare. Likely culprits (same classes as the PDF builder regression):
>    - **status value mismatch** — export filters e.g. `status='completed'` while audits are `'complete'`
>      (or vice versa) → zero matches. Confirm the ACTUAL status value of Bondi's audits and what the
>      export filters on.
>    - **date filter** — canon says CSV = "last 30 days". If the export filters `created_at >= now()-30d`
>      and the comparison is wrong (timezone, units, or the audits are older than 30 days), it returns
>      nothing. Check Bondi's audit dates vs the filter window.
>    - **brand-id filtering** — the selected brand IDs from the UI may not be reaching the query, or are
>      matched against the wrong column → no rows. Check how the selected brandIds are passed to the
>      export and used in the WHERE.
>    - **a JOIN that excludes rows** — e.g. joining a table that's empty for these audits.
>    - **the query runs but the row-to-CSV mapping drops rows** — confirm the query returns rows at all
>      (log the count) vs returns rows but they're lost in CSV serialization.
> **Report:** the export query, the working dashboard query, Bondi's actual audit status + dates, and the
> EXACT reason the export returns 0 rows.

═══════════════════════════════════════════════════════════════════════════════
PART 2 — Fix: make the export return the real audit rows
═══════════════════════════════════════════════════════════════════════════════
> Correct the export query so selected brands' audits appear as data rows:
> - Align the status filter, brand-id matching, org scoping, and date logic to the WORKING dashboard
>   pattern (reuse its helper if one exists, so they can't diverge).
> - For Bondi selected → the CSV must contain Bondi's completed audit(s) as data rows (composite 88.3,
>   etc.). For multiple brands selected → rows for each.
> - If the "last 30 days" window is the cause and Bondi's audits are older, decide the correct behaviour:
>   canon says last 30 days, but if that legitimately excludes everything, either the window is wrong or
>   the intent is "all audits" — match canon's stated intent ("all brands' last 30 days") but ensure the
>   date math is correct (right timezone/units) so in-window audits ARE included. (Bondi's audits are
>   recent — "11 min ago / 3h / 11h" per the Overview — so they SHOULD be within 30 days; if they're
>   being excluded, the date filter is buggy, not the data.)
> - Do NOT change the dashboard query. Only fix the export.
> **Do not fabricate rows** — if a selected brand genuinely has no audits, it simply contributes no rows
> (that's correct, e.g. a brand-new brand). The bug is that Bondi (which HAS audits) contributes none.

═══════════════════════════════════════════════════════════════════════════════
PART 3 — Reconcile the CSV columns with canon (secondary)
═══════════════════════════════════════════════════════════════════════════════
> The current header is 5 columns: `Brand, Domain, Vertical, Audit Date, Composite Score`. Canon BD1
> specifies a 14-column per-engine-row format: `audit_number, brand_name, engine, prompt, run_number,
> brand_mentioned, position, sentiment_label, context_label, response_snippet, cited_sources_domains,
> llm_model, llm_cost_usd, created_at`.
> - Determine whether the bulk export is INTENDED to be the canon 14-column per-engine export, or a
>   simpler brand-level summary (the 5-column version). Check canon/the bulk spec for which the
>   /agency/bulk CSV should produce.
> - If canon wants the 14-column per-engine format → expand the export to match BD1.
> - If the 5-column brand-summary is an intentional agency-level rollup (distinct from the per-audit CSV
>   export at /api/audits/[id]/export) → that's acceptable; just note the divergence and confirm it's
>   deliberate. Don't force 14 columns if the design intends a summary.
> Report which it is and what you did. (This is secondary to Part 1/2 — getting DATA into the CSV is the
> priority; the column schema is a refinement.)

═══════════════════════════════════════════════════════════════════════════════
PART 4 — Verify (real data)
═══════════════════════════════════════════════════════════════════════════════
> - Export the bulk CSV with **Bondi Plumbing** selected → the CSV now has Bondi's audit data as ROWS
>   (composite 88.3 etc.), not just a header. Open it and confirm real rows.
> - Select multiple brands (Bondi + Asset Plumbing) → rows for each that has audits.
> - A brand with no audits (or Marrickville's stale case) contributes no rows — that's fine, not a crash.
> - Confirm the query returns rows (log count during dev if helpful) and they serialize to the CSV.
> - `npm run typecheck` passes; the dashboard query is unchanged (Overview still shows 88.3).
> Report: the root cause (exact query difference), the fix, the column decision (Part 3), and a sample of
> the now-populated CSV (header + Bondi row).

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **Confirmed a real bug, not dev/prod** — you tested with Bondi (which has audits) and still got an
  empty CSV. Same signature as the PDF builder regression: data exists, query doesn't find it. Most
  likely a status-value or date-filter mismatch, or selected brandIds not reaching the WHERE.
- **The diagnosis-by-comparison approach** (vs the working dashboard query) is what cleanly fixed the
  PDF builder — same method here. The dashboard finds Bondi's audits; the export should use the same
  filters.
- **Bondi's audits are recent** ("11 min / 3h / 11h ago" on the Overview), so if a "last 30 days" filter
  is excluding them, the date math is buggy — they're well within 30 days. That's a strong hint toward
  either the date filter or a status mismatch.
- **Part 3 (columns) is secondary** — getting real ROWS in is the priority. The 5-vs-14 column question
  is a refinement; the 5-column summary may even be intentional for an agency rollup. Don't let it block
  the data fix.
- Per your relay discipline: verify with a real Bondi export (open the CSV, see the row) — not just
  "typecheck passes." This is the third query-mismatch bug this session (PDF builder, and now this), so
  the same "code reported done ≠ works on real data" caution applies.
