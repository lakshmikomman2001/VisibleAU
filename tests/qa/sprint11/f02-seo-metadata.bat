@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0..\..\..\"
echo [F02-S11] Working directory: %CD%
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if not "!line!"=="" if not "!line:~0,1!"=="#" set "%%A=%%B"))
echo [F02-S11] SEO Metadata Helper
echo [F02-S11] Running tests...
call pnpm exec vitest run -c tests/qa/sprint11/vitest.config.ts tests/qa/sprint11/f02-seo-metadata.test.ts --reporter=verbose
set TEST_EXIT=%ERRORLEVEL%
if %TEST_EXIT% EQU 0 (echo [F02-S11] PASSED) else (echo [F02-S11] FAILED)
pause
exit /b %TEST_EXIT%
