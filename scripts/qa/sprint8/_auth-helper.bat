@echo off
REM Shared auth helper — signs in and saves session cookie
REM Usage: call _auth-helper.bat
REM Sets COOKIE_FILE, BRAND_ID, and BASE_URL environment variables

set "BASE_URL=http://localhost:3000"
set "COOKIE_FILE=%TEMP%\visibleau-test-cookies.txt"

REM Sign in and save cookie
curl -s -c "%COOKIE_FILE%" -X POST %BASE_URL%/api/auth/sign-in/email ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"sri@visibleau.local\",\"password\":\"password123\"}" > nul 2>&1

REM Verify session is valid
curl -s -b "%COOKIE_FILE%" -o nul -w "%%{http_code}" %BASE_URL%/dashboard > "%TEMP%\visibleau-auth-check.txt" 2>&1
set /p AUTH_STATUS=<"%TEMP%\visibleau-auth-check.txt"

if "%AUTH_STATUS%"=="200" (
    echo [AUTH] Session established successfully
) else (
    echo [AUTH] FAILED - got HTTP %AUTH_STATUS%
    exit /b 1
)

REM Discover first brand with a completed audit
for /f "usebackq delims=" %%B in (`curl -s -b "%COOKIE_FILE%" "%BASE_URL%/api/brands" 2^>nul ^| node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{const j=JSON.parse(d.join(''));const b=(j.brands||j)[0];console.log(b.id)}catch{console.log('')}})"`) do set "BRAND_ID=%%B"

if "%BRAND_ID%"=="" (
    echo [AUTH] WARNING: Could not discover brand ID, using fallback
    set "BRAND_ID=97ae2005-c676-4118-83ee-7e2f0b2c4cd6"
)
echo [AUTH] Using brand: %BRAND_ID%
