@echo off
setlocal
echo.
echo ============================================================
echo  SPRINT 8 — FULL TEST SUITE
echo  Features: Drift + Local SEO + Webhooks + Exports + Actions
echo  Date: %date% %time%
echo ============================================================
echo.

set PASS_COUNT=0
set FAIL_COUNT=0

REM Test 1: API Health
call "%~dp0test-api-health.bat"
if errorlevel 1 (set /a FAIL_COUNT+=1) else (set /a PASS_COUNT+=1)
echo.

REM Test 2: Drift Alerts Page
call "%~dp0test-drift-alerts-page.bat"
if errorlevel 1 (set /a FAIL_COUNT+=1) else (set /a PASS_COUNT+=1)
echo.

REM Test 3: Drift Alerts API
call "%~dp0test-drift-alerts-api.bat"
if errorlevel 1 (set /a FAIL_COUNT+=1) else (set /a PASS_COUNT+=1)
echo.

REM Test 4: Audits List
call "%~dp0test-audits-list.bat"
if errorlevel 1 (set /a FAIL_COUNT+=1) else (set /a PASS_COUNT+=1)
echo.

REM Test 5: Local SEO Page
call "%~dp0test-local-seo-page.bat"
if errorlevel 1 (set /a FAIL_COUNT+=1) else (set /a PASS_COUNT+=1)
echo.

REM Test 6: Webhooks Settings Page
call "%~dp0test-webhooks-page.bat"
if errorlevel 1 (set /a FAIL_COUNT+=1) else (set /a PASS_COUNT+=1)
echo.

REM Test 7: Webhooks Config API
call "%~dp0test-webhooks-api.bat"
if errorlevel 1 (set /a FAIL_COUNT+=1) else (set /a PASS_COUNT+=1)
echo.

REM Test 8: Audit Export Formats
call "%~dp0test-audit-export.bat"
if errorlevel 1 (set /a FAIL_COUNT+=1) else (set /a PASS_COUNT+=1)
echo.

REM Test 9: Action Center
call "%~dp0test-action-center.bat"
if errorlevel 1 (set /a FAIL_COUNT+=1) else (set /a PASS_COUNT+=1)
echo.

REM Test 10: Brand Detail
call "%~dp0test-brand-detail.bat"
if errorlevel 1 (set /a FAIL_COUNT+=1) else (set /a PASS_COUNT+=1)
echo.

REM Print summary
set /a TOTAL=%PASS_COUNT%+%FAIL_COUNT%
echo.
echo ============================================================
echo  TASK 20 — BATCH SCRIPT RESULTS SUMMARY
echo ============================================================
echo  Total: %PASS_COUNT% passed, %FAIL_COUNT% failed out of %TOTAL%
echo ============================================================

if %FAIL_COUNT% GTR 0 (
    exit /b 1
) else (
    exit /b 0
)
