@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0..\..\..\"
echo [F04-S10] Working directory: %CD%
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if not "!line!"=="" if not "!line:~0,1!"=="#" set "%%A=%%B"))
echo [F04-S10] Stripe Price-Map
echo [F04-S10] Running tests...
call pnpm exec vitest run -c tests/qa/sprint10/vitest.config.ts tests/qa/sprint10/f04-price-map.test.ts --reporter=verbose
set TEST_EXIT=%ERRORLEVEL%
if %TEST_EXIT% EQU 0 (echo [F04-S10] PASSED) else (echo [F04-S10] FAILED)
pause
exit /b %TEST_EXIT%