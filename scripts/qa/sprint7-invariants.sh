#!/usr/bin/env bash
# §12 Verification Greps — Sprint 7 Conversational Discovery Intelligence
# Re-runnable: bash scripts/qa/sprint7-invariants.sh

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
gcount_E() { local r; r=$(grep -cE "$@" 2>/dev/null); echo "${r:-0}"; }
gcount_rE() { local r; r=$(grep -rcE "$@" 2>/dev/null | awk -F: '{s+=$NF}END{print s+0}'); echo "${r:-0}"; }
glines_r() { { grep -r "$@" 2>/dev/null || true; } | wc -l | tr -d ' '; }
glines_rE() { { grep -rE "$@" 2>/dev/null || true; } | wc -l | tr -d ' '; }
glines_rnE() { { grep -rnE "$@" 2>/dev/null || true; } | wc -l | tr -d ' '; }

echo "=== Sprint 7 Conversational Discovery Intelligence — §12 Invariant Greps ==="
echo ""

# ─────────────────────────────────────────────────────────
# Migrations / schema
# ─────────────────────────────────────────────────────────
echo "--- Migrations / schema ---"

c1=$(gcount "CREATE TABLE IF NOT EXISTS" db/migrations/*sprint7_discovery.sql)
check "CREATE TABLE IF NOT EXISTS in discovery migration" 3 "$c1"

c2=$(gcount "DROP POLICY IF EXISTS" db/migrations/*sprint7_discovery.sql)
check "DROP POLICY IF EXISTS in discovery migration" 3 "$c2"

c3=$(gcount_E "professional_services|real_estate" db/migrations/*sprint7_discovery.sql)
check_gte "vertical CHECK includes all AU verticals" 1 "$c3"

c4=$(grep -E "journey_id|audit_id" db/migrations/*sprint7_discovery.sql 2>/dev/null | grep -c "ON DELETE CASCADE")
check_gte "CASCADE rules on journey_id + audit_id" 2 "$c4"

# ─────────────────────────────────────────────────────────
# Lib modules
# ─────────────────────────────────────────────────────────
echo ""
echo "--- Lib modules ---"

c5=$(gcount "JourneyTurn" lib/conversational/types.ts)
check_gte "JourneyTurn typed in types.ts" 1 "$c5"

c6=$(gcount_E "earlyMention|firstMention" lib/conversational/journey-scorer.ts)
check_gte "early mention / first_mention in scorer" 1 "$c6"

c73=$(gcount_E '\.min\(2\)' lib/conversational/types.ts)
check_gte "Zod .min(2) validation on prompt sequence" 1 "$c73"

# ─────────────────────────────────────────────────────────
# Dual-emit obligation (Obligation 1)
# ─────────────────────────────────────────────────────────
echo ""
echo "--- Dual-emit obligation ---"

c7=$(gcount '"technical-audit\.complete"' inngest/functions/technical-audit-run.ts)
check_gte "dot-form emit (webhook)" 1 "$c7"

c8=$(gcount '"technical-audit/complete"' inngest/functions/technical-audit-run.ts)
check_gte "slash-form emit (internal chaining)" 1 "$c8"

c9=$(gcount '"technical-audit.complete"' lib/webhooks/events.ts)
check_gte "dot-form in VALID_EVENTS" 1 "$c9"

# ─────────────────────────────────────────────────────────
# Inngest functions
# ─────────────────────────────────────────────────────────
echo ""
echo "--- Inngest functions ---"

c10=$(gcount '"audit.complete"' inngest/functions/run-comparison-prompts.ts)
check_gte "run-comparison-prompts triggers on audit.complete" 1 "$c10"

c11=$(gcount "competitors" inngest/functions/run-comparison-prompts.ts)
check_gte "comparison reads competitors" 1 "$c11"

c12=$(gcount "step.run(" inngest/functions/run-journey.ts)
check_gte "step.run in run-journey" 1 "$c12"

c13=$(gcount "persist-" inngest/functions/run-journey.ts)
check_gte "persist- step naming in run-journey" 1 "$c13"

c14a=$(gcount '"journey/run-requested"' inngest/functions/run-journey.ts)
c14b=$(gcount '"journey/run-requested"' 'app/api/brands/[brandId]/journeys/[journeyId]/run/route.ts')
c14=$((c14a + c14b))
check_gte "journey/run-requested in producer + consumer" 2 "$c14"

c15a=$(gcount_E 'concurrency.*limit.*3' inngest/functions/run-journey.ts)
c15b=$(gcount_E 'concurrency.*limit.*3' inngest/functions/run-comparison-prompts.ts)
c15=$((c15a + c15b))
check_gte "concurrency limit 3 on both functions" 2 "$c15"

c16a=$(gcount "isEngineEnabled" inngest/functions/run-journey.ts)
c16b=$(gcount "isEngineEnabled" inngest/functions/run-comparison-prompts.ts)
c16=$((c16a + c16b))
check_gte "isEngineEnabled in both functions" 2 "$c16"

c17a=$(gcount "ENGINE_TO_PROVIDER" inngest/functions/run-journey.ts)
c17b=$(gcount "ENGINE_TO_PROVIDER" inngest/functions/run-comparison-prompts.ts)
c17=$((c17a + c17b))
check_gte "ENGINE_TO_PROVIDER in both functions" 1 "$c17"

# ─────────────────────────────────────────────────────────
# No second crawler (Obligation 2)
# ─────────────────────────────────────────────────────────
echo ""
echo "--- No second crawler ---"

c18=$(glines_rE "new (PlaywrightCrawler|chromium)" lib/conversational/ inngest/functions/run-journey.ts)
check "no second crawler in conversational/run-journey" 0 "$c18"

# ─────────────────────────────────────────────────────────
# Tier gates
# ─────────────────────────────────────────────────────────
echo ""
echo "--- Tier gates ---"

c19=$(gcount "AGENCY_PLUS" 'app/api/brands/[brandId]/journeys/route.ts')
check_gte "journeys API Agency+ gated" 1 "$c19"

c20=$(gcount "GROWTH_PLUS" 'app/api/brands/[brandId]/comparisons/route.ts')
check_gte "comparisons API Growth+ gated" 1 "$c20"

# ─────────────────────────────────────────────────────────
# Hygiene
# ─────────────────────────────────────────────────────────
echo ""
echo "--- Hygiene ---"

c21=$(glines_rnE "'claude-3|'gpt-4|'gemini-" lib/conversational/)
check "no hardcoded model in lib/conversational" 0 "$c21"

c22=$(glines_r "LLMService" lib/conversational/)
check_gte "LLMService used in lib/conversational" 1 "$c22"

c23=$(gcount_E "withRlsContext" 'app/api/brands/[brandId]/journeys/route.ts')
check_gte "withRlsContext on journeys route" 1 "$c23"

c24=$(gcount_E "runJourney|runComparisonPrompts" app/api/webhooks/inngest/route.ts)
check_gte "S7 functions registered in serve()" 2 "$c24"

c25=$(glines_rE 'var\(--[a-z-]+\)[0-9a-fA-F]{2}' components/domain/discovery/)
check "no hex-alpha on CSS vars" 0 "$c25"

c26=$(glines_rE 'sm:grid-cols|md:|lg:grid-cols' 'app/(auth)/brands/[brandId]/discovery/')
check_gte "responsive grid in discovery pages" 1 "$c26"

c27=$(glines_r 'Clerk\|@clerk' lib/conversational/)
c28=$(glines_r 'Clerk\|@clerk' app/api/brands/)
c29=$((c27 + c28))
check "no Clerk in conversational + API code" 0 "$c29"

# ─────────────────────────────────────────────────────────
# S3 benchmark wiring (CPR-01 resolved)
# ─────────────────────────────────────────────────────────
echo ""
echo "--- S3 benchmark wiring ---"

c30=$(gcount "comparisonPromptResults" 'app/api/brands/[brandId]/competitive-benchmark/route.ts')
check_gte "competitive-benchmark queries comparison_prompt_results" 1 "$c30"

c31=$(gcount "CPR-01" 'app/api/brands/[brandId]/competitive-benchmark/route.ts')
check "CPR-01 stub removed" 0 "$c31"

c62=$(gcount "latestAudit" 'app/api/brands/[brandId]/competitive-benchmark/route.ts')
check_gte "benchmark scoped to latest audit_id (LLD 280-282)" 1 "$c62"

c63=$(gcount 'data={null}' 'app/(auth)/brands/[brandId]/visibility/page.tsx')
check "visibility page no longer passes data={null} to benchmark" 0 "$c63"

c64=$(gcount "competitive-benchmark" 'app/(auth)/brands/[brandId]/visibility/page.tsx')
check_gte "visibility page fetches competitive-benchmark route" 1 "$c64"

c65=$(gcount "competitors.map" components/domain/visibility/competitive-benchmark-panel.tsx)
check_gte "benchmark panel renders per-competitor cards" 1 "$c65"

c66=$(gcount "dataAvailableFrom" components/domain/visibility/competitive-benchmark-panel.tsx)
check "no stale dataAvailableFrom in benchmark panel" 0 "$c66"

c67=$(gcount "brand.competitors" 'app/api/brands/[brandId]/competitive-benchmark/route.ts')
check_gte "benchmark reads brands.competitors (configured set, not SOV)" 1 "$c67"

c68=$(gcount "configuredCompetitors" 'app/api/brands/[brandId]/competitive-benchmark/route.ts')
check_gte "route filters by configuredCompetitors" 1 "$c68"

c69=$(gcount "firstCompetitor\|sov\[0\]" 'app/(auth)/brands/[brandId]/visibility/page.tsx')
check "visibility page does NOT use SOV first competitor" 0 "$c69"

c70=$(gcount "competitor query param required" 'app/api/brands/[brandId]/competitive-benchmark/route.ts')
check "route does NOT require single ?competitor= param" 0 "$c70"

# ─────────────────────────────────────────────────────────
# NAV-ORPHAN GUARD — brand page references every layer hub
# (This class shipped 3x: S5 Trust, S6 Retrieval, S7 Discovery)
# ─────────────────────────────────────────────────────────
echo ""
echo "--- Nav-orphan guard (brand-page tile → layer hubs) ---"

BRAND_NAV="components/domain/brand/brand-detail-client.tsx"

c32=$(gcount_E "/discovery|discovery-hub|'discovery'" "$BRAND_NAV")
check_gte "Discovery tile in brand-page nav" 1 "$c32"

c33=$(gcount_E "/retrieval|retrieval-hub|'retrieval'" "$BRAND_NAV")
check_gte "Retrieval tile in brand-page nav" 1 "$c33"

c71=$(gcount_E "/trust|trust-hub|'trust'" "$BRAND_NAV")
check_gte "Trust tile in brand-page nav (backfill S5)" 1 "$c71"

c34=$(gcount_E "subscriptions\.tier|tier\b.*=.*sub" 'app/(auth)/brands/[brandId]/page.tsx')
check_gte "tier from subscriptions (not organizations)" 1 "$c34"

c35=$(gcount "AGENCY_PLUS_TIERS" "$BRAND_NAV")
check_gte "Discovery tile Agency+ gated via AGENCY_PLUS_TIERS" 1 "$c35"

c36=$(gcount "Compass" "$BRAND_NAV")
check_gte "Compass icon imported for Discovery tile" 1 "$c36"

c37=$(gcount "layer-discovery" "$BRAND_NAV")
check_gte "--layer-discovery token used on Discovery tile" 1 "$c37"

# ─────────────────────────────────────────────────────────
# LAYER-COLOR GUARD — --layer-discovery is CYAN, not orange
# (Build shipped orange #f97316 instead of canon cyan #06b6d4)
# ─────────────────────────────────────────────────────────
echo ""
echo "--- Layer-color guard (Discovery = cyan) ---"

DISCOVERY_HUB='app/(auth)/brands/[brandId]/discovery/page.tsx'

c38=$(gcount "layer-discovery" "$DISCOVERY_HUB")
check_gte "Discovery hub uses --layer-discovery token" 1 "$c38"

c39=$(gcount_E '#06b6d4' app/globals.css)
check_gte "--layer-discovery dark = #06b6d4 (cyan)" 1 "$c39"

c40=$(gcount_E '#0e7490' app/globals.css)
check_gte "--layer-discovery light = #0e7490 (cyan)" 1 "$c40"

c41=$(gcount_E '#f97316|#ea580c' app/globals.css)
check "no orange in --layer-discovery (old wrong values)" 0 "$c41"

c42=$(gcount "layer-discovery" 'app/(auth)/brands/[brandId]/discovery/journeys/page.tsx')
check_gte "Journeys sub-screen uses --layer-discovery" 1 "$c42"

c43=$(gcount "layer-discovery" components/domain/discovery/journey-flow-chart.tsx)
check_gte "Journey flow chart uses --layer-discovery" 1 "$c43"

# ─────────────────────────────────────────────────────────
# PREBUILT SEED + EMPTY-STATE COPY GUARD
# (§5.5 mandatory: 3 templates per vertical; §6U.3/§6U.4 canonical copy)
# ─────────────────────────────────────────────────────────
echo ""
echo "--- Prebuilt seed + empty-state copy ---"

JOURNEYS_PAGE='app/(auth)/brands/[brandId]/discovery/journeys/page.tsx'
COMPARISONS_PAGE='app/(auth)/brands/[brandId]/discovery/comparisons/page.tsx'

c44=$(gcount_E "getPrebuiltJourneysForVertical|PREBUILT_JOURNEYS" 'app/api/brands/[brandId]/journeys/route.ts')
check_gte "journeys API surfaces prebuilt templates" 1 "$c44"

c45=$(gcount_E "PREBUILT_JOURNEYS" db/seed/prebuilt-journeys.ts)
check_gte "PREBUILT_JOURNEYS exported from seed" 1 "$c45"

c46=$(gcount "tradies" db/seed/prebuilt-journeys.ts)
check_gte "§5.5: tradies templates in seed (≥3)" 3 "$c46"

c47=$(gcount "allied_health" db/seed/prebuilt-journeys.ts)
check_gte "§5.5: allied_health templates in seed (≥3)" 3 "$c47"

c48=$(gcount "clone" "$JOURNEYS_PAGE")
check_gte "Journeys page has clone action" 1 "$c48"

c49=$(gcount "via the API" "$JOURNEYS_PAGE")
check "no 'via the API' copy (wrong empty state)" 0 "$c49"

c50=$(gcount "clone a pre-built" "$JOURNEYS_PAGE")
check_gte "canonical §6U.3 empty copy present" 1 "$c50"

c51=$(gcount "Add competitors" "$COMPARISONS_PAGE")
check_gte "canonical §6U.4 empty copy present" 1 "$c51"

c52=$(gcount "automatically after" "$COMPARISONS_PAGE")
check "no 'automatically after' copy (wrong empty state)" 0 "$c52"

c53=$(gcount "isTemplate" "$JOURNEYS_PAGE")
check_gte "Journeys page distinguishes templates from owned" 1 "$c53"

# ─────────────────────────────────────────────────────────
# BUG 5 GUARD — score-agent-readiness reads orgId from event (not organizationId)
# (Latent: S6 ran on manual refresh; S7 dual-emit exposed the mismatch)
# ─────────────────────────────────────────────────────────
echo ""
echo "--- Bug 5: score-agent-readiness orgId from event ---"

c54=$(gcount_E "orgId.*organizationId|orgId:\s*organizationId" inngest/functions/score-agent-readiness.ts)
check_gte "score-agent-readiness destructures orgId from event" 1 "$c54"

c55=$(gcount "organizationId," inngest/functions/score-agent-readiness.ts)
check_gte "insert supplies organizationId (non-null)" 1 "$c55"

c56=$(gcount_E "orgId.*string" inngest/functions/score-agent-readiness.ts)
check_gte "event type declares orgId (not organizationId)" 1 "$c56"

c61=$(gcount_E "orgId.*organizationId|orgId:\s*organizationId" inngest/functions/audit-entity-home.ts)
check_gte "audit-entity-home destructures orgId from event" 1 "$c61"

# ─────────────────────────────────────────────────────────
# BUG 6 GUARD — all post-audit functions trigger on audit.complete (DOT)
# (run-audit.ts emits "audit.complete"; slash form "audit/complete" never emitted)
# ─────────────────────────────────────────────────────────
echo ""
echo "--- Bug 6: audit.complete trigger consistency ---"

c57=$(gcount '"audit/complete"' inngest/functions/run-comparison-prompts.ts)
check "no slash-form audit/complete in run-comparison-prompts" 0 "$c57"

c58=$(gcount '"audit/complete"' inngest/functions/detect-hallucinations.ts)
check "no slash-form audit/complete in detect-hallucinations" 0 "$c58"

c59=$(gcount '"audit/complete"' inngest/functions/ga4-push.ts)
check "no slash-form audit/complete in ga4-push" 0 "$c59"

c60=$(gcount '"audit/complete"' inngest/functions/capture-evidence-snapshot.ts)
check "no slash-form audit/complete in capture-evidence-snapshot" 0 "$c60"

c74=$(gcount '"audit.complete"' inngest/functions/detect-hallucinations.ts)
check_gte "detect-hallucinations triggers on audit.complete (DOT)" 1 "$c74"

c75=$(gcount '"audit.complete"' inngest/functions/ga4-push.ts)
check_gte "ga4-push triggers on audit.complete (DOT)" 1 "$c75"

c76=$(gcount '"audit.complete"' inngest/functions/capture-evidence-snapshot.ts)
check_gte "capture-evidence-snapshot triggers on audit.complete (DOT)" 1 "$c76"

# ─────────────────────────────────────────────────────────
# DOT-vs-SLASH CONVENTION GUARD (repo-wide)
# No Inngest function should trigger on "audit/complete" (slash) —
# run-audit.ts only emits "audit.complete" (dot).
# NOTE: technical-audit dual-emit is INTENTIONAL (both dot+slash) — excluded.
# ─────────────────────────────────────────────────────────
echo ""
echo "--- DOT-vs-SLASH convention (audit.complete consumers) ---"

c72=$(grep -rl '"audit/complete"' inngest/functions/*.ts 2>/dev/null | grep -v technical-audit-run | wc -l | tr -d ' ')
check "no fn (except technical-audit-run) listens on audit/complete (slash)" 0 "$c72"

# ─────────────────────────────────────────────────────────
# DOT-vs-SLASH CONVENTION GUARD — Crawler pipeline (AA-21)
# Internal chain events use SLASH: crawler-log/uploaded, crawler-hits/ingested
# External webhook events use DOT: crawler.impersonation-detected
# A mismatch silently severs the chain (the S7 failure mode).
# ─────────────────────────────────────────────────────────
echo ""
echo "--- DOT-vs-SLASH convention (crawler pipeline AA-21) ---"

c80=$(grep -c '"crawler-log/uploaded"' inngest/functions/parse-crawler-log.ts 2>/dev/null | tr -d ' ')
check "parse-crawler-log triggers on crawler-log/uploaded (SLASH, internal)" 1 "$c80"

c81=$(grep -c '"crawler-hits/ingested"' inngest/functions/parse-crawler-log.ts 2>/dev/null | tr -d ' ')
check "parse-crawler-log emits crawler-hits/ingested (SLASH, internal)" 1 "$c81"

c82=$(grep -c '"crawler-hits/ingested"' inngest/functions/verify-crawler-hits.ts 2>/dev/null | tr -d ' ')
check "verify-crawler-hits triggers on crawler-hits/ingested (SLASH, internal)" 1 "$c82"

c83=$(grep -c '"crawler.impersonation-detected"' inngest/functions/verify-crawler-hits.ts 2>/dev/null | tr -d ' ')
check "verify-crawler-hits emits crawler.impersonation-detected (DOT, external)" 1 "$c83"

c84=$(grep -c '"crawler.impersonation-detected"' inngest/functions/fanout-webhooks.ts 2>/dev/null | tr -d ' ')
check_gte "fanout-webhooks triggers on crawler.impersonation-detected (DOT)" 1 "$c84"

c85=$(grep -Frl '"crawler-hits.ingested"' inngest/functions/*.ts 2>/dev/null | wc -l | tr -d ' ')
check "no fn uses crawler-hits.ingested (DOT — must be SLASH)" 0 "$c85"

c86=$(grep -Frl '"crawler/impersonation-detected"' inngest/functions/*.ts 2>/dev/null | wc -l | tr -d ' ')
check "no fn uses crawler/impersonation-detected (SLASH — must be DOT)" 0 "$c86"

# ─────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
