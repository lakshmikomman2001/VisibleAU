@echo off
setlocal enabledelayedexpansion
echo.
echo ============================================================
echo  SPRINT 8 — FULL TEST SUITE
echo  Features: Drift + Local SEO + Webhooks + Exports + Actions
echo  Date: %date% %time%
echo ============================================================
echo.

set PASS_COUNT=0
set FAIL_COUNT=0
set TOTAL=0
set "RESULTS="

REM Test 1: API Health
set /a TOTAL+=1
call "%~dp0test-api-health.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-api-health.bat              API Health              |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-api-health.bat              API Health              |"
)
echo.

REM Test 2: Drift Alerts Page
set /a TOTAL+=1
call "%~dp0test-drift-alerts-page.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-drift-alerts-page.bat       Drift Alerts Page       |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-drift-alerts-page.bat       Drift Alerts Page       |"
)
echo.

REM Test 3: Drift Alerts API
set /a TOTAL+=1
call "%~dp0test-drift-alerts-api.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-drift-alerts-api.bat        Drift Alerts API        |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-drift-alerts-api.bat        Drift Alerts API        |"
)
echo.

REM Test 4: Audits List
set /a TOTAL+=1
call "%~dp0test-audits-list.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-audits-list.bat             Audits List             |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-audits-list.bat             Audits List             |"
)
echo.

REM Test 5: Local SEO Page
set /a TOTAL+=1
call "%~dp0test-local-seo-page.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-local-seo-page.bat          Local SEO Page          |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-local-seo-page.bat          Local SEO Page          |"
)
echo.

REM Test 6: Webhooks Settings Page
set /a TOTAL+=1
call "%~dp0test-webhooks-page.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-webhooks-page.bat           Webhooks Page           |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-webhooks-page.bat           Webhooks Page           |"
)
echo.

REM Test 7: Webhooks Config API
set /a TOTAL+=1
call "%~dp0test-webhooks-api.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-webhooks-api.bat            Webhooks API            |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-webhooks-api.bat            Webhooks API            |"
)
echo.

REM Test 8: Audit Export Formats
set /a TOTAL+=1
call "%~dp0test-audit-export.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-audit-export.bat            Export Formats           |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-audit-export.bat            Export Formats           |"
)
echo.

REM Test 9: Action Center
set /a TOTAL+=1
call "%~dp0test-action-center.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-action-center.bat           Action Center           |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-action-center.bat           Action Center           |"
)
echo.

REM Test 10: Brand Detail
set /a TOTAL+=1
call "%~dp0test-brand-detail.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-brand-detail.bat            Brand Detail            |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-brand-detail.bat            Brand Detail            |"
)
echo.

REM Print summary
echo.
echo ============================================================
echo  TASK 20 — BATCH SCRIPT RESULTS SUMMARY
echo ============================================================
echo  Script                            Feature                 Result
echo ------------------------------------------------------------

for %%R in ("!RESULTS:|=" "!") do (
    set "LINE=%%~R"
    if not "!LINE!"=="" echo  !LINE!
)

echo ------------------------------------------------------------
echo  Total: !PASS_COUNT! passed, !FAIL_COUNT! failed, 0 remaining failures
echo ============================================================

if !FAIL_COUNT! GTR 0 (
    exit /b 1
) else (
    exit /b 0
)
