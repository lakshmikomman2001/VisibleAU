@echo off
REM ============================================================
REM  VisibleAU — Start PROD environment
REM  Database: visibleau_prod (real audit data)
REM  LLM:      REAL mode (calls real APIs, costs real money!)
REM ============================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ============================================
echo   VisibleAU — PRODUCTION MODE (Real LLMs)
echo   Database: visibleau_prod
echo   LLM:      REAL (costs money!)
echo ============================================
echo.

REM Check API keys exist in .env.prod
findstr /C:"OPENAI_API_KEY=sk-" .env.prod >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] OPENAI_API_KEY is not set in .env.prod
  echo         Edit .env.prod and add your real API keys before running PROD mode.
  echo.
  pause
  exit /b 1
)

REM Kill existing server
echo [PROD] Stopping any running server...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (
  taskkill /PID %%P /F >nul 2>&1
)
taskkill /IM node.exe /F >nul 2>&1
timeout /t 3 /nobreak >nul

REM Switch to prod env
echo [PROD] Switching to .env.prod ...
copy /Y .env.prod .env.local >nul

REM Seed org/user in prod DB
echo [PROD] Ensuring org + user exist in prod database...
set PGPASSWORD=password
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d visibleau_prod -c "INSERT INTO organizations (id, clerk_org_id, name, tier, region, metadata, created_at, updated_at) VALUES (gen_random_uuid(), 'YOlMjajxQPtDqAMdblehOhhFDXGDiuBi', 'VisibleAU Dev', 'agency', 'au', '{}', NOW(), NOW()) ON CONFLICT (clerk_org_id) DO UPDATE SET tier='agency', name='VisibleAU Dev'" >nul 2>&1
for /f "usebackq tokens=*" %%I in (`"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d visibleau_prod -t -A -c "SELECT id FROM organizations WHERE clerk_org_id='YOlMjajxQPtDqAMdblehOhhFDXGDiuBi'"`) do set ORG_ID=%%I
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d visibleau_prod -c "INSERT INTO users (id, clerk_user_id, organization_id, email, name, role, created_at, updated_at) VALUES (gen_random_uuid(), '4Fc7RPQaytFN7dqHAwOsjG8XrbteBYpY', '%ORG_ID%', 'sri@visibleau.local', 'Sri Komman', 'owner', NOW(), NOW()) ON CONFLICT (clerk_user_id) DO UPDATE SET email='sri@visibleau.local', name='Sri Komman', organization_id='%ORG_ID%'" >nul 2>&1

echo.
echo   Login:  sri@visibleau.local / password123
echo   LLM:    REAL mode — API calls cost money!
echo   DB:     visibleau_prod (separate from dev)
echo.
echo   WARNING: Each Agency audit = 200 LLM calls.
echo   Estimated cost: ~US$0.50-2.00 per audit.
echo.

echo [PROD] Starting Next.js dev server...
start /B cmd /c "call pnpm dev"

:WAIT_PROD
ping -n 3 127.0.0.1 > nul
powershell -Command "try { (Invoke-WebRequest -Uri http://localhost:3000/api/health -UseBasicParsing -TimeoutSec 2).StatusCode } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_PROD

echo [PROD] Server ready! Opening browser...
start "" http://localhost:3000/sign-in
echo [PROD] Press Ctrl+C to stop.

:KEEP_ALIVE
ping -n 30 127.0.0.1 > nul
goto KEEP_ALIVE
