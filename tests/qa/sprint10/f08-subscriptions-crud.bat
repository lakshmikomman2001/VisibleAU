@echo off
echo ============================================================
echo  F08 Subscriptions CRUD + Tier Sync (HA1, HA3)
echo  Tests: 8  Runner: vitest
echo  Data: org + subscription seeded, deleted on completion
echo ============================================================
pnpm exec dotenv -e .env.test.local -- pnpm vitest run ^
  --config tests/qa/sprint10/vitest.config.ts ^
  tests/qa/sprint10/f08-subscriptions-crud.test.ts ^
  --reporter=verbose
if %ERRORLEVEL% equ 0 ( echo PASS: F08 -- DB cleaned ) else ( echo FAIL: F08 & exit /b 1 )
