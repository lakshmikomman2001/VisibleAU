# Claude Code — Sprint 2 Automated Tests: Section 5 (QA) — batch-script run

Execute **Section 5 (QA)** of the Phase 2 Sprint 2 test checklist (`phase2-sprint-2-test-checklist.md`) — the LAST
section. Sections 1-4 are done and green (1237+ tests). Section 5 is **QA-1: run each Sprint 2 feature's batch
script, confirm it closes & relaunches BOTH the backend API and the frontend app, then exercises the feature with
real test data — end-to-end, watched.** This is a run-and-observe QA pass, not a test-authoring task.

## ⚠️ DATABASE — dev, not prod (handle yourself)
The batch scripts exercise features with **real test data** (create/mutate rows). Run against the **DEV database,
NOT prod** — the repo was recently pointed at prod for smoke-testing.
- Confirm which DB the scripts/app will use before running. If pointed at prod, switch to dev for this QA run.
- Do NOT run feature batch scripts that create/mutate data against `visibleau_prod`.
- Report which DB the QA run used.

## ⚠️ INNGEST — dev mode reachable (features fire events)
Sprint 2 features (draft generation, task completion → re-audit, scheduled/bulk audits) fire Inngest events. For
the batch scripts to exercise them end-to-end:
- The Inngest dev server must be running + synced (`START-INNGEST.bat`, `:8288`), and the app in **dev mode**
  (`INNGEST_DEV=1` / the `isDev` client — fixed this session). Confirm the `PUT /api/webhooks/inngest` sync is
  200, not 400.
- If a feature's event can't process (Inngest down), the QA run for that feature is INCOMPLETE — do not mark it
  Done on a never-fired event. Report Inngest state.

---

## WHAT SECTION 5 REQUIRES (per QA-1)
For EACH Sprint 2 feature that has a batch script, run the script and confirm it:
1. **Closes & relaunches BOTH** the backend API and the frontend app (the script's job — verify it actually tears
   down and restarts both, not just one).
2. **Exercises the feature with real test data** (creates/uses actual rows in the dev DB).
3. **Runs end-to-end, watched** — the feature works through the full flow, observed to completion (not just
   "script exited 0").

## THE PASSES

### QA-1 — Batch-script run (per feature)
1. **Inventory the batch scripts.** Find the Sprint 2 feature batch scripts:
   ```bash
   ls *.bat 2>/dev/null; ls scripts/*.bat scripts/**/*.bat 2>/dev/null
   grep -rln "START-\|close.*relaunch\|taskkill\|npm run dev\|pnpm dev" . --include=*.bat 2>/dev/null | head
   ```
   Report which batch scripts exist and which Sprint 2 features they cover (Workflow loop / draft generation /
   task completion / re-audit / scheduled audits / bulk re-audit / Action Center / dashboard). If a Sprint 2
   feature has NO batch script, note it (may need one, or QA it manually).
2. **For each script:** run it. Confirm:
   - It closes + relaunches BOTH backend and frontend (watch the process teardown/restart).
   - It exercises the feature with real dev-DB test data.
   - The feature completes end-to-end (the actual outcome happens — e.g. draft created, task completed + re-audit
     fired, lift recorded — not just the script finishing).
3. **Mark each feature Done ONLY after watching it run end-to-end** (per QA-1: "Mark Done only after you've watched
   it run end-to-end"). "Script exited 0" is NOT sufficient — the feature's real effect must be observed.

## INVARIANTS
- DEV DB only for the QA run — never prod (features create/mutate data).
- Inngest in dev mode (synced, 200) so event-driven features actually fire; a never-fired event = INCOMPLETE, not
  Done.
- Do NOT modify feature source to make a script pass — this is QA/observation. If a batch script reveals a REAL
  bug (a feature doesn't work end-to-end), REPORT it (don't silently patch) — it'd be a new finding, same
  report-first discipline as the other sections.
- If a batch script itself is broken (wrong path, doesn't relaunch both services), that's a script fix, not a
  feature change — report + fix the script.

## VERIFY / REPORT
- **Which DB the QA run used** (dev, not prod) + Inngest dev-mode state (sync 200).
- **Batch-script inventory:** which scripts exist, which Sprint 2 features they cover, any feature with no script.
- **Per feature/script:** did it close+relaunch both backend & frontend? Exercise with real test data? Complete
  end-to-end (the real effect observed)? Done / Blocked-<reason>.
- **Any real bugs surfaced** by the QA run (feature doesn't work end-to-end) — reported, not silently patched.
- **Any script issues** (script broken vs feature broken) — distinguished and reported.
- Final Section 5 status: QA-1 Done for all Sprint 2 features (or blocked rows with reasons).

## NOTE — this closes the Sprint 2 automated test track
With Section 5 done, all 5 sections are complete: Backend Unit, Backend E2E, Frontend Unit, Frontend E2E, QA. That
finishes the Sprint 2 test track. Remaining go-live items (deployment: prod role, Inngest Cloud keys, prod
test-data cleanup) are separate infra tasks, not test sections. If any Sprint 2 feature lacks a batch script and
one is expected by the checklist convention, flag it — but the core requirement is watching each feature run
end-to-end with real data through its script.
