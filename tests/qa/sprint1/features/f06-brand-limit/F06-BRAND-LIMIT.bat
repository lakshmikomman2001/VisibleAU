@echo off
REM ============================================================
REM  F06 — Tier-based Brand Limit
REM  VisibleAU Sprint 1 QA
REM ============================================================
setlocal EnableDelayedExpansion

REM Navigate to project root (5 levels up from this batch file location)
cd /d "%~dp0..\..\..\..\..\"
echo [F06] Working directory: %CD%

echo [F06] Loading environment...
if exist .env.test.local (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (
    set "line=%%A"
    if not "!line!"=="" if not "!line:~0,1!"=="#" set "%%A=%%B"
  )
)

echo [F06] Stopping any existing server on port 3000...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (
  taskkill /PID %%P /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

echo [F06] Starting Next.js dev server...
if not exist "tests\qa\sprint1\logs" mkdir "tests\qa\sprint1\logs"
start "" /B cmd /c "pnpm dev > tests\qa\sprint1\logs\f06-server.log 2>&1"

echo [F06] Waiting for server...
set READY=0
for /L %%i in (1,1,30) do (
  if !READY!==0 (
    timeout /t 3 /nobreak >nul
    powershell -Command "try { Invoke-WebRequest 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
    if !ERRORLEVEL!==0 set READY=1
  )
)
if !READY!==0 (
  echo [F06] ERROR: Server did not start!
  pause
  exit /b 1
)
echo [F06] Server ready.

echo [F06] Running brand limit tests...
call pnpm exec playwright test tests/qa/sprint1/features/f06-brand-limit/f06-brand-limit.spec.ts --config tests/qa/sprint1/playwright.config.ts --reporter=list --headed
set TEST_EXIT=%ERRORLEVEL%

echo [F06] Stopping dev server...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (
  taskkill /PID %%P /F >nul 2>&1
)

echo.
if %TEST_EXIT% EQU 0 (
  echo   [F06] PASSED
) else (
  echo   [F06] FAILED
)
echo.
pause
exit /b %TEST_EXIT%
