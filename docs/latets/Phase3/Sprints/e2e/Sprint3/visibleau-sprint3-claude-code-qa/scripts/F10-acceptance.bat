@echo off
REM VisibleAU Sprint 3 QA — F10: Acceptance browser
REM MOCK_SCENARIO=happy_path
REM Usage: scripts\F10-F10-acceptance.bat [--headless]
setlocal enabledelayedexpansion
set FEATURE=F10
set LABEL=Acceptance browser
set SPEC=visibleau-sprint3-claude-code-qa/features/F10-acceptance.spec.ts
set PW_ARGS=--project=chromium --headed
if "%1"=="--headless" set PW_ARGS=--project=chromium
echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║  VisibleAU Sprint 3 QA — F10                              ║
echo ║  Acceptance browser                                      ║
echo ║  MOCK_SCENARIO=happy_path                                     ║
echo ╚══════════════════════════════════════════════════════════╝
echo.
if not exist ".env.test.local" ( echo ERROR: .env.test.local not found. & exit /b 1 )
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /v "^#" .env.test.local`) do (
  if not "%%A"=="" if not "%%B"=="" set %%A=%%B
)
set NODE_ENV=test
set LLM_MODE=mock
set MOCK_SCENARIO=happy_path
set E2E_USE_REAL_LLM=false
set INNGEST_EVENT_KEY=local
set INNGEST_SIGNING_KEY=local
echo [F10] Starting pnpm dev (MOCK_SCENARIO=happy_path)...
start /B "S3-Dev" cmd /c "pnpm dev > sprint3-dev.log 2>&1"
REM No Inngest needed
echo [F10] Waiting for app...
set WAITED=0
:WAIT_APP
timeout /T 2 /NOBREAK >nul
curl -sf http://localhost:3000/api/health >nul 2>&1
if %ERRORLEVEL% equ 0 goto APP_READY
set /A WAITED=WAITED+2
if %WAITED% geq 90 ( echo ERROR: App timeout. Check sprint3-dev.log. & goto CLEANUP )
goto WAIT_APP
:APP_READY
REM No Inngest wait needed
:RUN_TEST
echo.
pnpm exec playwright test %SPEC% %PW_ARGS% ^
  --config=visibleau-sprint3-claude-code-qa/playwright.config.ts ^
  --reporter=list
set EXIT_CODE=%ERRORLEVEL%
:CLEANUP
echo.
echo [F10] Stopping servers...
taskkill /F /FI "WINDOWTITLE eq S3-Dev" 2>nul
REM No Inngest to stop
taskkill /F /FI "IMAGENAME eq node.exe" 2>nul
echo.
if %EXIT_CODE% equ 0 (echo ✅ F10 PASSED — Acceptance browser) else (echo ❌ F10 FAILED — open sprint3-qa-report\index.html)
echo.
exit /b %EXIT_CODE%