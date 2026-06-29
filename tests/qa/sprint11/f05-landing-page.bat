@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0..\..\..\"
echo [F05-S11] Working directory: %CD%
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if not "!line!"=="" if not "!line:~0,1!"=="#" set "%%A=%%B"))
echo [F05-S11] Marketing Landing Page E2E
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (taskkill /PID %%P /F >nul 2>&1)
timeout /t 2 /nobreak >nul
if not exist "tests\qa\sprint11\logs" mkdir "tests\qa\sprint11\logs"
start "" /B cmd /c "pnpm dev > tests\qa\sprint11\logs\f05-server.log 2>&1"
set READY=0
for /L %%i in (1,1,30) do (if !READY!==0 (timeout /t 3 /nobreak >nul & powershell -Command "try { Invoke-WebRequest 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1 & if !ERRORLEVEL!==0 set READY=1))
if !READY!==0 (echo [F05-S11] Server failed! & pause & exit /b 1)
echo [F05-S11] Server ready. Running tests...
call pnpm exec playwright test tests/qa/sprint11/f05-landing-page.spec.ts --config tests/qa/sprint11/playwright.config.ts --reporter=list
set TEST_EXIT=%ERRORLEVEL%
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (taskkill /PID %%P /F >nul 2>&1)
if %TEST_EXIT% EQU 0 (echo [F05-S11] PASSED) else (echo [F05-S11] FAILED)
pause
exit /b %TEST_EXIT%
