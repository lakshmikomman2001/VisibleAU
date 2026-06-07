@echo off
REM ============================================================
REM  VisibleAU — Start DEV environment
REM  Database: visibleau (mock data)
REM  LLM:      MOCK mode (no real API calls, no cost)
REM ============================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ============================================
echo   VisibleAU — DEV MODE (Mock LLMs)
echo   Database: visibleau
echo   LLM:      MOCK (no cost)
echo ============================================
echo.

REM Kill existing server
echo [DEV] Stopping any running server...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (
  taskkill /PID %%P /F >nul 2>&1
)
taskkill /IM node.exe /F >nul 2>&1
timeout /t 3 /nobreak >nul

REM Switch to dev env
echo [DEV] Switching to .env.dev ...
copy /Y .env.dev .env.local >nul

REM Seed test data
echo [DEV] Ensuring test data exists...
set PGPASSWORD=password
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d visibleau -c "INSERT INTO organizations (id, clerk_org_id, name, tier, region, metadata, created_at, updated_at) VALUES (gen_random_uuid(), 'YOlMjajxQPtDqAMdblehOhhFDXGDiuBi', 'VisibleAU Dev', 'agency', 'au', '{}', NOW(), NOW()) ON CONFLICT (clerk_org_id) DO UPDATE SET tier='agency', name='VisibleAU Dev'" >nul 2>&1
for /f "usebackq tokens=*" %%I in (`"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d visibleau -t -A -c "SELECT id FROM organizations WHERE clerk_org_id='YOlMjajxQPtDqAMdblehOhhFDXGDiuBi'"`) do set ORG_ID=%%I
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d visibleau -c "INSERT INTO users (id, clerk_user_id, organization_id, email, name, role, created_at, updated_at) VALUES (gen_random_uuid(), '4Fc7RPQaytFN7dqHAwOsjG8XrbteBYpY', '%ORG_ID%', 'sri@visibleau.local', 'Sri Komman', 'owner', NOW(), NOW()) ON CONFLICT (clerk_user_id) DO UPDATE SET email='sri@visibleau.local', name='Sri Komman', organization_id='%ORG_ID%'" >nul 2>&1

echo.
echo   Login:  sri@visibleau.local / password123
echo   LLM:    Mock mode — no real API calls
echo   DB:     visibleau (dev)
echo.

echo [DEV] Starting Next.js dev server...
start /B cmd /c "call pnpm dev"

:WAIT_DEV
ping -n 3 127.0.0.1 > nul
powershell -Command "try { (Invoke-WebRequest -Uri http://localhost:3000/api/health -UseBasicParsing -TimeoutSec 2).StatusCode } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_DEV

echo [DEV] Server ready! Opening browser...
start "" http://localhost:3000/sign-in
echo [DEV] Press Ctrl+C to stop.

:KEEP_ALIVE
ping -n 30 127.0.0.1 > nul
goto KEEP_ALIVE
