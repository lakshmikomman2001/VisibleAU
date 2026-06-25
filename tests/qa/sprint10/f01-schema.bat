@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo  F01 Sprint 10 Schema Validation
echo  Tests: 12  Runner: vitest  Server: NOT needed
echo ============================================================
echo.

echo [1/2] Applying migrations...
pnpm exec dotenv -e .env.test.local -- pnpm drizzle-kit migrate
if %ERRORLEVEL% neq 0 (
  echo FAIL: migrations failed -- check DATABASE_URL
  exit /b 1
)

echo [2/2] Running vitest...
pnpm exec dotenv -e .env.test.local -- pnpm vitest run ^
  --config tests/qa/sprint10/vitest.config.ts ^
  tests/qa/sprint10/f01-schema.test.ts ^
  --reporter=verbose

set EXIT=%ERRORLEVEL%
if %EXIT% equ 0 (
  echo.
  echo ============================================================
  echo  PASS: F01 all 12 schema tests green
  echo ============================================================
) else (
  echo.
  echo ============================================================
  echo  FAIL: F01 schema tests -- see above
  echo ============================================================
)
exit /b %EXIT%
