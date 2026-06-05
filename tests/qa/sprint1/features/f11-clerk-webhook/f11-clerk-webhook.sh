#!/usr/bin/env bash
# F11 — Clerk Webhook Handler
set -euo pipefail
[ -f .env.test.local ] && export $(grep -v '^#' .env.test.local | xargs)
mkdir -p tests/qa/sprint1/logs
pnpm dev > tests/qa/sprint1/logs/f11-server.log 2>&1 & SERVER_PID=$!
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do sleep 2; done
TEST_EXIT=0
pnpm exec playwright test \
  tests/qa/sprint1/features/f11-clerk-webhook/f11-clerk-webhook.spec.ts \
  --reporter=list || TEST_EXIT=$?
kill "$SERVER_PID" 2>/dev/null || true
[ "$TEST_EXIT" -eq 0 ] && echo "[F11] PASSED" || echo "[F11] FAILED"
exit "$TEST_EXIT"
