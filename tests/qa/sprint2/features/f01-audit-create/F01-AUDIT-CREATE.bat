@echo off
REM ============================================================
REM  F01 — Audit Creation (Sprint 2)
REM  VisibleAU Sprint 2 QA
REM ============================================================
setlocal EnableDelayedExpansion

cd /d "%~dp0..\..\..\..\..\"
echo [F01-S2] Working directory: %CD%

echo [F01-S2] Loading environment...
if exist .env.test.local (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (
    set "line=%%A"
    if not "!line!"=="" if not "!line:~0,1!"=="#" set "%%A=%%B"
  )
)

echo [F01-S2] Stopping any existing server on port 3000...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (
  taskkill /PID %%P /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

echo [F01-S2] Starting Next.js dev server...
if not exist "tests\qa\sprint2\logs" mkdir "tests\qa\sprint2\logs"
start "" /B cmd /c "pnpm dev > tests\qa\sprint2\logs\f01-server.log 2>&1"

echo [F01-S2] Waiting for server...
set READY=0
for /L %%i in (1,1,30) do (
  if !READY!==0 (
    timeout /t 3 /nobreak >nul
    powershell -Command "try { Invoke-WebRequest 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
    if !ERRORLEVEL!==0 set READY=1
  )
)
if !READY!==0 (
  echo [F01-S2] ERROR: Server did not start!
  pause
  exit /b 1
)
echo [F01-S2] Server ready.

echo [F01-S2] Running audit creation tests...
call pnpm exec playwright test tests/qa/sprint2/features/f01-audit-create/f01-audit-create.spec.ts --config tests/qa/sprint2/playwright.config.ts --reporter=list --headed
set TEST_EXIT=%ERRORLEVEL%

echo [F01-S2] Stopping dev server...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (
  taskkill /PID %%P /F >nul 2>&1
)

echo.
if %TEST_EXIT% EQU 0 (
  echo   [F01-S2] PASSED
) else (
  echo   [F01-S2] FAILED
)
echo.
pause
exit /b %TEST_EXIT%
