# VisibleAU Phase 3 — SPRINT 2 PROMPT: Agent Analytics — Attribution + Surfaces
# Version: 1.0 | Built against: Agent Analytics LLD v1.5 + Phase 2 LLD v8.70 (canon) | Sprint: P3-S2 of 2
# Source anchors: AA LLD §2.4 (ai_referral_hits), §5 (metrics), §5.3 (CDN Shield join — the
#   differentiator), §6 (Action Center), §7 (UI — §7.0 the never-built S9 card), §8 (tiering),
#   §13 (limitations). Canon: crawler_visit_logs, CDN Shield (S6), Retrieval tab minTier:'Starter'
#   (FIX17 ~1051), remediation_tasks + explainability contract, referrer_ai_session.
#   NOTE: line numbers are navigational — open the region; the LLD wins.

═══════════════════════════════════════════════════════════════════════════════

## 0. READ FIRST — CONTEXT & CONVENTIONS

### 0.1 What P3-S2 is
The **attribution half + all the UI**. P3-S1 shipped the plumbing (verification + ingestion). This sprint
adds the **human-referral side** (`ai_referral_hits` ingestion), the **metrics** (the crawl-to-referral
ratio, the CDN-Shield join, coverage gap, etc.), and **every surface** — including **the crawler card
that Sprint 9 was supposed to build but never did** (§7.0).

⚠️ **§7.0 FIRST (AA-C13 — a real finding):** Prototype FIX17 contains **ZERO** crawler UI.
`crawler_visit_logs` has been collecting data **since S6 with no screen to read it** — an **orphan-reader
table** (the mirror of canon's own §1816 "orphan tables — data_residency_log has no writer" finding).
**Agent Analytics is not extending an existing card — it is DELIVERING the S9 promise that was never
kept.** (§7.0 already verified this and closed it as a resolved finding, not an open question.) A quick
`grep -rn "Crawler\|crawler" <prototype>` returns no
crawler-analytics component. **§7.0 has already RESOLVED this — the card does NOT exist.** The grep is a
sanity check only; the instruction is **BUILD**, not "investigate and decide." Do not graft onto some other
card — there is nothing to extend; build the crawler card fresh per §7.0/§7.1.

### 0.2 Prerequisites & the cross-sprint contracts (required this sprint)
- **P3-S1 must be complete:** `crawler_visit_logs` has `verification_status`; `ai_referral_hits` table
  exists (created in S1, populated here); the registry is seeded; verification runs.
- **CDN Shield exists** (Layer 1, S6) — it produces a per-vendor blocked/allowed **diagnosis**. ⚠️ **The
  join (§5.3) needs BOTH halves** — Shield's diagnosis AND the logs' observed reality. Confirm the Shield
  data shape before building the join.
- **`lib/crawler/index.ts`** (the canonical crawler) — reused for the coverage-gap metric (sitemap fetch).
- **Layer-2 citation data** exists — reused for the fetch-precedes-citation correlation (AA-14).
- **remediation_tasks + the explainability contract** `{ rationale, confidence_label, confidence_note,
  top_action }` exist — reused; NO new task system (§6).
- **The Retrieval tab** is `{ id:'retrieval', minTier:'Starter' }` in BrandIntelTabs (FIX17 ~1051).
  ⚠️ **The AA surface is a SECTION INSIDE that tab — NOT a new route or tile** (AA-P2).

### 0.3 Verify you are on the right LLD before starting
Open `Agent Analytics LLD v1.5`. Confirm §8 tiering reads **surface = Starter (the tab's minTier);
ratio + CDN-join = Growth (TierGate overlays inside the tab)** — NOT "Free." (v1.2 wrongly said Free;
AA-P3 corrected it in v1.3.) Confirm §5.1 ratio is **per-vendor** (AA-P8), never per-bot.

### 0.4 SHARED CONVENTIONS (binding)
- **Tier source-of-truth = `subscriptions.tier`. NEVER `organizations.tier`.**
- **Two DBs:** every migration/seed → BOTH `visibleau` AND `visibleau_prod`, psql-verified. (5+ prior
  failures; S8 took every brand route down.)
- RLS: direct-`organization_id`; cross-org → **404 not 401**; `setRlsContext` before every query;
  `assertBrandAccess` on every brand route.
- **UI (canon-binding):** no hex-alpha on `var()`; **responsive**; loading = skeletons, error = boundary,
  **never blank**; `prefers-reduced-motion` honored (the FIX15 motion-safety reset); existing
  `--layer-retrieval` token — **NO new colour** (AA-C4); Better Auth (no Clerk).
- **Envelope discipline (the S9 dominant bug):** if a route returns `{key:[...]}`, the client must read
  `body.key`, NOT `Array.isArray(body)`. ⚠️ A bare-array read on a wrapped envelope silently drops the
  data → a plausible empty state, no crash, no test failure. **This bit S9 repeatedly.**
- **null-vs-zero:** use `!= null`, NEVER truthy (`x && …` / `?? 0`) when a real 0 is meaningful (F11/F-4/
  G-2 class — fabricated zeros). "Never measured" (NULL) ≠ "measured zero."

### 0.5 The structural rules P3-S2 introduces (copy EXACTLY)
- **`ai_referral_hits.source`** ∈ `ga4 | log_referrer | utm`. **`session_count` AGGREGATE ONLY** (privacy).
- **6 new `remediation_tasks` types** (§6): `unblock_retrieval_bot`, `fix_5xx_for_bots`,
  `add_sitemap_for_ai`, `thin_content_never_crawled`, `investigate_impersonation`,
  `robots_violation_needs_edge_rule`. Each carries the explainability contract; `confidence_note` MUST
  carry the AA-13 caveat wherever the referral side is involved.
- **The ratio** = `verified_crawls(vendor) / referral_sessions(ai_platform)`. **Per-vendor** (AA-P8).
  `0 visitors sent` when denominator is 0 — **NEVER `∞`, never divide-by-zero.**
- **CDN-Shield join = exactly 4 verdicts** (§5.3): `healthy` · `not_blocked_never_visited` ·
  `self_blocked` · `robots_violation`. No fifth, none missing.

### 0.6 OPEN QUESTIONS (resolve with Sri before building the affected part)
- **OQ-A4 — WordPress plugin** as a wider ingestion path: reviewer recommends **defer** unless Sri wants
  it as the GTM wedge. Not this sprint.
- **GA4 ingestion mechanics** — confirm the auth path (a client connecting GA4 is a new OAuth surface).
  If it's heavy, ship `log_referrer` + `utm` first (they reuse P3-S1's log pipeline) and stage GA4.

---

## 1. WHAT SHIPS THIS SPRINT
1. **`ai_referral_hits` ingestion** — GA4 / referrer / UTM → the human side.
2. **Metrics (§5)** — crawl-to-referral ratio (+ benchmark + AA-13 caveat), volume by vendor/purpose,
   top pages by purpose, coverage gap, 5xx-for-bots, robots-violations, unverified/spoofed rate,
   fetch-precedes-citation correlation.
3. **The CDN-Shield join (§5.3)** — the differentiator; 4 verdicts.
4. **§7.0: BUILD the S9 crawler card** that was never delivered — the canon-spec'd retrieval/indexing/
   training display + the new verified/unverified/spoofed split + the ratio inline.
5. **Retrieval-hub "Agent Analytics" section** — volume time series, purpose pie, vendor table, top
   pages, coverage gap, the CDN-Shield join table.
6. **Setup/connect panel** — the 3 ingestion paths (upload / snippet / Logpush) with live "received N
   hits" confirmation.
7. **Tier gating (§8)** — surface Starter+ (tab minTier); ratio + CDN-join Growth (TierGate overlays).
8. **Action Center task emission (§6)** — the 6 new remediation_task types.

**No serve() change** (the functions shipped in S1). **+0 tables** (`ai_referral_hits` shipped in S1).
This sprint is metrics + UI + the referral ingestion path.

---

## 2. DEPENDENCIES TO INSTALL
- Charting: **reuse the existing chart components** from FIX17 (the visibility/trust surfaces already
  chart) — do NOT add a new chart lib.
- GA4: the Google Analytics Data API client (only if GA4 ingestion ships this sprint; otherwise none).

## 3. ENVIRONMENT VARIABLES (additions)
- GA4 OAuth client credentials (only if GA4 ingestion ships). `log_referrer`/`utm` need none.

## 4. PROJECT STRUCTURE ADDITIONS
```
lib/agent-analytics/
  metrics.ts                    — ratio, volume, top-pages, coverage-gap, 5xx, robots-violations
  cdn-shield-join.ts            — the §5.3 join (4 verdicts)
  referral-ingest.ts            — GA4/referrer/UTM → ai_referral_hits
  fetch-precedes-citation.ts    — the Layer-2 correlation (AA-14, correlation NEVER causation)
inngest/functions/
  ingest-ai-referrals.ts        — event: referrals/ingest (or a cron for GA4 pull)
app/(auth)/brands/[brandId]/  (WITHIN the existing Retrieval tab — NOT a new route)
  — the Agent Analytics section components (see §6U)
app/api/brands/[brandId]/agent-analytics/
  overview/route.ts             — the crawler card + ratio data
  cdn-join/route.ts             — the §5.3 join (Growth-gated)
  coverage/route.ts             — coverage gap
  referrals/connect/route.ts    — GA4/UTM setup
```
# BACKWARD EDITS:
# - BrandIntelTabs Retrieval tab content — ADD the Agent Analytics SECTION (not a new tab)
# - remediation_tasks type enum — ADD the 6 new types (§6)
# - the Action Center task emitter — emit the 6 new types from AA findings
# - (NO new serve() functions — they shipped in P3-S1)

---

## 5. DATABASE SCHEMA
**No new tables** — `ai_referral_hits` shipped in P3-S1. This sprint only:
- ⚠️ **ADD the 6 new `remediation_tasks` types** to the type enum/check. Idempotent migration → BOTH DBs,
  psql-verified.
- Populate `ai_referral_hits` via the ingestion path (§6.3).
- Confirm the `ai_referral_hits` RLS from S1 is enforced (cross-org → 404).

---

## 6. LIB MODULES

### 6.1 `metrics.ts` (LLD §5)
- **Ratio (§5.1):** per-vendor `verified_crawls / referral_sessions`. ⚠️ `verified` only (AA-05).
  ⚠️ `0 visitors sent` on zero-denominator — never `∞`. Benchmark against public figures (ClaudeBot
  ≈38,000:1, GPTBot ≈887:1).
- **Volume by vendor / by `visit_purpose`** (the "78% training bots" pie).
- **Top pages by purpose** — `retrieval` (`is_active_agent=true`) = "a human is reading this through AI
  now" (canon's framing).
- **Coverage gap** — sitemap pages (via `lib/crawler/index.ts`) NO AI bot has fetched.
- **5xx-for-bots** — spike = you're the bottleneck.
- **Robots violations** — `respects_robots=false` families fetching disallowed paths → a finding, feeds
  the CDN join.
- **Unverified/spoofed rate** per vendor (AA-05).

### 6.2 `cdn-shield-join.ts` (LLD §5.3 — THE DIFFERENTIATOR)
Cross-reference CDN Shield's diagnosis × the logs' reality → **exactly 4 verdicts:**
| Shield | Logs | verdict |
|---|---|---|
| allowed | crawling | `healthy` |
| allowed | never_seen | `not_blocked_never_visited` (discoverability problem) |
| blocked | never_seen | `self_blocked` (invisible by your own config — highest-value → Action Center) |
| blocked | crawling | `robots_violation` (bot ignores your rules → edge/WAF) |
⚠️ **No fifth state, none missing.** ⚠️ **Needs BOTH halves** — a bot tool has logs but no diagnosis;
a diagnostic tool has no logs. **This is why AA lives inside VisibleAU.**

### 6.3 `referral-ingest.ts`
GA4 / `log_referrer` / `utm` → `ai_referral_hits`. ⚠️ **AGGREGATE counts only** — never per-session.
⚠️ **AA-07:** never sum with crawler visits; separate table, separate meaning.

### 6.4 `fetch-precedes-citation.ts` (AA-14)
Correlate retrieval/indexing crawls on a URL with Layer-2 citation data for the same URL ~2–4 weeks
later. ⚠️ **Present as CORRELATION, NEVER causation.** A standalone bot tool can't do this — no citation
data. VisibleAU has both halves.

---

## 6U. UI SPECIFICATION (Layer 1 / Retrieval — `--layer-retrieval`, NO new colour)

### 6U.0 ⚠️ Build the S9 crawler card first (§7.0, AA-C13)
The canon-spec'd display that was never built: `retrieval` 🟢 *"AI recommended you in 47 live
conversations this month"* / `indexing` 🔵 / `training` ⚪ — **plus** the verified/unverified/spoofed
split and the crawl-to-referral ratio (AA-13 caveat inline). ⚠️ **Use a COUNT card, not a score card**
(AA-P7: a score card's bar fills value/max → a permanently-100%-full bar that reads as "perfect score"
for a raw count). Lives in the Retrieval tab (Starter+).

### 6U.1 Retrieval-hub "Agent Analytics" section (WITHIN the tab, AA-P2 — not a new hub)
Volume time series (stacked by `visit_purpose`), purpose pie, vendor table (with a 5xx column, AA-P9),
top pages, coverage gap, **the CDN-Shield join table**. ⚠️ **The ratio card carries the AA-13 honesty
caveat ON the card** (not buried): *"referral is a lower bound — the true ratio is better than shown."*
⚠️ **Unverified-rate alert** (AA-P10): unverified > 25% for a vendor over 1h → surface it (a sellable
finding). ⚠️ **VerificationSplit shows all 3 states separately** — never merge unverified/spoofed into
the headline (AA-05).

### 6U.2 Setup/connect panel
The 3 ingestion paths (upload / snippet / Logpush) with live "received N hits." ⚠️ **Empty states are
findings:** configured + zero hits → *"Connected — no AI crawler has visited yet. This is itself a
finding: the site may not be discoverable to AI. Check Retrieval + CDN Shield."* Not-configured → setup
CTA. Loading → skeleton. Error → boundary. **Never blank.**

### 6U.3 Nav (AA-17)
⚠️ **NO new brand-page tile** — Retrieval's tile exists. **But nav-orphan has shipped 4× (S5 Trust, S6
Retrieval, S7 Discovery, /settings/notifications).** Whatever route is added MUST be covered by the
repo-wide set-difference nav guard before the sprint closes.

---

## 7. (No CLI changes this sprint.)

## 8. INNGEST / WEBHOOK WIRING
- `ingest-ai-referrals` — GA4 pull (cron) or `referrals/ingest` event. ⚠️ If it's a new function,
  serve() 43→44 and update the manifest; if referral ingestion piggybacks an existing route, no serve()
  change. **State which in the report.**
- The Action Center emitter — emit the 6 new remediation_task types from AA findings. ⚠️ **The
  `self_blocked` CDN-join verdict → an `unblock_retrieval_bot` task** (highest-value).
- ⚠️ **AA-21:** if any new event is added, slash internal / dot external; extend the dot-vs-slash guard;
  a terminal-read real run confirms it fires.

## 9. API ROUTES
All under `app/api/brands/[brandId]/agent-analytics/` — Better Auth + `setRlsContext` + `assertBrandAccess`
+ `assertTier`. Cross-org → 404. ⚠️ **Tier split (§8):** the crawler card + verification = **Starter**;
the **ratio route + CDN-join route = Growth**. ⚠️ **The LLD §8 specifies the gate as a `TierGate` overlay
(client entitlement) inside the Starter tab** — that is the normative mechanism; build it. **Recommended
hardening BEYOND the LLD (not in §8, but the F28 lesson):** also enforce `assertTier('growth')` **server-side**
on these two routes — a client-only gate is cosmetic (in Phase 2, the entire paywall was a CSS blur with
6/9 routes ungated server-side). Flag to Sri that this is an addition to the LLD's spec, not the LLD's own
requirement.

---

## 10. CLAUDE CODE PROMPT (paste this to open P3-S2)
> Build VisibleAU Phase 3 Sprint 2 (Agent Analytics — Attribution + Surfaces) per Agent Analytics LLD
> v1.5 §5–§8. P3-S1 (verification + ingestion) must be complete.
> 1. Read AA LLD v1.5 §5 (metrics), §5.3 (CDN-Shield join), §7 (UI — §7.0: the S9 crawler card does NOT
>    exist; §7.0 already resolved this — BUILD it, don't re-investigate), §8 (tiering: surface Starter, ratio+CDN-join Growth).
> 2. ⚠️ §7.0 FIRST: BUILD the crawler card (§7.0 confirmed it does not exist — grep is a sanity check only, not a branch) — a COUNT card, not a
>    score card (AA-P7). retrieval/indexing/training + the verified/unverified/spoofed split + ratio.
> 3. Build metrics.ts (ratio per-vendor, verified-only, 0-visitors not ∞; volume; top pages; coverage
>    gap; 5xx; robots-violations; unverified rate) + cdn-shield-join.ts (exactly 4 verdicts).
> 4. Referral ingestion → ai_referral_hits (aggregate only; never summed with crawls). Migration for the
>    6 new remediation_task types → BOTH DBs, psql-verified.
> 5. Retrieval-hub AA section (WITHIN the tab, not a new hub/route) + setup panel. ⚠️ AA-13 caveat ON the
>    ratio card; empty states are findings; envelope-unwrap discipline (read body.key not
>    Array.isArray); !=null not truthy for real-0.
> 6. Tier gate: build the LLD's `TierGate` overlay (§8, the normative mechanism). RECOMMENDED beyond the
>    LLD (F28 lesson — a client-only gate is cosmetic): also `assertTier('growth')` server-side on the ratio +
>    CDN-join routes. (Flag this addition to Sri.)
>    (F28). Nav guard covers any added route.
> 7. Then §11 tests + §12 greps. ⚠️ Acceptance: the ratio renders WITH its caveat; the CDN-join produces
>    ≥1 real finding on Metropolitan Plumbing; verified on the RENDERED screen (greps/tests ≠ works on
>    screen — S7 shipped 7 bugs behind 44 green tests).

---

## 11. TESTS REQUIRED (LLM_MODE=mock) — the 5-section track

**§11.1 Backend Unit**
- Ratio: per-vendor; verified-only (unverified excluded); zero-denominator → "0 visitors sent" string,
  NOT `∞`, NOT a throw. ⚠️ **Break-proof:** feed 100 verified + 50 unverified crawls, 2 referrals → ratio
  uses 100/2, NOT 150/2. Change the query to count all statuses → test goes RED (proves AA-05 enforced).
- CDN-join: each of the 4 (Shield×Logs) input pairs → the correct verdict; a 5th combination → handled,
  no crash. ⚠️ **Break-proof:** `blocked + crawling` MUST be `robots_violation`, not `healthy`.
- Coverage gap: sitemap of 10, 6 crawled → 4 in the gap. Top-pages: retrieval hits ranked correctly.
- Referral ingest: GA4/referrer/UTM rows → correct `ai_platform` normalisation; ⚠️ never summed with
  crawler_visit_logs (assert they're separate reads).

**§11.2 Backend Integration (real DB)**
- The 6 new remediation_task types insert; the explainability contract is non-null; ⚠️ `confidence_note`
  carries the AA-13 caveat on referral-involved tasks.
- `self_blocked` CDN-join verdict → an `unblock_retrieval_bot` task is emitted.
- `ai_referral_hits` RLS: a cross-org read → 404 (not 401, not a leak).
- ⚠️ **Envelope proof:** each AA route returns its documented envelope shape; a test asserts the client
  reads `body.<key>`, and that swapping to `Array.isArray(body)` yields empty (the S9 regression guard).

**§11.3 Walk regression guards** — one guard per finding above, RED if reintroduced. ⚠️ **Includes a
guard that the tier gate is enforced SERVER-side** (disable `assertTier` on the ratio route → the route
returns 200 with the Growth payload → RED; the F28 behavioural proof, not a grep).

**§11.4 Frontend Unit**
- The crawler card renders as a COUNT card (no score bar / no 100%-full bar — AA-P7).
- The ratio card renders the AA-13 caveat text (assert it's present, not buried).
- VerificationSplit renders 3 separate states; the >25% unverified alert appears when the mock crosses
  the threshold.
- Empty state (zero hits) renders the "this is itself a finding" copy, not a blank.
- ⚠️ **null-vs-zero:** a NULL metric renders "not yet measured"; a real 0 renders "0" — assert they
  differ (F11/F-4/G-2 class).

**§11.5 E2E — ⚠️ the mandatory real run**
On Metropolitan Plumbing (prod, 19 audits): open the Retrieval tab → the Agent Analytics section renders
with real data. ⚠️ **The ratio renders WITH its honesty caveat.** ⚠️ **The CDN-Shield join produces ≥1
real finding** (Metropolitan has real crawl + Shield data). ⚠️ **Verify on the RENDERED screen** — build
the DB answer key first (what SHOULD the ratio/verdicts be), then confirm the pixels match. As Growth,
the ratio + CDN-join show; as Starter, they're TierGate-locked; as Free, the tab itself is locked.
**Watch the terminal** on any ingestion/emit.

---

## 12. VERIFICATION GREPS
```bash
# the 6 new task types exist
grep -rn "unblock_retrieval_bot\|fix_5xx_for_bots\|add_sitemap_for_ai\|thin_content_never_crawled\|investigate_impersonation\|robots_violation_needs_edge_rule" db/ lib/
# CDN join = exactly 4 verdicts (no 5th, none missing)
grep -rn "healthy\|not_blocked_never_visited\|self_blocked\|robots_violation" lib/agent-analytics/cdn-shield-join.ts
# ratio: verified-only + no divide-by-zero
grep -rn "verified\|visitors sent\|=== 0\|denominator" lib/agent-analytics/metrics.ts && ! grep -rn "Infinity\|/ 0" lib/agent-analytics/metrics.ts
# ratio is per-vendor (AA-P8), not per-bot
grep -rn "vendor\|ai_platform" lib/agent-analytics/metrics.ts && ! grep -rn "crawler_name.*ratio\|ratio.*crawler_name" lib/agent-analytics/metrics.ts
# AA-13 caveat present on the ratio card
grep -rn "lower bound\|better than shown\|structurally incomplete\|Direct" app/ | grep -i "referral\|ratio\|caveat\|honesty"
# ⚠️ tier gate at BOTH levels (server + client) — F28 lesson
grep -rn "assertTier.*growth\|assertTier('growth')" app/api/brands/\[brandId\]/agent-analytics/cdn-join app/api/brands/\[brandId\]/agent-analytics/*ratio*
grep -rn "TierGate" app/ | grep -i "ratio\|cdn\|join"
# the AA surface is a SECTION in the Retrieval tab, NOT a new route/tile (AA-P2)
! grep -rn "id: 'agent-analytics'\|minTier.*agent" <prototype/tabs>   # no new tab
# COUNT card not score card (AA-P7)
grep -rn "CountCard\|count-card" app/ && ! grep -rn "IntelCard.*max={value}\|score.*max.*value" app/  # no self-filling bar
# envelope discipline: client reads body.key, not Array.isArray on a wrapped envelope
grep -rn "Array.isArray" app/ | grep -i "crawler\|referral\|agent-analytics"   # review each hit
# null-vs-zero: != null, not truthy, where real-0 matters
grep -rn "!= null\|!== null" lib/agent-analytics/ app/ | grep -i "crawl\|verif\|referral"
# nav guard covers any added route (AA-17)
grep -rn "agent-analytics\|crawler" scripts/qa/*nav* 2>/dev/null
# NO new colour token / layer (AA-C4)
! grep -rn "layer-8\|--layer-agent\|Layer 8" .
# reduced-motion honored (FIX15)
grep -rn "prefers-reduced-motion" app/ styles/ 2>/dev/null
```

---

## 13. COMMON PITFALLS (anti-patterns — do NOT do these)
1. ⚠️ **Migration to dev only, not prod.** BOTH DBs, psql-verified. (5+ failures; S8 outage.)
2. ⚠️ **Envelope-unwrap** — `Array.isArray(body)` on a `{key:[...]}` envelope → silent empty state. The
   S9 dominant bug. Read `body.key`.
3. ⚠️ **null-vs-zero** — truthy checks treating a real 0 or NULL the same → fabricated zeros (F11/F-4/G-2).
   Use `!= null`. "Never measured" ≠ "zero."
4. ⚠️ **Client-only tier gate** — F28: the entire Phase 2 paywall was a CSS blur with 6/9 routes ungated
   server-side. Enforce `assertTier` SERVER-side AND `TierGate` client-side.
5. ⚠️ **Counting unverified/spoofed in the ratio.** AA-05: verified only. A tool reporting spoofed traffic
   as real is worse than no tool.
6. ⚠️ **Divide-by-zero / `∞` in the ratio.** Zero-denominator → "0 visitors sent."
7. ⚠️ **Per-bot ratio instead of per-vendor** (AA-P8).
8. ⚠️ **Burying the AA-13 caveat.** It goes ON the ratio card. VisibleAU's honesty is the differentiator.
9. ⚠️ **A score card for raw counts** (AA-P7) — the 100%-full bar reads as a perfect score.
10. ⚠️ **A new route/tile for AA** instead of a section in the Retrieval tab (AA-P2). And any route added
    must be in the nav guard (nav-orphan shipped 4×).
11. ⚠️ **Summing crawls + referrals** (AA-07) — separate tables, separate meaning; conflating them is the
    most common error in this space.
12. ⚠️ **Presenting fetch-precedes-citation as causation** (AA-14). It's correlation.
13. ⚠️ **greps/tests green ≠ works on screen.** S7 shipped 7 bugs behind 44 green tests. Build the DB
    answer key, open the real screen, watch the terminal.
14. ⚠️ **A blank chart implying "no bots visited"** when the truth is "no log source" (AA-22 limitation
    #4) — say so plainly.
