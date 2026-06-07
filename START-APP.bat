@echo off
REM ============================================================
REM  VisibleAU — Start App
REM  Kills any existing server, seeds data, starts fresh,
REM  waits until ready, then opens Chrome
REM ============================================================
setlocal EnableDelayedExpansion

cd /d "%~dp0"

echo.
echo ============================================
echo   VisibleAU — Starting App
echo ============================================
echo.

REM ── Kill ALL node/next processes on port 3000 ─────────────────
echo [1/5] Killing existing processes on port 3000...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (
  taskkill /PID %%P /F >nul 2>&1
)
REM Also kill any orphaned node processes running pnpm/next
taskkill /IM node.exe /F >nul 2>&1
timeout /t 3 /nobreak >nul
echo       Done.

REM ── Load environment ──────────────────────────────────────────
echo [2/5] Loading .env.local ...
if exist .env.local (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.local") do (
    set "line=%%A"
    if not "!line!"=="" if not "!line:~0,1!"=="#" set "%%A=%%B"
  )
)

REM ── Seed test data ────────────────────────────────────────────
echo [3/5] Seeding test data...
set PGPASSWORD=password
set PSQL="C:\Program Files\PostgreSQL\18\bin\psql.exe"

%PSQL% -U postgres -h localhost -d visibleau -c "INSERT INTO organizations (id, clerk_org_id, name, tier, region, metadata, created_at, updated_at) VALUES (gen_random_uuid(), 'YOlMjajxQPtDqAMdblehOhhFDXGDiuBi', 'VisibleAU Dev', 'agency', 'au', '{}', NOW(), NOW()) ON CONFLICT (clerk_org_id) DO UPDATE SET tier='agency', name='VisibleAU Dev'" >nul 2>&1

for /f "usebackq tokens=*" %%I in (`%PSQL% -U postgres -h localhost -d visibleau -t -A -c "SELECT id FROM organizations WHERE clerk_org_id='YOlMjajxQPtDqAMdblehOhhFDXGDiuBi'"`) do set ORG_ID=%%I

%PSQL% -U postgres -h localhost -d visibleau -c "INSERT INTO users (id, clerk_user_id, organization_id, email, name, role, created_at, updated_at) VALUES (gen_random_uuid(), '4Fc7RPQaytFN7dqHAwOsjG8XrbteBYpY', '%ORG_ID%', 'sri@visibleau.local', 'Sri Komman', 'owner', NOW(), NOW()) ON CONFLICT (clerk_user_id) DO UPDATE SET email='sri@visibleau.local', name='Sri Komman', organization_id='%ORG_ID%'" >nul 2>&1
echo       Done.

echo.
echo   Login:  sri@visibleau.local / password123
echo.

REM ── Start Next.js dev server in background ────────────────────
echo [4/5] Starting Next.js dev server...
start /B cmd /c "set LLM_MODE=mock&& call pnpm dev"

REM ── Wait for server to be ready ───────────────────────────────
echo [5/5] Waiting for server to be ready...
set ATTEMPTS=0
:WAIT_SERVER
ping -n 3 127.0.0.1 > nul
set /a ATTEMPTS+=1
powershell -Command "try { (Invoke-WebRequest -Uri http://localhost:3000/api/health -UseBasicParsing -TimeoutSec 2).StatusCode } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  if %ATTEMPTS% GEQ 40 (
    echo [ERROR] Server failed to start after 2 minutes.
    pause
    exit /b 1
  )
  goto WAIT_SERVER
)

echo.
echo ============================================
echo   SERVER READY
echo   Opening http://localhost:3000/sign-in
echo   Press Ctrl+C in this window to stop
echo ============================================
echo.

start "" http://localhost:3000/sign-in

REM ── Keep window open, monitor server ──────────────────────────
:KEEP_ALIVE
ping -n 30 127.0.0.1 > nul
powershell -Command "try { (Invoke-WebRequest -Uri http://localhost:3000/api/health -UseBasicParsing -TimeoutSec 2).StatusCode | Out-Null } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% EQU 0 goto KEEP_ALIVE
echo.
echo [APP] Server stopped.
pause
