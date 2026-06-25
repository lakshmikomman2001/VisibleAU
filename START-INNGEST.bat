@echo off
REM ============================================================
REM  VisibleAU — Start Inngest Dev Server
REM  Dashboard: http://localhost:8288
REM  Endpoint:  http://localhost:3000/api/webhooks/inngest
REM ============================================================
cd /d "%~dp0"

echo.
echo ============================================
echo   VisibleAU — Inngest Dev Server
echo   Dashboard: http://localhost:8288
echo   Endpoint:  http://localhost:3000/api/webhooks/inngest
echo ============================================
echo.
echo   Run START-DEV.bat in a SEPARATE window first.
echo   Keep this window open while developing.
echo.

npx inngest-cli@latest dev -u http://localhost:3000/api/webhooks/inngest

pause
