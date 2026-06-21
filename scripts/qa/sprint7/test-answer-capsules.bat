@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo TEST: Answer Capsules
echo Feature: Question-based headings + 20-25 word answers
echo ============================================================

call "%~dp0_auth-helper.bat"
if errorlevel 1 (echo FAIL: Auth failed & exit /b 1)

set "URL=%BASE_URL%/brands/%BRAND_ID%/answer-capsules"
echo [TEST] GET %URL%

curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-answer-capsules.html" -w "%%{http_code}" "%URL%" > "%TEMP%\test-http-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-http-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

findstr /i "Answer Capsule" "%TEMP%\test-answer-capsules.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing Answer Capsule heading
    exit /b 1
)

echo PASS: Answer Capsules page renders correctly
exit /b 0
