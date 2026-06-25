@echo off
echo ============================================================
echo  F03 Sample Audit Config (HB2)
echo  Tests: 9  Runner: vitest  Server: NOT needed
echo ============================================================
pnpm exec dotenv -e .env.test.local -- pnpm vitest run ^
  --config tests/qa/sprint10/vitest.config.ts ^
  tests/qa/sprint10/f03-sample-config.test.ts ^
  --reporter=verbose
if %ERRORLEVEL% equ 0 ( echo PASS: F03 ) else ( echo FAIL: F03 & exit /b 1 )
