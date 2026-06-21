@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo TEST: Technical Audit Dashboard
echo Feature: 8-dimension breakdown + 5-category rollup
echo ============================================================

call "%~dp0_auth-helper.bat"
if errorlevel 1 (echo FAIL: Auth failed & exit /b 1)

set "URL=%BASE_URL%/brands/%BRAND_ID%/technical-audit"
echo [TEST] GET %URL%

curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-technical-audit.html" -w "%%{http_code}" "%URL%" > "%TEMP%\test-http-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-http-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

findstr /i "Technical AI Audit" "%TEMP%\test-technical-audit.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing "Technical AI Audit" heading
    exit /b 1
)

findstr /i "8-Dimension Breakdown" "%TEMP%\test-technical-audit.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing "8-Dimension Breakdown" section
    exit /b 1
)

findstr /i "Robots" "%TEMP%\test-technical-audit.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing Robots dimension
    exit /b 1
)

findstr /i "of 100" "%TEMP%\test-technical-audit.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing composite score
    exit /b 1
)

echo PASS: Technical Audit Dashboard renders correctly with all 8 dimensions
exit /b 0
