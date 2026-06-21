@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo TEST: Brand and Entity Audit
echo Feature: ABN, Wikipedia AU, AU TLD, directories
echo ============================================================

call "%~dp0_auth-helper.bat"
if errorlevel 1 (echo FAIL: Auth failed & exit /b 1)

set "URL=%BASE_URL%/brands/%BRAND_ID%/brand-entity-audit"
echo [TEST] GET %URL%

curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-brand-entity.html" -w "%%{http_code}" "%URL%" > "%TEMP%\test-http-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-http-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

findstr /i "Brand" "%TEMP%\test-brand-entity.html" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Missing Brand heading
    exit /b 1
)

echo PASS: Brand Entity Audit page renders correctly
exit /b 0
