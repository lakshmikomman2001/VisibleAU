#!/usr/bin/env bash
# F06 — Tier-based Brand Limit
set -euo pipefail
[ -f .env.test.local ] && export $(grep -v '^#' .env.test.local | xargs)
mkdir -p tests/qa/sprint1/logs
pnpm dev > tests/qa/sprint1/logs/f06-server.log 2>&1 & SERVER_PID=$!
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done
TEST_EXIT=0
pnpm exec playwright test \
  tests/qa/sprint1/features/f06-brand-limit/f06-brand-limit.spec.ts \
  --reporter=list || TEST_EXIT=$?
kill "$SERVER_PID" 2>/dev/null || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F06] PASSED" || echo "[F06] FAILED"
exit "$TEST_EXIT"
