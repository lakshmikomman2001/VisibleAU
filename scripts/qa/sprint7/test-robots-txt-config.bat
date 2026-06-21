@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo TEST: Robots.txt AI Crawler Configuration
echo Feature: 27 AI bots, 3 tiers, CDN detection
echo ============================================================

call "%~dp0_auth-helper.bat"
if errorlevel 1 (echo FAIL: Auth failed & exit /b 1)

set "URL=%BASE_URL%/brands/%BRAND_ID%/robots-txt-config"
echo [TEST] GET %URL%

curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-robots-config.html" -w "%%{http_code}" "%URL%" > "%TEMP%\test-http-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-http-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

findstr /i "Robots" "%TEMP%\test-robots-config.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing Robots heading
    exit /b 1
)

findstr /i "GPTBot" "%TEMP%\test-robots-config.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing GPTBot in bot list
    exit /b 1
)

echo PASS: Robots.txt Config page renders with bot list
exit /b 0
