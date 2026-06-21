@echo off
setlocal
echo ============================================================
echo TEST: Audits List Page
echo Feature: Audit listing with drift indicator support
echo ============================================================

call "%~dp0_auth-helper.bat"
if errorlevel 1 (echo FAIL: Auth failed & exit /b 1)

set "URL=%BASE_URL%/audits"
echo [TEST] GET %URL%

curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-audits-list.html" -w "%%{http_code}" "%URL%" > "%TEMP%\test-audits-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-audits-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

findstr /i "Audits" "%TEMP%\test-audits-list.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing "Audits" heading
    exit /b 1
)

findstr /i "Score" "%TEMP%\test-audits-list.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing Score column header
    exit /b 1
)

findstr /i "Brand" "%TEMP%\test-audits-list.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing Brand column header
    exit /b 1
)

echo PASS: Audits list page renders with score and brand columns
exit /b 0
