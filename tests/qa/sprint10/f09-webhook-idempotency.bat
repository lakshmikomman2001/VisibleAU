@echo off
echo ============================================================
echo  F09 Webhook Idempotency (HJ3 — UNIQUE race guard)
echo  Tests: 7  Runner: vitest
echo  Data: processed_webhook_events rows seeded + deleted
echo ============================================================
pnpm exec dotenv -e .env.test.local -- pnpm vitest run ^
  --config tests/qa/sprint10/vitest.config.ts ^
  tests/qa/sprint10/f09-webhook-idempotency.test.ts ^
  --reporter=verbose
if %ERRORLEVEL% equ 0 ( echo PASS: F09 -- DB cleaned ) else ( echo FAIL: F09 & exit /b 1 )
