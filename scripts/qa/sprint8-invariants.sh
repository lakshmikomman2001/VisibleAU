#!/usr/bin/env bash
# §12 Verification Greps — Sprint 8 Governance Intelligence
# Re-runnable: bash scripts/qa/sprint8-invariants.sh

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

echo "=== Sprint 8 Governance Intelligence — §12 Invariant Greps ==="
echo ""

SIDEBAR="components/domain/app-sidebar.tsx"

# ─────────────────────────────────────────────────────────
echo "── Nav-orphan guard: settings routes in sidebar ──"
check_gte "sidebar → /settings/team" 1 "$(gcount '/settings/team' "$SIDEBAR")"
check_gte "sidebar → /settings/audit-trail" 1 "$(gcount '/settings/audit-trail' "$SIDEBAR")"
check_gte "sidebar → /settings/data-residency" 1 "$(gcount '/settings/data-residency' "$SIDEBAR")"
check_gte "sidebar → /settings/webhooks" 1 "$(gcount '/settings/webhooks' "$SIDEBAR")"
check_gte "sidebar → /settings/billing" 1 "$(gcount '/settings/billing' "$SIDEBAR")"
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
echo "── assertBrandAccess wired in brand routes ──"
check_gte "assertBrandAccess imports in brand routes" 40 "$(grep -rl 'assertBrandAccess' app/api/brands/ 2>/dev/null | wc -l | tr -d ' ')"
echo ""

# ─────────────────────────────────────────────────────────
echo "── DR-01 residency call sites ──"
check_gte "recordDataResidency in auth/server.ts" 1 "$(gcount 'recordDataResidency' lib/auth/server.ts)"
check_gte "recordDataResidency in audit-data-retention.ts" 1 "$(gcount 'recordDataResidency' inngest/functions/audit-data-retention.ts)"
echo ""

# ─────────────────────────────────────────────────────────
echo "── Fanout-webhooks WH-01 triggers ──"
check_gte "EVENT_NAME_MAP entries" 8 "$(gcount -E '^\s+\"' inngest/functions/fanout-webhooks.ts)"
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
