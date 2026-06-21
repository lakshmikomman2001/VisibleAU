@echo off
setlocal
echo ============================================================
echo TEST: API Health Endpoint
echo Feature: Server health check with DB ping
echo ============================================================

set "BASE_URL=http://localhost:3000"

curl -s -o "%TEMP%\test-health.json" -w "%%{http_code}" "%BASE_URL%/api/health" > "%TEMP%\test-health-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-health-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

findstr /i "ok" "%TEMP%\test-health.json" > nul 2>&1
if errorlevel 1 (
    echo FAIL: Health check did not return "ok"
    exit /b 1
)

echo PASS: API health endpoint returns 200 with db ok
exit /b 0
