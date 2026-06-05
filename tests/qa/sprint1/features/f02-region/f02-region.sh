#!/usr/bin/env bash
# F02 — Region Detection Middleware
set -euo pipefail
[ -f .env.test.local ] && export $(grep -v '^#' .env.test.local | xargs)
mkdir -p tests/qa/sprint1/logs

pnpm dev > tests/qa/sprint1/logs/f02-server.log 2>&1 &
SERVER_PID=$!
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done
echo "[F02] Server ready."

TEST_EXIT=0
pnpm exec playwright test \
  tests/qa/sprint1/features/f02-region/f02-region.spec.ts \
  --reporter=list || TEST_EXIT=$?

kill "$SERVER_PID" 2>/dev/null || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F02] PASSED" || echo "[F02] FAILED"
exit "$TEST_EXIT"
