# Claude Code — Sprint 3 automated tests · SECTION 5 of 5: QA (batch-script run) — CLOSES THE TRACK

Final section of the Sprint 3 test track. Sections 1 (Backend Unit 80) + 2 (Backend E2E 263, acceptance MET) + 3
(Frontend Unit 65) + 4 (Frontend E2E 16, 1 crash bug + 2 copy drifts fixed) are all green. Section 5 = **QA-1
Batch-script run** — the operational launch flow, matching the Sprint 2 Section-5 QA row.

## What QA-1 is (from the checklist)
**QA-1 Batch-script run:** run each Sprint 3 feature's **batch script** yourself. Confirm the script **closes &
relaunches BOTH the backend API and the frontend app**, then **exercises the feature with real test data**. Mark
Done only after you've **watched it run end-to-end**. This is not code assertions — it's confirming the feature
launches and works via its actual startup/run script.

## ⚠️ FIRST — DO THE BATCH SCRIPTS EVEN EXIST? (Sprint 2's Section 5 found they did NOT)
In Sprint 2, Section 5 discovered there were **no `p2sprint2` batch scripts** — it became a documented backlog gap,
and a fallback was run instead of pretend-passing. **Sprint 3 may be the same.** So STEP 0 is: check whether
Sprint-3-specific batch scripts exist.
```bash
# Look for Sprint 3 / visibility batch/launch scripts (Windows .bat or shell equivalents):
ls *.bat scripts/*.bat 2>/dev/null | grep -iE "sprint3|visibility|p2s3|START"
find . -maxdepth 2 -iname "*.bat" 2>/dev/null | head -30
grep -rniE "sprint3|visibility|share.?of.?voice|fan.?out|topical" *.bat scripts/ 2>/dev/null | head
# The general app-launch scripts (backend + frontend + inngest) that DO exist:
ls START-*.bat *.bat 2>/dev/null
```
- **If Sprint-3 batch scripts EXIST:** run each per QA-1 (below).
- **If they do NOT exist (likely):** do NOT pretend-pass. **Document the gap** (as Sprint 2 did — a backlog item:
  "no p2sprint3 batch scripts") and run the **FALLBACK** (below) — a full end-to-end launch + feature exercise using
  the general startup scripts + the real app, so QA-1's INTENT (the feature launches and works end-to-end with real
  data) is still satisfied.

## ⚠️ DATABASE + INNGEST (same guards as Section 4)
- **DEV DB only, never prod** (this exercises real data + may seed). Confirm which DB the run used. If the app is on
  `visibleau_prod`, restart on dev (`visibleau`) with `LLM_MODE=mock` for this run — the recurring footgun.
- **Inngest in DEV mode** — Sprint 3's visibility data comes from the 5 functions firing on `audit.complete`. For
  the end-to-end exercise, Inngest must be up so an audit run populates the visibility tables (or seed the tables
  and exercise the read paths). Never "pass" on empty/never-fired.

## SPRINT 3 FEATURES TO EXERCISE (Layer 2 — Visibility Intelligence)
- Visibility hub (SoV bars, mention-source matrix, fan-out tree, topical gaps, volatility)
- Citation Failure Diagnosis (CPR-01 graceful)
- Competitive Benchmark panel (CPR-01 "Coming soon" + tier gating)
- Dashboard SoV strip
- The 6 Inngest functions firing on `audit.complete`; the wins feed

## QA-1 — the run (if batch scripts exist) OR the FALLBACK (if not)

### If Sprint-3 batch scripts exist:
For each, run it and **watch end-to-end**: confirm it **closes & relaunches BOTH backend + frontend** (and Inngest
if the script manages it), then exercises the visibility feature with **real test data** on a seeded brand. Mark
each Done only after watching it complete.

### FALLBACK (if no Sprint-3 batch scripts — the likely path):
Document the gap, then do the equivalent end-to-end manually via the general startup scripts:
1. **Relaunch the stack** (backend + frontend [+ Inngest dev]) via the existing `START-*.bat` (or the documented
   dev-start), pointed at the **dev DB** with `LLM_MODE=mock`. Confirm both come up healthy (app responds; Inngest
   synced at `:8288/apps`).
2. **Seed + run an audit** for a test brand (Bondi-equivalent) so the 5 Sprint-3 functions fire on `audit.complete`
   and populate the visibility tables (share_of_voice_snapshots, visibility_trends, query_fan_out_results,
   topical_coverage_gaps, + citation classification). Confirm in Inngest the functions ran green.
3. **Exercise the visibility features end-to-end** (real data, on screen or via the run):
   - Visibility hub loads; **SoV renders as bars** (brand highlighted, competitors muted); mention-source matrix,
     fan-out (real suburb, no literal {location}), topical gaps (HIGH LEVERAGE badge at ≥2), volatility.
   - Citation Failure Diagnosis loads with the **CPR-01 graceful state** (no 500).
   - Competitive Benchmark shows the **"Coming soon"** card + tier gating.
   - Dashboard SoV strip renders (independent of tasks).
   - Wins feed returns (multi-engine → no crash — the BE-3 fix).
4. **Confirm the launch flow works** — the stack relaunches cleanly and the features function with real data,
   watched end-to-end. That satisfies QA-1's intent even without a sprint-specific batch script.

## GO-LIVE ITEM TO NOTE (not a QA-1 blocker, but surface it)
- **Inngest for real prod** — in the local-app-against-prod-DB / real-deploy scenario, Inngest needs the dev server
  (START-INNGEST.bat + dev mode) or Cloud keys + a deployed serve endpoint. The bare-`inngest.send()` routes fail
  when Inngest is unreachable (the pattern from Sprint 2). For QA-1 here (dev + Inngest up) it's fine; note it as a
  go-live item, don't block Section 5 on it.
- **go-live #12 (SoV domain-variant normalisation)** — still a `test.todo`; not a Section-5 blocker.

## INVARIANTS
- DEV DB only — never prod. Confirm which DB. Inngest dev mode for event-dependent data (or seed; never pass on
  empty).
- If no Sprint-3 batch scripts: **document the gap + run the fallback** — do NOT mark QA-1 Done with pretend results.
- `LLM_MODE=mock` (mock values are canned → confirm the features WORK/render, not specific numbers).
- Don't regress the 328 + 16 existing tests. Don't change source in Section 5 (this is a run/verify section, not a
  fix section) unless a genuine launch-blocking bug is found — then flag it.

## VERIFY / REPORT
- **STEP 0:** do Sprint-3 batch scripts exist? (list what was found.) If not → the documented gap + the fallback
  path taken.
- **Which DB** the run used (confirm dev, not prod) + Inngest dev-mode confirmed (functions fired green on
  `audit.complete`).
- The end-to-end exercise result: the stack relaunched (backend + frontend [+ Inngest]) cleanly; each visibility
  feature exercised with real data and worked (hub/bars, citation-failure CPR-01, competitive-benchmark coming-soon
  + tiering, dashboard strip, wins feed no-crash).
- Any launch-blocking issue found (flagged, not silently fixed).
- The go-live notes surfaced (Inngest-for-prod; #12 todo) — as notes, not blockers.
- **Section 5 (QA) status: COMPLETE** (batch scripts run, OR gap documented + fallback exercised end-to-end) — which
  **closes the full Sprint 3 automated test track (all 5 sections)**.

## NOTE — this closes the track
Section 5 of 5. After it: **all five Sprint 3 test sections are complete** — Backend Unit, Backend E2E (acceptance
MET), Frontend Unit, Frontend E2E, and QA. Combined with the manual on-screen pass (8 bugs) + the enhancement +
the cross-sprint/E2E bugs found and fixed, Sprint 3 is validated at every layer. The remaining forward items are
backlog/go-live notes (p2sprint3 batch scripts if missing; Inngest-for-prod wiring; go-live #12 domain
normalisation), not Sprint-3 blockers. Report the track as COMPLETE (or list any blocked row with its reason).
