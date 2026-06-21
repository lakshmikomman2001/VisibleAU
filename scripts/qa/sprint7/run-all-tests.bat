@echo off
setlocal enabledelayedexpansion
echo.
echo ============================================================
echo  SPRINT 7 — FULL TEST SUITE
echo  Brand: Asset Plumbing Solutions (dev database, mock LLM)
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

REM Test 2: Technical Audit Dashboard
set /a TOTAL+=1
call "%~dp0test-technical-audit.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-technical-audit.bat          Technical Audit         |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-technical-audit.bat          Technical Audit         |"
)
echo.

REM Test 3: Robots.txt Config
set /a TOTAL+=1
call "%~dp0test-robots-txt-config.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-robots-txt-config.bat        Robots.txt Config       |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-robots-txt-config.bat        Robots.txt Config       |"
)
echo.

REM Test 4: llms.txt Generator
set /a TOTAL+=1
call "%~dp0test-llms-txt-generator.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-llms-txt-generator.bat       llms.txt Generator      |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-llms-txt-generator.bat       llms.txt Generator      |"
)
echo.

REM Test 5: Schema Audit
set /a TOTAL+=1
call "%~dp0test-schema-audit.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-schema-audit.bat             Schema Audit            |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-schema-audit.bat             Schema Audit            |"
)
echo.

REM Test 6: Meta Tags
set /a TOTAL+=1
call "%~dp0test-meta-tags.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-meta-tags.bat                Meta Tags               |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-meta-tags.bat                Meta Tags               |"
)
echo.

REM Test 7: SSR Check
set /a TOTAL+=1
call "%~dp0test-ssr-check.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-ssr-check.bat                SSR Check               |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-ssr-check.bat                SSR Check               |"
)
echo.

REM Test 8: Brand Entity Audit
set /a TOTAL+=1
call "%~dp0test-brand-entity-audit.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-brand-entity-audit.bat       Brand Entity Audit      |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-brand-entity-audit.bat       Brand Entity Audit      |"
)
echo.

REM Test 9: Signals
set /a TOTAL+=1
call "%~dp0test-signals.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-signals.bat                  Signals                 |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-signals.bat                  Signals                 |"
)
echo.

REM Test 10: AI Discovery
set /a TOTAL+=1
call "%~dp0test-ai-discovery.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-ai-discovery.bat             AI Discovery            |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-ai-discovery.bat             AI Discovery            |"
)
echo.

REM Test 11: Answer Capsules
set /a TOTAL+=1
call "%~dp0test-answer-capsules.bat"
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set "RESULTS=!RESULTS!FAIL  test-answer-capsules.bat          Answer Capsules         |"
) else (
    set /a PASS_COUNT+=1
    set "RESULTS=!RESULTS!PASS  test-answer-capsules.bat          Answer Capsules         |"
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
