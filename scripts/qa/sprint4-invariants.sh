#!/usr/bin/env bash
# Sprint 4 Communication Layer — §12 invariant verification greps
# Usage: bash scripts/qa/sprint4-invariants.sh
# Exit: 0 if all pass, 1 if any fail

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

PASS=0
FAIL=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" -ge "$expected" ] 2>/dev/null; then
    printf "  ✓  %-60s expected ≥%-3s actual %s\n" "$label" "$expected" "$actual"
    PASS=$((PASS + 1))
  else
    printf "  ✗  %-60s expected ≥%-3s actual %s\n" "$label" "$expected" "$actual"
    FAIL=$((FAIL + 1))
  fi
}

check_zero() {
  local label="$1" actual="$2"
  if [ "$actual" -eq 0 ] 2>/dev/null; then
    printf "  ✓  %-60s expected 0   actual %s\n" "$label" "$actual"
    PASS=$((PASS + 1))
  else
    printf "  ✗  %-60s expected 0   actual %s\n" "$label" "$actual"
    FAIL=$((FAIL + 1))
  fi
}

echo "═══════════════════════════════════════════════════════════"
echo " Sprint 4 §12 Invariant Verification"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Schema / migration
check "CREATE TABLE IF NOT EXISTS (migration)" 3 \
  "$(grep -c 'CREATE TABLE IF NOT EXISTS' db/migrations/*sprint4*.sql 2>/dev/null; true)"
check "DROP POLICY IF EXISTS (migration)" 3 \
  "$(grep -c 'DROP POLICY IF EXISTS' db/migrations/*sprint4*.sql 2>/dev/null; true)"

# CM-01: no status column
check_zero "status col in generated-reports schema" \
  "$(grep -ic 'status' db/schema/generated-reports.ts 2>/dev/null; true)"

# U-13: append-only (no onConflict)
check_zero "onConflict in generated-reports schema" \
  "$(grep -icE 'on conflict|onConflict' db/schema/generated-reports.ts 2>/dev/null; true)"

# TS-01: ReportSection typed
check "ReportSection in types.ts" 1 \
  "$(grep -c 'ReportSection' lib/communication/types.ts 2>/dev/null; true)"
check "evidence_snapshots in types.ts" 1 \
  "$(grep -c 'evidence_snapshots' lib/communication/types.ts 2>/dev/null; true)"

# Model routing (selectModel present, no hardcoded models)
check "selectModel in narrative-generator" 1 \
  "$(grep -c 'selectModel(' lib/communication/narrative-generator.ts 2>/dev/null; true)"
check_zero "hardcoded model strings in lib/communication/" \
  "$(grep -rnE "'claude-3|'gpt-4|'gemini-" lib/communication/ 2>/dev/null | wc -l)"

# Event chain
check "trend/aggregated trigger" 1 \
  "$(grep -c 'trend/aggregated' inngest/functions/generate-narrative-report.ts 2>/dev/null; true)"
check "report/generated emit" 1 \
  "$(grep -c 'report/generated' inngest/functions/generate-narrative-report.ts 2>/dev/null; true)"

# Resend singleton (imported, not new-ed)
check "resend import in send-scheduled-reports" 1 \
  "$(grep -c '@/lib/email/client' inngest/functions/send-scheduled-reports.ts 2>/dev/null; true)"
check "resend import in alert-composer" 1 \
  "$(grep -c '@/lib/email/client' lib/communication/alert-composer.ts 2>/dev/null; true)"
check_zero "new Resend() in lib/communication/" \
  "$(grep -rnE 'new Resend\(' lib/communication/ 2>/dev/null | wc -l)"
check_zero "new Resend() in send-scheduled-reports" \
  "$(grep -cE 'new Resend\(' inngest/functions/send-scheduled-reports.ts 2>/dev/null; true)"

# PDF theme imported
check "PDF theme import in pdf-builder" 1 \
  "$(grep -cE '@/lib/pdf/theme' lib/communication/pdf-builder.tsx 2>/dev/null; true)"

# EM-01 dedup guard
check "reportDeliverySchedules in digest" 1 \
  "$(grep -c 'reportDeliverySchedules' inngest/functions/weekly-digest-cron.ts 2>/dev/null; true)"

# Schedule mutual-exclusivity refine
check "Zod refine day_of_week/day_of_month" 2 \
  "$(grep -c 'refine' app/api/organizations/*/delivery-schedules/route.ts 2>/dev/null; true)"

# Functions registered in serve()
check "S4 functions in serve()" 3 \
  "$(grep -cE 'generateNarrativeReport|sendScheduledReports|renderReportPdf' app/api/webhooks/inngest/route.ts 2>/dev/null; true)"

# UI: no hex-alpha on var()
check_zero "hex-alpha on var() in communication components" \
  "$(grep -rnE 'var\(--[a-z-]+\)[0-9a-fA-F]{2}' components/domain/communication/ 2>/dev/null | wc -l)"

# Responsive
check "responsive classes in reports UI" 1 \
  "$(grep -rnE 'md:|sm:' app/\(auth\)/brands/\[brandId\]/reports/ 2>/dev/null | wc -l)"

# Tier source: no org.tier in lib, no Clerk in S4 code
check_zero "org.tier in lib/communication/ (should use subscriptions)" \
  "$(grep -rnE 'organizations\.tier|org\.tier' lib/communication/ 2>/dev/null | grep -iv subscriptions | wc -l)"
check_zero "Clerk refs in lib/communication/" \
  "$(grep -rnE 'Clerk|@clerk' lib/communication/ 2>/dev/null | wc -l)"
check_zero "Clerk refs in db/" \
  "$(grep -rnE 'Clerk|@clerk' db/ 2>/dev/null | wc -l)"

# Anti-pattern #10: S5/S6 tables not referenced
check_zero "S5/S6 table refs in lib/communication/" \
  "$(grep -rnE 'linkedin_presence_audits|brand_consensus_checks|content_structure_audits|youtube_presence_audits' lib/communication/ 2>/dev/null | wc -l)"
check_zero "S5/S6 table refs in generate-narrative-report" \
  "$(grep -rnE 'linkedin_presence_audits|brand_consensus_checks|content_structure_audits|youtube_presence_audits' inngest/functions/generate-narrative-report.ts 2>/dev/null | wc -l)"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════════════════"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
