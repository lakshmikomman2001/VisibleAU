# VisibleAU — Fix /agency crash: "column reference 'id' is ambiguous" (top-movers subquery) — Claude Code
# Status: /agency (AgencyDashboardPage) IS built and tier-gating works — it reaches the data query then
#   crashes. Root cause is a precise SQL bug in the top-movers score-delta correlated subquery.
# Error: PostgresError "column reference 'id' is ambiguous", from app/(auth)/agency/page.tsx:47.
# Pins: canon Sprint 9 §64 (top movers = biggest gains/drops by composite delta), GB1 page spec,
#   portfolio.ts. TS strict; str_replace/exact-literal only. This is a query bug — verify on real data.

═══════════════════════════════════════════════════════════════════════════════
ROOT CAUSE (confirmed from the error output)
═══════════════════════════════════════════════════════════════════════════════
The agency page builds a correlated subquery to compute each brand's score delta (top-movers: most
recent audit's score minus the previous audit's score), used in BOTH the SELECT list and the ORDER BY.

The two copies are INCONSISTENT:
- **ORDER BY version (CORRECT):** `WHERE a1.brand_id = "brands"."id"` — fully qualified.
- **SELECT version (BUGGY):** `WHERE a1.brand_id = "id"` — bare `"id"`, no table qualifier.

At that point in the query, `"id"` is ambiguous: both the outer `brands` table and the joined
`audits a1`/`a2` are in scope, so Postgres can't resolve which `id` is meant → "column reference 'id'
is ambiguous". The SELECT-clause subquery simply dropped the `brands.` qualifier that the ORDER BY
version has. This passes typecheck (valid Drizzle) but fails at the database.

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — Locate the two subquery copies
═══════════════════════════════════════════════════════════════════════════════
> Find where the top-movers score-delta subquery is built. It's used by the /agency page — likely in
> `app/(auth)/agency/page.tsx` directly, or in `lib/agency/portfolio.ts` (the portfolio metrics
> aggregation, canon L111), composed into the brands query. Identify BOTH occurrences:
> 1. the one in the SELECT list (computes the delta text shown per brand), and
> 2. the one in the ORDER BY (`ORDER BY ABS(COALESCE((... delta ...), 0)) DESC`).
> Confirm the SELECT one references the outer brand id WITHOUT a table qualifier while the ORDER BY one
> uses the qualified form. Report the file + the Drizzle expression that produces each.

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Qualify the correlation reference in the SELECT subquery
═══════════════════════════════════════════════════════════════════════════════
> Make the SELECT-clause subquery's correlation predicate reference the OUTER brand id with the table
> qualifier, exactly like the (working) ORDER BY version:
> - Change the predicate from the unqualified `a1.brand_id = <bare id>` to
>   `a1.brand_id = brands.id` (in Drizzle: reference the outer `brands.id` column object, e.g.
>   `eq(a1.brandId, brands.id)` inside the `sql` correlated subquery, NOT a bare `sql\`"id"\`` or an
>   unqualified column).
> - The generated SQL for the SELECT subquery's WHERE must read `WHERE a1.brand_id = "brands"."id"`
>   (qualified), matching the ORDER BY subquery byte-for-byte on that predicate.
> - Do NOT change the delta math, the JOIN, the `status='complete'` / `completed_at <` conditions, the
>   ordering, the LIMIT, or the ORDER BY subquery (it's already correct). ONLY add the missing
>   `brands.` qualifier to the SELECT subquery's correlation.
> - If both subqueries are generated from a shared helper, fix the helper so BOTH emit the qualified
>   reference (and confirm the ORDER BY output is unchanged). Prefer a single source of truth so they
>   can't drift again.

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — Verify on real data
═══════════════════════════════════════════════════════════════════════════════
> - Load `http://localhost:3000/agency` as the agency-tier user — it now renders WITHOUT the
>   ambiguous-column error.
> - The portfolio dashboard shows: KPI cards (active brands / avg portfolio score / brands with issues
>   / monthly LLM cost), and the **top-movers** list with per-brand score deltas (e.g. Bondi Plumbing,
>   Marrickville Dental Studio — the org's brands), ordered by biggest absolute delta.
> - Sanity-check a delta value against known data: a brand with two audits shows (latest − previous);
>   a brand with only one completed audit shows null/0 delta (COALESCE) and doesn't crash.
> - Run the generated SQL mentally/once: both subquery copies now use `"brands"."id"`.
> - `npm run typecheck` passes; no other agency route regressed.
> Report: the file + expression changed, the before/after of the SELECT subquery's WHERE clause, and a
> description/screenshot of /agency rendering with the top-movers list.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **This confirms AgencyDashboard IS built** — the crash is at agency/page.tsx:47, past the TierGate,
  so the page + tier-gating work. The reason you couldn't navigate to it is the SEPARATE missing nav
  handle (see below), not a missing page.
- **The bug is a one-qualifier fix** — the ORDER BY subquery already does it right
  (`"brands"."id"`); the SELECT subquery dropped the `brands.` qualifier, making `"id"` ambiguous.
  Low-risk, surgical change. It passed typecheck because it's valid Drizzle — only Postgres' scoping
  rules catch it, which is why a real page-load was needed to surface it (the recurring "typecheck
  green ≠ runs on real data" lesson).
- **Separate follow-up — the navigation handle (GH2):** even after this fix, /agency has no UI path —
  canon's intended entry is the top-bar **workspace-switcher** with an "All brands (N) → /agency"
  option (GH2), which appears not to be built (it's why you had to type the URL). That's a distinct,
  small piece. Once this crash is fixed and you confirm the dashboard renders, I can write the GH2
  fix (add the workspace-switcher "All brands" nav handle) so the page is reachable without typing the
  URL. Want to keep them separate: fix the crash first, verify the dashboard, then wire the nav.
- Per your relay discipline: this touches a data query on a tier-gated page; the fix is tiny but
  verifying the delta values are correct (not just "no crash") is the bit worth the second look.
