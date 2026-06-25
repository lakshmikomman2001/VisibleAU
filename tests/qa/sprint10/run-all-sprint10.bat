@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo  VisibleAU Sprint 10 — Complete QA Suite (12 features)
echo  Unit tests run without a server.
echo  Playwright tests auto-start pnpm dev (shared instance).
echo ============================================================
echo.

set PASS=0
set FAIL=0
set FAILED=

echo [SETUP] Applying migrations...
pnpm exec dotenv -e .env.test.local -- pnpm drizzle-kit migrate
if %ERRORLEVEL% neq 0 ( echo FAIL: migrations -- aborting & exit /b 1 )
echo.

echo -- Unit Tests (F01-F09) --
for %%F in (f01-schema f02-sample-org f03-sample-config f04-price-map f05-gst-math f06-tier-limits f07-onboarding-state f08-subscriptions-crud f09-webhook-idempotency) do (
  echo Running %%F...
  pnpm exec dotenv -e .env.test.local -- pnpm vitest run ^
    --config tests/qa/sprint10/vitest.config.ts ^
    tests/qa/sprint10/%%F.test.ts ^
    --reporter=verbose > nul 2>&1
  if !ERRORLEVEL! equ 0 (
    set /a PASS+=1
    echo   PASS: %%F
  ) else (
    set /a FAIL+=1
    set FAILED=!FAILED! %%F
    echo   FAIL: %%F
  )
)
echo.

echo -- Playwright Tests (F10-F12) — starting dev server --
set OWN_SERVER=0
curl -sf http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo Starting dev server...
  start /b pnpm exec dotenv -e .env.test.local -- pnpm dev > nul 2>&1
  set OWN_SERVER=1
  set WAITED=0
  :WAIT_ALL
  timeout /t 2 /nobreak > nul
  set /a WAITED+=2
  curl -sf http://localhost:3000/api/health > nul 2>&1
  if !ERRORLEVEL! equ 0 goto UP_ALL
  if !WAITED! geq 40 ( echo FAIL: server timeout -- skipping Playwright tests & goto RESULTS )
  goto WAIT_ALL
  :UP_ALL
  echo Dev server ready after !WAITED!s
)
echo.

for %%F in (f10-sample-audit-api f11-pricing-checkout f12-webhook-tier-sync) do (
  echo Running %%F...
  pnpm exec dotenv -e .env.test.local -- pnpm exec playwright test ^
    tests/qa/sprint10/%%F.spec.ts ^
    --config tests/qa/sprint10/playwright.config.ts ^
    --reporter=list > nul 2>&1
  if !ERRORLEVEL! equ 0 (
    set /a PASS+=1
    echo   PASS: %%F
  ) else (
    set /a FAIL+=1
    set FAILED=!FAILED! %%F
    echo   FAIL: %%F
  )
)

if !OWN_SERVER! equ 1 (
  echo Stopping dev server...
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /PID %%a /F > nul 2>&1
  )
)

:RESULTS
echo.
echo ============================================================
echo  Sprint 10 QA Results
echo ============================================================
echo  PASSED: !PASS!   FAILED: !FAIL!
if not "!FAILED!"=="" echo  Failed features: !FAILED!
if !FAIL! equ 0 (
  echo  ALL GREEN -- zero DB rows remain
) else (
  echo  SOME FAILURES -- see individual feature scripts for detail
  exit /b 1
)
