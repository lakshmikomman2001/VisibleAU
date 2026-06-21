@echo off
setlocal
echo ============================================================
echo TEST: Drift Alerts API
echo Feature: GET /api/drift-alerts returns JSON array
echo ============================================================

call "%~dp0_auth-helper.bat"
if errorlevel 1 (echo FAIL: Auth failed & exit /b 1)

set "URL=%BASE_URL%/api/drift-alerts"
echo [TEST] GET %URL%

curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-drift-api.json" -w "%%{http_code}" "%URL%" > "%TEMP%\test-drift-api-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-drift-api-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

REM Verify response is valid JSON with object structure (no ! chars - breaks enabledelayedexpansion)
node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(process.env.TEMP+'/test-drift-api.json','utf8'));if(d&&typeof d==='object'){process.exit(0)}else{process.exit(1)}" 2>nul
if errorlevel 1 (
    echo FAIL: Response is not valid JSON
    exit /b 1
)

echo PASS: Drift Alerts API returns valid JSON
exit /b 0
