# VisibleAU — Fix PDF builder regression: "No completed audit" when audits EXIST — Claude Code prompt
# CONFIRMED REGRESSION (not dev/prod, not data): in the SAME database/session, the Overview dashboard
#   shows Bondi Plumbing with MULTIPLE completed audits at 88.3 (11 min ago, 3h, 11h — all "complete"),
#   but /agency/reports/pdf-builder says "No completed audit for Bondi Plumbing yet." Two pages, same
#   data, disagree → the PDF builder's audit query is broken.
# TIMING: the PDF builder worked (showed 88.3, exported a real PDF) BEFORE the "agency dashboard cards"
#   prompt, and broke AFTER it — even though that prompt's report said it only touched /agency. It must
#   have changed something SHARED (a query helper, brand→audit resolution, or a type) used by both.
# Goal: find why the PDF builder's "latest completed audit" fetch returns empty when the dashboard's
#   equivalent returns 88.3, and fix it — WITHOUT removing the honest empty state for brands that truly
#   have no completed audit (do NOT reintroduce mock-data fallback).
# str_replace/exact-literal only. Diagnose first, then fix.

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — Diagnose: compare the PDF builder's query to the WORKING dashboard query
═══════════════════════════════════════════════════════════════════════════════
> Both pages, in the SAME database, should find Bondi's completed audits. The dashboard does (shows
> 88.3); the PDF builder doesn't. Find the divergence:
> 1. Find the Overview dashboard's query that fetches Bondi's latest completed audit / composite score
>    (the one producing 88.3 on /overview). Note exactly how it filters: brand match, status =
>    'complete' (or whatever the real enum value is), org scoping, ordering, limit.
> 2. Find the PDF builder's query (app/(auth)/agency/reports/pdf-builder + its data fetch / any shared
>    helper) that's returning empty and triggering "No completed audit for {brand}".
> 3. Compare them field-by-field. Likely culprits to check:
>    - **status value mismatch:** dashboard filters one value (e.g. `'complete'` / `'completed'`) and
>      the PDF builder filters a different/wrong one (so nothing matches). Confirm the ACTUAL status
>      value of Bondi's audits in the DB and which value each query uses.
>    - **brand resolution:** the PDF builder may resolve the selected brand differently now (wrong
>      brandId, a changed prop, the dropdown value not reaching the query) — so it queries the wrong/no
>      brand. Check what brandId the PDF builder actually passes vs the real Bondi id.
>    - **a shared helper the cards prompt changed:** if both pages call a common function
>      (e.g. getLatestAudit / getLatestCompletedAudit / a portfolio helper), check git/recent changes —
>      did the cards prompt modify it in a way that broke the PDF builder's call?
>    - **org/RLS scoping** or a JOIN condition that now excludes the rows.
> **Report:** the dashboard query (works), the PDF builder query (broken), and the EXACT difference that
> makes the PDF builder return empty while the dashboard returns 88.3.

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Fix the PDF builder's query to match the working one
═══════════════════════════════════════════════════════════════════════════════
> Correct the PDF builder's audit fetch so it finds the same completed audits the dashboard finds for
> the selected brand:
> - Align the status filter, brand resolution, org scoping, ordering, and limit to the WORKING
>   dashboard pattern (reuse the dashboard's helper if there is one, so they can't diverge again).
> - For the selected brand, it must return that brand's latest completed audit (Bondi → the 88.3 one).
> - Do NOT change the dashboard query (it's correct). Only fix the PDF builder side (or the shared
>   helper, in a way that keeps BOTH correct — re-verify the dashboard still shows 88.3 after).
> **CRITICAL — preserve the honest empty state:** the "No completed audit yet" message must STILL show
> for a brand that genuinely has zero completed audits. The fix is to make the query find audits that
> DO exist — NOT to remove the empty state and NOT to fall back to mock/hardcoded numbers (the old
> 72.4 bug we already removed). A brand with real audits → real score; a brand with none → honest empty
> state. Never mock.

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — Verify (same database, both pages agree)
═══════════════════════════════════════════════════════════════════════════════
> In the SAME mode/database where /overview shows Bondi at 88.3:
> - /agency/reports/pdf-builder with Bondi selected now shows the report with composite **88.3**
>   (matching the dashboard) — NOT "No completed audit". The Generate PDF button is enabled.
> - Switching the brand dropdown to another brand WITH completed audits (e.g. Marrickville → 13.8)
>   shows that brand's real score.
> - A brand that genuinely has NO completed audit still shows the honest empty state (confirm the empty
>   state wasn't removed — e.g. test a brand with no audits, or reason about it).
> - The Overview dashboard STILL shows 88.3 (didn't regress the dashboard while fixing the shared path).
> - `npm run typecheck` passes.
> Report: the root cause (the exact query difference), the fix, and confirmation that the PDF builder
> and dashboard now agree (both 88.3 for Bondi) while the empty state still works for auditless brands.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **You were right, I was wrong** — this is a genuine regression, not dev/prod. The proof: /overview
  shows Bondi's completed audits at 88.3 while the PDF builder says "no audit" — same database, so it's
  the PDF builder's query, not the environment. The cards prompt broke a shared piece despite its report
  only mentioning /agency.
- **Most likely a status-value or brand-resolution mismatch, or a shared helper the cards prompt
  edited.** Step 1 compares the two queries to pinpoint it. The fix is to make the PDF builder query
  match the dashboard's (ideally share the helper).
- **The empty state is GOOD and must stay** — it's the honest "no audit" behaviour from the earlier fix.
  The bug isn't that the empty state exists; it's that it's firing when audits DO exist. The fix makes
  the query find them, NOT removes the empty state or restores mock data. I've made that explicit so
  Claude Code doesn't "fix" it by reintroducing the 72.4-style fallback.
- This is a good example of why verifying after every prompt matters — the cards prompt looked clean
  (typecheck passed, its report said /agency only) but had a side effect on a shared path. Caught
  because you checked the PDF builder afterward rather than assuming.
- After this, run the full path in the same database: /agency → Generate client reports → PDF builder
  (88.3) → Generate PDF → download.
