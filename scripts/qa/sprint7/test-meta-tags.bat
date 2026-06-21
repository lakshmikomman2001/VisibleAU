@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo TEST: Meta Tags Audit
echo Feature: Title, description, OG, canonical, hreflang
echo ============================================================

call "%~dp0_auth-helper.bat"
if errorlevel 1 (echo FAIL: Auth failed & exit /b 1)

set "URL=%BASE_URL%/brands/%BRAND_ID%/meta-tags"
echo [TEST] GET %URL%

curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-meta-tags.html" -w "%%{http_code}" "%URL%" > "%TEMP%\test-http-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-http-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

findstr /i "Meta Tags" "%TEMP%\test-meta-tags.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing Meta Tags heading
    exit /b 1
)

findstr /i "Title Tag" "%TEMP%\test-meta-tags.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing Title Tag check
    exit /b 1
)

echo PASS: Meta Tags page renders with tag checks
exit /b 0
