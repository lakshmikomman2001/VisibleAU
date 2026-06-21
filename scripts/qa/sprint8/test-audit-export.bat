@echo off
setlocal
echo ============================================================
echo TEST: Audit Export Formats
echo Feature: SARIF, JUnit, GHA export endpoints
echo ============================================================

call "%~dp0_auth-helper.bat"
if errorlevel 1 (echo FAIL: Auth failed & exit /b 1)

REM Find the most recent completed audit
for /f "usebackq delims=" %%A in (`curl -s -b "%COOKIE_FILE%" "%BASE_URL%/audits" 2^>nul ^| node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{const h=d.join('');const m=h.match(/\/audits\/([0-9a-f-]+)/);console.log(m?m[1]:'')}catch{console.log('')}})"`) do set "AUDIT_ID=%%A"

if "%AUDIT_ID%"=="" (
    echo SKIP: No completed audit found to test exports
    exit /b 0
)

echo [TEST] Testing exports for audit %AUDIT_ID%

REM Test SARIF export
curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-export-sarif.json" -w "%%{http_code}" "%BASE_URL%/api/audits/%AUDIT_ID%/export?format=sarif" > "%TEMP%\test-sarif-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-sarif-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: SARIF export HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

findstr /i "sarif" "%TEMP%\test-export-sarif.json" > nul 2>&1
if errorlevel 1 (
    echo FAIL: SARIF output missing schema reference
    exit /b 1
)

REM Test JUnit export
curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-export-junit.xml" -w "%%{http_code}" "%BASE_URL%/api/audits/%AUDIT_ID%/export?format=junit" > "%TEMP%\test-junit-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-junit-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: JUnit export HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

findstr /i "testsuite" "%TEMP%\test-export-junit.xml" > nul 2>&1
if errorlevel 1 (
    echo FAIL: JUnit output missing testsuite element
    exit /b 1
)

REM Test GHA export
curl -s -b "%COOKIE_FILE%" -o "%TEMP%\test-export-gha.txt" -w "%%{http_code}" "%BASE_URL%/api/audits/%AUDIT_ID%/export?format=gha" > "%TEMP%\test-gha-code.txt" 2>&1
set /p HTTP_CODE=<"%TEMP%\test-gha-code.txt"

if not "%HTTP_CODE%"=="200" (
    echo FAIL: GHA export HTTP %HTTP_CODE% - expected 200
    exit /b 1
)

echo PASS: All export formats (SARIF, JUnit, GHA) return 200 with valid content
exit /b 0
