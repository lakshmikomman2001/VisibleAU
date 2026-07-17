#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# SECTION 6 — Standalone QA Antipattern Greps
# ═══════════════════════════════════════════════════════════════════
#
# Zero-match assertions: each grep targets a bug-SHAPE that this session
# hit or the LLD documents as forbidden. The script FAILS (non-zero exit)
# if any pattern reappears in production code.
#
# ⚠️ STANDALONE — never folded into Sections 1–5 (the S8 lesson).
#
# Run: bash scripts/qa/section6-antipatterns.sh
# CI:  add as a separate step that must pass before merge.
# ═══════════════════════════════════════════════════════════════════

set -uo pipefail

PASS=0
FAIL=0
REAL_HITS=""

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

# Count matching LINES (not files) — excludes allowlisted paths via grep -v
gcount_excl() {
  local pattern="$1"; shift
  # remaining args are grep path/include flags; pipe through grep -v for allowlist
  local allowlist="$1"; shift
  local r
  r=$(grep -rnE "$pattern" "$@" 2>/dev/null | grep -vcE "$allowlist" 2>/dev/null) || true
  echo "${r:-0}"
}

# Count matching LINES with no allowlist
gcount() {
  local r
  r=$(grep -rnEc "$@" 2>/dev/null) || true
  echo "${r:-0}"
}

echo "═══════════════════════════════════════════════════════"
echo " SECTION 6 — Antipattern Greps (standalone final pass)"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── SET A: This session's recurring runtime bugs ───────

echo "── SET A: Session runtime-bug pattern guards ──"

# A1 — .rows on serviceDb.execute() (array-vs-{rows})
# serviceDb.execute() returns an array; .rows is undefined → silent data loss
A1=$(grep -rnE 'execute\([^)]*\)[^;]*\.rows|as unknown as \{ *rows' \
  lib/ app/ inngest/ --include='*.ts' 2>/dev/null | wc -l)
A1=$(echo "$A1" | tr -d ' ')
check_zero "A1: .rows on execute() (array-vs-{rows} silent data loss)" "$A1"

# A2 — Raw Date as SQL param (driver ERR_INVALID_ARG_TYPE)
# JS Date interpolated into sql`` template → crash. Must use .toISOString()
A2=$(grep -rnE 'sql`[^`]*\$\{[^}]*(new Date\(|Date\.now\(\))[^}]*\}' \
  lib/ app/ inngest/ --include='*.ts' 2>/dev/null | wc -l)
A2=$(echo "$A2" | tr -d ' ')
check_zero "A2: Raw Date in sql\`\` template (driver type crash)" "$A2"

# A3 — organizations.tier read in production code (should be subscriptions.tier)
# Scoped to lib/ and app/ only — seeds, tests, docs legitimately reference it
A3=$(grep -rnE 'organizations\.tier|organization\.tier' \
  lib/ app/ --include='*.ts' 2>/dev/null | wc -l)
A3=$(echo "$A3" | tr -d ' ')
check_zero "A3: organizations.tier in lib/app (must use subscriptions.tier)" "$A3"

# A4 — Anchored LIKE '/p3s1test-%' (silent no-op on full URLs)
# visited_url stores full URLs, so LIKE '/p3s1test-%' matches nothing
A4=$(grep -rnE "LIKE '/p3s1test-%'" \
  lib/ app/ inngest/ scripts/ --include='*.ts' --include='*.sql' 2>/dev/null | wc -l)
A4=$(echo "$A4" | tr -d ' ')
check_zero "A4: Anchored LIKE '/p3s1test-%' (silent cleanup no-op)" "$A4"

# A5 — Array.isArray() on known-wrapped envelope responses
# Check lib/ only (components handle both shapes intentionally)
A5=$(grep -rnE 'Array\.isArray\((response|result|payload|res)\b' \
  lib/ --include='*.ts' 2>/dev/null | wc -l)
A5=$(echo "$A5" | tr -d ' ')
check_zero "A5: Array.isArray on envelope variable in lib/ (unwrap first)" "$A5"

echo ""

# ─── SET B: Event-chain convention (dot external, slash internal) ───

echo "── SET B: Event dot/slash convention ──"

# B1a — Internal events in wrong (dot) form
B1A=$(grep -rnE 'crawler-log\.uploaded|crawler-hits\.ingested' \
  lib/ app/ inngest/ --include='*.ts' 2>/dev/null | wc -l)
B1A=$(echo "$B1A" | tr -d ' ')
check_zero "B1a: Internal event in DOT form (must be slash)" "$B1A"

# B1b — External event in wrong (slash) form
B1B=$(grep -rnE 'crawler/impersonation-detected' \
  lib/ app/ inngest/ --include='*.ts' 2>/dev/null | wc -l)
B1B=$(echo "$B1B" | tr -d ' ')
check_zero "B1b: External event in SLASH form (must be dot)" "$B1B"

echo ""

# ─── SET C: LLD-documented anti-patterns ───────────────

echo "── SET C: LLD anti-patterns ──"

# C1 — Hardcoded model strings outside model-selector.ts / compute-cost.ts / *-impl.ts
# model-selector.ts is the canonical registry; compute-cost.ts holds pricing;
# *-impl.ts files have fallback defaults. Everything else must go through the selector.
C1=$(grep -rnE '"claude-[a-z0-9-]+"|'"'"'claude-[a-z0-9-]+'"'"'|"gpt-4[^"]*"|'"'"'gpt-4[^'"'"']*'"'"'|haiku-2025' \
  lib/ app/ --include='*.ts' 2>/dev/null \
  | grep -v 'model-selector\.ts' \
  | grep -v 'compute-cost\.ts' \
  | grep -v 'openai-impl\.ts' \
  | grep -v 'anthropic-impl\.ts' \
  | grep -v 'mock-impl\.ts' \
  | wc -l)
C1=$(echo "$C1" | tr -d ' ')
check_zero "C1: Hardcoded model string outside selector/impl/cost" "$C1"

# C2 — Hardcoded bot list (AA-03: bots come from ai_bot_registry table)
C2=$(grep -rnE "\[('|\"|)(GPTBot|ClaudeBot|PerplexityBot|Bytespider|Google-Extended)" \
  lib/ app/ --include='*.ts' 2>/dev/null | wc -l)
C2=$(echo "$C2" | tr -d ' ')
check_zero "C2: Hardcoded bot array in lib/app (must use ai_bot_registry)" "$C2"

# C3 — Verification states summed for a HEADLINE (AA-05: headline = verified only)
# The rate denominator (verified+unverified+spoofed) is legitimate for calculating
# the unverified PERCENTAGE — so we exclude crawler-card.tsx which does exactly that.
C3=$(grep -rnE 'verified *\+ *unverified|unverified *\+ *verified|verified *\+ *spoofed' \
  lib/ app/ components/ --include='*.ts' --include='*.tsx' 2>/dev/null \
  | grep -v 'agent-analytics-crawler-card\.tsx' \
  | wc -l)
C3=$(echo "$C3" | tr -d ' ')
check_zero "C3: verified+unverified summing (AA-05 headline violation)" "$C3"

# C4 — Crawler hits + referral hits summed (AA-07: never mix)
C4=$(grep -rnE 'crawlerHits *\+ *referral|referral.*\+ *crawler|visits *\+ *referrals' \
  lib/ app/ --include='*.ts' 2>/dev/null | wc -l)
C4=$(echo "$C4" | tr -d ' ')
check_zero "C4: crawler+referral summing (AA-07 violation)" "$C4"

echo ""

# ─── SET D: Schema/DDL invariants ──────────────────────

echo "── SET D: Schema/DDL invariants ──"

# D1 — source_ip or cidr defined as TEXT in new migrations
# After 0024/0026, source_ip is INET and cidr is CIDR.
# The Drizzle schema uses text() as a workaround (no native inet/cidr type) —
# that's the ORM layer, not the DDL. Guard against NEW migrations that regress.
# Exclude comments (lines starting with --) and the existing fix migrations.
D1=$(grep -rnE '"source_ip"[[:space:]]+TEXT|"cidr"[[:space:]]+TEXT' \
  db/migrations/ --include='*.sql' 2>/dev/null \
  | grep -v '^.*:.*--' \
  | grep -v '0024_' \
  | grep -v '0026_' \
  | wc -l)
D1=$(echo "$D1" | tr -d ' ')
check_zero "D1: source_ip/cidr as TEXT in migrations (must be INET/CIDR)" "$D1"

echo ""

# ─── REAL HITS (live anti-patterns found during audit) ──

echo "── Real Hits (flagged during audit) ──"

# C1-LIVE: Two files hardcode model strings
C1_LIVE=$(grep -rnE '"claude-[a-z0-9-]+"|'"'"'claude-[a-z0-9-]+'"'"'' \
  lib/answer-capsules/generate-capsule.ts lib/brands/classify-brand.ts 2>/dev/null | wc -l)
C1_LIVE=$(echo "$C1_LIVE" | tr -d ' ')
if [ "$C1_LIVE" -gt 0 ]; then
  echo "  NOTE  C1-LIVE: $C1_LIVE hardcoded model strings found:"
  grep -rnE '"claude-[a-z0-9-]+"' \
    lib/answer-capsules/generate-capsule.ts lib/brands/classify-brand.ts 2>/dev/null || true
  echo "         ↳ These should use getModelId() from model-selector.ts"
  REAL_HITS="${REAL_HITS}C1-LIVE "
fi

echo ""

# ─── SUMMARY ───────────────────────────────────────────

echo "═══════════════════════════════════════════════════════"
echo " RESULTS: $PASS passed, $FAIL failed"
if [ -n "$REAL_HITS" ]; then
  echo " REAL HITS (pre-existing anti-patterns): $REAL_HITS"
fi
echo "═══════════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "VERDICT: FAIL — $FAIL antipattern(s) found in production code."
  exit 1
fi

echo ""
echo "VERDICT: PASS — all zero-match assertions hold."
exit 0
