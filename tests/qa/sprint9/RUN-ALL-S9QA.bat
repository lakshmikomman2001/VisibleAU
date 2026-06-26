@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0..\..\..\"
echo [S9QA] Working directory: %CD%
if exist .env.test.local (for /f "usebackq tokens=1,* delims==" %%A in (".env.test.local") do (set "line=%%A" & if not "!line!"=="" if not "!line:~0,1!"=="#" set "%%A=%%B"))
echo.
echo ============================================================
echo  VisibleAU Sprint 9 — Complete QA Suite (13 features)
echo  F01-F05: vitest (no server)
echo  F06-F13: Playwright E2E (auto-starts dev server)
echo ============================================================
echo.

set PASS=0
set FAIL=0
set FAILED=

echo -- Unit Tests (F01-F05) --
for %%D in (f01-schema f02-calculate-next-run f03-tier-limits f04-check-quota f05-digest-html) do (
  echo Running %%D...
  call pnpm exec vitest run -c tests/qa/sprint9/vitest.config.ts tests/qa/sprint9/features/%%D/*.spec.ts --reporter=verbose >nul 2>&1
  if !ERRORLEVEL! EQU 0 (
    set /a PASS+=1
    echo   PASS: %%D
  ) else (
    set /a FAIL+=1
    set FAILED=!FAILED! %%D
    echo   FAIL: %%D
  )
)
echo.

echo -- Playwright E2E Tests (F06-F13) --
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (taskkill /PID %%P /F >nul 2>&1)
timeout /t 2 /nobreak >nul
if not exist "tests\qa\sprint9\logs" mkdir "tests\qa\sprint9\logs"
start "" /B cmd /c "pnpm dev > tests\qa\sprint9\logs\run-all-server.log 2>&1"
set READY=0
for /L %%i in (1,1,30) do (if !READY!==0 (timeout /t 3 /nobreak >nul & powershell -Command "try { Invoke-WebRequest 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1 & if !ERRORLEVEL!==0 set READY=1))
if !READY!==0 (echo [S9QA] Server failed! Skipping Playwright tests. & goto RESULTS)
echo [S9QA] Server ready.

call pnpm exec playwright test tests/qa/sprint9/features/f06-db-brand-assets/f06-agency-branding-e2e.spec.ts --config tests/qa/sprint9/playwright.config.ts --reporter=list >nul 2>&1
if !ERRORLEVEL! EQU 0 (set /a PASS+=1 & echo   PASS: f06-agency-branding) else (set /a FAIL+=1 & set FAILED=!FAILED! f06 & echo   FAIL: f06-agency-branding)

call pnpm exec playwright test tests/qa/sprint9/features/f07-db-portal-invites/f07-client-portal-e2e.spec.ts --config tests/qa/sprint9/playwright.config.ts --reporter=list >nul 2>&1
if !ERRORLEVEL! EQU 0 (set /a PASS+=1 & echo   PASS: f07-client-portal) else (set /a FAIL+=1 & set FAILED=!FAILED! f07 & echo   FAIL: f07-client-portal)

call pnpm exec playwright test tests/qa/sprint9/features/f08-db-audit-schedules/f08-schedules-e2e.spec.ts --config tests/qa/sprint9/playwright.config.ts --reporter=list >nul 2>&1
if !ERRORLEVEL! EQU 0 (set /a PASS+=1 & echo   PASS: f08-schedules) else (set /a FAIL+=1 & set FAILED=!FAILED! f08 & echo   FAIL: f08-schedules)

call pnpm exec playwright test tests/qa/sprint9/features/f09-db-notif-prefs/f09-notifications-e2e.spec.ts --config tests/qa/sprint9/playwright.config.ts --reporter=list >nul 2>&1
if !ERRORLEVEL! EQU 0 (set /a PASS+=1 & echo   PASS: f09-notifications) else (set /a FAIL+=1 & set FAILED=!FAILED! f09 & echo   FAIL: f09-notifications)

call pnpm exec playwright test tests/qa/sprint9/features/f10-api-branding/f10-branding-api-e2e.spec.ts --config tests/qa/sprint9/playwright.config.ts --reporter=list >nul 2>&1
if !ERRORLEVEL! EQU 0 (set /a PASS+=1 & echo   PASS: f10-branding-api) else (set /a FAIL+=1 & set FAILED=!FAILED! f10 & echo   FAIL: f10-branding-api)

call pnpm exec playwright test tests/qa/sprint9/features/f11-api-schedules/f11-schedules-api-e2e.spec.ts --config tests/qa/sprint9/playwright.config.ts --reporter=list >nul 2>&1
if !ERRORLEVEL! EQU 0 (set /a PASS+=1 & echo   PASS: f11-schedules-api) else (set /a FAIL+=1 & set FAILED=!FAILED! f11 & echo   FAIL: f11-schedules-api)

call pnpm exec playwright test tests/qa/sprint9/features/f12-api-portal-verify/f12-portal-verify-e2e.spec.ts --config tests/qa/sprint9/playwright.config.ts --reporter=list >nul 2>&1
if !ERRORLEVEL! EQU 0 (set /a PASS+=1 & echo   PASS: f12-portal-verify) else (set /a FAIL+=1 & set FAILED=!FAILED! f12 & echo   FAIL: f12-portal-verify)

call pnpm exec playwright test tests/qa/sprint9/features/f13-api-bulk-notif/f13-notif-api-e2e.spec.ts --config tests/qa/sprint9/playwright.config.ts --reporter=list >nul 2>&1
if !ERRORLEVEL! EQU 0 (set /a PASS+=1 & echo   PASS: f13-notif-api) else (set /a FAIL+=1 & set FAILED=!FAILED! f13 & echo   FAIL: f13-notif-api)

for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (taskkill /PID %%P /F >nul 2>&1)

:RESULTS
echo.
echo ============================================================
echo  Sprint 9 QA Results
echo ============================================================
echo  PASSED: !PASS!   FAILED: !FAIL!
if not "!FAILED!"=="" echo  Failed features: !FAILED!
if !FAIL! EQU 0 (echo  ALL GREEN) else (echo  SOME FAILURES -- run individual scripts for detail)
pause
if !FAIL! NEQ 0 exit /b 1
exit /b 0