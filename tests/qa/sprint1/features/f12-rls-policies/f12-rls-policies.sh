#!/usr/bin/env bash
# F12 — Row Level Security Policies
set -euo pipefail
[ -f .env.test.local ] && export $(grep -v '^#' .env.test.local | xargs)
echo "[F12] Running RLS policy tests (direct DB — no server needed)..."
TEST_EXIT=0
pnpm exec playwright test \
  tests/qa/sprint1/features/f12-rls-policies/f12-rls-policies.spec.ts \
  --reporter=list || TEST_EXIT=$?
[ "$TEST_EXIT" -eq 0 ] && echo "[F12] PASSED" || echo "[F12] FAILED"
exit "$TEST_EXIT"
