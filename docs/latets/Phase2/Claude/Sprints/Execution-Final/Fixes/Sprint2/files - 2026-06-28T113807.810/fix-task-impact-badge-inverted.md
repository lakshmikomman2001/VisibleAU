# Claude Code — FIX: task-card impact/priority badge shows wrong band (Finding 4)

Sprint 2 manual testing: a task created from the **High-impact** recommendation ("Your AU local directory
listings are incomplete") renders a **"Low Impact"** badge on its kanban card — contradicting its own data
(confidence **High**, scoreBefore **80**, dimension frequency). The band is wrong/inverted. This is the EXACT
trap canon already flagged: the badge must NOT render the raw INTEGER `priority` rank as a high/med/low band.

> **Investigate-first.** Before changing anything, find what the badge CURRENTLY binds to and confirm the
> mechanism. Then fix to the canon-specified derivation. Report-first if the cause differs from the hypothesis.

## CANON RULE (the binding contract — EV-01, prototype PriorityBadge note + LLD)
The high/med/low impact band is a **DERIVED display band**, NOT a direct read of a column:
- `remediation_tasks.priority` is **INTEGER** — a 1..N *rank* (priority=1 = top action). **Low integer = HIGH
  priority.** Used for ORDERING the kanban, NOT for the band label.
- The categorical low/medium/high band must be **derived from `effort` + `expectedImpactScore`** (the impact
  magnitude), where **high impact → "High" band**.
- Canon verbatim: *"do NOT render the raw INTEGER priority as if it were 'high'|'medium'|'low'."*

## THE LIKELY BUG (confirm before fixing)
The card appears to render the **integer `priority` rank** mapped onto the band — so a high-impact task (which
ranks #1–2, a LOW integer) shows as **"Low"**. That's an inversion: low rank-number = top priority, but it's
displayed as low impact. Classic integer-rank-vs-categorical-band confusion.

## STEP 1 — Investigate (no change yet)
```bash
# Find the task-card badge component + what value it receives:
grep -rn "PriorityBadge\|Low Impact\|impact.*band\|priority.*badge" components/domain/workflow/ components/phase2/ app/\(auth\)/brands/*/workflow/ --include=*.tsx
# Trace what's passed as the badge's value — is it task.priority (the INTEGER), or a derived band?
grep -rn "PriorityBadge\|impactLabel\|priorityBand\|deriveImpact\|expectedImpactScore\|scoreBefore" components/ lib/workflow/ --include=*.ts --include=*.tsx | head
```
Determine the actual source:
- If the badge reads **`task.priority`** (the integer) and maps it to high/med/low → **that's the bug** (canon
  says don't). Confirm whether low-integer is mapping to "Low" (the inversion).
- If it reads **`effort`** or **`scoreBefore`** with a wrong threshold → identify the wrong mapping.
- **Report what you found** before applying the fix.

## STEP 2 — Fix to the canon derivation
Bind the badge to a **derived impact band from `expectedImpactScore` (+ `effort`)**, NOT the integer priority:
- Map the impact magnitude → band. Use the same buckets the recommendation uses
  (`expectedImpactScore` high/medium/low, or `scoreBefore`: e.g. ≥70 → High, 40–69 → Medium, <40 → Low —
  match whatever the recommendation's impact scale already is; the task carries `scoreBefore` 80 = High).
- Keep the **integer `priority`** for **ordering** the kanban (rank 1 first) — do NOT display it as the band.
- So this High-impact task (scoreBefore 80) must show **"High"**, not "Low".
- Clarify the LABEL if needed: if the badge means *impact*, label it "High/Med/Low" consistently (the card
  currently shows "Low Impact" — ensure the word "Impact" + the band agree with the source).

## STEP 3 — Verify (behavioural, on the real task)
- Reload the Bondi Plumbing kanban (`/brands/8f59b2a2-6aa0-4318-9848-b33ed520ca36/workflow/tasks`). The task
  "Your AU local directory listings are incomplete" must now show **High** impact (it's the High-impact /
  scoreBefore-80 recommendation) — NOT "Low".
- Create a task from a **Medium** recommendation (e.g. "Get mentioned in relevant Reddit threads") → its card
  shows **Med**. (Confirms the band tracks impact, not the rank.)
- Confirm the kanban still **orders** by the integer priority (top-priority task first) — ordering unchanged,
  only the displayed band corrected.
- Confidence badge still shows **High** for the confirmed recommendation (don't regress that — it was correct).
- Full suite green.

## REPORT
- What the badge was actually binding to (integer priority? wrong threshold?) — confirm the mechanism.
- The fix: derive band from expectedImpactScore/effort; integer priority retained for ordering only.
- Behavioural confirmation: the Bondi High-impact task now shows High; a Medium task shows Med; ordering intact.
- Confirm no regression to the confidence badge or kanban sort; suite green.
