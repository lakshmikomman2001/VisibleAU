#!/usr/bin/env bash
# ============================================================
#  F01 — Health Check Endpoint
#  VisibleAU Sprint 1 QA
#  Launches: Next.js dev server + Playwright test
#  Test data: none (read-only)
# ============================================================
set -euo pipefail

echo "[F01] Loading environment..."
if [ -f .env.test.local ]; then
  export $(grep -v '^#' .env.test.local | xargs)
fi

mkdir -p tests/qa/sprint1/logs

echo "[F01] Starting Next.js dev server..."
pnpm dev > tests/qa/sprint1/logs/f01-server.log 2>&1 &
SERVER_PID=$!

# Wait until server responds
echo "[F01] Waiting for http://localhost:3000 ..."
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
  sleep 2
done
echo "[F01] Server ready (PID $SERVER_PID)."

echo "[F01] Running Playwright tests..."
TEST_EXIT=0
pnpm exec playwright test \
  tests/qa/sprint1/features/f01-health/f01-health.spec.ts \
  --reporter=list || TEST_EXIT=$?

echo "[F01] No test data to clean up (read-only test)."

echo "[F01] Stopping dev server (PID $SERVER_PID)..."
kill "$SERVER_PID" 2>/dev/null || true

[ "$TEST_EXIT" -eq 0 ] && echo "[F01] PASSED" || echo "[F01] FAILED"
exit "$TEST_EXIT"
