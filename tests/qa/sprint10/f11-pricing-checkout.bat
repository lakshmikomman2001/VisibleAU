@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo  F11 /pricing + POST /api/billing/checkout (HA3, HB1, HG1)
echo  Tests: 10  Runner: Playwright
echo  Auto-starts: pnpm dev on port 3000
echo ============================================================
echo.

echo [1/3] Applying migrations...
pnpm exec dotenv -e .env.test.local -- pnpm drizzle-kit migrate
if %ERRORLEVEL% neq 0 ( echo FAIL: migrations & exit /b 1 )

curl -sf http://localhost:3000/api/health > nul 2>&1
if %ERRORLEVEL% equ 0 (
  set OWN_SERVER=0
  echo [2/3] Dev server already running
) else (
  echo [2/3] Starting dev server...
  start /b pnpm exec dotenv -e .env.test.local -- pnpm dev > nul 2>&1
  set OWN_SERVER=1
  set WAITED=0
  :WAIT_F11
  timeout /t 2 /nobreak > nul
  set /a WAITED+=2
  curl -sf http://localhost:3000/api/health > nul 2>&1
  if !ERRORLEVEL! equ 0 goto UP_F11
  if !WAITED! geq 30 ( echo FAIL: server not ready & exit /b 1 )
  goto WAIT_F11
  :UP_F11
  echo Dev server ready after !WAITED!s
)

echo [3/3] Running Playwright tests...
pnpm exec dotenv -e .env.test.local -- pnpm exec playwright test ^
  tests/qa/sprint10/f11-pricing-checkout.spec.ts ^
  --config tests/qa/sprint10/playwright.config.ts ^
  --reporter=list

set EXIT=%ERRORLEVEL%

if !OWN_SERVER! equ 1 (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /PID %%a /F > nul 2>&1
  )
)

if %EXIT% equ 0 ( echo PASS: F11 -- DB cleaned ) else ( echo FAIL: F11 & exit /b 1 )
exit /b %EXIT%
