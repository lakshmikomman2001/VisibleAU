@echo off
echo ============================================================
echo  F07 Onboarding State Machine (HC4, HM1, HJ4)
echo  Tests: 8  Runner: vitest
echo  Data: seeds org [S10QA F07], deletes on completion
echo ============================================================
echo.

pnpm exec dotenv -e .env.test.local -- pnpm vitest run ^
  --config tests/qa/sprint10/vitest.config.ts ^
  tests/qa/sprint10/f07-onboarding-state.test.ts ^
  --reporter=verbose

set EXIT=%ERRORLEVEL%
if %EXIT% equ 0 (
  echo PASS: F07 -- DB cleaned by afterAll
) else (
  echo FAIL: F07
)
exit /b %EXIT%
