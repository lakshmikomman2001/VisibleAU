#!/usr/bin/env bash
# F10 — Stripe Products Setup
set -euo pipefail
[ -f .env.test.local ] && export $(grep -v '^#' .env.test.local | xargs)
echo "[F10] Running Stripe product verification (no dev server needed)..."
TEST_EXIT=0
pnpm exec playwright test \
  tests/qa/sprint1/features/f10-stripe-products/f10-stripe-products.spec.ts \
  --reporter=list || TEST_EXIT=$?
[ "$TEST_EXIT" -eq 0 ] && echo "[F10] PASSED" || echo "[F10] FAILED — run pnpm stripe:setup first"
exit "$TEST_EXIT"
