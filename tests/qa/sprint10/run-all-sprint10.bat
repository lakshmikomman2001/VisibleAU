@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0..\..\..\"
echo [S10QA] Working directory: %CD%
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if not "!line!"=="" if not "!line:~0,1!"=="#" set "%%A=%%B"))
echo.
echo ============================================================
echo  VisibleAU Sprint 10 — Complete QA Suite (12 features)
echo  F01-F09: vitest (no server)
echo  F10-F12: Playwright (auto-starts dev server)
echo ============================================================
echo.

set PASS=0
set FAIL=0
set FAILED=

echo -- Unit Tests (F01-F09) --
for %%F in (f01-schema f02-sample-org f03-sample-config f04-price-map f05-gst-math f06-tier-limits f07-onboarding-state f08-subscriptions-crud f09-webhook-idempotency) do (
  echo Running %%F...
  call pnpm exec vitest run -c tests/qa/sprint10/vitest.config.ts tests/qa/sprint10/%%F.test.ts --reporter=verbose >nul 2>&1
  if !ERRORLEVEL! EQU 0 (
    set /a PASS+=1
    echo   PASS: %%F
  ) else (
    set /a FAIL+=1
    set FAILED=!FAILED! %%F
    echo   FAIL: %%F
  )
)
echo.

echo -- Playwright Tests (F10-F12) --
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (taskkill /PID %%P /F >nul 2>&1)
timeout /t 2 /nobreak >nul
if not exist "tests\qa\sprint10\logs" mkdir "tests\qa\sprint10\logs"
start "" /B cmd /c "pnpm dev > tests\qa\sprint10\logs\run-all-server.log 2>&1"
set READY=0
for /L %%i in (1,1,30) do (if !READY!==0 (timeout /t 3 /nobreak >nul & powershell -Command "try { Invoke-WebRequest 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1 & if !ERRORLEVEL!==0 set READY=1))
if !READY!==0 (echo [S10QA] Server failed! Skipping Playwright tests. & goto RESULTS)
echo [S10QA] Server ready.

for %%F in (f10-sample-audit-api f11-pricing-checkout f12-webhook-tier-sync) do (
  echo Running %%F...
  call pnpm exec playwright test tests/qa/sprint10/%%F.spec.ts --config tests/qa/sprint10/playwright.config.ts --reporter=list >nul 2>&1
  if !ERRORLEVEL! EQU 0 (
    set /a PASS+=1
    echo   PASS: %%F
  ) else (
    set /a FAIL+=1
    set FAILED=!FAILED! %%F
    echo   FAIL: %%F
  )
)

for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (taskkill /PID %%P /F >nul 2>&1)

:RESULTS
echo.
echo ============================================================
echo  Sprint 10 QA Results
echo ============================================================
echo  PASSED: !PASS!   FAILED: !FAIL!
if not "!FAILED!"=="" echo  Failed features: !FAILED!
if !FAIL! EQU 0 (echo  ALL GREEN) else (echo  SOME FAILURES -- run individual scripts for detail)
pause
if !FAIL! NEQ 0 exit /b 1
exit /b 0