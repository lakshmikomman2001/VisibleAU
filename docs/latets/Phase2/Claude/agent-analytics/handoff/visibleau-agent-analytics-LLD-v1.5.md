# VisibleAU — Agent Analytics — LLD **v1.5**
### (Layer 1 · Retrieval Intelligence — **extension**, not a new layer)

**Status:** DESIGN — not built. Post-Phase-2. 2 sprints.
**v1.5 change (two residual-consistency fixes, found during sprint-prompt cross-check):**
(1) **§10** still read `serve()=28` — a leftover of the same stale baseline AA-E1 corrected in §9. Fixed to
**serve()=43** so §9 and §10 agree. (2) **§12**'s P3-S2 bullet said *"verify what S9 built → extend it,"*
which reopened a question **§7.0 already RESOLVED** (the S9 crawler card does not exist — orphan-reader table
since S6). Changed to **BUILD** the card outright; a grep is a sanity check, not a branch point. No feature
or scope change — internal consistency only.
**v1.4 change (AA-E1):** §9 invariant **baselines** corrected to the true post-Phase-2 state
(serve() 25→**40**, tables 37→**71**); the deltas (+3/+3/+1) are unchanged. Canon's v8.70 headers state a
stale serve()=25 (frozen ~P2-S3) and a Phase-2-only "37 tables"; the real figures are serve()=40 (per
`scripts/qa/inngest-serve-manifest.txt`) and 71 tables (34 P1 + 37 P2). All six review axes (data
contract, honesty rules, CDN-Shield join, tiering, events, invariants) were re-verified against canon;
this was the only conflict found — a *converging* audit, as expected.
**Supersedes:** v1.4 (AA-E1 baseline fix), v1.3 (reconciled against 4 prototype audits — 17 conflicts, see §0.2c), v1.2, v1.1 and v1.0 (**WITHDRAWN**). v1.0 proposed a new Layer 8, four new tables
(`ai_crawler_hits` et al.), and a 4-value purpose taxonomy — **all of which conflicted with Phase 2 canon.**
A 9-conflict audit against LLD v8.70 + prototype FIX17 found v1.0 would have duplicated `crawler_visit_logs`,
inverted the meaning of `visit_purpose`, and silently broken three counted invariants. v1.1 is the corrected
design. **See §0.2 for the full conflict ledger — it is retained deliberately so this mistake is not repeated.**

**Canon authority:** Phase 2 LLD **v8.70** > this document. Where they disagree, **v8.70 wins.**

---

## §0. WHAT THIS IS (and what it is NOT)

**The gap being closed:** VisibleAU has `crawler_visit_logs` — it already records *which AI bot visited which
URL*. What it **cannot** do today:
1. **Prove the bot was real.** The table trusts the `User-Agent` string. There is **no `source_ip` column and no
   verification of any kind.** A competitor scraping prices while claiming to be `GPTBot` is recorded as GPTBot.
2. **Answer "did AI send anyone back?"** There is **no human-referral data at all** — so the crawl-to-referral
   ratio, the single most sellable metric in this space, is not computable.
3. **Ingest from a client who can't install the snippet.** The only ingestion path is the middleware snippet →
   Visit API. An AU SMB on cPanel/shared hosting with no code access has no route in.

**That is the whole scope.** Three gaps. Everything else already exists and is reused.

**What this is NOT:** not a new layer, not a new crawler table, not a new purpose taxonomy, not a WAF, not a
bot-blocker, not a general web-analytics product.

---

## §0.1 THE ONE-LINE PRODUCT ARGUMENT

*AI crawlers do not execute JavaScript, so they never fire GA4 or any client-side analytics — the client's
existing stack is **structurally blind** to them.* An AU agency can therefore tell a client something their
current tooling **cannot**. That is the definition of a sellable insight, and it is why Profound ships its
equivalent on **every** tier.

**The killer metric (a division):** crawl-to-referral ratio. Public Cloudflare data: ClaudeBot ≈ 38,000 crawls
per referral; GPTBot ≈ 887. So *"GPTBot fetched your booking page 400 times last month and sent you 0
visitors"* is factual, concrete, and immediately actionable — and today VisibleAU **cannot say it**, because it
has the numerator and not the denominator.

---

## §0.2 CONFLICT LEDGER — v1.0 → v1.1 (retained as a permanent record)

| # | Conflict (v1.0) | Canon says | v1.1 resolution |
|---|---|---|---|
| **AA-C1** | Proposed new table `ai_crawler_hits` | **`crawler_visit_logs` already exists** (14 cols: brand_id, organization_id, crawler_name, crawler_tier, visited_url, status_code, response_time_ms, error_type, raw_log_line, is_active_agent, referrer_ai_session, visit_purpose, visited_at, created_at). LLD line 5233 states verbatim: *"into the existing crawler_visit_logs table — **no second table needed**"* | **ALTER the existing table.** `ai_crawler_hits` deleted from the design. |
| **AA-C2** | Invented 4-value purpose enum (`agent`/`retrieval`/`search`/`training`) | `visit_purpose` **already exists** with **`retrieval` \| `indexing` \| `training`**, and canon's `retrieval` means what v1.0 called `agent` — **an inverted collision on the same column** | **Adopt canon's 3-value enum verbatim.** v1.0's taxonomy deleted. |
| **AA-C3** | Added 4 tables, 4 fns, "Layer 8" | Canon asserts in every revision: **"37 tables, 16 GAPs, serve()=25/25 intact"** and **"All 7 Layers intact"** | v1.1 declares its invariant delta **explicitly** (§9). No silent breaks. |
| **AA-C4** | "Layer 8" + a new colour token | 7 layers; 7 WCAG-AA-verified tokens (workflow/visibility/comm/trust/retrieval/discovery/governance). **No 8th slot.** | **This is Layer 1 (Retrieval) extended.** `crawler_visit_logs` already lives in Layer 1; CDN Shield is Layer 1. **No new layer, no new token.** |
| **AA-C5** | 4 brand-new screens | Canon DDL comment: *"UI display (**Sprint 9 crawler analytics card**)"* — a crawler UI is **already spec'd** | **Extend the S9 card + the Retrieval surface.** Verify what S9 actually built before designing (§7.0). |
| **AA-C6** | New "collector endpoint" + its security | **Visit API already exists and is hardened**: `crawler-log-ingest.ts` middleware snippet (PATCH W-03), **SEC-A** (validate `new URL(body.url).host === brand.domain` → 422; the brandToken is necessarily public) and **SEC-B** (IP throttle *before* any DB work → 429; short-TTL negative cache for unknown tokens; then brand lookup, SEC-A check, per-token limit) | **Reuse the Visit API verbatim.** Only *add* the upload + Logpush paths. |
| **AA-C7** | New `ai_bot_registry` competing with existing tiers | `crawler_tier` (`must_allow` \| `emerging` \| `data`) already classifies bots and **drives `visit_purpose`** | Registry **retained** (canon lacks verification metadata) but it must **emit** canon's `crawler_tier` + `visit_purpose`, never compete with them. |
| **AA-C8** | Proposed Starter gate as if new | Crawler logs are **already a paid-Starter surface** (line 609). And there is a **carried S6 bug**: the gate is dead-code labelled "Growth" but should be Starter+ per LLD 3170 → **currently ungated = Free-tier leak** | v1.1 **resolves the existing bug** rather than adding a third opinion (§8). |
| **AA-C9** | Tier-varying retention (90d/365d) | **RT-01: `crawler_visit_logs` = 90 days flat**, enforced by the retention cron, declared in `data_residency_log` (ap-southeast-2, supabase, AES-256) | **Keep 90 days flat.** Any change must update the cron + `data_residency_log` together. |

## §0.2b SECOND-PASS CONFLICT LEDGER — v1.1 → v1.2 (different audit angles)

A second audit against canon (angles: the GAP register, the tier-gate table TG-02, the prototype's actual
screens, the Visit API's middleware) found **5 further conflicts** — two HIGH. **One would have removed a feature
canon deliberately ships.**

| # | Conflict (v1.1) | Canon says | v1.2 resolution |
|---|---|---|---|
| **AA-C10** | §8 tiering: `Free ❌ — upsell surface only. (Fixing the leak is part of this work.)` | **LLD 3198: "Free + Starter: `crawler_visit_logs` + `llmstxt_versions` (near-zero cost, real value)."** Crawler logs are a **DELIBERATE Free-tier acquisition hook** — the exact reasoning v1.1's own AA-19 argued for. **Canon got there first.** | **INVERTED. Free KEEPS crawler logs.** AA's *new* capabilities (verification, ratio, CDN-join) are the paid uplift. **v1.1 would have STRIPPED a deliberate feature and called it a bug fix.** |
| **AA-C11** | §8 claims a "carried S6 tier-gate bug — currently ungated → Free-tier leak" | **ALREADY FIXED at v8.56** (prototype FIX 5 / **TG-02**): *"Retrieval tab minTier 'Growth' → 'Starter' … gating at Growth hid paid Starter value."* | **Claim DELETED.** The gate is already correct. (A stale carried item trusted from memory instead of verified — the same error class as v1.0.) |
| **AA-C12** | §9: *"GAPs: 16 → 16 UNCHANGED"* | GAPs are canon's numbered **feature** gaps (GAP 2 Agent Readiness, GAP 3 MCP, GAP 10 NAP, GAP 11 Knowledge Panel, GAP 12 Entity Home, GAP 13 Wikidata…). **None covers crawler traffic / verification / referral attribution.** | **GAPs 16 → 17.** This work IS a new GAP: **GAP 17 — AI Crawler Verification & Referral Attribution.** |
| **AA-C13** | OQ-A3 left the S9 crawler card as a *blocking unknown* | **The S9 crawler analytics card WAS NEVER BUILT.** Prototype FIX17 contains **zero** crawler-card / agent-traffic UI. Canon's DDL comment promises *"UI display (Sprint 9 crawler analytics card)"* — **it does not exist.** | **OQ-A3 RESOLVED.** `crawler_visit_logs` has been **collecting data since S6 with no UI to read it** — an **orphan-reader table** (the mirror of canon's own §1816 finding: *"orphan tables — `data_residency_log` has no writer"*). **AA is not extending a card; it is DELIVERING an S9 promise that was never kept.** Scope +1 surface; blocking uncertainty removed. |
| **AA-C14** | §4 P0 "reuse the Visit API" — route unnamed, middleware unmentioned | **MW-01:** `app/api/visit/route.ts` is a **PUBLIC** endpoint and **must be in the `isPublic` middleware matcher** — *"Without adding '/api/visit', auth middleware blocks visitors (401)."* | Route named explicitly: **`POST /api/visit`**, already in the public matcher. **Any NEW collector route (Logpush) MUST also be added to `isPublic`, or it 401s silently.** |

**Method note (why this ledger stays):** v1.0 was written from good market research and **insufficient canon
reading** — the exact failure mode ("build claims X" / "design assumes X" without verifying) that this project's
discipline exists to catch. It was caught by a fresh-eyes audit, which is the system working. Retained so the
next designer reads canon *first*.

---

## §0.2c PROTOTYPE-AUDIT RECONCILIATION — what 4 prototype passes fed back into this LLD

The prototype was audited four times on different axes (17 conflicts fixed: tokens, route/nav model, gating
mechanism, component semantics, data contract, metric coverage, theme behaviour, CSS contracts, a11y, async
states, data consistency). Most were prototype-only. **Three reach back into this LLD and are folded in here:**

| From prototype | What it exposed in the LLD | v1.3 fix |
|---|---|---|
| **AA-P3 [HIGH]** | §8's *"Free ✅ crawler visits"* is **UNREACHABLE**. Canon's Retrieval **tab** is `minTier: 'Starter'` (prototype FIX17 line 1051) — a Free user **cannot open the surface**. §8 conflated *data-retention entitlement* (LLD 3198: Free's crawler_visit_logs is retained) with *UI access* (the tab gate). Both are true and NOT contradictory — Free's data is collected; Free just can't see the Retrieval analytics UI. | **§8 rewritten (below).** The Agent Analytics *surface* is **Starter+** (the tab's operative gate). LLD 3198's "Free" is a data-retention statement, not a UI promise. **This corrects v1.2's own §8, which was internally right about the hook but wrong about who can *see* it.** |
| **AA-P8 [MED]** | Prototype drifted to `ua:` / per-bot `ratio:`. The LLD was already correct (`crawler_name`, and §5.1 `ratio(vendor)`), so **no LLD change** — but §5.1 now states the per-vendor rule more emphatically so a future prototype can't drift again. | §5.1 annotated (per-vendor is normative). |
| **AA-P9 / AA-P10 [MED]** | Two spec'd metrics (5xx-for-bots, unverified-rate>25% alert) had no UI. The LLD §5.2 already lists them, so **no LLD change** — confirmed they're canon and the prototype now surfaces them. | Confirmed; no change. |

**Net LLD change in v1.3 is small and precise: §8 tiering.** The schema and metric specs were already correct;
the prototype had drifted from them, not the reverse. (Which is itself the point of auditing both directions.)

## §1. WHAT ALREADY EXISTS (reuse — do not rebuild)

| Asset | Where | Reused for |
|---|---|---|
| **`crawler_visit_logs`** (14 cols, RLS'd, indexed ×3, 90d retention) | Layer 1 | **The fact table.** Extended, not replaced. |
| **`visit_purpose`** (`retrieval`/`indexing`/`training`) + `is_active_agent` + `referrer_ai_session` | same table | **The taxonomy.** Adopted verbatim. |
| **`crawler_tier`** (`must_allow`/`emerging`/`data`) | same table | Bot classification input. |
| **`lib/crawler/visit-classifier.ts`** — the documented detection logic | Layer 1 | Extended (see §3.3). |
| **Visit API** `POST /api/visit` + `crawler-log-ingest.ts` snippet, hardened by **SEC-A** + **SEC-B** | Layer 1 | **Ingestion path 1.** Reused as-is. |
| **CDN Shield** (blocked/allowed diagnosis) | Layer 1 (S6) | **The join (§5.3) — the differentiator.** |
| **`lib/crawler/index.ts`** (canonical crawler) | S6 | Sitemap fetch for the coverage-gap metric. |
| **Retention cron** (RT-01) + `data_residency_log` declaration | Layer 7 | Retention. Unchanged. |
| **S9 crawler analytics card** (spec'd; **verify built**) | S9 | The UI surface. Extended. |

---

## §2. DATA MODEL

### §2.1 **ALTER** `crawler_visit_logs` (AA-01 — the core change; **NOT a new table**)

```sql
ALTER TABLE crawler_visit_logs
  ADD COLUMN IF NOT EXISTS source_ip            INET,
  ADD COLUMN IF NOT EXISTS verification_status  TEXT
      CHECK (verification_status IN ('verified','unverified','spoofed')),
  ADD COLUMN IF NOT EXISTS verified_via         TEXT
      CHECK (verified_via IN ('cidr','fcrdns','asn')),
  ADD COLUMN IF NOT EXISTS bytes                BIGINT,
  ADD COLUMN IF NOT EXISTS ingest_source        TEXT NOT NULL DEFAULT 'visit_api'
      CHECK (ingest_source IN ('visit_api','log_upload','cf_logpush'));

CREATE INDEX IF NOT EXISTS crawler_logs_verification_idx
  ON crawler_visit_logs(brand_id, verification_status, visited_at DESC);
```
- **Backfill:** existing rows get `verification_status = NULL` (= *"ingested before verification existed"*).
  **NULL is NOT 'verified'** — it must never be counted in a verified headline (AA-05). Display as "unknown
  (pre-verification)".
- **Idempotency (AA-02):** log upload and Logpush are at-least-once. Add:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS crawler_logs_dedup_idx
    ON crawler_visit_logs(brand_id, crawler_name, visited_url, visited_at, COALESCE(source_ip,'0.0.0.0'::inet));
  ```
  Re-uploading the same log file must be a **no-op**, not a doubling. *(Verify this doesn't collide with the
  Visit API's existing write pattern before applying — if it does, dedup in the parser instead.)*

### §2.2 **NEW** Table — `ai_bot_registry` (global, seeded; **NOT org-scoped**)

**AA-03: the bot list lives in a table, seeded and updatable, NEVER hardcoded.** Bot names change and new ones
appear monthly; a hardcoded array is a permanent maintenance bug. **This registry must EMIT canon's values**
(`crawler_tier`, `visit_purpose`), never compete with them (AA-C7).

```sql
CREATE TABLE ai_bot_registry (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ua_token           TEXT NOT NULL UNIQUE,      -- e.g. 'ChatGPT-User'
  match_mode         TEXT NOT NULL DEFAULT 'substring'
                     CHECK (match_mode IN ('substring','exact')),
  vendor             TEXT NOT NULL,             -- 'openai' | 'anthropic' | 'perplexity' | ...
  crawler_tier       TEXT NOT NULL              -- EMITS canon's value
                     CHECK (crawler_tier IN ('must_allow','emerging','data')),
  default_purpose    TEXT                       -- EMITS canon's value; classifier may override
                     CHECK (default_purpose IN ('retrieval','indexing','training')),
  is_agent_ua        BOOLEAN NOT NULL DEFAULT false,  -- drives is_active_agent
  ai_platform        TEXT,                      -- 'chatgpt'|'claude'|'perplexity'|'gemini' → referrer_ai_session
  verification_paths JSONB NOT NULL,            -- ['cidr','fcrdns','asn'] in priority order
  cidr_source_url    TEXT,                      -- NULL for Anthropic → FCrDNS primary (AA-04)
  ptr_domain_suffix  TEXT,                      -- e.g. '.openai.com' — FCrDNS step 2
  expected_asns      INTEGER[],
  respects_robots    BOOLEAN,                   -- Bytespider / meta-externalagent = false
  is_active          BOOLEAN NOT NULL DEFAULT true,
  notes              TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Seed (v1 — 2026-07; MUST be re-verified at build time; apply to BOTH DBs):**

| ua_token | vendor | crawler_tier | default_purpose | is_agent_ua | verification | notes |
|---|---|---|---|---|---|---|
| `ChatGPT-User` | openai | must_allow | retrieval | **true** | cidr(`openai.com/chatgpt-user.json`)+fcrdns | **highest-value signal** |
| `OAI-SearchBot` | openai | must_allow | indexing | false | cidr(`openai.com/searchbot.json`)+fcrdns | |
| `GPTBot` | openai | must_allow | training | false | cidr(`openai.com/gptbot.json`)+fcrdns | training only |
| `Claude-User` | anthropic | must_allow | retrieval | **true** | **fcrdns** (AA-04) | |
| `Claude-SearchBot` | anthropic | must_allow | indexing | false | fcrdns | |
| `ClaudeBot` | anthropic | must_allow | training | false | fcrdns | |
| `Perplexity-User` | perplexity | must_allow | retrieval | **true** | cidr+fcrdns | robots compliance *disputed* |
| `PerplexityBot` | perplexity | must_allow | indexing | false | cidr+fcrdns | |
| `Google-NotebookLM` | google | emerging | retrieval | **true** | fcrdns | **headless-Chrome UA — needs `exact` match; a generic `bot\|crawl\|spider` regex MISSES it** |
| `Gemini-Deep-Research` | google | emerging | retrieval | true | fcrdns | |
| `Googlebot` | google | must_allow | indexing | false | cidr+fcrdns | feeds AI Overviews |
| `bingbot` | microsoft | must_allow | indexing | false | cidr+fcrdns | feeds Copilot |
| `DuckAssistBot` | duckduckgo | emerging | indexing | false | cidr | |
| `MistralAI-User` | mistral | emerging | retrieval | true | — | |
| `meta-externalagent` | meta | data | training | false | fcrdns/asn | **ignores robots.txt** |
| `Bytespider` | bytedance | data | training | false | **asn only** | **ignores robots.txt** |
| `Amazonbot` | amazon | data | training | false | fcrdns | |
| `CCBot` | commoncrawl | data | training | false | fcrdns (`*.commoncrawl.org`) | |
| `Applebot-Extended` | apple | data | training | false | fcrdns | |
| `cohere-ai` | cohere | data | training | false | — | |

### §2.3 **NEW** Table — `ai_bot_ip_ranges` (daily-refreshed CIDR cache, versioned)

```sql
CREATE TABLE ai_bot_ip_ranges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor       TEXT NOT NULL,
  cidr         CIDR NOT NULL,               -- native type; use >>= for containment
  source_url   TEXT NOT NULL,
  version_hash TEXT NOT NULL,               -- detects "the feed changed"
  is_current   BOOLEAN NOT NULL DEFAULT true,   -- previous versions RETAINED (debuggability)
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vendor, cidr, version_hash)
);
CREATE INDEX ai_bot_ip_ranges_cidr_idx ON ai_bot_ip_ranges USING gist (cidr inet_ops);
```
**AA-06 (feed resilience):** vendors publish useful lists but **do not freeze their JSON schemas.** The importer
**fails closed** on malformed data, **retains the previous known-good version**, and **alerts on schema
surprise**. Never wipe-then-insert.

### §2.4 **NEW** Table — `ai_referral_hits` (the *human* side — genuinely absent from canon)

**AA-07: crawler visits and human referrals are NEVER stored in the same table and NEVER summed.** A crawl is a
bot reading you. A referral is a human arriving because an AI cited you. Conflating them is the most common
analytical error in this space — and keeping them separate is what makes the ratio *mean* anything.

```sql
CREATE TABLE ai_referral_hits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  brand_id        UUID NOT NULL REFERENCES brands(id),
  referrer_domain TEXT NOT NULL,   -- chatgpt.com | perplexity.ai | claude.ai | gemini.google.com | copilot.microsoft.com
  ai_platform     TEXT NOT NULL,   -- normalised: 'chatgpt'|'claude'|'perplexity'|'gemini'|'copilot' (joins referrer_ai_session)
  landing_path    TEXT NOT NULL,
  session_count   INTEGER NOT NULL,   -- AGGREGATE ONLY — never per-session (privacy)
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('ga4','log_referrer','utm')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, referrer_domain, landing_path, period_start)
);
```
RLS: direct-`organization_id` (USING + WITH CHECK), cross-org → **404 not 401**, `setRlsContext` before queries —
per canon. Retention: **90 days**, aligned with `crawler_visit_logs` (RT-01); add a `data_residency_log` row.

---

## §3. VERIFICATION (AA-08 — the biggest genuine gap; canon has **none**)

Today `crawler_visit_logs` trusts the UA string. UA strings are **trivially spoofable** — a scraper claiming to
be GPTBot may be a competitor scraping prices. **Bot reports built on user-agents alone overstate real AI crawl
activity badly**, and shipping an inflated number to an agency is exactly the credibility failure VisibleAU's
honesty rule exists to prevent.

### §3.1 Three paths, tried in order; record which succeeded

1. **CIDR** — source IP ∈ a vendor-published range (`ai_bot_ip_ranges`, refreshed daily).
2. **FCrDNS** (forward-confirmed reverse DNS) — the canonical pattern:
   ```
   1. reverse-DNS source_ip           → PTR hostname
   2. PTR must end with the registry's ptr_domain_suffix for the CLAIMED vendor
   3. forward-DNS that hostname       → IP
   4. must equal the ORIGINAL source_ip
   fail at 2 or 4 → SPOOFED, regardless of user-agent
   ```
3. **ASN** — source ASN ∈ `expected_asns`. **WEAK**: most AI vendors run on AWS/GCP/Azure, so an IP that is
   OpenAI's today may be an unrelated startup's next week. **AA-09: ASN alone NEVER yields `verified` — at most
   `unverified` (plausible). It can only be used to *contradict* (→ `spoofed`).**

**AA-04 (verification asymmetry — the trap):** **OpenAI publishes three separate per-bot IP JSON files.
Anthropic publishes none** and recommends robots.txt control instead. A CIDR-only design therefore **silently
fails on Claude's entire bot family.** Verification MUST support all three paths and degrade gracefully — a bot
with no published CIDR is *not* "unverifiable"; it falls back to FCrDNS.

### §3.2 The verdict (AA-05 — **three states, never two**)

| status | Meaning | Treatment |
|---|---|---|
| `verified` | CIDR or FCrDNS passed | **Counted in headline metrics** |
| `unverified` | Claimed a bot UA; no path succeeded / inconclusive / ASN-only | **Shown as its OWN line. NEVER silently merged into the headline.** |
| `spoofed` | FCrDNS actively failed, or ASN contradicts the claimed vendor | Flagged as an **impersonation finding** (itself sellable) |
| `NULL` | Pre-verification row (backfill) | "Unknown (ingested before verification)" — **NOT verified** |

**AA-05 is non-negotiable and mirrors the existing `score_after` honesty discipline:** headline numbers count
**`verified` only**. A tool that reports spoofed traffic as real AI traffic is worse than no tool.

**Impersonation alert:** unverified rate for one bot family > **25% over 1h** ⇒ that is a *scraper* problem, not
a crawler problem — raise it as a finding.

**AA-10 (cost):** DNS lookups are expensive per-request. **Verify per unique `(source_ip, vendor)` tuple and
cache the verdict 24h** — not per hit. A million hits from 3 IPs = 3 lookups.

### §3.3 Classifier extension (extends `lib/crawler/visit-classifier.ts`, does not replace it)

Canon's existing logic stands:
```
if (is_active_agent)                                        → 'retrieval'
else if (crawler_tier = 'data')                             → 'training'
else if (crawler_tier = 'must_allow' AND pages_in_session>3)→ 'indexing'
else                                                        → NULL
```
**Added:** the registry now *supplies* `crawler_tier`, `default_purpose`, `is_agent_ua`, and `ai_platform`
(→ `referrer_ai_session`) by UA lookup rather than hardcoding, and **verification runs before classification**
so a `spoofed` row is never classified as a real visit.

---

## §4. INGESTION (AA-11 — one existing path reused, two added)

**The constraint that shapes this:** the target client is an AU SMB — typically WordPress on shared/cPanel
hosting, or behind Cloudflare **free/Pro**. **Cloudflare Logpush requires an Enterprise plan for the raw
HTTP-requests dataset**, so a Logpush-only design excludes ~95% of the actual AU market.

| Path | Status | Who | Mechanism |
|---|---|---|---|
| **P0 — Visit API + middleware snippet** | **EXISTS — reuse verbatim** | Clients who can add the snippet | `crawler-log-ingest.ts` → **`POST /api/visit`** (`app/api/visit/route.ts`). **MW-01: it is a PUBLIC endpoint and is already in the `isPublic` middleware matcher — without that, auth returns 401 to visitors.** **Already hardened: SEC-A** (URL host must equal the brand domain — the brandToken is necessarily public) **+ SEC-B** (IP throttle *before* any DB work; negative cache for unknown tokens; then brand lookup, SEC-A check, per-token limit). **Do not re-derive this.** Extend only to capture `source_ip` (from `X-Forwarded-For`, carefully) + set `ingest_source='visit_api'`. |
| **P1 — Log file upload** | **NEW — ships first** | The universal fallback: cPanel/nginx/Apache | Upload `.log`/`.gz` (Combined/Common Log Format) or CSV. Parse → filter to registry UAs → **discard everything else** → dedup → verify. **Zero client-side install; works for any AU SMB.** |
| **P2 — Cloudflare Logpush** | **NEW** | Growth+/Agency clients on CF Enterprise | HTTP-destination Logpush job → a collector route (reusing the Visit API's SEC-A/SEC-B hardening pattern). **AA-C14: the new collector route MUST be added to the `isPublic` middleware matcher (MW-01) or it 401s silently — this bit the Visit API already.** |
| *(deferred v1.2)* CF Worker; Vercel/Netlify drains | — | — | A Worker duplicates P0's job for CF-fronted sites. **Vercel free retains logs 1h, Pro 3 days** → a drain is mandatory for persistence. Defer. |

**AA-12 (privacy — MANDATORY, and a marketing asset):** ingestion **discards non-AI-bot traffic at parse time
and NEVER persists it.** Only requests matching a registry `ua_token` are stored. Consequences: (a) a public
privacy commitment — *we do not store your human visitors' traffic*; (b) a clean `data_residency_log` answer;
(c) volume stays sane. **Static assets (css/js/img/font/video) are filtered out** — count HTML/document hits
only, or crawl counts become meaningless.

---

## §5. METRICS

### §5.1 Crawl-to-referral ratio (the headline)
```
-- NORMATIVE (AA-P8): the ratio is computed PER VENDOR, never per bot/crawler_name. A prototype once
-- drifted to a per-bot ratio; that is wrong. ai_referral_hits keys on ai_platform, which maps to vendor.
ratio(vendor, period) = verified_crawls(vendor, period)          -- crawler_visit_logs, verification_status='verified'
                      / referral_sessions(ai_platform, period)   -- ai_referral_hits
```
- Rendered **"N pages crawled per visitor sent"**; `0 visitors sent` when the denominator is 0 (never `∞`, never
  a divide-by-zero crash).
- **Benchmarked** against public figures (ClaudeBot ≈38,000:1, GPTBot ≈887:1) — context is the insight; a bare
  number is not.
- **AA-13 (honesty caveat, ON THE CARD — not buried):** referral attribution is **structurally incomplete**.
  Many AI platforms send **no referrer header**; mobile AI apps strip it; Google AI Mode uses `noreferrer`. A
  large share of AI-driven humans land in GA4 as **"Direct"** and cannot be attributed. **Therefore: the crawl
  side is an upper bound and the referral side is a LOWER bound — the true ratio is BETTER than shown.** Every
  competitor has this limit. VisibleAU is the one that says so.

### §5.2 Supporting metrics
- **Volume by vendor / by `visit_purpose`** — the pie that says *"78% of your AI crawl budget is training bots
  that will never cite you."*
- **Top pages by purpose.** `retrieval` hits (`is_active_agent=true`) = **a human is reading that page through
  AI right now** — canon's own framing (line ~5282): *"A tradie seeing 'ChatGPT was mid-conversation and fetched
  your booking page 47 times' understands that AI was actively recommending them to real customers."*
- **Coverage gap** — sitemap pages (via `lib/crawler/index.ts`) that **no** AI bot has ever fetched. Actionable.
- **5xx-for-bots** — a spike means *you* are the bottleneck.
- **Robots violations** — a bot fetching a path its own robots rule disallows. `respects_robots=false` families
  (Bytespider, meta-externalagent) are known offenders → this is a finding, and it feeds CDN Shield.
- **Unverified/spoofed rate** per vendor (AA-05).
- **Fetch-precedes-citation correlation** — retrieval/indexing crawls on a URL vs Layer-2 citation data for the
  same URL, ~2–4 weeks later. **AA-14: present as CORRELATION, never causation.** A standalone bot tool cannot
  do this — it has no citation data. **VisibleAU has both halves.**

### §5.3 **The CDN Shield join — the differentiator (AA-15)**

Cross-reference CDN Shield's **diagnosis** with the logs' **observed reality**:

| CDN Shield says | Logs say | Finding |
|---|---|---|
| Allowed | Crawling | ✅ Healthy |
| Allowed | **Never seen** | ⚠️ **"Not blocked — but never visited."** A *discoverability* problem (no sitemap? no inbound links? content too thin to crawl?) |
| **Blocked** | Not crawling | ❌ **"You are invisible to this engine by your own configuration."** Highest-value finding → Action Center task |
| Blocked | **Still crawling** | 🚨 **Robots violation** — the bot ignores your rules; edge/WAF is the only control |

**No competitor can produce this table.** It requires both the diagnostic layer (CDN Shield) *and* the log layer.
A bot tool has logs but no diagnosis; a diagnostic tool has no logs. **This is the reason to build Agent
Analytics inside VisibleAU rather than buy a bot tracker.**

---

## §6. ACTION CENTER INTEGRATION (reuse — no new task system)

New `remediation_tasks` types emitted from AA findings:
`unblock_retrieval_bot` · `fix_5xx_for_bots` · `add_sitemap_for_ai` · `thin_content_never_crawled` ·
`investigate_impersonation` · `robots_violation_needs_edge_rule`

Each carries the canon explainability contract `{ rationale, confidence_label, confidence_note, top_action }`.
`confidence_note` MUST carry the **AA-13** attribution caveat wherever the referral side is involved.

---

## §7. UI — **extend, do not duplicate** (AA-16)

### §7.0 **RESOLVED (AA-C13): the S9 crawler card was NEVER BUILT**

v1.1 made this a blocking open question. **Answer: it does not exist.** Prototype FIX17 contains **zero**
crawler-card / agent-traffic / `CrawlerAnalytics` UI. Canon's `crawler_visit_logs` DDL promises *"UI display
(Sprint 9 crawler analytics card)"* — **that card was never delivered.**

**Consequence — this is itself a finding:** `crawler_visit_logs` has been **collecting data since S6 with no UI
to read it.** It is an **orphan-reader table** — the exact mirror of canon's own audit finding (§1816:
*"Function→table WRITER matrix (orphan tables) — FOUND `data_residency_log` has no writer"*). Here the writer
exists and the **reader** doesn't. Data has been accumulating, unseen, for two sprints.

**Therefore Agent Analytics is not "extending" an existing card — it is DELIVERING an S9 promise that was never
kept**, plus the new verification/attribution capability. Scope is +1 surface vs v1.1's assumption; the blocking
uncertainty is gone.

### §7.1 Surface plan (Layer 1 / Retrieval — **existing token `--layer-retrieval`, no new colour**)
1. **BUILD the crawler card S9 never delivered** (AA-C13) — the canon-spec'd display: `retrieval` 🟢 *"AI
   recommended you in 47 live conversations this month"* / `indexing` 🔵 / `training` ⚪ — **plus** the new
   verified/unverified/spoofed split, the crawl-to-referral ratio (with the AA-13 caveat inline), and the vendor
   breakdown. **The card lives in the Retrieval tab (minTier:'Starter' — AA-P3); verification is Starter,
   the ratio is Growth (§8). Free-org data is retained but the analytics UI is gated.**
2. **Retrieval hub — new "Agent Analytics" section** (within the existing Layer-1 Retrieval surface, **not a new
   layer hub**): volume time series (stacked by `visit_purpose`), purpose pie, vendor table, top pages,
   coverage gap, the **CDN Shield join table (§5.3)**.
3. **Setup/connect panel** — the three ingestion paths (upload / snippet / Logpush) with a live *"received N
   hits"* confirmation.
4. **Nav (AA-17):** **NO new brand-page tile is needed** — Retrieval's tile already exists. **But:** nav-orphan
   has shipped **4×** (S5 Trust, S6 Retrieval, S7 Discovery, `/settings/notifications`). **Whatever route is
   added MUST be covered by the repo-wide set-difference nav guard before the sprint closes.**

### §7.2 Empty states (canon-mandated — and one is an *insight*)
- Not configured → the setup CTA.
- Configured, **zero hits** → *"Connected — no AI crawler has visited yet. **This is itself a finding**: it may
  mean the site isn't discoverable to AI engines. Check Retrieval + CDN Shield."* ← an empty state that is a
  finding is a VisibleAU-ism worth keeping.
- Loading → skeletons. Error → boundary. Never blank.

---

## §8. TIERING (v1.3 — **corrected by AA-P3: the SURFACE is Starter+, not Free**)

**v1.2 said "Free ✅ crawler visits." The prototype audit (AA-P3) proved that is unreachable.** Resolving it
requires separating two things v1.2 conflated:

- **Data-retention entitlement** (LLD 3198): *"Free + Starter: `crawler_visit_logs`"* — a Free org's crawler
  data **is collected and retained**. This is true, and it is why the visit data can feed things a Free user
  *can* see (the overview/report surfaces).
- **UI access** (prototype FIX17, line 1051): the Retrieval **tab** is `{ id: 'retrieval', minTier: 'Starter' }`
  — a Free user **cannot open the Retrieval surface at all**. Entitlement is enforced at the tab level via
  `minTier` + `tierRank` (aria-disabled + Lock icon), **not** by per-card overlays.

**These are not in conflict** — Free's data is retained; Free just can't open the analytics UI that displays it.
v1.2 §8 read LLD 3198 as a *UI* promise; it is a *retention* statement. **The operative gate for the Agent
Analytics surface is the tab's `minTier: 'Starter'`.**

| Tier | Sees the Agent Analytics surface? | Gets |
|---|---|---|
| **Free** | ❌ — Retrieval tab is `minTier:'Starter'` (data is still retained per LLD 3198, and can feed the overview/report, but the analytics UI is gated) | — |
| **Starter** | ✅ | Crawler visits · `visit_purpose` split · **verification** (verified/unverified/spoofed) |
| **Growth** | ✅ | + **crawl-to-referral ratio** · + **CDN Shield join** · Logpush · coverage gap · alerts ← `TierGate` overlays gate these two Growth sub-features *inside* the Starter tab |
| **Agency** | ✅ | + unlimited domains · white-label PDF section · cross-client rollup |

**AA-19 (restated, now accurate):** the value ladder is **access → trust → attribution**. Starter opens the
door and adds *verification* (is this bot real?). Growth adds *attribution* (did it send anyone back — the ratio
— and is my config costing me visibility — the CDN join). The "hook" framing from v1.2 still holds, but the hook
is **Starter**, not Free — because Free cannot open the Retrieval tab, full stop.

**Gating mechanism (normative, from prototype FIX17):**
- The **surface** is gated by the Retrieval tab's `minTier:'Starter'` (BrandIntelTabs — do not add a separate
  route or a per-page gate for tab access).
- The two **Growth sub-features** (ratio, CDN join) are gated by `TierGate` overlays *within* the tab.
- Tier source-of-truth = **`subscriptions.tier`** (never `organizations.tier`) — canon.

## §9. INVARIANT DELTA (AA-20 — **declared explicitly; no silent breaks**)

**AA-E1 (v1.4 — baselines corrected to the TRUE post-Phase-2 state).** Canon's v8.70 *headers* assert
*"37 tables, 16 GAPs, serve()=25/25, All 7 Layers intact"* — but two of those figures are **stale**: they
were frozen at ~Phase-2 Sprint 3 and never updated as S4–S9 landed. The **real current state** (verified
via `scripts/qa/inngest-serve-manifest.txt` and the schema at Phase-2 completion) is **serve()=40** and
**71 tables** (34 Phase-1 baseline + 37 Phase-2). The "37" in canon is the *Phase-2-only* count stated as
if it were the platform total; the "25" is simply out of date. **The deltas below are unchanged (+3 tables,
+3 functions, +1 GAP) — only the BASELINES are corrected.** This work still changes **three** invariants.
**Stated, not smuggled:**

| Invariant | Before (TRUE current) | After | Note |
|---|---|---|---|
| **Layers** | 7 | **7 — UNCHANGED** | This is Layer 1 extended. **No Layer 8. No new colour token.** |
| **GAPs** | 16 | **17** | **+1: GAP 17 — AI Crawler Verification & Referral Attribution.** (AA-C12: GAPs are canon's numbered *feature* gaps; none covered crawler traffic/verification/referral. This IS a new one — declare it, don't hide it.) |
| **Tables** | **71** (34 P1 + 37 P2) | **74** | +3: `ai_bot_registry`, `ai_bot_ip_ranges`, `ai_referral_hits`. **(`crawler_visit_logs` is ALTERed, not added.)** ⚠️ **Baseline was mis-stated as 37 (Phase-2-only) in v1.0–v1.3.** |
| **serve()** | **40** | **43** | +3 fns (§10). ⚠️ **Baseline was 25 in v1.0–v1.3 — canon's stale figure.** Source of truth is `scripts/qa/inngest-serve-manifest.txt`, NOT a hard-coded literal (a literal "25" survived ~15 additions unnoticed — do not reintroduce one). *(The Visit API is a route, not a function — canon precedent, line 947.)* |
| **Migrations** | — | +1 | Idempotent (`IF NOT EXISTS` + `DROP POLICY` guards), **applied to BOTH `visibleau` and `visibleau_prod`, verified with psql.** The dev-applied/prod-missing gap has bitten **5+ times** (S5×2, S6, S7, S8 — the S8 instance took every brand route down). |

> **Note (AA-E1):** the §0.2 / §0.2b conflict ledgers below quote canon's "37 tables / serve()=25/25" as
> the figures reconciled against *at audit time* — those are **retained as historical record** and are
> correct as history. This §9 baseline correction applies to the *live current-truth* delta only. The
> root cause (v8.70's stale header figures) is a **canon-sync** item tracked separately against v8.70
> itself; it is not an Agent Analytics design error.

---

## §10. EVENTS (Inngest — **dot-form external, slash-form internal**)

| Event | Producer | Consumer |
|---|---|---|
| `crawler-log/uploaded` *(slash, internal)* | upload route | `parse-crawler-log` |
| `crawler-hits/ingested` *(slash, internal)* | Visit API + parser + Logpush collector | `verify-crawler-hits` |
| `crawler.impersonation-detected` *(**dot, external**)* | `verify-crawler-hits` | **fanout-webhooks (WH-01) — add to `VALID_EVENTS` + `EVENT_NAME_MAP`** |

**Functions (+3 → serve()=43, per the corrected §9 baseline):** `parse-crawler-log` · `verify-crawler-hits` · `refresh-bot-ip-ranges` (daily
cron: fetch each `cidr_source_url`, diff `version_hash`, insert, mark old `is_current=false`, **retain previous**,
alert on schema surprise). *(Retention is the existing RT-01 cron — extended, not added.)*

**AA-21 — the dot-vs-slash trap (this cost S7 dearly):** in S7, `run-audit` emitted `audit.complete` (dot) while
four functions listened on `audit/complete` (slash) — **they silently never fired**, and every test passed. A
repo-wide **dot-vs-slash convention guard now exists: it MUST be extended to cover these events**, and **a real
ingestion run with a terminal read is mandatory verification.** Greps cannot prove an event chain fires.

---

## §11. SECURITY / PRIVACY / RLS (canon-binding)

- `ai_referral_hits` → direct-`organization_id` RLS (USING + WITH CHECK); cross-org → **404 not 401**;
  `setRlsContext(db, orgId)` before every query; `assertBrandAccess()` on every route.
- `ai_bot_registry` + `ai_bot_ip_ranges` are **global reference data** — read-only to users, operator-seeded, **no
  org scoping** (mirrors `org_feature_flags`' operator-set-only pattern).
- **Collector endpoints reuse the Visit API's hardening (SEC-A + SEC-B).** Do not write a new unauthenticated
  endpoint from scratch — extend the proven one.
- **AA-12 privacy:** non-AI-bot traffic never persisted. Human PII never stored — bot `source_ip`s are
  infrastructure addresses, not people. `ai_referral_hits` holds **aggregate counts only**, never sessions.
- **Layer 7:** add `data_residency_log` rows for the new tables; log AA config changes to `audit_trail` via
  `recordAction`.

---

## §12. SPRINT SPLIT (2 sprints, ~8h/wk)

### **P3-S1 — Verification + Ingestion** (the plumbing; **no new UI**)
- ALTER `crawler_visit_logs` (§2.1) + the 3 new tables (§2.2–2.4) + **1 idempotent migration → BOTH DBs, psql-verified.**
- Seed `ai_bot_registry` (§2.2) **on both DBs**; `refresh-bot-ip-ranges` daily job.
- Verification engine (§3): CIDR → FCrDNS → ASN, 3-state verdict, 24h tuple cache. Extend `visit-classifier.ts`.
- Ingestion: extend the **Visit API** for `source_ip`/`ingest_source`; build **log upload** (P1); Logpush (P2) if it fits.
- **Acceptance:** upload a real Metropolitan Plumbing log → hits land, classified per canon's taxonomy, verified/
  unverified/spoofed correctly assigned. **Prove it: seed a deliberately spoofed UA and confirm it is caught.**
  Re-upload the same file → **no duplicates** (AA-02).

### **P3-S2 — Attribution + Surfaces**
- `ai_referral_hits` + GA4/referrer/UTM ingestion.
- Metrics (§5): ratio + benchmark + **AA-13 caveat**, purpose split, top pages, coverage gap, 5xx,
  robots-violations, unverified rate, **the CDN Shield join (§5.3)**, fetch-precedes-citation correlation.
- **§7.0 first:** **BUILD** the crawler card — §7.0 confirmed it does not exist (an orphan-reader table since S6);
  a one-line grep is a sanity check only, not a branch point. Retrieval-hub AA section + setup panel. Tier gate (§8) —
  **and fix the carried Free-tier leak.**
- Action Center task emission (§6). The dot-form webhook event (**AA-21: extend the guard**).
- **Acceptance:** the ratio renders **with its honesty caveat**; the CDN-Shield join produces ≥1 real finding on
  Metropolitan Plumbing; **verified on the RENDERED screen** (canon lesson: greps/tests passing ≠ works on
  screen — S7 shipped 7 bugs behind 44 green tests).

---

## §13. HONEST LIMITATIONS (state these IN the product — AA-22)

1. **Referral attribution is structurally incomplete** (no referrer from mobile AI apps; AI Mode = `noreferrer`).
   The referral side is a **lower bound**; the true ratio is better than shown.
2. **A crawl is not a citation.** High GPTBot volume ≠ appearing in ChatGPT. Crawls tell you *access*, not
   *influence*. (Which is why the Layer-2 citation join matters — VisibleAU has both halves.)
3. **Training-bot volume is mostly noise for AEO.** It is a content-rights signal. Do not let a big `training`
   number look like good news.
4. **Coverage is only as good as the log source.** No CF, no server access, no snippet → we have nothing, and we
   **say so plainly** rather than show an empty chart that implies "no bots visited."
5. **The bot list ages.** New bots monthly, UA strings change quarterly. The registry table + a documented refresh
   cadence is the mitigation — not a claim of completeness.

**These limitations are a feature.** The category is full of tools presenting modelled numbers as counts. The
tool that draws the line clearly is the one an AU agency trusts in front of a client.

---

## §14. OPEN QUESTIONS FOR SRI

- **OQ-A1 — RESOLVED (AA-C10 + AA-P3).** Two facts, both true: Free-org crawler data is *retained* (LLD 3198),
  but the Retrieval *surface* is `minTier:'Starter'` (prototype FIX17). So the analytics UI is **Starter+**, not
  Free. Paid line: **Starter** = visits + verification; **Growth** = ratio + CDN-join. *Sri to confirm the line.*
- **OQ-A2 — Dedup index.** Verify the proposed unique index (§2.1) doesn't collide with the Visit API's existing
  write pattern. If it does → dedup in the parser instead. **Check before applying.**
- **OQ-A3 — RESOLVED (AA-C13): it was NEVER BUILT.** Prototype FIX17 has no crawler UI. `crawler_visit_logs` has
  been an **orphan-reader table since S6** — data written, never displayed. AA delivers it. *No longer blocking.*
- **OQ-A4 — WordPress plugin.** Most AU SMBs are WordPress; a plugin would be the widest-coverage ingestion path
  — but it is a **new artefact class** (distributed, versioned, supported). *Reviewer recommends: **defer to
  v1.2**, unless Sri wants it as the GTM wedge.*
- **OQ-A5 — Retention.** Keep the flat 90 days (RT-01) — or vary by tier? Varying means updating the retention
  cron **and** `data_residency_log` together. *Reviewer recommends: **keep 90 flat** for v1.*
