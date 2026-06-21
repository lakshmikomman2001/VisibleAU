@echo off
setlocal
echo ============================================================
echo TEST: Webhooks Config API
echo Feature: GET /api/webhooks-config returns JSON array
echo ============================================================

call "%~dp0_auth-helper.bat"
if errorlevel 1 (echo FAIL: Auth failed & exit /b 1)

set "URL=%BASE_URL%/api/webhooks-config"
echo [TEST] GET %URL%

curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-webhooks-api.json" -w "%%{http_code}" "%URL%" > "%TEMP%\test-webhooks-api-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-webhooks-api-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(process.env.TEMP+'/test-webhooks-api.json','utf8'));if(d&&typeof d==='object'){process.exit(0)}else{process.exit(1)}" 2>nul
if errorlevel 1 (
    echo FAIL: Response is not valid JSON
    exit /b 1
)

echo PASS: Webhooks Config API returns valid JSON
exit /b 0
