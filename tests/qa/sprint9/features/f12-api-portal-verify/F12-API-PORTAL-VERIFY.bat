@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0..\..\..\..\..\"
echo [F12-S9] Working directory: %CD%
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if not "!line!"=="" if not "!line:~0,1!"=="#" set "%%A=%%B"))
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (taskkill /PID %%P /F >nul 2>&1)
timeout /t 2 /nobreak >nul
if not exist "tests\qa\sprint9\logs" mkdir "tests\qa\sprint9\logs"
start "" /B cmd /c "pnpm dev > tests\qa\sprint9\logs\f12_api_portal_verify-server.log 2>&1"
set READY=0
for /L %%i in (1,1,30) do (if !READY!==0 (timeout /t 3 /nobreak >nul & powershell -Command "try { Invoke-WebRequest 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1 & if !ERRORLEVEL!==0 set READY=1))
if !READY!==0 (echo [F12-S9] Server failed! & pause & exit /b 1)
echo [F12-S9] Server ready. Running tests...
call pnpm exec playwright test tests/qa/sprint9/features/f12-api-portal-verify/f12-portal-verify-e2e.spec.ts --config tests/qa/sprint9/playwright.config.ts --reporter=list --headed
set TEST_EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (taskkill /PID %%P /F >nul 2>&1)
if %TEST_EXIT% EQU 0 (echo [F12-S9] PASSED) else (echo [F12-S9] FAILED)
pause
exit /b %TEST_EXIT%