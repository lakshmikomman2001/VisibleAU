# Claude Code — Sprint 2 Test Task Runner (v3)
# Source: Lucky_test_prompts.xlsx (Sheet1)
# Tasks: 20 | Columns: A=Task#, B=Task description, C=Status
# Current state: Tasks 1–19 Done. Task 20 is the only remaining task.

---

## CURRENT STATE — READ THIS FIRST

Tasks 1–19 are already complete. Do NOT re-run them.
Check column C before touching anything — if a task already shows Done or
Done - errors fixed, skip it and move on.

| Tasks | Status |
|-------|--------|
| 1, 2, 7, 16 | Done - errors fixed |
| 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19 | Done |
| **20** | **Blank — this is your only task** |

---

## READ THESE FIRST — BEFORE ANY CODE

1. `C:\startup\VisibleAU\src\docs\latets\CodePrompts\CLAUDE.md`                          — stack, conventions, anti-patterns
2. `C:\startup\VisibleAU\src\docs\latets\CodePrompts\sri-visibleau-foundations.md` v1.12 — folder structure + schema (§2 + §3)
3. `C:\startup\VisibleAU\src\docs\latets\CodePrompts\sri-visibleau-sprint-1-prompt.md`   — what Sprint 2 built + acceptance criteria
4. `Lucky_test_prompts.xlsx`            — confirm task 20 column C is blank (your only task)
5. `scripts/qa/sprint2/`               — read ALL batch scripts created in task 19
   before running any of them

---

## TASK 20 — FULL SPECIFICATION

**Column B text (verbatim):**
> Could you please run each batch script by yourself for each feature and make
> sure each batch script launches both backend and frontend and run the feature
> level tests, when running each batch script then the script should close the
> backend APIs and frontend app and relaunch the backend API and frontend app
> and then test the feature with real test data.

**What this means in plain terms:**
For every batch script that was created in task 19 (one per feature):

1. **Close** any running backend API server and frontend app (clean slate)
2. **Launch** the backend API server fresh
3. **Launch** the frontend app fresh
4. **Wait** for both to be fully ready before proceeding
5. **Run** the batch script — it inputs real test data and tests the feature end-to-end
6. **Record** the result: Pass or Fail, with details
7. **Close** the backend and frontend again (clean up for the next script)
8. **Repeat** for the next batch script

After all scripts have run, produce a full summary report.

---

## YOUR EXACT WORKFLOW FOR TASK 20

### Step 1 — Update status to In Progress
```python
import openpyxl

XLSX_PATH = "Lucky_test_prompts.xlsx"  # adjust to actual path in repo

def set_task_status(task_number: int, status: str):
    wb = openpyxl.load_workbook(XLSX_PATH)
    ws = wb.active
    for row in ws.iter_rows():
        if row[0].value == task_number:
            row[2].value = status         # column C
            break
    wb.save(XLSX_PATH)
    print(f"[STATUS] Task {task_number} → {status}")

set_task_status(20, "In Progress")
```

### Step 2 — Discover all batch scripts from task 19
Read the `scripts/qa/sprint2/` folder and list every `.bat` or `.sh` file.
These are the scripts you will run one by one. Do not skip any.

### Step 3 — For each batch script, run this sequence

```
FOR EACH script in scripts/qa/sprint2/:

  A. SHUTDOWN — stop any running backend and frontend processes
     - Kill the backend API server (check for processes on its port, e.g. 3001)
     - Kill the frontend dev server (check for processes on its port, e.g. 3000)
     - Wait 3 seconds to confirm both are fully stopped
     - Verify the ports are free before continuing

  B. LAUNCH BACKEND
     - Start the backend API server (e.g. pnpm dev:api or equivalent)
     - Wait until the backend is ready (health check endpoint responds 200)
     - Confirm: backend is up and accepting requests

  C. LAUNCH FRONTEND
     - Start the frontend dev server (e.g. pnpm dev)
     - Wait until the frontend is ready (HTTP 200 on localhost:3000 or equivalent)
     - Confirm: frontend is up and rendering

  D. RUN THE BATCH SCRIPT
     - Execute the batch script for this feature
     - Capture full stdout and stderr output
     - Note: Pass or Fail

  E. RECORD RESULT
     - Feature name:
     - Script name:
     - Result: Pass / Fail
     - If Fail: exact error message, which step failed, screenshot if possible

  F. SHUTDOWN AGAIN (clean slate for next script)
     - Stop backend API server
     - Stop frontend dev server
     - Wait 3 seconds to confirm both stopped

  G. Move to next script
```

### Step 4 — Fix any failures before marking Done

If any script fails:
1. Read the full error output carefully
2. Diagnose the root cause — do not guess
3. Fix the issue (in the batch script, the app code, or the test data)
4. Re-run that script from the beginning of Step 3 (full shutdown → launch → test)
5. Confirm it passes before moving to the next script
6. Note what was fixed in your summary report

Do not move to the next script until the current one passes.

### Step 5 — Produce a summary report

Once all scripts have passed, print a summary to the terminal:

```
============================================================
TASK 20 — BATCH SCRIPT RESULTS SUMMARY
============================================================
Script                          Feature              Result
------------------------------------------------------------
test-auth-signup.bat            User signup          ✅ Pass
test-brand-create.bat           Brand creation       ✅ Pass
test-audit-run.bat              Run audit            ✅ Pass (errors fixed)
test-dashboard.bat              Dashboard load       ✅ Pass
... (one row per script)
------------------------------------------------------------
Total: X passed, Y failed (all fixed), 0 remaining failures
============================================================
```

### Step 6 — Update status to Done
```python
set_task_status(20, "Done")
# If any script had errors you fixed:
set_task_status(20, "Done - errors fixed")
```

---

## PORT AND PROCESS MANAGEMENT

Before running any script, check which ports your backend and frontend use.
Check `package.json`, `.env`, `.env.local`, or `next.config.ts` for port config.
Common defaults for this stack (Next.js + separate API):
- Frontend: port 3000
- Backend API: port 3001

To check and kill processes on a port (cross-platform):

**Windows (batch):**
```bat
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

**Mac/Linux (bash):**
```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null
```

**Health check — wait for backend to be ready:**
```bash
# Wait until backend responds (max 30 seconds)
for i in {1..30}; do
  curl -s http://localhost:3001/health && break || sleep 1
done
```

---

## CLEAN STATE DEFINITION

Task 20 is in clean state when ALL of the following are true:
- ✅ Every batch script ran successfully (Pass)
- ✅ Each script performed a clean shutdown → relaunch → test cycle
- ✅ Real test data was used (not mocks) for every feature test
- ✅ No script was skipped
- ✅ All failures were fixed and re-tested before moving on

---

## BLOCKER REPORTING

If you hit something you genuinely cannot fix, stop and report:

```
❌ BLOCKED on Task 20 — [script name]: [one-line description]

Script:     [filename]
Feature:    [feature being tested]
Error:      [exact error message]
Step:       [which step failed — shutdown / launch backend / launch frontend / test]
Tried:      [what you attempted to fix it]
Root cause: [what you identified but cannot resolve]
Needs:      [what Sri must do to unblock]
```

Set column C = `Blocked` and stop.

---

## NEVER-CHANGE LIST

These are locked from CLAUDE.md — do not alter in any fix:

| Rule | Value |
|------|-------|
| Cross-org access | 404 not 401 — always |
| DIMENSION_WEIGHTS | 25 / 25 / 20 / 15 / 15 |
| Commodified context score | 25 — NOT 0 |
| Mock LLM canonical scenarios | 4 scenarios — unchanged |
| Schema changes | Additive only — never destructive |

---

## START SEQUENCE

1. Read `C:\startup\VisibleAU\src\docs\latets\CodePrompts\CLAUDE.md` → `C:\startup\VisibleAU\src\docs\latets\CodePrompts\sri-visibleau-foundations.md` → `sri-visibleau-sprint-1-prompt.md`
2. Open `Lucky_test_prompts.xlsx` — confirm tasks 1–19 are Done, task 20 is blank
3. Read ALL scripts in `scripts/qa/sprint2/` — know what each one tests
4. Set task 20 column C = `In Progress` → save
5. Begin the shutdown → launch → test cycle for the first script

Work through every script in order. Fix failures before moving on.
Stop only on a genuine blocker. Report clearly if you do.
