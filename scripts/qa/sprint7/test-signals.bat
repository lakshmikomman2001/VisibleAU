@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo TEST: Signals (Negative Signals + Prompt Injection)
echo Feature: 8 negative patterns + 8 injection patterns
echo ============================================================

call "%~dp0_auth-helper.bat"
if errorlevel 1 (echo FAIL: Auth failed & exit /b 1)

set "URL=%BASE_URL%/brands/%BRAND_ID%/signals"
echo [TEST] GET %URL%

curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-signals.html" -w "%%{http_code}" "%URL%" > "%TEMP%\test-http-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-http-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

findstr /i "Signal" "%TEMP%\test-signals.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing Signals heading
    exit /b 1
)

echo PASS: Signals page renders correctly
exit /b 0
