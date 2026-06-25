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

REM ── 1. Kill existing server on port 3000 ──
echo [DEV] Stopping any running server on port 3000...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (
  taskkill /PID %%P /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

REM ── 2. Switch to dev env ──
echo [DEV] Copying .env.dev to .env.local ...
copy /Y .env.dev .env.local >nul

REM ── 3. Ensure dev database exists ──
echo [DEV] Checking visibleau database...
set PGPASSWORD=password
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5432 -tc "SELECT 1 FROM pg_database WHERE datname='visibleau'" 2>nul | findstr "1" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [DEV] Creating visibleau database...
  "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5432 -c "CREATE DATABASE visibleau" 2>nul
)

REM ── 4. Push schema to dev database ──
echo [DEV] Pushing schema to dev database...
set DIRECT_URL=postgresql://postgres:password@localhost:5432/visibleau
set DATABASE_URL=postgresql://postgres:password@localhost:5432/visibleau
call npx drizzle-kit push --force 2>nul

REM ── 5. Seed vertical packs + citability methods + research data ──
echo [DEV] Seeding vertical packs, citability methods, research data...
call npx tsx db/seed/seed.ts 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo [WARN] Seed had issues — data may already exist. Continuing...
)

REM ── 6. Start Next.js dev server ──
echo [DEV] Starting Next.js dev server...
start /B cmd /c "call npm run dev 2>&1"

REM ── 7. Wait for server to be ready ──
echo [DEV] Waiting for server to start...
:WAIT_LOOP
ping -n 3 127.0.0.1 > nul
powershell -Command "try { $r = Invoke-WebRequest -Uri http://localhost:3000 -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_LOOP

REM ── 8. Seed auth user (requires server running) ──
echo [DEV] Seeding test user account...
call npx tsx scripts/seed-auth-user.ts 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo [WARN] Auth seed had issues — user may already exist. Continuing...
)

REM ── 9. Set dev org tier to agency (only the dev user's org, not all orgs) ──
echo [DEV] Setting dev org tier to agency...
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5432 -d visibleau -c "UPDATE organizations SET tier='agency' WHERE name='VisibleAU Dev'" >nul 2>&1

echo.
echo ============================================
echo   Server ready!
echo ============================================
echo.
echo   URL:      http://localhost:3000/sign-in
echo   Login:    sri@visibleau.local / password123
echo   Org:      VisibleAU Dev (Agency tier)
echo   Database: visibleau (dev)
echo   LLM:      MOCK mode — no real API calls
echo.

REM ── 10. Open browser ──
echo [DEV] Opening browser...
start "" http://localhost:3000/sign-in

echo [DEV] Press Ctrl+C to stop the server.
echo.

:KEEP_ALIVE
ping -n 30 127.0.0.1 > nul
goto KEEP_ALIVE
