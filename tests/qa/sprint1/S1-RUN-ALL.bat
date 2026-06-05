@echo off
REM ============================================================
REM  Sprint 1 QA — Run All Feature Tests
REM  Runs F01 through F12 sequentially.
REM  All test data is created per-feature and deleted at end.
REM ============================================================
setlocal EnableDelayedExpansion
set PASS=0
set FAIL=0
set FAILED_FEATURES=

for %%F in (
  tests\qa\sprint1\features\f01-health\F01-HEALTH.bat
  tests\qa\sprint1\features\f02-region\F02-REGION.bat
  tests\qa\sprint1\features\f03-auth-signup\F03-AUTH-SIGNUP.bat
  tests\qa\sprint1\features\f04-auth-signin\F04-AUTH-SIGNIN.bat
  tests\qa\sprint1\features\f05-brand-crud\F05-BRAND-CRUD.bat
  tests\qa\sprint1\features\f06-brand-limit\F06-BRAND-LIMIT.bat
  tests\qa\sprint1\features\f07-cross-org\F07-CROSS-ORG.bat
  tests\qa\sprint1\features\f08-soft-delete\F08-SOFT-DELETE.bat
  tests\qa\sprint1\features\f09-feature-flags\F09-FEATURE-FLAGS.bat
  tests\qa\sprint1\features\f10-stripe-products\F10-STRIPE-PRODUCTS.bat
  tests\qa\sprint1\features\f11-clerk-webhook\F11-CLERK-WEBHOOK.bat
  tests\qa\sprint1\features\f12-rls-policies\F12-RLS-POLICIES.bat
) do (
  echo.
  echo ========================================
  echo Running %%F
  echo ========================================
  call %%F
  if !ERRORLEVEL! EQU 0 (
    set /a PASS+=1
  ) else (
    set /a FAIL+=1
    set FAILED_FEATURES=!FAILED_FEATURES! %%F
  )
)

echo.
echo ========================================
echo  Sprint 1 QA Summary
echo  Passed: %PASS%  Failed: %FAIL%
if not "%FAILED_FEATURES%"=="" echo  Failed features: %FAILED_FEATURES%
echo ========================================
if %FAIL% EQU 0 (exit /b 0) else (exit /b 1)
