# GATHER S9 CANON — bundle for the reviewer chat (so the S9 walk is canon-grounded, like S8)

The reviewer chat verified S8 against LLD v8.70 + the S8 prompt + prototype FIX17. It does NOT have
S9's canon. To walk S9's screens the same way (every finding tied to a specific canon line), it needs
the S9 sources. Collect them into one place and paste/attach so the reviewer can read them directly.

## What to collect (the 3 sources, S9 versions)

### 1 — The S9 sprint prompt
```bash
cd c:/startup/VisibleAU
# Find the S9 prompt (the report referenced sri-visibleau-sprint-9-prompt.md earlier):
find . -iname "*sprint*9*prompt*" -o -iname "*sprint-9*" 2>/dev/null | grep -iE "prompt|sprint.?9" | head
```
Copy the S9 prompt to the outputs area so it can be shared:
`cp <found-s9-prompt.md> /mnt/user-data/outputs/S9-CANON-sprint-9-prompt.md` (or paste its full text).

### 2 — The current LLD, S9/Autopilot sections
The report mentions **v8.16** and things I don't have specs for (autopilot-loop, action-progress,
health-check cross-layer synthesis, explainability, S9b-01 honesty rule). My handoff had LLD v8.70 —
so either there's a different LLD lineage or a newer version. Clarify + extract:
```bash
cd c:/startup/VisibleAU
# Which LLD is current? (v8.16? v8.70? a newer one?)
find . -iname "*LLD*" -o -iname "*lld*" 2>/dev/null | grep -iE "phase2|phase-2|lld" | head
```
From the CURRENT LLD, extract the S9 / Layer-8 (Autopilot) region — the sections defining:
- the **autopilot loop** (the 5 steps + presentational states done/current/pending + the honesty
  rule S9b-01: scoreAfter/liftAchieved only shown when real, never fabricated)
- the **action-progress tracker** (remediation_tasks-backed, tier gate, response shape)
- the **health-check cross-layer synthesis** (scoreComposite / localAiTrustScore / dimensions +
  thresholds + the SaaS-skip rule)
- the **explainability** render contract (rendered, not regenerated; no ExplainabilityService/
  annotate())
- the **prompt-trend** route (the v8.16 JOIN audits fix + the citations.brand_id bug that must NOT
  recur)
- the RBAC / assertBrandAccess requirements on the S9 routes
Copy that region to `/mnt/user-data/outputs/S9-CANON-lld-autopilot-region.md` (or paste it). If it's
large, the section headers + the specific screen/route specs + any DDL for new tables are what
matter most.

### 3 — The prototype (S9 screens)
```bash
cd c:/startup/VisibleAU
# Which prototype is current? (my handoff had FIX17 — is there a newer one with the S9 screens?)
find . -iname "*prototype*" 2>/dev/null | grep -iE "phase2|phase-2|FIX|prototype" | head
```
If the current prototype has the S9 screens (autopilot loop, action-progress, health-check,
explainability), copy it (or the relevant components) to
`/mnt/user-data/outputs/S9-CANON-prototype.jsx` (or note if S9 screens were NOT prototyped — like
the S8 audit-trail screen wasn't, which is useful to know up front, since un-prototyped screens are
where gaps cluster).

## Also tell the reviewer (paste inline, briefly)
1. **Which DB** you'll walk S9 on — `visibleau_prod` (the real-integrations one you used for S8), and
   whether it has S9 data yet (any autopilot runs / remediation_tasks / health-check scores to view).
2. **Which S9 screens are reachable** and their routes (e.g. the autopilot page, action-progress,
   health dashboard) — so the walk targets real URLs.
3. **The v8.16 vs v8.70 LLD question** — is v8.16 a typo, a different doc, or a newer LLD that
   supersedes the v8.70 I have? (This matters — I need to know which is authoritative for S9.)

## Report back (paste inline or attach)
- The S9 prompt (full).
- The LLD S9/Autopilot region (the screen/route specs + any new-table DDL).
- The prototype S9 screens (or confirmation they weren't prototyped).
- The 3 context answers above (DB, reachable screens+routes, the LLD version question).
