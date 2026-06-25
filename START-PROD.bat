@echo off
REM ============================================================
REM  VisibleAU — Start LOCAL PRODUCTION environment
REM  Database: visibleau_prod (real audit data, separate from dev)
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

REM ── 1. Check API keys exist in .env.prod ──
findstr /C:"OPENAI_API_KEY=sk-" .env.prod >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] OPENAI_API_KEY is not set in .env.prod
  echo         Edit .env.prod and add your real API keys before running PROD mode.
  echo.
  pause
  exit /b 1
)

REM ── 2. Kill existing server on port 3000 ──
echo [PROD] Stopping any running server on port 3000...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000"') do (
  taskkill /PID %%P /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

REM ── 3. Switch to prod env ──
echo [PROD] Copying .env.prod to .env.local ...
copy /Y .env.prod .env.local >nul

REM ── 4. Ensure prod database exists ──
echo [PROD] Checking visibleau_prod database...
set PGPASSWORD=password
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5432 -tc "SELECT 1 FROM pg_database WHERE datname='visibleau_prod'" 2>nul | findstr "1" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [PROD] Creating visibleau_prod database...
  "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5432 -c "CREATE DATABASE visibleau_prod" 2>nul
)

REM ── 5. Push schema to prod database ──
echo [PROD] Pushing schema to prod database...
set DIRECT_URL=postgresql://postgres:password@localhost:5432/visibleau_prod
set DATABASE_URL=postgresql://postgres:password@localhost:5432/visibleau_prod
call npx drizzle-kit push --force 2>nul

REM ── 6. Seed vertical packs + citability methods + research data ──
echo [PROD] Seeding vertical packs, citability methods, research data...
call npx tsx db/seed/seed.ts 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo [WARN] Seed had issues — data may already exist. Continuing...
)

REM ── 7. Start Next.js dev server ──
echo [PROD] Starting Next.js dev server...
start /B cmd /c "call npm run dev 2>&1"

REM ── 8. Wait for server to be ready ──
echo [PROD] Waiting for server to start...
:WAIT_LOOP
ping -n 3 127.0.0.1 > nul
powershell -Command "try { $r = Invoke-WebRequest -Uri http://localhost:3000 -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_LOOP

REM ── 9. Seed auth user (requires server running) ──
echo [PROD] Seeding test user account...
call npx tsx scripts/seed-auth-user.ts 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo [WARN] Auth seed had issues — user may already exist. Continuing...
)

REM ── 10. Set dev org tier to agency (only the dev user's org, not all orgs) ──
echo [PROD] Setting dev org tier to agency...
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5432 -d visibleau_prod -c "UPDATE organizations SET tier='agency' WHERE name='VisibleAU Dev'" >nul 2>&1

echo.
echo ============================================
echo   Server ready!
echo ============================================
echo.
echo   URL:      http://localhost:3000/sign-in
echo   Login:    sri@visibleau.local / password123
echo   Org:      VisibleAU Dev (Agency tier)
echo   Database: visibleau_prod
echo   LLM:      REAL mode — API calls cost money!
echo.
echo   Engines:  ChatGPT, Claude, Gemini, Perplexity
echo   Models:   gpt-4.1-mini, claude-haiku-4-5,
echo             gemini-2.5-flash, sonar
echo.
echo   WARNING: Each Agency audit = 200 LLM calls.
echo   Estimated cost: ~US$0.50-2.00 per audit.
echo.

REM ── 11. Open browser ──
echo [PROD] Opening browser...
start "" http://localhost:3000/sign-in

echo [PROD] Press Ctrl+C to stop the server.
echo.

:KEEP_ALIVE
ping -n 30 127.0.0.1 > nul
goto KEEP_ALIVE
