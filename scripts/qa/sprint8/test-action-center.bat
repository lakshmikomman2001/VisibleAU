@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo TEST: Action Center Page
echo Feature: Recommendations dashboard with KPI cards
echo ============================================================

call "%~dp0_auth-helper.bat"
if errorlevel 1 (echo FAIL: Auth failed & exit /b 1)

set "URL=%BASE_URL%/action-center"
echo [TEST] GET %URL%

curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-action-center.html" -w "%%{http_code}" "%URL%" > "%TEMP%\test-http-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-http-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

findstr /i "Action Center" "%TEMP%\test-action-center.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing "Action Center" heading
    exit /b 1
)

findstr /i "OPEN ACTIONS" "%TEMP%\test-action-center.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing "OPEN ACTIONS" KPI card
    exit /b 1
)

echo PASS: Action Center page renders with KPI cards
exit /b 0
