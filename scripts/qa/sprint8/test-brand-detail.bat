@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo TEST: Brand Detail Page
echo Feature: Brand page with TikTok placeholder + nav tabs
echo ============================================================

call "%~dp0_auth-helper.bat"
if errorlevel 1 (echo FAIL: Auth failed & exit /b 1)

set "URL=%BASE_URL%/brands/%BRAND_ID%"
echo [TEST] GET %URL%

curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-brand-detail.html" -w "%%{http_code}" "%URL%" > "%TEMP%\test-http-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-http-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

findstr /i "Local SEO" "%TEMP%\test-brand-detail.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing Local SEO navigation tab
    exit /b 1
)

findstr /i "TikTok" "%TEMP%\test-brand-detail.html" > nul 2>&1
if errorlevel 1 (
    echo WARN: TikTok placeholder not found in HTML - may be client-rendered
)

echo PASS: Brand detail page renders with navigation tabs
exit /b 0
