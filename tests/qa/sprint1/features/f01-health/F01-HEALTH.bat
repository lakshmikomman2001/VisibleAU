@echo off
REM ============================================================
REM  F01 — Health Check Endpoint
REM  VisibleAU Sprint 1 QA
REM  Launches: Next.js dev server + Playwright test
REM  Test data: none (read-only)
REM ============================================================
setlocal EnableDelayedExpansion

REM Navigate to project root (5 levels up from this batch file location)
cd /d "%~dp0..\..\..\..\..\"
echo [F01] Working directory: %CD%

echo [F01] Loading environment from .env.test.local ...
if exist .env.test.local (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (
    set "line=%%A"
    if not "!line!"=="" if not "!line:~0,1!"=="#" set "%%A=%%B"
  )
) else (
  echo [F01] WARNING: .env.test.local not found!
)

echo [F01] Stopping any existing server on port 3000...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (
  taskkill /PID %%P /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

echo [F01] Starting Next.js dev server...
if not exist "tests\qa\sprint1\logs" mkdir "tests\qa\sprint1\logs"
start "" /B cmd /c "pnpm dev > tests\qa\sprint1\logs\f01-server.log 2>&1"

echo [F01] Waiting for server on http://localhost:3000/api/health ...
set READY=0
for /L %%i in (1,1,30) do (
  if !READY!==0 (
    timeout /t 3 /nobreak >nul
    powershell -Command "try { $r = Invoke-WebRequest 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 3; exit 0 } catch { exit 1 }" >nul 2>&1
    if !ERRORLEVEL!==0 set READY=1
  )
)
if !READY!==0 (
  echo [F01] ERROR: Server did not start within 90 seconds!
  echo [F01] Check tests\qa\sprint1\logs\f01-server.log for errors
  exit /b 1
)
echo [F01] Server ready.

echo [F01] Running Playwright tests...
call pnpm exec playwright test tests/qa/sprint1/features/f01-health/f01-health.spec.ts --config tests/qa/sprint1/playwright.config.ts --reporter=list --headed
set TEST_EXIT=%ERRORLEVEL%

echo [F01] No test data to clean up (read-only test).

echo [F01] Stopping dev server...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (
  taskkill /PID %%P /F >nul 2>&1
)

echo.
if %TEST_EXIT% EQU 0 (
  echo ============================================
  echo   [F01] PASSED - Health check endpoint OK
  echo ============================================
) else (
  echo ============================================
  echo   [F01] FAILED - check logs above
  echo ============================================
)
echo.
pause
exit /b %TEST_EXIT%
