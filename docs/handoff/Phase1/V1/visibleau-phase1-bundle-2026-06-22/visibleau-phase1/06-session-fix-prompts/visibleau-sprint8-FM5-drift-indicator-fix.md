# VisibleAU — Sprint 8: FM5 audit-list drift indicator + 2 verify checks — Claude Code prompt
# Scope (verified against canon sri-visibleau-sprint-8-prompt.md):
#   • BUILD: FM5 — extend GET /api/audits with a drift_alerts JOIN so each audit row carries
#     driftSeverity, then render the EXISTING drift-indicator.tsx on audit-history rows. (canon L34-55,
#     L878-890; DoD L1487)
#   • VERIFY-ONLY (do not rebuild if present): TikTok placeholder in cited-sources (L80, L1611, DoD
#     L1658); Foglift entry in ATTRIBUTIONS.md (L81, L1614-1615).
# NOT in this prompt: webhook recipe pages + export UI helper components (separate decide-build/defer).
# TS strict; design tokens; both themes; str_replace/exact-literal only. This touches a Sprint 4 API —
# additive only, verify on real data.

═══════════════════════════════════════════════════════════════════════════════
PART 1 — BUILD: FM5 drift indicator on audit-history rows
═══════════════════════════════════════════════════════════════════════════════

### Step 1.1 — Confirm the existing pieces (read-only)
> Before changing anything, confirm:
> - `components/domain/drift/drift-indicator.tsx` EXISTS (canon says it was built; FK2). Read its
>   current props + render logic.
> - The audit-list data source: `GET /api/audits` (app/api/audits/route.ts, Sprint 4) AND the audit-
>   history UI that renders the rows (on the brand detail page's "Audit history" section and/or the
>   audits list page). Identify exactly where rows are mapped.
> **Report:** the indicator's current prop signature, and the file(s) where audit rows are rendered.

### Step 1.2 — Extend GET /api/audits with the drift JOIN (the FM5 fix)
> In `app/api/audits/route.ts`, add `driftSeverity` to each returned audit row via a LEFT JOIN on
> `drift_alerts`, per canon L40-54. **Use the subquery form** (canon L888) so an audit with more than
> one unacknowledged alert can't duplicate the audit row:
> ```
> .leftJoin(
>   // most-recent UNACKNOWLEDGED drift alert per audit (subquery avoids row fan-out):
>   <subquery: SELECT currentAuditId, severity FROM drift_alerts WHERE acknowledged = false>
>     AS latestDrift,
>   eq(latestDrift.currentAuditId, audits.id)
> )
> // select adds: driftSeverity: latestDrift.severity   // null if no alert
> ```
> - Keep everything else in the query unchanged (existing columns, brand innerJoin, RLS/org scoping,
>   ordering, limit). This is ADDITIVE — one extra nullable column on each row.
> - `driftSeverity` is `'significant_drop' | 'significant_rise' | null` (note: `within_noise` never
>   reaches the DB per §6, so in practice only drop/rise/null appear). Type it `string | null`.
> - Confirm RLS still scopes to the current org and the JOIN doesn't leak another org's alerts.

### Step 1.3 — Render drift-indicator.tsx on the audit rows
> In the audit-history row component, pass the new `driftSeverity` to `drift-indicator.tsx` and render
> it on each row. Match the canon FK2 badge logic EXACTLY:
> - `significant_drop` → `<Badge tone="danger">↓ Drop</Badge>`
> - `significant_rise` → `<Badge tone="success">↑ Rise</Badge>`
> - null (no alert) → render nothing (the indicator returns null)
> - If the existing drift-indicator.tsx already implements this exact logic, just WIRE it (pass the
>   prop); do NOT rewrite it. If its prop shape differs (e.g. it expects to fetch by brandId/auditId
>   rather than receive driftSeverity), adapt the call minimally to the canon "fetched server-side,
>   passed as prop" pattern (L884) — prefer passing the already-joined driftSeverity over a new query.
> - Place the badge inline on the row (next to the score/date), consistent with the prototype's audit-
>   history styling. Don't disrupt the existing row layout.

### Step 1.4 — Verify FM5 on real data
> - On a brand WITH an unacknowledged drift alert (Bondi Plumbing has 2 right now — the Drop −12.4 and
>   the Rise +8.3), the corresponding audit row(s) in audit-history show the matching badge:
>   the drifted audit shows ↓ Drop (danger) or ↑ Rise (success).
> - Audit rows with NO alert show NO badge (no phantom indicators).
> - The `GET /api/audits` response now includes `driftSeverity` per row (null where no alert).
> - One audit row maps to at most one badge (subquery prevented duplication).
> - RLS holds: a second org's audits never show this org's drift badges.
> - `npm run typecheck` passes; both light/dark themes; existing audit-list behaviour otherwise
>   unchanged.
> **Report:** the query change, how the indicator was wired (prop vs adapted), and a description/
> screenshot of a Drop and a Rise badge on the relevant audit rows.

═══════════════════════════════════════════════════════════════════════════════
PART 2 — VERIFY ONLY (do NOT rebuild if already present)
═══════════════════════════════════════════════════════════════════════════════

### Step 2.1 — TikTok placeholder in cited-sources
> Canon L80 / L1611 / DoD L1658: the cited-sources view should show a grayed-out "TikTok" element with
> a "Coming v1.1" tooltip (per FF3: a grayed row, opacity ~0.45, dash score, tooltip badge — NO actual
> TikTok parsing). This was likely added in an earlier pass.
> - CHECK the cited-sources / per-engine-breakdown UI for the grayed TikTok placeholder + "Coming v1.1"
>   tooltip.
> - If PRESENT and matches (grayed, no data, tooltip) → report DONE, change nothing.
> - If MISSING → add ONLY the placeholder: a grayed-out TikTok row/badge (opacity ~0.45, dash/no
>   score) with a "Coming v1.1" tooltip. Do NOT implement any TikTok parsing (explicitly deferred to
>   v1.1, canon L1612/L1672).
> **Report:** present-or-added, with what you saw.

### Step 2.2 — Foglift attribution in ATTRIBUTIONS.md
> Canon L81 / L1614-1615: ATTRIBUTIONS.md must credit **Foglift (MIT)** for the webhook event taxonomy
> + 6-channel pattern.
> - CHECK ATTRIBUTIONS.md for a Foglift entry.
> - If PRESENT → report DONE, change nothing.
> - If MISSING → add one line: `Foglift (MIT) — webhook event taxonomy + 6-channel pattern`.
> **Report:** present-or-added, with the line.

═══════════════════════════════════════════════════════════════════════════════
FINAL REPORT
═══════════════════════════════════════════════════════════════════════════════
> - PART 1: FM5 built — the query change, indicator wiring, and the Drop/Rise badges verified on Bondi
>   Plumbing's audit history (before/after).
> - PART 2: TikTok placeholder — present or added. Foglift attribution — present or added.
> - Confirm: no scoring changed; GET /api/audits change is additive; RLS intact; typecheck passes.
> - State explicitly that the webhook recipe pages + export UI helpers were NOT touched (out of this
>   prompt's scope).

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **FM5 is the only functional item here** — it wires the already-built drift-indicator.tsx to data so
  the drift badge actually appears on audit-history rows. You have a perfect live test case right now:
  Bondi Plumbing has 2 unacknowledged alerts (Drop −12.4, Rise +8.3), so after this you should SEE a
  ↓ Drop and ↑ Rise badge on the matching audit rows. That's the before/after proof.
- **The JOIN uses the subquery form** (canon L888) deliberately — the plain LEFT JOIN at canon L40
  could duplicate an audit row if it had >1 unacknowledged alert. The subquery returns one severity
  per audit. Minor robustness point, but worth getting right on an API used across the app.
- **#4 and #5 are verify-not-build** — likely already done from earlier sprints; the prompt only adds
  them if genuinely missing, and explicitly forbids TikTok parsing (placeholder only).
- **Deliberately excluded:** the 7 webhook recipe doc pages + the 2 export UI helper components
  (format-tooltip, ci-integration-cta). They're in-scope but static/minor — decide separately whether
  to build now or defer as Sprint 8 content polish. I can write that prompt if you want them.
- Per your relay discipline: PART 1 touches a Sprint 4 API (GET /api/audits) used app-wide, so the
  JOIN + RLS scoping is the bit worth a reviewer's second look before it lands.
