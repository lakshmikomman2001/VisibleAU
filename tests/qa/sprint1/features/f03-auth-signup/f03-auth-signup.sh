#!/usr/bin/env bash
# F03 — Authentication: Sign-up Flow
set -euo pipefail
[ -f .env.test.local ] && export $(grep -v '^#' .env.test.local | xargs)
mkdir -p tests/qa/sprint1/logs

pnpm dev > tests/qa/sprint1/logs/f03-server.log 2>&1 &
SERVER_PID=$!
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done
echo "[F03] Server ready."

TEST_EXIT=0
pnpm exec playwright test \
  tests/qa/sprint1/features/f03-auth-signup/f03-auth-signup.spec.ts \
  --reporter=list || TEST_EXIT=$?

echo "[F03] Cleanup handled by test afterAll (cleanupOrg)."
kill "$SERVER_PID" 2>/dev/null || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F03] PASSED" || echo "[F03] FAILED"
exit "$TEST_EXIT"
