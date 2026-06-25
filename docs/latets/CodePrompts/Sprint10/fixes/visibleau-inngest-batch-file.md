# VisibleAU — Create a Windows batch file to launch the Inngest dev server
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
Goal: a `START-INNGEST.bat` (matching the existing `START-DEV.bat` / `START-PROD.bat` convention) that
starts the Inngest dev server correctly so crons fire locally and the dashboard at
http://localhost:8288 works. Operator is on Windows (WSL2 available); IDE VS Code / JetBrains.

---

## Context
`pnpm dev` does NOT start Inngest — the Inngest **dev server** is a separate process that drives crons
and serves the dashboard. Without it, scheduled functions (e.g. `audit-schedules-cron`) never fire.
The operator wants a one-double-click batch file to launch it, like their existing START-DEV.bat.

The Next.js app runs on **port 3000**, so the Inngest dev server must be pointed at
`http://localhost:3000/api/inngest` (its default discovery port is 8288/8000, not 3000).

## STEP 0 — Detect the correct command (don't guess)
```bash
# (a) Existing batch-file convention to match (style, pause, echo, how they invoke pnpm):
ls *.bat 2>/dev/null && cat START-DEV.bat 2>/dev/null

# (b) Is there already an inngest script in package.json?
grep -nE "inngest" package.json

# (c) What's the Inngest endpoint route (confirm the path is /api/inngest)?
ls app/api/inngest/route.ts && grep -nE "serve\(|inngest" app/api/inngest/route.ts | head

# (d) Is inngest-cli a dependency, or run via npx? Package manager = pnpm (confirm lockfile):
ls pnpm-lock.yaml package-lock.json yarn.lock 2>/dev/null
grep -nE "inngest-cli|\"inngest\"" package.json
```
Report:
- The exact style of START-DEV.bat (so the new file matches: same echo/pause/title conventions, and
  HOW it runs commands — e.g. `pnpm dev` directly, or via `wsl`, or `cmd /k`).
- Whether an `inngest` npm script exists (if so, the batch file should call THAT for consistency).
- Confirm the endpoint path is `/api/inngest`.
- Whether the operator runs commands in plain Windows `cmd` or through WSL (this changes the batch
  file — see STEP 1). Infer from START-DEV.bat; if it uses `wsl ...`, mirror that.

## STEP 1 — Create `START-INNGEST.bat`
Match START-DEV.bat's environment (plain Windows cmd vs WSL). Two variants — pick the one that matches
how START-DEV.bat runs:

**Variant A — plain Windows cmd (if START-DEV.bat runs `pnpm dev` directly):**
```bat
@echo off
title VisibleAU - Inngest Dev Server
echo ============================================
echo  Starting Inngest Dev Server
echo  Dashboard: http://localhost:8288
echo  App endpoint: http://localhost:3000/api/inngest
echo ============================================
echo.
echo Keep this window open. Run START-DEV.bat in a SEPARATE window first.
echo.
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
pause
```

**Variant B — via WSL (if START-DEV.bat uses `wsl ...` because the repo lives in WSL):**
```bat
@echo off
title VisibleAU - Inngest Dev Server
echo ============================================
echo  Starting Inngest Dev Server (via WSL)
echo  Dashboard: http://localhost:8288
echo  App endpoint: http://localhost:3000/api/inngest
echo ============================================
echo.
echo Keep this window open. Run START-DEV.bat in a SEPARATE window first.
echo.
wsl bash -lc "cd /path/to/repo && npx inngest-cli@latest dev -u http://localhost:3000/api/inngest"
pause
```
(Use the SAME `cd` path / wsl invocation pattern START-DEV.bat uses — copy it exactly, don't invent.)

**If STEP 0(b) found an existing inngest npm script** (e.g. `"inngest": "inngest-cli dev -u ..."`),
prefer calling it for consistency — replace the `npx ...` line with `pnpm inngest` (or `wsl bash -lc
"cd ... && pnpm inngest"`), so the command lives in ONE place (package.json) and the batch file is a
thin launcher.

## STEP 2 — (Optional, only if it fits the repo's convention) add the npm script
If there is NO existing inngest script and the repo's style favors npm scripts, add to package.json:
```json
"inngest": "inngest-cli dev -u http://localhost:3000/api/inngest"
```
Then the batch file just runs `pnpm inngest`. Skip this if the repo prefers calling npx directly in
batch files — match the existing pattern, don't impose a new one.

## Constraints
- Match START-DEV.bat EXACTLY in style and execution environment (cmd vs WSL, paths, pause behaviour).
  Do not introduce a different pattern.
- The `-u http://localhost:3000/api/inngest` flag is REQUIRED (the app is on 3000; Inngest's default
  discovery port is not). Keep it.
- Do not modify START-DEV.bat or START-PROD.bat.
- Pin nothing fragile: `inngest-cli@latest` is fine for a dev launcher.

## Verification
1. Confirm `START-INNGEST.bat` exists at repo root alongside START-DEV.bat.
2. Dry sanity check (don't need to fully run in this session): the file's launch line is well-formed
   and uses the `-u http://localhost:3000/api/inngest` endpoint.
3. Report the final batch file contents + which variant (A cmd / B WSL) was chosen and why (based on
   STEP 0's reading of START-DEV.bat), and whether an npm script was added or an existing one reused.

## Note for the operator (include in your report)
Usage: open TWO windows — run START-DEV.bat in one (Next.js app), START-INNGEST.bat in the other
(Inngest). THEN http://localhost:8288 loads the dashboard and `audit-schedules-cron` should appear in
Functions. If the dashboard loads but shows no apps/functions, the `-u` endpoint is wrong or the app
isn't running — check START-DEV.bat is up on port 3000.
