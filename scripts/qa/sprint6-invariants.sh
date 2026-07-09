#!/usr/bin/env bash
# §12 Verification Greps — Sprint 6 Retrieval Intelligence
# Re-runnable: bash scripts/qa/sprint6-invariants.sh

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

check_file() {
  local label="$1" path="$2"
  if [ -f "$path" ]; then
    echo "  PASS  $label (exists)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label (missing: $path)"
    FAIL=$((FAIL + 1))
  fi
}

check_no_file() {
  local label="$1" path="$2"
  if [ ! -f "$path" ]; then
    echo "  PASS  $label (correctly absent)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label (should not exist: $path)"
    FAIL=$((FAIL + 1))
  fi
}

check_grep_q() {
  local label="$1" pattern="$2" file="$3"
  if grep -qE "$pattern" "$file" 2>/dev/null; then
    echo "  PASS  $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label (pattern not found in $file)"
    FAIL=$((FAIL + 1))
  fi
}

check_grep_q_not() {
  local label="$1" pattern="$2" file="$3"
  if ! grep -rqE "$pattern" "$file" 2>/dev/null; then
    echo "  PASS  $label (correctly absent)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label (found in $file but should not be)"
    FAIL=$((FAIL + 1))
  fi
}

gcount() { local r; r=$(grep -c "$@" 2>/dev/null); echo "${r:-0}"; }
gcount_E() { local r; r=$(grep -cE "$@" 2>/dev/null); echo "${r:-0}"; }
gcount_iE() { local r; r=$(grep -ciE "$@" 2>/dev/null); echo "${r:-0}"; }
glines() { { grep "$@" 2>/dev/null || true; } | wc -l | tr -d ' '; }
glines_r() { { grep -r "$@" 2>/dev/null || true; } | wc -l | tr -d ' '; }
glines_rE() { { grep -rE "$@" 2>/dev/null || true; } | wc -l | tr -d ' '; }
glines_rnE() { { grep -rnE "$@" 2>/dev/null || true; } | wc -l | tr -d ' '; }

echo "=== Sprint 6 Retrieval Intelligence — §12 Invariant Greps ==="
echo ""

# ─────────────────────────────────────────────────────────
# Migrations / schema
# ─────────────────────────────────────────────────────────
echo "--- Migrations / schema ---"

c1=$(gcount "CREATE TABLE IF NOT EXISTS" db/migrations/*sprint6_retrieval.sql)
check "CREATE TABLE IF NOT EXISTS in retrieval migration" 4 "$c1"

c2=$(gcount "DROP POLICY IF EXISTS" db/migrations/*sprint6_retrieval.sql)
check "DROP POLICY IF EXISTS in retrieval migration" 4 "$c2"

c3=$(gcount "ADD COLUMN IF NOT EXISTS brand_token" db/migrations/*sprint6_brand_token.sql)
check_gte "ADD COLUMN brand_token in brand_token migration" 1 "$c3"

c4=$(gcount_E 'llmstxt_one_current_per_brand|crawler_logs_purpose_idx' db/migrations/*sprint6_retrieval.sql)
check "partial unique indexes" 2 "$c4"

# ─────────────────────────────────────────────────────────
# Write patterns (append-only vs UPSERT)
# ─────────────────────────────────────────────────────────
echo ""
echo "--- Write patterns ---"

c5=$(gcount_iE '\.onConflict\(|insert[^;]*on conflict' db/schema/agent-readiness-scores.ts)
check "agent_readiness APPEND-ONLY (no ON CONFLICT)" 0 "$c5"

c6=$(gcount_iE '\.onConflict\(|insert[^;]*on conflict' inngest/functions/crawler-log-ingest.ts)
check "crawler_visit_logs APPEND-ONLY (no ON CONFLICT)" 0 "$c6"

c7=$(gcount_E '\.onConflictDoUpdate|onConflict.*page|ON CONFLICT.*page_url' inngest/functions/content-structure-audit.ts)
check_gte "content_structure_audits UPSERT" 1 "$c7"

# ─────────────────────────────────────────────────────────
# Score gotchas
# ─────────────────────────────────────────────────────────
echo ""
echo "--- Score gotchas ---"

c8=$(gcount_iE 'score_of_10\s*[:=)]|\.score_of_10\b' lib/retrieval/agent-readiness.ts)
check "entity_clarity NOT score_of_10" 0 "$c8"

c9=$(gcount '"saas"' lib/platform/local-ai-trust-scorer.ts)
check_gte "local_ai_trust NULL for SaaS vertical" 1 "$c9"

c10=$(gcount_E 'bookingAccessible|pricingVisible|serviceArea' inngest/functions/score-agent-readiness.ts)
check_gte "§8.4a task-fit signals in scorer" 1 "$c10"

c11=$(gcount_E 'bookingAccessible|pricingVisible|taskScore' lib/platform/local-ai-trust-scorer.ts)
check "task-fit NOT in /100 trust scorer" 0 "$c11"

c12=$(gcount_E "from.*@/lib/crawler" inngest/functions/score-agent-readiness.ts)
check_gte "scorer uses shared crawler module" 1 "$c12"

# ─────────────────────────────────────────────────────────
# Public Visit API
# ─────────────────────────────────────────────────────────
echo ""
echo "--- Public Visit API ---"

c13=$(gcount '/api/visit' middleware.ts)
check_gte "/api/visit is public in middleware" 1 "$c13"

c14=$(gcount_E 'brand_token|brandToken' app/api/visit/route.ts)
check_gte "brandToken in visit route" 1 "$c14"

c15a=$(gcount 'visit/ingested' app/api/visit/route.ts)
c15b=$(gcount 'visit/ingested' inngest/functions/crawler-log-ingest.ts)
c15=$((c15a + c15b))
check_gte "visit/ingested event across visit + ingest" 2 "$c15"

c16=$(gcount '202' app/api/visit/route.ts)
check_gte "202 status in visit route" 1 "$c16"

# ─────────────────────────────────────────────────────────
# Crawler reuse + Inngest triggers
# ─────────────────────────────────────────────────────────
echo ""
echo "--- Crawler reuse + Inngest triggers ---"

c17=$(gcount_E "from.*@/lib/crawler" inngest/functions/content-structure-audit.ts)
check_gte "content-structure-audit uses shared crawler" 1 "$c17"

c18=$(gcount_E '0 22 \* \* 3' inngest/functions/content-structure-audit.ts)
check_gte "Wednesday 22:00 cron schedule" 1 "$c18"

c19a=$(gcount 'technical-audit/complete' inngest/functions/score-agent-readiness.ts)
c19b=$(gcount 'technical-audit/complete' inngest/functions/audit-entity-home.ts)
c19=$((c19a + c19b))
check_gte "technical-audit/complete triggers scorer + entity-home" 2 "$c19"

c20=$(gcount 'agent/readiness-scored' inngest/functions/score-agent-readiness.ts)
check_gte "agent/readiness-scored emitted" 1 "$c20"

# Assert all 5 S6 functions are registered in serve() (NOT a total count)
echo ""
echo "--- 5 S6 functions registered in serve() ---"
INNGEST_ROUTE="app/api/webhooks/inngest/route.ts"
for fn in crawlerLogIngest contentStructureAudit llmstxtRefresh scoreAgentReadiness auditEntityHome; do
  fc=$(gcount "$fn" "$INNGEST_ROUTE")
  check_gte "$fn registered in serve()" 1 "$fc"
done

# ─────────────────────────────────────────────────────────
# Retention + explainability + RLS
# ─────────────────────────────────────────────────────────
echo ""
echo "--- Retention + explainability + RLS ---"

c21=$(gcount 'crawlerVisitLogs' inngest/functions/audit-data-retention.ts)
check_gte "crawler_visit_logs in retention function" 1 "$c21"

c22=$(gcount_E 'rationale|confidence_label|top_action' lib/platform/explainability.ts)
check_gte "explainability contract" 1 "$c22"

c23=$(gcount_E 'setRlsContext|withRlsContext' 'app/api/brands/[brandId]/agent-readiness/route.ts')
check_gte "RLS context on agent-readiness route" 1 "$c23"

# ─────────────────────────────────────────────────────────
# Hygiene
# ─────────────────────────────────────────────────────────
echo ""
echo "--- Hygiene ---"

c24=$(glines_rnE "'claude-3|'gpt-4|'gemini-" lib/retrieval/)
check "no hardcoded model in lib/retrieval" 0 "$c24"

c25=$(glines_rE 'var\(--[a-z-]+\)[0-9a-fA-F]{2}' components/domain/retrieval/)
check "no hex-alpha on CSS vars" 0 "$c25"

c26=$(glines_rE 'sm:grid-cols|md:|lg:grid-cols' 'app/(auth)/brands/[brandId]/retrieval/')
check_gte "responsive grid in retrieval pages" 1 "$c26"

c27=$(glines_r 'Clerk\|@clerk' lib/retrieval/)
c28=$(glines_r 'Clerk\|@clerk' app/api/brands/)
c29=$((c27 + c28))
check "no Clerk in retrieval + API code" 0 "$c29"

# ─────────────────────────────────────────────────────────
# CDN enhancement (§12)
# ─────────────────────────────────────────────────────────
echo ""
echo "--- CDN enhancement ---"

check_file "cdn-shield-detector in lib/crawler" lib/crawler/cdn-shield-detector.ts
check_no_file "no collision in lib/platform" lib/platform/cdn-shield-detector.ts

check_grep_q "honest-block codes (403/429/503)" '403|429|503' lib/crawler/cdn-shield-detector.ts

CDN_ROUTE='app/api/brands/[brandId]/cdn-shield/route.ts'
check_grep_q "CdnShieldDetector wired in cdn-shield route" 'CdnShieldDetector|analyzeHeaders' "$CDN_ROUTE"
check_grep_q "isBlockedByCDN in cdn-shield route" 'isBlockedByCDN' "$CDN_ROUTE"

check_grep_q_not "no firewall schema drift (ADD COLUMN firewall/cdn)" 'ADD COLUMN.*(firewall|cdn|remediation)' db/

check_grep_q "200 in CDN test" '200' tests/phase2/sprint6/cdn-shield-detector.test.ts
check_grep_q "false (not-blocked) in CDN test" 'false|toBe.*false' tests/phase2/sprint6/cdn-shield-detector.test.ts

# ─────────────────────────────────────────────────────────
# Walk-found grep guards
# ─────────────────────────────────────────────────────────
echo ""
echo "--- Walk-found grep guards ---"

c30=$(glines_rE "color:\s*[\"']white[\"']" app/ components/)
check "no hardcoded color:'white' in app/components" 0 "$c30"

c31=$(glines_r 'accent-primary-foreground' app/ components/)
check "no accent-primary-foreground typo" 0 "$c31"

c32=$(gcount_E 'llms\.txt Depth|llmstxt.*Depth|Depth.*/18' components/domain/retrieval/retrieval-score-summary.tsx)
check "no standalone llms.txt Depth stat in hub summary" 0 "$c32"

# ─────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
