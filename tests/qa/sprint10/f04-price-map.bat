@echo off
echo ============================================================
echo  F04 Stripe Price-Map (HA5)
echo  Tests: 14  Runner: vitest  Server: NOT needed
echo ============================================================
pnpm exec dotenv -e .env.test.local -- pnpm vitest run ^
  --config tests/qa/sprint10/vitest.config.ts ^
  tests/qa/sprint10/f04-price-map.test.ts ^
  --reporter=verbose
if %ERRORLEVEL% equ 0 ( echo PASS: F04 ) else ( echo FAIL: F04 & exit /b 1 )
