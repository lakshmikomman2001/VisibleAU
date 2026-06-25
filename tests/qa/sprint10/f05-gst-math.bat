@echo off
echo ============================================================
echo  F05 GST Math (HC2, HG1 — no double-charge)
echo  Tests: 10  Runner: vitest  Server: NOT needed
echo ============================================================
pnpm exec dotenv -e .env.test.local -- pnpm vitest run ^
  --config tests/qa/sprint10/vitest.config.ts ^
  tests/qa/sprint10/f05-gst-math.test.ts ^
  --reporter=verbose
if %ERRORLEVEL% equ 0 ( echo PASS: F05 ) else ( echo FAIL: F05 & exit /b 1 )
