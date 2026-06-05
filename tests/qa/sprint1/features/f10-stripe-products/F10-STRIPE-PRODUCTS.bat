@echo off
REM ============================================================
REM  F10 — Stripe Products Setup (no server needed — Stripe API test)
REM  VisibleAU Sprint 1 QA
REM ============================================================
setlocal EnableDelayedExpansion

REM Navigate to project root (5 levels up from this batch file location)
cd /d "%~dp0..\..\..\..\..\"
echo [F10] Working directory: %CD%

echo [F10] Loading environment...
if exist .env.test.local (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (
    set "line=%%A"
    if not "!line!"=="" if not "!line:~0,1!"=="#" set "%%A=%%B"
  )
)

echo [F10] Running Stripe product verification (no server needed)...
call pnpm exec playwright test tests/qa/sprint1/features/f10-stripe-products/f10-stripe-products.spec.ts --config tests/qa/sprint1/playwright.config.ts --reporter=list --headed
set TEST_EXIT=%ERRORLEVEL%

echo.
if %TEST_EXIT% EQU 0 (
  echo   [F10] PASSED
) else (
  echo   [F10] FAILED - Run pnpm stripe:setup first
)
echo.
pause
exit /b %TEST_EXIT%
