#!/usr/bin/env bash
# Sprint 8 Governance Intelligence — Invariant Checks
# UPGRADED from §12 presence-greps to behavioral/specific guards.
# Re-runnable: bash scripts/qa/sprint8-invariants.sh
#
# Behavioral/set-difference guards are in vitest (s8-walk-regression.test.ts).
# This script catches infra-level issues that a test suite can't (file layout,
# migration structure, serve() registration). For the real invocation/behavior
# guards (viewer-403, recordAction call-site, dedup WHERE), see §2 tests.

PASS=0
FAIL=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS  $label (got $actual, expected $expected)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label (got $actual, expected $expected)"
    FAIL=$((FAIL + 1))
  fi
}

check_gte() {
  local label="$1" min="$2" actual="$3"
  if [ "$actual" -ge "$min" ] 2>/dev/null; then
    echo "  PASS  $label (got $actual, expected >= $min)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label (got $actual, expected >= $min)"
    FAIL=$((FAIL + 1))
  fi
}

gcount() { local r; r=$(grep -c "$@" 2>/dev/null); echo "${r:-0}"; }

echo "=== Sprint 8 Governance Intelligence — Invariant Checks ==="
echo ""

SIDEBAR="components/domain/app-sidebar.tsx"

# ─────────────────────────────────────────────────────────
echo "── Nav-orphan guard (set-difference — catches the NEXT orphan) ──"
NAV_WAIVER="notifications"
ORPHANS=""
for dir in app/\(auth\)/settings/*/; do
  [ ! -d "$dir" ] && continue
  route_name=$(basename "$dir")
  [ "$route_name" = "$NAV_WAIVER" ] && continue
  [ ! -f "${dir}page.tsx" ] && continue
  if ! grep -q "/settings/${route_name}" "$SIDEBAR" 2>/dev/null; then
    ORPHANS="${ORPHANS}/settings/${route_name} "
  fi
done
ORPHANS=$(echo "$ORPHANS" | xargs)
check "nav-orphan: all settings sub-routes in sidebar" "" "$ORPHANS"
echo "  (waiver: /settings/${NAV_WAIVER} — per-user prefs, FINDING reported)"
echo ""

# ─────────────────────────────────────────────────────────
echo "── Governance lib modules exist ──"
check_gte "lib/governance/audit-trail.ts exists" 1 "$(test -f lib/governance/audit-trail.ts && echo 1 || echo 0)"
check_gte "lib/governance/access-control.ts exists" 1 "$(test -f lib/governance/access-control.ts && echo 1 || echo 0)"
check_gte "lib/governance/feature-flags.ts exists" 1 "$(test -f lib/governance/feature-flags.ts && echo 1 || echo 0)"
check_gte "lib/governance/data-residency.ts exists" 1 "$(test -f lib/governance/data-residency.ts && echo 1 || echo 0)"
check_gte "lib/governance/record-data-residency.ts exists" 1 "$(test -f lib/governance/record-data-residency.ts && echo 1 || echo 0)"
echo ""

# ─────────────────────────────────────────────────────────
echo "── assertBrandAccess: ALL brand-data routes (not just >=40) ──"
TOTAL_BRAND_ROUTES=$(find app/api/brands/\[brandId\] -name "route.ts" -type f 2>/dev/null | wc -l | tr -d ' ')
BRAND_WITH_ACCESS=$(grep -rl 'assertBrandAccess(' app/api/brands/\[brandId\]/ 2>/dev/null | wc -l | tr -d ' ')
check "assertBrandAccess: ${BRAND_WITH_ACCESS}/${TOTAL_BRAND_ROUTES} brand routes" "$TOTAL_BRAND_ROUTES" "$BRAND_WITH_ACCESS"
echo ""

# ─────────────────────────────────────────────────────────
echo "── DR-01 residency call sites ──"
check_gte "recordDataResidency in auth/server.ts" 1 "$(gcount 'recordDataResidency' lib/auth/server.ts)"
check_gte "recordDataResidency in audit-data-retention.ts" 1 "$(gcount 'recordDataResidency' inngest/functions/audit-data-retention.ts)"
echo "  (behavioral residency guard: §2 tests 2.7 + 2.8)"
echo ""

# ─────────────────────────────────────────────────────────
echo "── Fanout-webhooks WH-01 triggers ──"
check_gte "EVENT_NAME_MAP entries" 8 "$(gcount -E '^\s+\"' inngest/functions/fanout-webhooks.ts)"
echo "  (behavioral dedup guard: §2 test 2.9 — WHERE on internalEventId)"
echo ""

# ─────────────────────────────────────────────────────────
echo "── Migration idempotency (MI-01 — re-runnable) ──"
for migfile in db/migrations/0021_phase2_sprint8_governance.sql db/migrations/sprint-8-tables.sql; do
  CT_ALL=$(grep -ciE '^\s*CREATE TABLE\b' "$migfile" 2>/dev/null || echo 0)
  CT_SAFE=$(grep -ciE 'CREATE TABLE IF NOT EXISTS' "$migfile" 2>/dev/null || echo 0)
  check "CREATE TABLE IF NOT EXISTS ($migfile)" "$CT_ALL" "$CT_SAFE"
  IX_ALL=$(grep -ciE '^\s*CREATE .*INDEX\b' "$migfile" 2>/dev/null || echo 0)
  IX_SAFE=$(grep -ciE 'CREATE .*INDEX IF NOT EXISTS' "$migfile" 2>/dev/null || echo 0)
  check "CREATE INDEX IF NOT EXISTS ($migfile)" "$IX_ALL" "$IX_SAFE"
  POL_ALL=$(grep -ciE '^\s*CREATE POLICY\b' "$migfile" 2>/dev/null || echo 0)
  DROP_ALL=$(grep -ciE 'DROP POLICY IF EXISTS' "$migfile" 2>/dev/null || echo 0)
  check_gte "DROP POLICY IF EXISTS >= CREATE POLICY ($migfile)" "$POL_ALL" "$DROP_ALL"
done
echo ""

# ─────────────────────────────────────────────────────────
echo "── Inngest serve() registration ──"
SERVE_FILE="app/api/webhooks/inngest/route.ts"
for fn in fanoutWebhooksFn deliverWebhookFn auditDataRetention; do
  check_gte "serve() → $fn registered" 1 "$(gcount "$fn" "$SERVE_FILE")"
done
echo ""

# ─────────────────────────────────────────────────────────
echo "── /api/auth/me contract (F7) ──"
check_gte "/api/auth/me route exists" 1 "$(test -f app/api/auth/me/route.ts && echo 1 || echo 0)"
check_gte "/api/auth/me returns 401" 1 "$(gcount '401' app/api/auth/me/route.ts)"
echo "  (contract shape guard: §3 test 3.3)"
echo ""

# ─────────────────────────────────────────────────────────
echo "── OQ-1: local_seo_results schema should NOT exist ──"
if [ -f db/schema/local-seo-results.ts ]; then
  echo "  FAIL  db/schema/local-seo-results.ts EXISTS (OQ-1 violation)"
  FAIL=$((FAIL + 1))
else
  echo "  PASS  db/schema/local-seo-results.ts absent"
  PASS=$((PASS + 1))
fi
echo ""

echo "═══════════════════════════════════════════════"
echo "  TOTAL: $((PASS + FAIL))  |  PASS: $PASS  |  FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "  STATUS: FAILED"
  exit 1
else
  echo "  STATUS: ALL PASS"
  exit 0
fi
