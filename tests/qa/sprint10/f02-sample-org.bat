@echo off
echo ============================================================
echo  F02 ensureSampleOrg Idempotency
echo  Tests: 6  Runner: vitest  Server: NOT needed
echo ============================================================
echo.

pnpm exec dotenv -e .env.test.local -- pnpm vitest run ^
  --config tests/qa/sprint10/vitest.config.ts ^
  tests/qa/sprint10/f02-sample-org.test.ts ^
  --reporter=verbose

set EXIT=%ERRORLEVEL%
if %EXIT% equ 0 (
  echo PASS: F02 -- DB cleaned by afterAll
) else (
  echo FAIL: F02
)
exit /b %EXIT%
