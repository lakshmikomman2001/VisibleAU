# VisibleAU Phase 3 — SPRINT 1 PROMPT: Agent Analytics — Verification + Ingestion
# Version: 1.0 | Built against: Agent Analytics LLD v1.5 + Phase 2 LLD v8.70 (canon) | Sprint: P3-S1 of 2
# Source anchors: AA LLD §2 (data model), §3 (verification), §4 (ingestion), §9 (invariant delta),
#   §10 (events), §11 (security), §12 (sprint split). Canon anchors: crawler_visit_logs DDL (v8.70 ~983),
#   visit_purpose enum (~3012), Visit API SEC-A/SEC-B, RT-01 retention, fanout-webhooks WH-01.
#   NOTE: line numbers are navigational — open the region; the LLD wins.

═══════════════════════════════════════════════════════════════════════════════

## 0. READ FIRST — CONTEXT & CONVENTIONS

### 0.1 What P3-S1 is
Agent Analytics is a **Layer 1 (Retrieval) EXTENSION** — not a new layer. It closes three gaps in the
existing `crawler_visit_logs` table: (1) no bot **verification** (the table trusts the User-Agent
string), (2) no **referral** side (P3-S2), (3) no **ingestion** for clients who can't install the
snippet. **This sprint is the plumbing: the verification engine + the ingestion paths. NO NEW UI** — the
surfaces are P3-S2.

**Ships:** ALTER `crawler_visit_logs` (+5 columns); 3 new tables (`ai_bot_registry`, `ai_bot_ip_ranges`,
`ai_referral_hits` — the last is created now, populated in P3-S2); the 3-path verification engine
(CIDR → FCrDNS → ASN, 3-state verdict); registry seed; the daily IP-range refresh job; log-file upload
ingestion; Cloudflare Logpush collector (if it fits).

### 0.2 Prerequisites & the cross-sprint contracts (required this sprint)
- **The Visit API already exists and is hardened** (`app/api/visit/route.ts` + `crawler-log-ingest.ts`
  snippet): **SEC-A** (validate `new URL(body.url).host === brand.domain` → 422; the brandToken is
  necessarily public) + **SEC-B** (IP throttle *before* any DB work → 429; negative cache for unknown
  tokens; then brand lookup, SEC-A check, per-token limit). ⚠️ **REUSE IT VERBATIM.** Only *extend* it to
  capture `source_ip` + set `ingest_source='visit_api'`. Do not re-derive the hardening.
- **MW-01:** `app/api/visit/route.ts` is PUBLIC and already in the `isPublic` middleware matcher. ⚠️
  **Any NEW collector route (Logpush) MUST also be added to `isPublic` or it 401s silently** — this
  already bit the Visit API once.
- **The classifier exists** (`lib/crawler/visit-classifier.ts`). ⚠️ **EXTEND it, do not replace it** —
  canon's logic (`is_active_agent → 'retrieval'`, etc.) stands; the registry now *supplies* the inputs.
- **RT-01 retention cron** exists (`crawler_visit_logs` = 90 days flat). Extend for the new tables; do
  not add a second cron.
- **fanout-webhooks (WH-01)** exists. The one external event this sprint emits (`crawler.impersonation-
  detected`) must be added to `VALID_EVENTS` + `EVENT_NAME_MAP` (§8).

### 0.3 Verify you are on the right LLD before starting
Open `Agent Analytics LLD v1.5`. Confirm §9 reads **serve() 40→43, tables 71→74** (NOT 25/37 — those are
canon's stale header figures, corrected in v1.4/v1.5). ⚠️ §10's inline "serve()=28" was a v1.4 miss — v1.5 fixes it to 43; trust 43. Confirm §2.2 registry EMITS canon's `crawler_tier` +
`visit_purpose` (never competes). If your copy says v1.3/v1.4 or shows 25/37 baselines or serve()=28 in §10 → get v1.5 first.

### 0.4 SHARED CONVENTIONS (binding; from Phase 2 master plan §7)
- **Tier source-of-truth = `subscriptions.tier`. NEVER `organizations.tier`.**
- **Two DBs:** every migration + seed applies to **BOTH** `visibleau` AND `visibleau_prod`, **verified
  with psql**. ⚠️ **The dev-applied/prod-missing gap has bitten 5+ times — S8's instance took every
  brand route down.** This is the single most dangerous pitfall.
- RLS: direct-`organization_id` (USING + WITH CHECK); cross-org → **404 not 401**; `setRlsContext(db,
  orgId)` before every query; `assertBrandAccess()` on every brand route.
- Events: **dot-form external, slash-form internal** (§8). ⚠️ The S7 dot-vs-slash bug (`audit.complete`
  emitted, `audit/complete` listened → silent no-op, all tests green) — a real ingestion run with a
  **terminal read** is mandatory; greps cannot prove an event chain fires.
- Migrations idempotent: `IF NOT EXISTS` + `DROP POLICY IF EXISTS` guards.
- UI (none this sprint): no hex-alpha on `var()`; responsive; no Clerk (Better Auth).

### 0.5 The structural rules + enums P3-S1 introduces (copy EXACTLY)
- **`verification_status`** ∈ `verified | unverified | spoofed` (+ NULL for pre-verification backfill).
  ⚠️ **NULL is NEVER 'verified'** — display "unknown (pre-verification)", never count in a headline.
- **`verified_via`** ∈ `cidr | fcrdns | asn`.
- **`ingest_source`** ∈ `visit_api | log_upload | cf_logpush` (NOT NULL DEFAULT `visit_api`).
- **`crawler_tier`** (registry EMITS canon's) ∈ `must_allow | emerging | data`.
- **`default_purpose`** (registry EMITS canon's) ∈ `retrieval | indexing | training`.
- **AA-09:** ASN alone NEVER yields `verified` — at most `unverified`. It can only *contradict* → `spoofed`.
- **AA-05 (non-negotiable):** headline metrics count `verified` ONLY. `unverified`/`spoofed` shown
  separately, never merged. Mirrors the existing `score_after` honesty discipline.

### 0.6 OPEN QUESTIONS (resolve with Sri before building the affected part)
- **OQ-A2 — dedup index.** The proposed `crawler_logs_dedup_idx` (§2.1) may collide with the Visit API's
  existing write pattern. ⚠️ **Verify BEFORE applying** — if it collides, dedup in the parser instead.
- **Logpush (P2 path):** ships only if it fits the sprint. The upload path (P1) is mandatory and ships
  first — it's the universal fallback for cPanel/shared-hosting AU SMBs.

---

## 1. WHAT SHIPS THIS SPRINT
1. **ALTER `crawler_visit_logs`** — +5 columns (`source_ip`, `verification_status`, `verified_via`,
   `bytes`, `ingest_source`) + verification index + (conditional) dedup index.
2. **`ai_bot_registry`** (#38 global reference table) — seeded ~20 bots, emits canon's tier/purpose.
3. **`ai_bot_ip_ranges`** (#39) — daily-refreshed CIDR cache, versioned, fail-closed.
4. **`ai_referral_hits`** (#40) — created now (schema + RLS), populated in P3-S2.
5. **Verification engine** — CIDR → FCrDNS → ASN, 3-state verdict, per-`(source_ip,vendor)` 24h cache.
6. **Classifier extension** — registry supplies inputs; verification runs *before* classification.
7. **Ingestion P1 (log upload)** — parse Combined/Common Log Format + CSV, filter to registry UAs,
   discard the rest, dedup, verify.
8. **Ingestion P2 (Logpush collector)** — if it fits; reuses SEC-A/SEC-B; MUST be in `isPublic`.
9. **`refresh-bot-ip-ranges`** daily cron + the RT-01 retention extension.
10. **`crawler.impersonation-detected`** external event wired into fanout-webhooks (WH-01).

**serve() 40 → 43** (+`parse-crawler-log`, +`verify-crawler-hits`, +`refresh-bot-ip-ranges`).
**tables 71 → 74** (+3; `crawler_visit_logs` is ALTERed, not added).

---

## 2. DEPENDENCIES TO INSTALL
- A log-format parser (Combined/Common Log Format) — or a small hand-rolled regex parser (preferred: no
  heavy dep for a well-specified format).
- `.gz` decompression (Node built-in `zlib` — no new dep).
- DNS: Node built-in `dns/promises` for FCrDNS (no dep). CIDR containment: Postgres native `>>=` / `<<=`
  on `INET`/`CIDR` (no app-side dep).

## 3. ENVIRONMENT VARIABLES (additions)
- None strictly required. If Logpush ships, a shared secret for the collector route (reuse the Visit
  API's token pattern — do not invent a new auth scheme).

## 4. PROJECT STRUCTURE ADDITIONS
```
lib/agent-analytics/
  verify-crawler-hits.ts        — the 3-path verification engine (§3)
  bot-registry.ts               — registry lookup (UA → tier/purpose/platform/verification paths)
  ip-ranges.ts                  — CIDR refresh + containment helpers
  parse-crawler-log.ts          — log-file parser (CLF/Combined/CSV) → filtered hits
inngest/functions/
  parse-crawler-log.ts          — event: crawler-log/uploaded
  verify-crawler-hits.ts        — event: crawler-hits/ingested
  refresh-bot-ip-ranges.ts      — daily cron
app/api/brands/[brandId]/crawler-logs/upload/route.ts   — P1 upload endpoint (authed, brand-scoped)
app/api/collector/logpush/route.ts                      — P2 (if it fits) — PUBLIC, add to isPublic
db/seed/ai-bot-registry/seed.ts                         — the ~20-bot seed (BOTH DBs)
db/migrations/NNNN_agent_analytics_p3s1.sql             — the one idempotent migration
```
# BACKWARD EDITS to existing files:
# - lib/crawler/visit-classifier.ts   — EXTEND (§3.3): registry supplies inputs; verify-before-classify
# - app/api/visit/route.ts            — EXTEND: capture source_ip (X-Forwarded-For, carefully) + ingest_source='visit_api'
# - middleware isPublic matcher       — ADD the Logpush collector route (if it ships) — MW-01
# - inngest/functions/... serve()      — REGISTER the 3 new functions; UPDATE inngest-serve-manifest.txt (43)
# - the RT-01 retention cron           — EXTEND to the 3 new tables (do NOT add a second cron)
# - fanout-webhooks VALID_EVENTS + EVENT_NAME_MAP — ADD crawler.impersonation-detected

---

## 5. DATABASE SCHEMA ADDITIONS

### 5.1 ALTER `crawler_visit_logs` (AA-01, LLD §2.1 — NOT a new table)
Apply the 5 `ADD COLUMN IF NOT EXISTS` + the verification index verbatim from LLD §2.1.
⚠️ **Backfill:** existing rows get `verification_status = NULL` = "ingested before verification existed."
**NULL ≠ verified** (AA-05). ⚠️ **Dedup index (OQ-A2):** verify it doesn't collide with the Visit API
write pattern *before* applying — if it does, dedup in the parser instead.

### 5.2 `ai_bot_registry` (#38, LLD §2.2) — GLOBAL, not org-scoped
Full DDL from LLD §2.2. ⚠️ **This table EMITS canon's `crawler_tier` + `default_purpose`, never competes
with them** (AA-C7). Read-only to users; operator-seeded (mirrors `org_feature_flags`' operator-set
pattern). No RLS org scoping — it's global reference data.

### 5.3 `ai_bot_ip_ranges` (#39, LLD §2.3) — versioned CIDR cache
Full DDL from LLD §2.3 (GiST index on `cidr inet_ops`). ⚠️ **AA-06 (feed resilience):** the importer
**fails closed** on malformed vendor JSON, **retains the previous known-good version** (`is_current`
flag, never wipe-then-insert), and alerts on schema surprise.

### 5.4 `ai_referral_hits` (#40, LLD §2.4) — created now, populated in P3-S2
Full DDL from LLD §2.4. ⚠️ **AA-07:** crawler visits and human referrals are NEVER in the same table and
NEVER summed. RLS: direct-`organization_id` (USING + WITH CHECK), cross-org → 404. Retention 90 days
(RT-01), + a `data_residency_log` row. `session_count` is **AGGREGATE ONLY** — never per-session (privacy).

### 5.5 The registry seed (MANDATORY — BOTH DBs)
`db/seed/ai-bot-registry/seed.ts` — the ~20-bot table from LLD §2.2. ⚠️ **Apply to `visibleau` AND
`visibleau_prod`, psql-verified.** ⚠️ **`Google-NotebookLM` needs `match_mode='exact'`** — it's a
headless-Chrome UA a generic `bot|crawl|spider` regex MISSES. ⚠️ **Anthropic has `cidr_source_url=NULL`**
→ FCrDNS primary (AA-04). Re-verify the seed against live vendor docs at build time (the list ages).

### 5.6 RLS + barrel exports
`ai_referral_hits` → full RLS. `ai_bot_registry` + `ai_bot_ip_ranges` → global, no org RLS. Add all 3 to
the schema barrel. Add `data_residency_log` rows for all 3 new tables.

---

## 6. LIB MODULES

### 6.1 `verify-crawler-hits.ts` (LLD §3 — the biggest genuine gap)
The 3-path engine: **CIDR** (`source_ip` ∈ `ai_bot_ip_ranges` via `>>=`) → **FCrDNS** (reverse-DNS →
PTR must end with the registry's `ptr_domain_suffix` for the CLAIMED vendor → forward-DNS → must equal
original IP; fail at step 2 or 4 → **spoofed**) → **ASN** (weak; contradict-only). ⚠️ **AA-04:** support
all 3 paths — a bot with no published CIDR (Anthropic) falls back to FCrDNS, is NOT "unverifiable."
⚠️ **AA-10 (cost):** verify per unique `(source_ip, vendor)` tuple, cache 24h — NOT per hit. A million
hits from 3 IPs = 3 lookups.

### 6.2 `bot-registry.ts` — UA → registry lookup
Given a UA string, return the matching registry row (respecting `match_mode` substring/exact). Supplies
`crawler_tier`, `default_purpose`, `is_agent_ua` (→ `is_active_agent`), `ai_platform` (→
`referrer_ai_session`), and the `verification_paths`. ⚠️ **NEVER hardcode the bot list** (AA-03) — it's a
table so new bots don't require a code change.

### 6.3 `ip-ranges.ts` — refresh + containment
Fetch each `cidr_source_url`, diff `version_hash`, insert new, mark old `is_current=false`, **retain
previous** (AA-06). Containment via Postgres `>>=`.

### 6.4 `parse-crawler-log.ts` — the P1 parser
Parse CLF/Combined/CSV + `.gz`. ⚠️ **AA-12 (privacy, MANDATORY + a marketing asset):** discard non-AI-bot
traffic **at parse time** — only rows matching a registry `ua_token` are stored; human traffic NEVER
persisted. ⚠️ **Filter out static assets** (css/js/img/font/video) — count HTML/document hits only, or
crawl counts are meaningless. Dedup (AA-02) → hand off to verification.

### 6.5 Classifier extension (`lib/crawler/visit-classifier.ts` — EDIT, don't replace)
Canon's logic stands. **Added:** registry supplies `crawler_tier`/`default_purpose`/`is_agent_ua`/
`ai_platform` by UA lookup; **verification runs BEFORE classification** so a `spoofed` row is never
classified as a real visit (§3.3).

---

## 6U. UI SPECIFICATION
**NONE THIS SPRINT.** All surfaces are P3-S2. (The upload endpoint is an API, not a screen — a minimal
"received N hits" JSON response is fine; the setup panel UI is P3-S2.)

## 7. (No CLI changes this sprint.)

## 8. INNGEST / WEBHOOK WIRING

### 8.1 The 3 new functions (serve() 40 → 43)
- `parse-crawler-log` — event `crawler-log/uploaded` (slash, internal) → parse → filter → dedup → emit
  `crawler-hits/ingested`.
- `verify-crawler-hits` — event `crawler-hits/ingested` (slash, internal) → run the 3-path engine →
  write `verification_status`/`verified_via` → if a vendor's unverified rate > 25% over 1h, emit
  `crawler.impersonation-detected`.
- `refresh-bot-ip-ranges` — daily cron.

### 8.2 fanout-webhooks (WH-01) EDIT
Add **`crawler.impersonation-detected`** (dot, external) to **`VALID_EVENTS`** + **`EVENT_NAME_MAP`**.
⚠️ **AA-21 (the dot-vs-slash trap that cost S7):** the internal events are slash (`crawler-log/uploaded`,
`crawler-hits/ingested`); the external one is dot. **Extend the repo-wide dot-vs-slash convention guard
to cover these three events.** A real ingestion run + terminal read is mandatory verification.

## 9. API ROUTES
- `POST /api/brands/[brandId]/crawler-logs/upload` — authed, brand-scoped: Better Auth + `setRlsContext`
  + `assertBrandAccess` + `assertTier` (Starter+, per §8 of the LLD). Accepts `.log`/`.gz`/`.csv`,
  emits `crawler-log/uploaded`. Cross-org → 404.
- `POST /api/collector/logpush` (if it ships) — **PUBLIC**, reuses SEC-A/SEC-B, ⚠️ **MUST be in
  `isPublic`** (MW-01), emits `crawler-hits/ingested`.
- `app/api/visit/route.ts` — EDITED: capture `source_ip` + `ingest_source='visit_api'`.

---

## 10. CLAUDE CODE PROMPT (paste this to open P3-S1)
> Build VisibleAU Phase 3 Sprint 1 (Agent Analytics — Verification + Ingestion) per Agent Analytics LLD
> v1.5 §2–§4, §8–§11. This is Layer 1 EXTENSION plumbing — NO new UI.
> 1. Read AA LLD v1.5 §2 (data model), §3 (verification), §4 (ingestion). Confirm §9 says serve() 40→43,
>    tables 71→74.
> 2. ALTER crawler_visit_logs (+5 cols) + 3 new tables. ⚠️ ONE idempotent migration, applied to BOTH
>    visibleau AND visibleau_prod, psql-verified. ⚠️ Verify the dedup index (OQ-A2) doesn't collide with
>    the Visit API write pattern before applying.
> 3. Seed ai_bot_registry (~20 bots) on BOTH DBs. Google-NotebookLM = exact match; Anthropic = FCrDNS.
> 4. Build the 3-path verification engine (CIDR→FCrDNS→ASN, 3-state verdict, per-(ip,vendor) 24h cache).
>    ⚠️ ASN never yields verified; NULL backfill never counts as verified.
> 5. Extend visit-classifier.ts (registry supplies inputs; verify-before-classify). EXTEND the Visit API
>    for source_ip + ingest_source. Build the log-upload parser (discard non-AI + static assets at parse
>    time; dedup).
> 6. Register 3 Inngest fns (serve()=43; update the manifest). Wire crawler.impersonation-detected into
>    fanout-webhooks VALID_EVENTS + EVENT_NAME_MAP. Extend the dot-vs-slash guard.
> 7. Then run §11 tests and §12 greps. ⚠️ A real ingestion run + terminal read is mandatory (greps can't
>    prove an event chain fires).

---

## 11. TESTS REQUIRED (LLM_MODE=mock) — the 5-section track

**§11.1 Backend Unit**
- Verification: CIDR hit → `verified`/`cidr`; FCrDNS pass → `verified`/`fcrdns`; FCrDNS fail at step 2
  → `spoofed`; ASN-only → `unverified` (NEVER verified — AA-09); ASN contradicts → `spoofed`.
- ⚠️ **Break-proof:** feed a UA claiming GPTBot from an IP NOT in OpenAI's range with a non-matching PTR
  → MUST be `spoofed`, NOT verified. Disable the FCrDNS step-4 IP-equality check → the spoof passes →
  test goes RED. That's the proof the check enforces.
- Registry lookup: substring vs exact (Google-NotebookLM exact-only); NULL cidr_source_url → FCrDNS path.
- Parser: CLF/Combined/CSV rows → correct fields; ⚠️ non-AI UA → **discarded** (assert NOT persisted);
  static asset (.css/.png) → **discarded**; `.gz` decompresses.
- `classifyScore`/purpose: verify-before-classify — a spoofed row is never classified as a real visit.

**§11.2 Backend Integration (real DB)**
- Migration applied to a test DB → all 5 columns + 3 tables exist; RLS forced on `ai_referral_hits`;
  registry/ip_ranges have NO org RLS (global).
- ⚠️ **Dedup (AA-02):** ingest the same log file twice → **row count unchanged** (no doubling).
- ⚠️ **Verification cache (AA-10):** 1,000 hits from 3 IPs → exactly 3 DNS lookups (assert the cache hit
  count), not 1,000.
- IP-range refresh: feed malformed vendor JSON → **fails closed**, previous `is_current` retained, NOT
  wiped (AA-06).

**§11.3 Walk regression guards** — each finding above gets a guard that goes RED if reintroduced.

**§11.4 Frontend Unit** — none (no UI this sprint).

**§11.5 E2E** — ⚠️ **the mandatory real run:** upload a real log file for Metropolitan Plumbing → hits
land, classified per canon's taxonomy, verified/unverified/spoofed correctly assigned. **Seed a
deliberately spoofed UA → confirm it is caught.** Re-upload the same file → no duplicates. **Watch the
terminal:** `parse-crawler-log` → `verify-crawler-hits` must fire in sequence (the dot-vs-slash proof).

---

## 12. VERIFICATION GREPS
```bash
# The 3 new tables exist in schema + barrel
grep -rn "ai_bot_registry\|ai_bot_ip_ranges\|ai_referral_hits" db/schema/ | grep -i "export\|pgTable"
# crawler_visit_logs ALTERed, NOT a new table
grep -rn "crawler_visit_logs" db/migrations/*p3s1* | grep -i "ALTER" && ! grep -rn "CREATE TABLE.*crawler_visit_logs" db/migrations/*p3s1*
# the 3 enums, verbatim
grep -rn "verified.*unverified.*spoofed\|cidr.*fcrdns.*asn\|visit_api.*log_upload.*cf_logpush" db/
# registry EMITS canon's values (not competing enums)
grep -rn "must_allow.*emerging.*data\|retrieval.*indexing.*training" lib/agent-analytics/bot-registry.ts
# serve() = 43 and the manifest updated
grep -c "createFunction\|Fn," app/api/webhooks/inngest/route.ts   # cross-check against manifest
diff <(grep -oE "[a-zA-Z]+Fn|[a-z-]+" scripts/qa/inngest-serve-manifest.txt) ... # set-difference guard
# the 3 new functions registered
grep -rn "parse-crawler-log\|verify-crawler-hits\|refresh-bot-ip-ranges" app/api/webhooks/inngest/route.ts
# fanout: the external event mapped
grep -rn "crawler.impersonation-detected" | grep -i "VALID_EVENTS\|EVENT_NAME_MAP"
# ⚠️ the emit EXISTS at its source (not just mapped in fanout) — the S8-01 lesson
grep -rn "crawler.impersonation-detected\|crawler-hits/ingested\|crawler-log/uploaded" inngest/functions/
# Logpush collector (if built) in isPublic — MW-01
grep -rn "collector/logpush" middleware.ts
# privacy: parser discards non-AI + static assets
grep -rn "ua_token\|registry\|static\|css\|discard\|filter" lib/agent-analytics/parse-crawler-log.ts
# Visit API extended for source_ip
grep -rn "source_ip\|ingest_source" app/api/visit/route.ts
# data_residency_log rows for the 3 new tables
grep -rn "ai_bot_registry\|ai_bot_ip_ranges\|ai_referral_hits" db/ | grep -i "data_residency\|residency"
# NO new layer / colour token (AA-C4)
! grep -rn "layer-8\|--layer-agent\|Layer 8" .
# tier gate reads subscriptions.tier, never organizations.tier
grep -rn "assertTier\|subscriptions.tier" app/api/brands/\[brandId\]/crawler-logs/ && ! grep -rn "organizations.tier" app/api/brands/\[brandId\]/crawler-logs/
```

---

## 13. COMMON PITFALLS (anti-patterns — do NOT do these)
1. ⚠️ **Migration to dev only, not prod.** The single most damaging recurring bug (5+ times, incl. S8's
   44-route outage). BOTH DBs, psql-verified.
2. ⚠️ **Counting NULL/unverified/spoofed in a headline.** AA-05: `verified` ONLY. NULL backfill = "unknown."
3. ⚠️ **CIDR-only verification.** Silently fails Anthropic's entire bot family (no published CIDR) —
   AA-04. Must support FCrDNS fallback.
4. ⚠️ **ASN yielding `verified`.** AA-09: ASN is weak (vendors share AWS/GCP) — contradict-only.
5. ⚠️ **DNS lookup per hit.** AA-10: per-`(ip,vendor)` tuple, 24h cache. Per-hit = a cost bomb.
6. ⚠️ **Persisting human traffic.** AA-12: discard non-AI + static assets at PARSE time. Privacy is a
   marketing asset here.
7. ⚠️ **Hardcoding the bot list.** AA-03: it's a table. A hardcoded array is a permanent maintenance bug.
8. ⚠️ **Wipe-then-insert on IP-range refresh.** AA-06: fail closed, retain previous version.
9. ⚠️ **A new collector route not in `isPublic`.** MW-01: it 401s silently.
10. ⚠️ **dot-vs-slash event mismatch.** AA-21 (cost S7 dearly): slash internal, dot external; extend the
    guard; a terminal-read real run is mandatory — greps can't prove a chain fires.
11. ⚠️ **The registry competing with canon's enums** instead of emitting them (AA-C7).
12. ⚠️ **Re-deriving the Visit API hardening** instead of reusing SEC-A/SEC-B (AA-C6).
