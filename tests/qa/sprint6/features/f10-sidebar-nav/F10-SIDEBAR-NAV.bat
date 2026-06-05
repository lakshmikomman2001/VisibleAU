@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0..\..\..\..\..\"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
mkdir tests\qa\sprint6\logs 2>nul
start /B cmd /c "set LLM_MODE=mock&& call pnpm dev > tests\qa\sprint6\logs\f10-server.log 2>&1"
:WAIT_F10
ping -n 3 127.0.0.1 > nul
powershell -Command "try { (Invoke-WebRequest -Uri http://localhost:3000/api/health -UseBasicParsing -TimeoutSec 2).StatusCode } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_F10
call pnpm exec playwright test tests/qa/sprint6/features/f10-sidebar-nav/f10-sidebar-nav.spec.ts --config tests/qa/sprint6/playwright.config.ts --reporter=list --headed
set EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000"') do taskkill /PID %%P /F >nul 2>&1
if %EXIT% EQU 0 (echo [F10] PASSED) else (echo [F10] FAILED)
pause
exit /b %EXIT%
