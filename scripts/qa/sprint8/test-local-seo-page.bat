@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo TEST: Local SEO Page
echo Feature: GMB + AU directories + NAP consistency
echo ============================================================

call "%~dp0_auth-helper.bat"
if errorlevel 1 (echo FAIL: Auth failed & exit /b 1)

set "URL=%BASE_URL%/brands/%BRAND_ID%/local-seo"
echo [TEST] GET %URL%

curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-local-seo.html" -w "%%{http_code}" "%URL%" > "%TEMP%\test-http-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-http-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

findstr /i "Local SEO" "%TEMP%\test-local-seo.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing "Local SEO" heading
    exit /b 1
)

echo PASS: Local SEO page renders correctly
exit /b 0
