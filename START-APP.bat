@echo off
REM ============================================================
REM  VisibleAU — Start App (dev server)
REM  Stops any running server, re-seeds data, launches fresh
REM  Open http://localhost:3000 in your browser after "Server ready"
REM ============================================================
setlocal EnableDelayedExpansion

cd /d "%~dp0"
echo [APP] Working directory: %CD%

echo [APP] Loading environment from .env.local ...
if exist .env.local (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.local") do (
    set "line=%%A"
    if not "!line!"=="" if not "!line:~0,1!"=="#" set "%%A=%%B"
  )
)

echo [APP] Stopping any running server on port 3000...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (
  taskkill /PID %%P /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

echo [APP] Ensuring test data exists in database...
set PGPASSWORD=password
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d visibleau -c "INSERT INTO organizations (id, clerk_org_id, name, tier, region, metadata, created_at, updated_at) VALUES (gen_random_uuid(), 'YOlMjajxQPtDqAMdblehOhhFDXGDiuBi', 'VisibleAU Dev', 'agency', 'au', '{}', NOW(), NOW()) ON CONFLICT (clerk_org_id) DO UPDATE SET tier='agency'" >nul 2>&1

for /f "usebackq tokens=*" %%I in (`"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d visibleau -t -A -c "SELECT id FROM organizations WHERE clerk_org_id='YOlMjajxQPtDqAMdblehOhhFDXGDiuBi'"`) do set ORG_ID=%%I

"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d visibleau -c "INSERT INTO users (id, clerk_user_id, organization_id, email, name, role, created_at, updated_at) VALUES (gen_random_uuid(), '4Fc7RPQaytFN7dqHAwOsjG8XrbteBYpY', '%ORG_ID%', 'sri@visibleau.local', 'Sri Komman', 'owner', NOW(), NOW()) ON CONFLICT (clerk_user_id) DO UPDATE SET email='sri@visibleau.local', name='Sri Komman', organization_id='%ORG_ID%'" >nul 2>&1

echo [APP] Data ready.
echo.
echo ============================================
echo   TEST ACCOUNT:
echo   Email:    sri@visibleau.local
echo   Password: password123
echo   Org:      VisibleAU Dev (agency tier)
echo ============================================
echo.

echo [APP] Starting Next.js dev server...
echo [APP] Open http://localhost:3000 in Chrome when ready.
echo.

start "" http://localhost:3000/sign-in

pnpm dev
