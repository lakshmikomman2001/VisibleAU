@echo off
REM VisibleAU Sprint 3 QA — Run ALL features in sequence
REM Starts ONE shared dev server for the entire suite.
REM
REM BC4 NOTE: F04/F05/F06 require different MOCK_SCENARIO values (no_mention/
REM partial_failure/rate_limited) that cannot be changed without restarting the
REM server. These 3 features are SKIPPED in run-all.
REM Run them individually: scripts\F04-no-mention.bat
REM                        scripts\F05-partial-failure.bat
REM                        scripts\F06-rate-limited.bat
REM
REM Usage: scripts\run-all-sprint3.bat [--headless]

setlocal enabledelayedexpansion
set PW_ARGS=--project=chromium --headed
if "%1"=="--headless" set PW_ARGS=--project=chromium
set PASS=0 & set FAIL=0 & set RESULTS=

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║  VisibleAU Sprint 3 QA — Full Suite                     ║
echo ║  10 features (7 in run-all · 3 need individual bats)    ║
echo ║                                                          ║
echo ║  BC4: F04/F05/F06 SKIPPED — each needs a different      ║
echo ║  MOCK_SCENARIO env requiring a separate server restart.  ║
echo ║  Run them individually via their own bat scripts.        ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

if not exist ".env.test.local" ( echo ERROR: .env.test.local not found. & exit /b 1 )
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /v "^#" .env.test.local`) do (
  if not "%%A"=="" if not "%%B"=="" set %%A=%%B
)
set NODE_ENV=test & set LLM_MODE=mock & set MOCK_SCENARIO=happy_path & set E2E_USE_REAL_LLM=false
set INNGEST_EVENT_KEY=local & set INNGEST_SIGNING_KEY=local

echo [Suite] Starting pnpm dev (MOCK_SCENARIO=happy_path)...
start /B "S3-Dev" cmd /c "pnpm dev > sprint3-dev.log 2>&1"
echo [Suite] Starting Inngest dev server...
start /B "S3-Inngest" cmd /c "npx inngest-cli@latest dev --port 8288 > sprint3-inngest.log 2>&1"
echo [Suite] Waiting for app...
set WAITED=0
:WAIT_APP
timeout /T 2 /NOBREAK >nul
curl -sf http://localhost:3000/api/health >nul 2>&1
if %ERRORLEVEL% equ 0 goto APP_READY
set /A WAITED=WAITED+2
if %WAITED% geq 90 ( echo ERROR: App did not start. Check sprint3-dev.log. & goto FINAL ) & goto WAIT_APP
:APP_READY
echo [Suite] App ready. Waiting for Inngest...
set INN_WAITED=0
:WAIT_INN
timeout /T 2 /NOBREAK >nul & curl -sf http://localhost:8288 >nul 2>&1
if %ERRORLEVEL% equ 0 goto SUITE_READY
set /A INN_WAITED=INN_WAITED+2 & if %INN_WAITED% geq 30 goto SUITE_READY & goto WAIT_INN
:SUITE_READY
echo [Suite] Both servers ready. Running F01-F03, F07-F10...
echo.

for %%F in (
  "visibleau-sprint3-claude-code-qa/features/F01-run-audit-btn.spec.ts"
  "visibleau-sprint3-claude-code-qa/features/F02-audit-running-sprint3.spec.ts"
  "visibleau-sprint3-claude-code-qa/features/F03-audit-results-basic-sprint3.spec.ts"
  "visibleau-sprint3-claude-code-qa/features/F07-audit-results-rich.spec.ts"
  "visibleau-sprint3-claude-code-qa/features/F08-cross-org-isolation.spec.ts"
  "visibleau-sprint3-claude-code-qa/features/F09-failed-audit.spec.ts"
  "visibleau-sprint3-claude-code-qa/features/F10-acceptance.spec.ts"
) do (
  echo.
  echo ── Running %%~F ──
  pnpm exec playwright test %%~F %PW_ARGS% ^
    --config=visibleau-sprint3-claude-code-qa/playwright.config.ts ^
    --reporter=list
  if %ERRORLEVEL% equ 0 (
    set /A PASS=PASS+1
    set "RESULTS=!RESULTS! ✅ %%~nxF"
  ) else (
    set /A FAIL=FAIL+1
    set "RESULTS=!RESULTS! ❌ %%~nxF"
  )
)

echo.
echo ── BC4: F04/F05/F06 SKIPPED (need different MOCK_SCENARIO per feature) ──
echo    Run separately:
echo      scripts\F04-no-mention.bat
echo      scripts\F05-partial-failure.bat
echo      scripts\F06-rate-limited.bat
echo.

:FINAL
echo.
echo [Suite] Stopping servers...
taskkill /F /FI "WINDOWTITLE eq S3-Dev" 2>nul
taskkill /F /FI "WINDOWTITLE eq S3-Inngest" 2>nul
taskkill /F /FI "IMAGENAME eq node.exe" 2>nul

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║  Sprint 3 QA Results                                    ║
echo ║  Passed: %PASS%   Failed: %FAIL%                                ║
echo ╚══════════════════════════════════════════════════════════╝
echo.
for %%R in (%RESULTS%) do echo   %%R
echo.
if %FAIL% equ 0 (echo ✅ All Sprint 3 QA features passed.) else (echo ❌ %FAIL% feature(s) failed — open sprint3-qa-report\index.html)
echo.
if %FAIL% gtr 0 exit /b 1
exit /b 0
