@echo off
REM VisibleAU Sprint 3 QA — F05: partial_failure scenario
REM MOCK_SCENARIO=partial_failure · Inngest required
REM Usage: scripts\F05-F05-partial-failure.bat [--headless]
setlocal enabledelayedexpansion
set FEATURE=F05
set LABEL=partial_failure scenario
set SPEC=visibleau-sprint3-claude-code-qa/features/F05-partial-failure.spec.ts
set PW_ARGS=--project=chromium --headed
if "%1"=="--headless" set PW_ARGS=--project=chromium
echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║  VisibleAU Sprint 3 QA — F05                              ║
echo ║  partial_failure scenario                                ║
echo ║  MOCK_SCENARIO=partial_failure                                ║
echo ╚══════════════════════════════════════════════════════════╝
echo.
if not exist ".env.test.local" ( echo ERROR: .env.test.local not found. & exit /b 1 )
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /v "^#" .env.test.local`) do (
  if not "%%A"=="" if not "%%B"=="" set %%A=%%B
)
set NODE_ENV=test
set LLM_MODE=mock
set MOCK_SCENARIO=partial_failure
set E2E_USE_REAL_LLM=false
set INNGEST_EVENT_KEY=local
set INNGEST_SIGNING_KEY=local
echo [F05] Starting pnpm dev (MOCK_SCENARIO=partial_failure)...
start /B "S3-Dev" cmd /c "pnpm dev > sprint3-dev.log 2>&1"
start /B "S3-Inngest" cmd /c "npx inngest-cli@latest dev --port 8288 > sprint3-inngest.log 2>&1"
echo [F05] Waiting for app...
set WAITED=0
:WAIT_APP
timeout /T 2 /NOBREAK >nul
curl -sf http://localhost:3000/api/health >nul 2>&1
if %ERRORLEVEL% equ 0 goto APP_READY
set /A WAITED=WAITED+2
if %WAITED% geq 90 ( echo ERROR: App timeout. Check sprint3-dev.log. & goto CLEANUP )
goto WAIT_APP
:APP_READY
set INN_WAITED=0
:WAIT_INN
timeout /T 2 /NOBREAK >nul
curl -sf http://localhost:8288 >nul 2>&1
if %ERRORLEVEL% equ 0 goto INN_READY
set /A INN_WAITED=INN_WAITED+2
if %INN_WAITED% geq 30 ( echo WARNING: Inngest not confirmed ^& goto RUN_TEST )
goto WAIT_INN
:INN_READY
echo [F05] Inngest ready. Running tests...
:RUN_TEST
echo.
pnpm exec playwright test %SPEC% %PW_ARGS% ^
  --config=visibleau-sprint3-claude-code-qa/playwright.config.ts ^
  --reporter=list
set EXIT_CODE=%ERRORLEVEL%
:CLEANUP
echo.
echo [F05] Stopping servers...
taskkill /F /FI "WINDOWTITLE eq S3-Dev" 2>nul
taskkill /F /FI "WINDOWTITLE eq S3-Inngest" 2>nul
taskkill /F /FI "IMAGENAME eq node.exe" 2>nul
echo.
if %EXIT_CODE% equ 0 (echo ✅ F05 PASSED — partial_failure scenario) else (echo ❌ F05 FAILED — open sprint3-qa-report\index.html)
echo.
exit /b %EXIT_CODE%