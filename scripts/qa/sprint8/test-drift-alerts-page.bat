@echo off
setlocal
echo ============================================================
echo TEST: Drift Alerts Page
echo Feature: Drift alerts dashboard with KPI cards
echo ============================================================

call "%~dp0_auth-helper.bat"
if errorlevel 1 (echo FAIL: Auth failed & exit /b 1)

set "URL=%BASE_URL%/drift-alerts"
echo [TEST] GET %URL%

curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-drift-alerts.html" -w "%%{http_code}" "%URL%" > "%TEMP%\test-drift-page-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-drift-page-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

findstr /i "Drift Alerts" "%TEMP%\test-drift-alerts.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing "Drift Alerts" heading
    exit /b 1
)

findstr /i "Active alerts" "%TEMP%\test-drift-alerts.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing "Active alerts" KPI card
    exit /b 1
)

findstr /i "Resolved" "%TEMP%\test-drift-alerts.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing "Resolved" KPI card
    exit /b 1
)

echo PASS: Drift Alerts page renders with KPI cards
exit /b 0
