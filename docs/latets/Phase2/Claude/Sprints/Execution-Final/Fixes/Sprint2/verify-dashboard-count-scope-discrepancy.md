# Claude Code — VERIFY (likely a labelling fix, not a count bug): dashboard vs WorkflowHub "completed" count

Canon already DIAGNOSED this (Phase 2 LLD changelog, the v-pass entry at ~lines 454–465). The two numbers are NOT
contradictory — they are **different SCOPES**, and the apparent discrepancy was a missing scope LABEL, not a wrong
count:

- **Dashboard "Work Completed"** = the org-wide Action Progress Tracker metric:
  `COUNT(remediation_tasks WHERE status='complete' AND updated_at >= period_start)` across **ALL brands** in the
  org (LLD lines ~1898 / ~8608). Canonical framing: **"X / N gaps closed this month"** (e.g. "4 / 11").
- **WorkflowHub "Done this month"** = the **single-brand** task counter for the brand currently being viewed.

Same period, two scopes (whole org vs one brand) → legitimately different numbers. The PROTOTYPE fix was to make
the scope explicit: dashboard shows **"4 / 11 gaps closed this month"** with an inline note that the scope differs
from WorkflowHub by design. So the question for the BUILD is: did it carry over the corrected scoping + labelling,
or does it still show two bare unlabelled numbers that READ as a contradiction?

**This is VERIFY-FIRST.** The underlying queries are almost certainly correct (org-wide vs per-brand by design).
The only likely fix is a missing scope label/denominator on the dashboard — NOT changing any count. Do not "fix"
the numbers to match each other; they are SUPPOSED to differ by scope.

> **Investigate-first. Confirm what each surface actually queries + displays.** Read:
> - `lib/workflow/progress-summary.ts` — the shared progress helper. Confirm: does it compute the dashboard
>   "Work Completed" as **org-wide** `COUNT(remediation_tasks WHERE status='complete' AND updated_at >=
>   period_start)`? Is there a denominator (N gaps) for the "X / N" framing?
> - The **dashboard** "Work Completed" component (wherever the Action Progress Tracker / "gaps closed this month"
>   renders). Does it show "X / N gaps closed this month" with org-wide scope made explicit, or a bare "4"?
> - The **WorkflowHub** "Done this month" card (`workflow-hub-client.tsx` — the third stat card). Confirm it's the
>   single-brand count (status='complete', this brand, this period).
> - `GET /api/brands/[id]/progress` (and any org-level progress endpoint) — confirm which scope each serves.
> Report: the exact query + scope behind EACH number, and how each is currently LABELLED in the UI.

---

## DECISION TREE (report which case applies, then act)

### CASE 1 — Build already matches the corrected prototype → NO FIX
If the dashboard shows the org-wide metric WITH explicit scope (e.g. "X / N gaps closed this month" or a clear
"across all brands" label) AND WorkflowHub shows the per-brand count clearly → the numbers correctly differ by
scope and are properly labelled. **Nothing to change.** Report CASE 1 with the evidence (both labels + both
queries) and stop.

### CASE 2 — Build shows two bare unlabelled numbers → LABELLING FIX ONLY
If the dashboard shows a bare count (e.g. "4 recommendations completed") with no scope/denominator, so it reads as
contradicting WorkflowHub's per-brand "Done this month" → apply the SAME fix the prototype got:
- Dashboard "Work Completed": render the org-wide metric with the canonical **"X / N gaps closed this month"**
  framing (X = completed this period org-wide; N = total relevant gaps/tasks — use the denominator
  progress-summary already computes; do NOT invent numbers). Add a brief scope cue so it's clear this is org-wide
  (e.g. "across all brands" or the existing label convention) — distinct from WorkflowHub's per-brand counter.
- Do NOT change the WorkflowHub per-brand number or either underlying query. This is a DISPLAY/label change only.

### CASE 3 — A number is genuinely WRONG (not just unlabelled) → real bug, report before fixing
If investigation shows a query is actually incorrect (e.g. the dashboard "org-wide" count is missing a brand,
double-counting, wrong period boundary, or the per-brand count includes other brands) → that's a real bug. Report
the exact query defect and the corrected query for Sri's review BEFORE changing it. (This is the least likely
case — canon says the scopes are by-design correct.)

## INVARIANTS — do not violate
- The two numbers are SUPPOSED to differ (org-wide vs per-brand). Do NOT make them equal. The goal is CLARITY of
  scope, not matching values.
- Dashboard "Work Completed" = org-wide `status='complete'` this period; WorkflowHub "Done this month" = single
  brand. Preserve both scopes.
- `status='complete'` (no -d) for `remediation_tasks` — the canonical spelling. Period boundary = `updated_at >=
  period_start`.
- If relabelling (CASE 2): no invented numbers — X and N come from progress-summary's real computation. Display
  change only; queries unchanged.
- Reuse existing components / labels / tokens; don't introduce new UI primitives.

## VERIFY
1. Identify the period and create a known state: confirm how many `remediation_tasks` are `status='complete'` with
   `updated_at` in the current period, **org-wide** vs **for Bondi specifically**:
   ```bash
   psql "$DATABASE_URL" -c "SELECT COUNT(*) AS org_wide_complete FROM remediation_tasks WHERE status='complete' AND updated_at >= date_trunc('month', now());"
   psql "$DATABASE_URL" -c "SELECT COUNT(*) AS bondi_complete FROM remediation_tasks WHERE status='complete' AND updated_at >= date_trunc('month', now()) AND brand_id='8f59b2a2-6aa0-4318-9848-b33ed520ca36';"
   ```
   (Adjust period boundary to match what progress-summary actually uses.)
2. Dashboard "Work Completed" number == the **org_wide_complete** count, and is labelled with org-wide scope
   (+ denominator if "X / N").
3. WorkflowHub "Done this month" (Bondi) == the **bondi_complete** count, labelled as the per-brand counter.
4. The two are now clearly distinguishable by scope in the UI — a user does not read them as contradictory.
5. (If CASE 2 fix applied) No query changed — confirm via diff that only display/label code moved.
6. Suite green; only the known pre-existing `audit_cost_snapshots` red.

## REPORT
- The exact query + scope behind EACH number (dashboard org-wide vs WorkflowHub per-brand) and their current
  labels.
- **Which CASE applies (1 / 2 / 3)** and the evidence.
- If CASE 1: confirmation both are correctly scoped + labelled — no change.
- If CASE 2: the labelling change made (org-wide "X / N gaps closed this month" + scope cue), with proof no query
  or count changed.
- If CASE 3: the genuine query defect + proposed corrected query (do NOT apply without Sri's sign-off).
- DB cross-check: org_wide_complete vs bondi_complete counts vs what each surface displays.
- Confirm invariants: scopes preserved (numbers NOT forced equal), status='complete' spelling, no invented
  numbers. Suite green.

## NOTE
Per the LLD changelog, the prototype was already corrected to "4 / 11 gaps closed this month" with a scope comment
(4 and 11 are the LLD's own canonical example, lines 1898/8608). This task confirms the BUILD carried that
correction over; most likely outcome is CASE 1 (already fine) or a small CASE 2 label addition.
