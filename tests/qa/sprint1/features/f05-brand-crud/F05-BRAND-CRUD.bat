@echo off
REM ============================================================
REM  F05 — Brand CRUD (Create, Read, Update)
REM  VisibleAU Sprint 1 QA
REM ============================================================
setlocal EnableDelayedExpansion

REM Navigate to project root (5 levels up from this batch file location)
cd /d "%~dp0..\..\..\..\..\"
echo [F05] Working directory: %CD%

echo [F05] Loading environment...
if exist .env.test.local (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (
    set "line=%%A"
    if not "!line!"=="" if not "!line:~0,1!"=="#" set "%%A=%%B"
  )
)

echo [F05] Stopping any existing server on port 3000...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (
  taskkill /PID %%P /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

echo [F05] Starting Next.js dev server...
if not exist "tests\qa\sprint1\logs" mkdir "tests\qa\sprint1\logs"
start "" /B cmd /c "pnpm dev > tests\qa\sprint1\logs\f05-server.log 2>&1"

echo [F05] Waiting for server...
set READY=0
for /L %%i in (1,1,30) do (
  if !READY!==0 (
    timeout /t 3 /nobreak >nul
    powershell -Command "try { Invoke-WebRequest 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
    if !ERRORLEVEL!==0 set READY=1
  )
)
if !READY!==0 (
  echo [F05] ERROR: Server did not start!
  pause
  exit /b 1
)
echo [F05] Server ready.

echo [F05] Running brand CRUD tests...
call pnpm exec playwright test tests/qa/sprint1/features/f05-brand-crud/f05-brand-crud.spec.ts --config tests/qa/sprint1/playwright.config.ts --reporter=list --headed
set TEST_EXIT=%ERRORLEVEL%

echo [F05] Stopping dev server...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (
  taskkill /PID %%P /F >nul 2>&1
)

echo.
if %TEST_EXIT% EQU 0 (
  echo   [F05] PASSED
) else (
  echo   [F05] FAILED
)
echo.
pause
exit /b %TEST_EXIT%
