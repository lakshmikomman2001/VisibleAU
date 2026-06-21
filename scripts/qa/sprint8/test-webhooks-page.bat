@echo off
setlocal
echo ============================================================
echo TEST: Webhooks Settings Page
echo Feature: Per-org webhook configuration UI
echo ============================================================

call "%~dp0_auth-helper.bat"
if errorlevel 1 (echo FAIL: Auth failed & exit /b 1)

set "URL=%BASE_URL%/settings/webhooks"
echo [TEST] GET %URL%

curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-webhooks.html" -w "%%{http_code}" "%URL%" > "%TEMP%\test-webhooks-page-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-webhooks-page-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

findstr /i "Webhook" "%TEMP%\test-webhooks.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing "Webhook" content
    exit /b 1
)

echo PASS: Webhooks settings page renders correctly
exit /b 0
