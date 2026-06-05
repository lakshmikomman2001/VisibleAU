@echo off
REM ============================================================
REM  F12 — Row Level Security Policies (no dev server needed — direct DB test)
REM  VisibleAU Sprint 1 QA
REM ============================================================
setlocal EnableDelayedExpansion

REM Navigate to project root (5 levels up from this batch file location)
cd /d "%~dp0..\..\..\..\..\"
echo [F12] Working directory: %CD%

echo [F12] Loading environment...
if exist .env.test.local (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (
    set "line=%%A"
    if not "!line!"=="" if not "!line:~0,1!"=="#" set "%%A=%%B"
  )
)

echo [F12] Running RLS policy tests (direct DB — no server needed)...
call pnpm exec playwright test tests/qa/sprint1/features/f12-rls-policies/f12-rls-policies.spec.ts --config tests/qa/sprint1/playwright.config.ts --reporter=list --headed
set TEST_EXIT=%ERRORLEVEL%

echo.
if %TEST_EXIT% EQU 0 (
  echo   [F12] PASSED
) else (
  echo   [F12] FAILED
)
echo.
pause
exit /b %TEST_EXIT%
