#!/usr/bin/env bash
# §12 Verification Greps — Sprint 5 Trust Intelligence
# Re-runnable: ./scripts/qa/sprint5-invariants.sh

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

# Safe grep count that never fails on no-match
gcount() { grep -c "$@" 2>/dev/null || echo 0; }
gcount_E() { grep -cE "$@" 2>/dev/null || echo 0; }
gcount_iE() { grep -ciE "$@" 2>/dev/null || echo 0; }
glines() { { grep "$@" 2>/dev/null || true; } | wc -l | tr -d ' '; }
glines_iE() { { grep -iE "$@" 2>/dev/null || true; } | wc -l | tr -d ' '; }
glines_E() { { grep -E "$@" 2>/dev/null || true; } | wc -l | tr -d ' '; }

echo "=== Sprint 5 Trust Intelligence — §12 Invariant Greps ==="
echo ""

# --- Explainability wiring ---
echo "--- ExplainabilityService wiring ---"
for route in trust entity-score linkedin-presence youtube-presence consensus-score; do
  file="app/api/brands/[brandId]/${route}/route.ts"
  c=$(gcount "ExplainabilityService\|annotate(" "$file")
  check "$route route uses ExplainabilityService" 1 "$([ "$c" -ge 1 ] && echo 1 || echo 0)"
done

# --- Migration idempotency ---
echo ""
echo "--- Migration idempotency (MI-01) ---"
c6=$(gcount "CREATE TABLE IF NOT EXISTS" db/migrations/*sprint5_trust.sql)
check_gte "CREATE TABLE IF NOT EXISTS in trust migration" 6 "$c6"

c7=$(gcount "DROP POLICY IF EXISTS" db/migrations/*sprint5_trust.sql)
check_gte "DROP POLICY IF EXISTS in trust migration" 6 "$c7"

c8=$(gcount "ADD COLUMN IF NOT EXISTS" db/migrations/*sprint5_entity_alter.sql)
check_gte "ADD COLUMN IF NOT EXISTS in entity alter migration" 18 "$c8"

# --- D-01: no entity_score or scored_at columns ---
echo ""
echo "--- D-01: score_of_10 is canonical ---"
c9=$(glines_iE "add column[^;]*entity_score|add column[^;]*scored_at" db/migrations/*sprint5_entity_alter.sql)
check "entity_score/scored_at NOT added" 0 "$c9"

# --- CT-04: no risk column on hallucination_incidents ---
echo ""
echo "--- CT-04: hallucination risk is read-time ---"
c10=$(glines_E "^\s*risk[_a-zA-Z]*\s*:" db/schema/hallucination-incidents.ts)
check "no risk column in hallucination-incidents schema" 0 "$c10"

# --- §13 anti-patterns ---
echo ""
echo "--- §13 anti-patterns ---"
c11=$(gcount "uniqueIndex\|unique(" db/schema/citation-source-intelligence.ts)
check_gte "citation_source_intelligence has 2 unique indexes" 2 "$c11"

c12=$(gcount "onConflict" lib/trust/consensus-checker.ts)
check_gte "consensus checker uses onConflict (UPSERT)" 1 "$c12"

# Bug-8 class guard: accent-primary-foreground (the undefined typo) → 0
echo ""
echo "--- Bug-8: no accent-primary-foreground typo ---"
c13=$(glines "accent-primary-foreground" -r app/ components/)
check "accent-primary-foreground occurrences" 0 "$c13"

# --- Score-derived badge (Bug-7 guard) ---
echo ""
echo "--- Bug-7: scoreLevel (not confidence_label) in badge ---"
c14=$(gcount "scoreLevel" components/domain/trust/linkedin-presence-scorecard.tsx)
check_gte "linkedin scorecard uses scoreLevel" 1 "$c14"

c15=$(gcount "scoreLevel" components/domain/trust/youtube-presence-scorecard.tsx)
check_gte "youtube scorecard uses scoreLevel" 1 "$c15"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
