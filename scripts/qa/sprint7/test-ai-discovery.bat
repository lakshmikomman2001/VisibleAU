@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo TEST: AI Discovery Endpoints
echo Feature: ai.txt, AI FAQ, AI Summary, AI Service
echo ============================================================

call "%~dp0_auth-helper.bat"
if errorlevel 1 (echo FAIL: Auth failed & exit /b 1)

set "URL=%BASE_URL%/brands/%BRAND_ID%/ai-discovery"
echo [TEST] GET %URL%

curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-ai-discovery.html" -w "%%{http_code}" "%URL%" > "%TEMP%\test-http-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-http-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

findstr /i "AI Discovery" "%TEMP%\test-ai-discovery.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing AI Discovery heading
    exit /b 1
)

findstr /i "ai.txt" "%TEMP%\test-ai-discovery.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing ai.txt endpoint check
    exit /b 1
)

echo PASS: AI Discovery page renders with endpoint checks
exit /b 0
