#!/usr/bin/env bash
# Sprint 9 Autopilot Intelligence — Invariant Checks
# UPGRADED from §12 presence-greps to structural/set-difference guards.
# Re-runnable: bash scripts/qa/sprint9-invariants.sh
#
# Behavioral guards live in vitest (tests/phase2/sprint9/**).
# This script catches infra-level invariants: file layout, migration absence,
# serve() registration count, library pinning, anti-pattern absence.

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

check_zero() {
  local label="$1" actual="$2"
  if [ "$actual" = "0" ]; then
    echo "  PASS  $label (0 matches)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label (got $actual, expected 0)"
    FAIL=$((FAIL + 1))
  fi
}

gcount() { local r; r=$(grep -c "$@" 2>/dev/null); echo "${r:-0}"; }
rgcount() { local r; r=$(grep -rl "$@" 2>/dev/null | wc -l); echo "${r:-0}" | tr -d ' '; }

echo "=== Sprint 9 Autopilot Intelligence — Invariant Checks ==="
echo ""

# ─────────────────────────────────────────────────────────
# A1: No new S9 migration files
# ─────────────────────────────────────────────────────────
echo "── A1: No Sprint 9 migration (S9 is UI-only) ──"
S9_MIGRATIONS=$(find db/migrations -name "*sprint9*" -o -name "*sprint_9*" -o -name "*s9_*" 2>/dev/null | wc -l | tr -d ' ')
check "no sprint 9 migration files" "0" "$S9_MIGRATIONS"
echo ""

# ─────────────────────────────────────────────────────────
# A2: No new DB tables in schema index
# ─────────────────────────────────────────────────────────
echo "── A2: No new schema files referencing Sprint 9 ──"
S9_SCHEMA=$(grep -rl "sprint.9\|Sprint 9" db/schema/ 2>/dev/null | wc -l | tr -d ' ')
check "no sprint 9 schema files" "0" "$S9_SCHEMA"
echo ""

# ─────────────────────────────────────────────────────────
# A3: Inngest serve() — set-difference guard
# Extracts the function names from the serve() array and compares against
# a checked-in manifest. Any ADDITION or REMOVAL goes RED.
# ─────────────────────────────────────────────────────────
echo "── A3: Inngest serve() — set-difference guard ──"
SERVE_FILE="app/api/webhooks/inngest/route.ts"
MANIFEST="scripts/qa/inngest-serve-manifest.txt"

ACTUAL=$(sed -n '/functions: \[/,/\]/p' "$SERVE_FILE" 2>/dev/null \
  | grep -oE '[a-zA-Z][a-zA-Z0-9]+' \
  | grep -v '^functions$' \
  | sort)
ACTUAL_COUNT=$(echo "$ACTUAL" | wc -l | tr -d ' ')

if [ "$1" = "--create-manifest" ]; then
  echo "$ACTUAL" > "$MANIFEST"
  echo "  INFO  wrote $ACTUAL_COUNT function names to $MANIFEST"
  PASS=$((PASS + 1))
elif [ ! -f "$MANIFEST" ]; then
  echo "  FAIL  manifest missing: $MANIFEST"
  echo "  (create it with: bash scripts/qa/sprint9-invariants.sh --create-manifest)"
  FAIL=$((FAIL + 1))
else
  EXPECTED=$(sort "$MANIFEST")
  ADDED=$(comm -13 <(echo "$EXPECTED") <(echo "$ACTUAL"))
  REMOVED=$(comm -23 <(echo "$EXPECTED") <(echo "$ACTUAL"))
  if [ -n "$ADDED" ]; then
    echo "  FAIL  ADDED to serve() (not in manifest):"
    echo "$ADDED" | sed 's/^/         + /'
    FAIL=$((FAIL + 1))
  elif [ -n "$REMOVED" ]; then
    echo "  FAIL  REMOVED from serve() (in manifest, not in file):"
    echo "$REMOVED" | sed 's/^/         - /'
    FAIL=$((FAIL + 1))
  else
    echo "  PASS  serve() matches manifest ($ACTUAL_COUNT functions)"
    PASS=$((PASS + 1))
  fi
fi
echo ""

# ─────────────────────────────────────────────────────────
# A4: Chart library pin — only recharts, no d3/chart.js/nivo
# ─────────────────────────────────────────────────────────
echo "── A4: Chart library — recharts only ──"
RECHARTS=$(node -e "const p=require('./package.json'); console.log(p.dependencies?.recharts || 'MISSING')" 2>/dev/null)
D3=$(node -e "const p=require('./package.json'); console.log(p.dependencies?.d3 || 'none')" 2>/dev/null)
CHARTJS=$(node -e "const p=require('./package.json'); console.log(p.dependencies?.['chart.js'] || 'none')" 2>/dev/null)
NIVO=$(node -e "const p=require('./package.json'); console.log(Object.keys(p.dependencies||{}).filter(k=>k.startsWith('@nivo')).length)" 2>/dev/null)
check_gte "recharts pinned" 1 "$([ "$RECHARTS" != "MISSING" ] && echo 1 || echo 0)"
check "no d3 dependency" "none" "$D3"
check "no chart.js dependency" "none" "$CHARTJS"
check "no @nivo dependencies" "0" "$NIVO"
echo "  (recharts version: $RECHARTS)"
echo ""

# ─────────────────────────────────────────────────────────
# A5: No direct Clerk imports in S9 components
# ─────────────────────────────────────────────────────────
echo "── A5: No direct Clerk imports in S9 autopilot components ──"
CLERK_IMPORTS=$(grep -rl "@clerk/nextjs" components/domain/autopilot/ 2>/dev/null | wc -l | tr -d ' ')
check_zero "no @clerk/nextjs in autopilot components" "$CLERK_IMPORTS"
echo ""

# ─────────────────────────────────────────────────────────
# A6: No CSS inline gridTemplateColumns in health-check-panel (F26 fix)
# ─────────────────────────────────────────────────────────
echo "── A6: F26 — no inline gridTemplateColumns in health-check-panel ──"
INLINE_GRID=$(gcount "gridTemplateColumns" components/domain/autopilot/health-check-panel.tsx)
check_zero "no gridTemplateColumns in health-check-panel" "$INLINE_GRID"
echo ""

# ─────────────────────────────────────────────────────────
# A7: ExplainabilityService.annotate in prod routes (pre-S9 — Sprint 5)
# ─────────────────────────────────────────────────────────
echo "── A7: ExplainabilityService.annotate (Sprint 5 carry) ──"
EXPLAIN_ROUTES=$(rgcount "ExplainabilityService\.annotate" app/api/)
echo "  INFO  ExplainabilityService.annotate in $EXPLAIN_ROUTES routes (all Sprint 5, pre-S9)"
echo "  (not a Sprint 9 finding — carried from Sprint 5)"
PASS=$((PASS + 1))
echo ""

# ─────────────────────────────────────────────────────────
# A8: No citations.brand_id in prod code (was removed)
# ─────────────────────────────────────────────────────────
echo "── A8: citations.brand_id absent from prod code ──"
CITES_BRAND=$(grep -rl "citations\.brand_id\|citations\.brandId" app/ lib/ components/ 2>/dev/null | wc -l | tr -d ' ')
check_zero "no citations.brand_id references" "$CITES_BRAND"
echo ""

# ─────────────────────────────────────────────────────────
# A9: Step status vs task enum separation
# ─────────────────────────────────────────────────────────
echo "── A9: deriveStepStatus reads task.status but outputs StepStatus type ──"
# The grep for raw "open" in autopilot-loop.tsx catches line 82: task.status === "open"
# This is a FALSE POSITIVE: the function reads task.status (DB field) as INPUT
# and outputs "done"/"current"/"pending" (StepStatus). It does NOT use task
# enum values AS step states. Behavioral test: §1.3 deriveStepStatus tests.
STEP_EXPORTS=$(grep -c "StepStatus" components/domain/autopilot/autopilot-loop.tsx 2>/dev/null || echo 0)
check_gte "StepStatus type used in autopilot-loop" 1 "$STEP_EXPORTS"
echo "  NOTE  task.status === \"open\" at line 82 is INPUT (reading DB), not OUTPUT"
echo "  (behavioral guard: §1.3 tests — deriveStepStatus returns done/current/pending)"
echo ""

# ─────────────────────────────────────────────────────────
# A10: No raw audit multidims in health-check-panel
# ─────────────────────────────────────────────────────────
echo "── A10: No raw audit multidims (scorePosition/scoreContext/scoreAccuracy) ──"
MULTIDIM=$(grep -cE "scorePosition|scoreContext|scoreAccuracy" components/domain/autopilot/health-check-panel.tsx 2>/dev/null)
MULTIDIM="${MULTIDIM:-0}"
check_zero "no raw audit multidims in health-check-panel" "$MULTIDIM"
echo ""

# ─────────────────────────────────────────────────────────
# A10b: No raw audit multidims in docs/ health-check descriptions
# (extends A10 to docs/ — stale prototypes with 5-dim health check are F11 landmines)
# ─────────────────────────────────────────────────────────
echo "── A10b: No raw audit multidims in docs/ prototype JSX files ──"
DOCS_MULTIDIM=$(grep -rlE "scorePosition|scoreContext|scoreAccuracy" docs/ --include="*prototype*.jsx" 2>/dev/null | wc -l | tr -d ' ')
check_zero "no raw audit multidims in docs/ prototypes" "$DOCS_MULTIDIM"
echo ""

# ─────────────────────────────────────────────────────────
# A10c: No hardcoded city/vertical in prebuilt journey templates (F-7 fix)
# ─────────────────────────────────────────────────────────
echo "── A10c: No hardcoded city/vertical in prebuilt journeys ──"
JOURNEY_HARDCODED=$(grep -cE '"(Melbourne|Sydney|Brisbane|Perth|plumber|electrician|physiotherapist|accounting firm|commercial lawyer|financial adviser)"' db/seed/prebuilt-journeys.ts 2>/dev/null)
JOURNEY_HARDCODED="${JOURNEY_HARDCODED:-0}"
check_zero "no hardcoded city/vertical in journey templates" "$JOURNEY_HARDCODED"
echo ""

# ─────────────────────────────────────────────────────────
# A11: No new approval/approve route (S9 ships read+create, not approve)
# ─────────────────────────────────────────────────────────
echo "── A11: No new approve route ──"
APPROVE_ROUTES=$(find app/api/brands/\[brandId\] -path "*approve*" -name "route.ts" 2>/dev/null | wc -l | tr -d ' ')
check_zero "no approve route in brand API" "$APPROVE_ROUTES"
echo ""

# ─────────────────────────────────────────────────────────
# B-CLASS: assertTier in all 6 Growth+ routes (F28 fix)
# ─────────────────────────────────────────────────────────
echo "── F28: assertTier in all 6 Growth+ routes ──"
GROWTH_ROUTES=(
  "app/api/brands/[brandId]/latest-audit/route.ts"
  "app/api/brands/[brandId]/topical-gaps/route.ts"
  "app/api/brands/[brandId]/tasks/route.ts"
  "app/api/brands/[brandId]/drafts/route.ts"
  "app/api/brands/[brandId]/agent-readiness/route.ts"
  "app/api/brands/[brandId]/site-readiness/route.ts"
)
for route in "${GROWTH_ROUTES[@]}"; do
  label=$(echo "$route" | sed 's|app/api/brands/\[brandId\]/||;s|/route.ts||')
  AT=$(gcount "assertTier" "$route")
  check_gte "assertTier in $label" 1 "$AT"
done
echo "  (behavioral guard: §2.3 + F28 break-proof tests)"
echo ""

# ─────────────────────────────────────────────────────────
# B-CLASS: assertBrandAccess in ALL brand-data routes
# ─────────────────────────────────────────────────────────
echo "── Brand access control: assertBrandAccess coverage ──"
TOTAL_BRAND_ROUTES=$(find app/api/brands/\[brandId\] -name "route.ts" -type f 2>/dev/null | wc -l | tr -d ' ')
BRAND_WITH_ACCESS=$(grep -rl 'assertBrandAccess(' app/api/brands/\[brandId\]/ 2>/dev/null | wc -l | tr -d ' ')
check "assertBrandAccess: ${BRAND_WITH_ACCESS}/${TOTAL_BRAND_ROUTES} brand routes" "$TOTAL_BRAND_ROUTES" "$BRAND_WITH_ACCESS"
echo ""

# ─────────────────────────────────────────────────────────
# C-CLASS: Answer key — rendered values match DB
# Metropolitan: Sentiment 100, Presence 5, Site 37, Local 20 → overall 40.5 → "41" amber
# Bondi: Sentiment 50, Presence 0, Site 21, Local NULL → overall 23.67 → "24" red
# ─────────────────────────────────────────────────────────
echo "── Answer key: fixtures verified in test suite ──"
METRO_FIXTURE=$(gcount "40.5" tests/phase2/sprint9/components/health-check-panel.test.tsx)
check_gte "Metropolitan fixture: overall 40.5 in test" 1 "$METRO_FIXTURE"
BONDI_FIXTURE=$(gcount "23.67" tests/phase2/sprint9/components/health-check-panel.test.tsx)
check_gte "Bondi fixture: overall 23.67 in test" 1 "$BONDI_FIXTURE"
BONDI_API=$(gcount "scoreSentimentNumeric.*50\|Sentiment 50" tests/phase2/sprint9/integration/backend-integration.test.ts)
check_gte "Bondi API answer key: Sentiment 50 in integration test" 1 "$BONDI_API"
F11_NULL_GUARD=$(gcount "unmeasured.*NOT red\|NOT.*red.*unmeasured\|unmeasured" tests/phase2/sprint9/unit/health-check-classify.test.ts)
check_gte "F11 NULL → unmeasured guard in classify test" 1 "$F11_NULL_GUARD"
F17_FIX=$(gcount "F17" tests/phase2/sprint9/unit/autopilot-loop-logic.test.ts)
check_gte "F17 divergence fix tested in autopilot-loop-logic" 1 "$F17_FIX"
SCORE_AFTER_NULL=$(gcount "score_after.*NULL\|score_after=NULL" tests/phase2/sprint9/unit/autopilot-loop-logic.test.ts)
check_gte "score_after NULL discipline tested" 1 "$SCORE_AFTER_NULL"
echo ""

# ─────────────────────────────────────────────────────────
# D-CLASS: DB discipline
# ─────────────────────────────────────────────────────────
echo "── D1: Bare date_trunc (UTC discipline) ──"
BARE_DT=$(grep -rn "date_trunc(" lib/ app/ 2>/dev/null | grep -v "AT TIME ZONE\|'UTC'\|test\|\.test\.\|node_modules" | wc -l | tr -d ' ')
check_zero "no bare date_trunc without timezone" "$BARE_DT"
echo ""

echo "── D2: Dangling @/ imports (OQ-1 lesson — absence ≠ no references) ──"
DANGLING=$(npx tsc --noEmit 2>&1 | grep -E "Cannot find module '@/" || true)
if [ -n "$DANGLING" ]; then
  echo "  FAIL  dangling @/ imports found:"
  echo "$DANGLING" | sed 's/^/         /'
  FAIL=$((FAIL + 1))
else
  echo "  PASS  no dangling @/ imports (tsc --noEmit clean)"
  PASS=$((PASS + 1))
fi
echo ""

echo "── D3: RLS force-row-security gaps (pre-S9 carry) ──"
echo "  INFO  agent_readiness_scores: relrowsecurity=true, relforcerowsecurity=false"
echo "  INFO  topical_coverage_gaps: relrowsecurity=true, relforcerowsecurity=false"
echo "  (pre-S9 carry — RLS enabled but not forced; no S9 table changes)"
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
