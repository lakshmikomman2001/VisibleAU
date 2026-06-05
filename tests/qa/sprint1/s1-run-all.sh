#!/usr/bin/env bash
# ============================================================
#  Sprint 1 QA — Run All Feature Tests
#  Runs F01 through F12 sequentially.
#  All test data is created per-feature and deleted at end.
# ============================================================
set -euo pipefail

[ -f .env.test.local ] && export $(grep -v '^#' .env.test.local | xargs)

PASS=0
FAIL=0
FAILED=()

FEATURES=(
  tests/qa/sprint1/features/f01-health/f01-health.sh
  tests/qa/sprint1/features/f02-region/f02-region.sh
  tests/qa/sprint1/features/f03-auth-signup/f03-auth-signup.sh
  tests/qa/sprint1/features/f04-auth-signin/f04-auth-signin.sh
  tests/qa/sprint1/features/f05-brand-crud/f05-brand-crud.sh
  tests/qa/sprint1/features/f06-brand-limit/f06-brand-limit.sh
  tests/qa/sprint1/features/f07-cross-org/f07-cross-org.sh
  tests/qa/sprint1/features/f08-soft-delete/f08-soft-delete.sh
  tests/qa/sprint1/features/f09-feature-flags/f09-feature-flags.sh
  tests/qa/sprint1/features/f10-stripe-products/f10-stripe-products.sh
  tests/qa/sprint1/features/f11-clerk-webhook/f11-clerk-webhook.sh
  tests/qa/sprint1/features/f12-rls-policies/f12-rls-policies.sh
)

for SCRIPT in "${FEATURES[@]}"; do
  echo ""
  echo "========================================"
  echo "Running $SCRIPT"
  echo "========================================"
  chmod +x "$SCRIPT"
  if bash "$SCRIPT"; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
    FAILED+=("$SCRIPT")
  fi
done

echo ""
echo "========================================"
echo " Sprint 1 QA Summary"
echo " Passed: $PASS   Failed: $FAIL"
if [ ${#FAILED[@]} -gt 0 ]; then
  echo " Failed features:"
  for F in "${FAILED[@]}"; do echo "   $F"; done
fi
echo "========================================"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
