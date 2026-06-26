@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0..\..\..\..\..\"
echo [F05-S9] Working directory: %CD%
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if not "!line!"=="" if not "!line:~0,1!"=="#" set "%%A=%%B"))
echo [F05-S9] buildDigestHtml — portfolio weekly email
echo [F05-S9] Running tests...
call pnpm exec vitest run -c tests/qa/sprint9/vitest.config.ts tests/qa/sprint9/features/f05-digest-html/f05-digest-html.spec.ts --reporter=verbose
set TEST_EXIT=%ERRORLEVEL%
if %TEST_EXIT% EQU 0 (echo [F05-S9] PASSED) else (echo [F05-S9] FAILED)
pause
exit /b %TEST_EXIT%