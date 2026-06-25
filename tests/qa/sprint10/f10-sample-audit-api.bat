@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo  F10 POST /api/sample-audit — Full E2E (HC1, HB2)
echo  Tests: 8  Runner: Playwright (Chromium)
echo  Auto-starts: pnpm dev on port 3000
echo ============================================================
echo.

echo [1/3] Applying migrations...
pnpm exec dotenv -e .env.test.local -- pnpm drizzle-kit migrate
if %ERRORLEVEL% neq 0 ( echo FAIL: migrations & exit /b 1 )

echo [2/3] Checking dev server...
curl -sf http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo Dev server already running -- skipping launch
  set OWN_SERVER=0
) else (
  echo Starting dev server...
  start /b pnpm exec dotenv -e .env.test.local -- pnpm dev > nul 2>&1
  set OWN_SERVER=1
  set WAITED=0
  :WAIT_LOOP_F10
  timeout /t 2 /nobreak > nul
  set /a WAITED+=2
  curl -sf http://localhost:3000/api/health > nul 2>&1
  if !ERRORLEVEL! equ 0 goto SERVER_UP_F10
  if !WAITED! geq 30 ( echo FAIL: server did not start in 30s & exit /b 1 )
  goto WAIT_LOOP_F10
  :SERVER_UP_F10
  echo Dev server ready after !WAITED!s
)

echo [3/3] Running Playwright tests...
pnpm exec dotenv -e .env.test.local -- pnpm exec playwright test ^
  tests/qa/sprint10/f10-sample-audit-api.spec.ts ^
  --config tests/qa/sprint10/playwright.config.ts ^
  --reporter=list

set EXIT=%ERRORLEVEL%

if !OWN_SERVER! equ 1 (
  echo Stopping dev server...
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /PID %%a /F > nul 2>&1
  )
)

if %EXIT% equ 0 (
  echo PASS: F10 all 8 tests green
) else (
  echo FAIL: F10
)
exit /b %EXIT%
