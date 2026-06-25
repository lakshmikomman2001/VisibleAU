@echo off
echo ============================================================
echo  F06 Tier Audit Limits (HE1, T1)
echo  Tests: 8  Runner: vitest  Server: NOT needed
echo ============================================================
pnpm exec dotenv -e .env.test.local -- pnpm vitest run ^
  --config tests/qa/sprint10/vitest.config.ts ^
  tests/qa/sprint10/f06-tier-limits.test.ts ^
  --reporter=verbose
if %ERRORLEVEL% equ 0 ( echo PASS: F06 ) else ( echo FAIL: F06 & exit /b 1 )
