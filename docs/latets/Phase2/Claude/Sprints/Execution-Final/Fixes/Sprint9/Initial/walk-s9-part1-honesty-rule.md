# S9 WALK — PART 1: The Honesty Rule (Autopilot Measure step + Action Progress Tracker)

## Why this first
S9's greps are 18/18 green — but S8 shipped 15 findings under 28 green greps, and the honesty rule is
the ONE thing a grep structurally cannot verify. Here's the gap, precisely:

The canonical query (LLD 7895–7931) returns TWO numbers with DIFFERENT filters:
- **WORK COMPLETED** = `COUNT(*) FILTER (status='complete' AND date_trunc('month',completed_at)=date_trunc('month',now()))`
- **MEASURED IMPACT** = `COALESCE(SUM(lift_achieved) FILTER (score_after IS NOT NULL AND <same month>), 0)`

**Your prod data hits the exact edge case the rule exists for:** `remediation_tasks` HAS rows with
`status='complete'`, and `score_after` is **NULL on every row**. So the query returns
**WORK COMPLETED = N (positive)** and **MEASURED IMPACT = 0** (the COALESCE default — because NO task
passes the `score_after IS NOT NULL` filter).

The LLD's TWO-STATE DISPLAY rule (v8.32) is explicit about this in-between state:
> • WORK COMPLETED — shown IMMEDIATELY on task completion. e.g. "3 recommendations completed".
> • MEASURED IMPACT — until the validation re-audit runs, show **"Validation audit scheduled —
>   measured impact pending" rather than a zero or a blank.** Once score_after is set, show the lift.

**The grep can pass while the UI is dishonest.** grep #7 checks the SQL mentions score_after /
lift_achieved (11 matches — passes). But the SQL being right does NOT mean the PRESENTATION is right.
The danger v8.32 names is exactly a presentation-layer failure: rendering the COALESCE'd **0** as
"Citation rate ↑0%" / "0% improvement", or as a blank. Only the rendered screen shows which happened.

---

## WALK 1A — Dashboard: the Action Progress Tracker (§6U.4, LLD 7895–7931)
Sign in (Growth+ tier), go to **`/dashboard`**. Screenshot the **Action Progress Tracker** card.

### What MUST be true (LLD-bound)
| # | Check | PASS looks like | FAIL looks like |
|---|---|---|---|
| 1 | **Work Completed shows the real count** | "N recommendations completed" / "N of M gaps closed" with N = the real COUNT of `status='complete'` tasks this UTC month | 0 when tasks exist; or a count that includes non-complete tasks |
| 2 | **Measured Impact shows PENDING, not zero** | **"Validation audit scheduled — measured impact pending"** (or the equivalent copy) | ❌ "Citation rate ↑0%" · ❌ "0% improvement" · ❌ a blank/missing impact line · ❌ any projected/estimated lift |
| 3 | **The two are DISTINCT states** | Work and Impact rendered as separate elements | The two conflated into one line, or Impact absent entirely |
| 4 | **No fabricated lift** | Nothing claims improvement | Any "↑X%" number (there is NO measured lift in your data — every score_after is NULL) |

> **This is the highest-value check in S9.** With `score_after` NULL everywhere, ANY lift number
> displayed is a violation of the binding honesty rule (v8.19/v8.27/v8.32 — the LLD calls it "the
> exact dishonesty the rule forbids", and notes it was a REAL BUG the LLD had to fix once already).

### Also capture (same screenshot / same page)
- The **citation-rate delta** (if the tracker shows one): §6U.2 notes this one IS legitimately a real
  measured week-over-week `visibility_trends` change with an up/down arrow — that's FINE and distinct
  from the per-fix lift. Confirm it's sourced from trends (a real delta), not from lift_achieved.
- The **Health Check entry banner** + **Persona dashboard** sections (we walk those in Part 2).

---

## WALK 1B — Autopilot Loop: the Measure step (§6U.2, honesty rule as a DATA gate)
Go to **`/brands/{brandId}/autopilot`** (Growth+; use a brand with real gaps/tasks — the ones you said
have `topical_coverage_gaps` + `remediation_tasks` + `content_drafts`). Screenshot the full 5-step loop.

### What MUST be true
| # | Step | Check |
|---|---|---|
| 1 | **(1) Audit complete** | Shows the real audit (score · engines · prompts) — real numbers, not placeholders |
| 2 | **(2) #1 gap identified** | The top-priority `remediation_task`/`topical_coverage_gap` — a REAL gap title, not a mock |
| 3 | **(3) Explanation shown** | The explainability rationale + evidence — **RENDERED from stored annotation, not regenerated** (§6U.2 / LLD S9 RULE: "no ExplainabilityService import, no annotate() call in S9 components") |
| 4 | **(4) Draft approved** | The real `content_draft` + a 1-click approve (re-using S2's approve action) |
| 5 | **(5) Re-audit + Measure** | ⚠️ **THE CHECK:** `score_after` is NULL on every task → this step MUST show **"validation audit scheduled — pending"** — NOT a lift number, NOT a projected/estimated %, NOT "improved X%" |

### The step-state check (CRITICAL — presentational, not the DB enum)
§6U.2 (and LLD line 788) bind: `step.status` is **`'done' | 'current' | 'pending'`** — a timeline
stepper concept — **NOT** `remediation_tasks.status` (the DB enum:
`open|in_progress|ready_for_review|complete|wont_fix`).
- **PASS:** the stepper shows done/current/pending states.
- **FAIL:** any raw DB enum leaks into the UI (a step labelled "open" / "ready_for_review" /
  "wont_fix"). *(Note: grep #8 was flagged as "PASS (false positive: 'open' used to derive
  presentational state, not render it)" — a grep that needed a hand-wave. The SCREEN settles it: is
  a DB enum being RENDERED anywhere in the stepper?)*

### The over-attribution check (§6U.2, explicit)
The per-fix delta must be the task's **`lift_achieved`** (= `score_after − score_before` for THIS
fix's re-audit) — **NOT** the overall `visibility_trends` change attributed to one fix (which would
over-attribute). With NULL score_after nothing should display — but if the Measure step DOES show a
number, check whether it's pulling the trend delta (over-attribution) instead of lift_achieved.

### States to note
- **loop-not-started** (a brand with no gaps): EmptyState explaining the loop populates after the
  first audit + gap. Try a brand with no gaps if one exists.
- **RESPONSIVE:** the 5-step timeline is horizontal on `≥lg`, **vertical/stacked on `<lg`** — narrow
  the window and confirm it stacks (don't skip; S8 had responsive gaps).

---

## WALK 1C — Which column does the tracker query actually use? (a canon conflict I found)
Two LLD passages disagree, and the build may have followed either:
- **Sprint 9 plan (LLD ~9162):** `COUNT(remediation_tasks WHERE status='complete' AND **updated_at**
  >= period_start)`
- **Canonical query (LLD 7895, v8.26/v8.32 — later + more specific):** `**completed_at**` with
  `date_trunc('month', completed_at) = date_trunc('month', now())`

`updated_at` ≠ `completed_at` — a task merely EDITED this month touches `updated_at`, inflating the
"work completed" count. The later canonical query should govern. Check the shipped query:
```bash
cd c:/startup/VisibleAU/src
grep -rn "completed_at\|updated_at\|date_trunc\|score_after\|lift_achieved\|FILTER" \
  lib/workflow/progress-summary.ts app/api/brands/*/action-progress/route.ts 2>/dev/null | head -20
```
REPORT: does it use `completed_at` (correct) or `updated_at` (the stale plan wording)? And does the
SUM carry `FILTER (WHERE score_after IS NOT NULL)`? And is the month boundary **UTC**
(`date_trunc('month', now())`) — NOT AEST (the LLD explicitly says do not switch to AEST)?

---

## Report back (paste inline)
1. **Screenshot: `/dashboard`** — the Action Progress Tracker card (Work Completed + Measured Impact).
2. **Screenshot: `/brands/{brandId}/autopilot`** — the full 5-step loop, especially **step 5**.
3. **Screenshot: the autopilot loop at `<lg`** (narrow window — the vertical/stacked timeline).
4. The 1C grep output (completed_at vs updated_at; the score_after FILTER; UTC boundary).
5. **The terminal** during those page loads (any errors, and which routes were hit).
6. Which brandId you used + confirm it has real gaps/tasks/drafts.

## What I'm looking for
The single question: **with `score_after` NULL everywhere, does S9 honestly say "pending" — or does
it show a fabricated/zeroed "improvement"?** The greps say the SQL is right. The screen says whether
the UI is.
