@echo off
REM ============================================================
REM  VisibleAU — Sprint 6 Action Center Test Data
REM  Requires: SEED-TEST-DATA.bat already run (org, user, brand exist)
REM  Seeds: 1 low-score audit + 8 action items + research citations
REM ============================================================
setlocal EnableDelayedExpansion

cd /d "%~dp0"
set PGPASSWORD=password
set PSQL="C:\Program Files\PostgreSQL\18\bin\psql.exe"

echo.
echo ============================================
echo   SPRINT 6 — Action Center Test Data
echo ============================================
echo.

REM --- Step 1: Run pnpm seed for research citations ---
echo [SEED] Running pnpm seed (vertical packs + research citations)...
call pnpm seed
echo.

REM --- Step 2: Run the Sprint 6 SQL seed ---
echo [SEED] Seeding Sprint 6 action items...
%PSQL% -U postgres -h localhost -d visibleau -f "db\seed\sprint6-test-data.sql"

REM --- Step 3: Count and verify ---
for /f "usebackq tokens=*" %%I in (`%PSQL% -U postgres -h localhost -d visibleau -t -A -c "SELECT COUNT(*) FROM action_items"`) do set ACTION_COUNT=%%I
for /f "usebackq tokens=*" %%I in (`%PSQL% -U postgres -h localhost -d visibleau -t -A -c "SELECT COUNT(*) FROM recommendation_research"`) do set RESEARCH_COUNT=%%I

echo.
echo ============================================
echo   SPRINT 6 SEED COMPLETE
echo.
echo   Action Items: %ACTION_COUNT% recommendations seeded
echo     4x Frequency  (Wikipedia, AU dirs, Reddit, Press)
echo     2x Accuracy   (Stale content, Expert quotes)
echo     1x Context    (FAQ schema)
echo     1x Position   (Comparison article)
echo.
echo   Confidence: 3 Confirmed, 4 Likely, 1 Hypothesis
echo   Research Citations: %RESEARCH_COUNT% rows
echo.
echo   Login:
echo     Email:    sri@visibleau.local
echo     Password: password123
echo.
echo   Test these pages:
echo     1. /action-center        8 recs across 4 dimensions
echo     2. /action-center/[id]   Click any card for detail
echo     3. Mark as done          On detail page
echo     4. Dismiss               Enter reason, confirm
echo     5. View research         Expand citations
echo     6. Sidebar nav           Action Center link
echo.
echo   To test Free tier blur:
echo     Run: psql -U postgres -d visibleau -c
echo       "UPDATE organizations SET tier='free'
echo        WHERE clerk_org_id='YOlMjajxQPtDqAMdblehOhhFDXGDiuBi'"
echo     Refresh /action-center - text should be blurred
echo     Restore: SET tier='agency'
echo ============================================
echo.
pause
