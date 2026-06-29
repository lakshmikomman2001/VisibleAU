# VisibleAU Phase 2 — Sprint 6 ENHANCEMENT: CDN Shield Detector + Remediation Snippet + Tier-0 Hook
# Version: 1.3 | Built against: LLD v8.68 (REVIEWED) + Sprint 6 prompt v1.5 (26 Jun 2026)
# Status: APPLY DURING / IMMEDIATELY AFTER Phase 2 Sprint 6 — NOT BEFORE.
# Scope: net-new delta layered onto the canonical Sprint 6 build. Adds the ONE genuinely-new
#   capability from the Gemini "market-moat" package (CDN firewall detection → customer-facing
#   WAF-bypass remediation snippet → Tier-0 conversion hook). Everything else in the Gemini
#   package was already in canon (see the disposition note at the end) and is NOT applied.
# Author: Sri + Claude (reviewer chat)

> HOW TO USE THIS PROMPT
> This is a SECOND prompt for Sprint 6, applied AFTER `visibleau-p2-sprint-6-prompt.md` v1.5
> has been built and merged (or in the same Sprint-6 session, immediately after it). It does
> NOT replace that prompt. Read §0, then paste §10 into the Claude Code session pointed at the
> VisibleAU repo. §0's Step-0 gate will STOP if the canonical Sprint 6 surfaces it depends on
> aren't present, so it physically cannot be applied against the wrong state.
> When this prompt and the LLD ever disagree, THE LLD WINS and this prompt is the bug.

---

## 0. READ FIRST — WHY THIS IS A SEPARATE PROMPT, AND THE PRE-CONDITIONS

### 0.1 What this enhancement is (and is NOT)
**IS:** three tightly-scoped additions, all inside Sprint 6's existing Layer-1 retrieval surface:
1. `lib/crawler/cdn-shield-detector.ts` — a pure, dependency-free utility that turns the
   **already-fetched** crawl status code + response headers into a `{ isBlockedByCDN,
   detectedFirewall, remediationSnippet }` diagnostic. NO new network call.
2. A wiring change in `content-structure-audit.ts` so that when the existing GPTBot crawl is
   blocked, the detector runs, `crawler_visit_logs.error_type='blocked_cdn'` is written
   (the column already exists, LLD 5225), and the diagnostic surfaces in the retrieval UI.
3. An **optional, separately-gated** Tier-0 sample-audit hook: a lightweight standalone header
   probe (NOT the Playwright crawl) so the anonymous sample audit can show "Cloudflare is
   blocking AI engines → sign up for the bypass rules." This is the conversion moat.

**IS NOT:** any schema change, any new table, any new column, any new Drizzle definition, any
new Inngest function, any new crawler. It adds exactly **one** lib file (+ its test) to the
Sprint 6 build, edits **one** existing Inngest function, edits **one** existing UI component,
and (optionally) edits **one** existing Tier-0 surface. serve() count is unchanged (stays 23
after S6 / 25 after S7).

### 0.2 Why a delta and not folded into the S6 prompt
The canonical Sprint 6 prompt already: (a) builds the one canonical Playwright crawler and
crawls as `GPTBot/1.1` (S-04, LLD 3384–3392); (b) carries the `error_type='blocked_cdn'` column
(LLD 5225); (c) already CONSUMES `error_type='blocked_cdn'` in §8.4a (blocked → all task_*
booleans false) and in §6U.3 (crawler-log table "error highlighting (blocked_cdn …)"). What
canon does NOT have is the **remediation-snippet generation** (the WAF bypass rule text) or the
**Tier-0 conversion hook** — those are the net-new 20% of the Gemini package. This prompt adds
only that delta, on top of the surfaces S6 already built. Keeping it separate means the S6
core stays exactly as Gate-3 audited, and this clearly-labelled enhancement layers cleanly.

### 0.3 STEP-0 GATE — verify the canonical Sprint 6 surfaces exist BEFORE doing anything
Run these. If ANY fails, STOP and finish/repair Sprint 6 first — this enhancement has nothing
to attach to otherwise.
```bash
# (a) The one canonical crawler exists and is the real thing (not a stub):
test -f lib/crawler/index.ts && grep -q "userAgent" lib/crawler/index.ts && echo "OK crawler" || echo "STOP: lib/crawler/index.ts missing or no userAgent param"
# (b) The Sprint 6 content-structure-audit Inngest function exists (the crawl owner we wire into):
test -f inngest/functions/content-structure-audit.ts && echo "OK content-structure-audit" || echo "STOP: content-structure-audit.ts not built — finish S6 first"
# (c) The error_type column exists on crawler_visit_logs (we WRITE 'blocked_cdn', not add it):
grep -rqE "error_type" db/schema/crawler-visit-logs.ts && echo "OK error_type column" || echo "STOP: crawler_visit_logs.error_type missing — it is canonical (LLD 5225); build S6 schema first"
# (d) The detector path is free (no collision — Gemini named a colliding file; we do NOT reuse its name pattern):
test ! -e lib/crawler/cdn-shield-detector.ts && echo "OK path free" || echo "NOTE: cdn-shield-detector.ts already exists — review before overwriting"
# (e) CONFIRM the §8.4a task-fit logic already consumes blocked_cdn (so we are layering, not duplicating):
grep -rqE "blocked_cdn" inngest/functions/score-agent-readiness.ts && echo "OK §8.4a consumes blocked_cdn" || echo "WARN: §8.4a blocked_cdn handling not found — confirm S6 v1.5 landed"
```
Note on naming: Gemini's package put this logic in a file that COLLIDED with the canonical
`lib/platform/local-ai-trust-scorer.ts`. This enhancement deliberately uses
`lib/crawler/cdn-shield-detector.ts` — a path Sprint 6 does NOT otherwise create — so there is
zero collision. Do not place CDN logic in `lib/platform/`.

### 0.4 SHARED CONVENTIONS (binding — same as every Phase 2 sprint)
- **Better Auth** canonical; **zero Clerk**. Page routes `[brandId]`; API routes `[id]`.
- **`subscriptions.tier`**, never `organizations.tier`, for any tier read.
- **Honest-data discipline (non-negotiable here):** a firewall block is asserted ONLY on a
  real signal (a real status code + real headers from the GPTBot crawl). NEVER infer "blocked"
  from the mere PRESENCE of a CDN — a Cloudflare-fronted site that returns 200 to GPTBot is NOT
  blocked. (Gemini's v1 draft had exactly this bug: it set `isBlockedByCDN=true` on any
  Cloudflare header. We do NOT replicate that — block requires a blocking STATUS CODE.)
- **No new runtime deps.** The detector is pure header/string logic. No new packages.
- **UI:** token-driven, `color-mix(in srgb, var(--token) N%, transparent)` (never hex-alpha on
  a var() string, RT-01); the existing retrieval components' style language; ARIA per FIX 13.

### 0.5 The ONE detection rule that must be exact (copy verbatim — it is the honest-data line)
`isBlockedByCDN` is TRUE **only** when BOTH hold:
1. a CDN/edge fingerprint is present in the response headers (Cloudflare: `cf-ray` or
   `server: cloudflare`; Vercel: `x-vercel-id` or `server: Vercel`; Akamai: `server` contains
   `akamai` or an `x-akamai-*` header), AND
2. the GPTBot-UA crawl status code is a block/deny code: **403, 429, or 503** (Cloudflare
   challenge/deny/over-capacity). A **200** to GPTBot is NOT a block, regardless of CDN.
`detectedFirewall` ∈ `'Cloudflare' | 'Akamai' | 'Vercel' | 'Unknown' | 'None'`.
`'Unknown'` = a block status (403/429/503) with NO recognised CDN fingerprint (still actionable
— "an edge security layer is blocking AI crawlers" — but no vendor-specific WAF path).
`'None'` = not blocked (status OK or no CDN). When `'None'`, `remediationSnippet` is the
benign "no block detected" string and `isBlockedByCDN=false`.

---

## 1. WHAT THIS ENHANCEMENT SHIPS
- 1 new pure lib file: `lib/crawler/cdn-shield-detector.ts` (+ `tests/.../cdn-shield-detector.test.ts`).
- An EDIT to `inngest/functions/content-structure-audit.ts`: run the detector on the crawl
  result, persist `error_type='blocked_cdn'` to the crawler_visit_logs row for the crawled
  page(s), and carry the firewall vendor + snippet in the content-structure result / `gaps` JSONB
  (the single UI source — see §3). NO vendor/firewall column on crawler_visit_logs.
- An EDIT to the retrieval UI (the crawler-logs view / RetrievalHub) to render a **"AI Crawler
  Access Blocked"** alert card with the remediation snippet + a copy-to-clipboard button — shown
  only when a block is detected. Gate it to **match the tier of the Sprint 6 crawler-logs /
  retrieval view it lives in** — confirm in the built S6 UI whether that surface is Starter+ or
  Growth+. The block alert is a **passive GPTBot-crawl** output (LLD 3170: passive log import =
  Starter+; `is_active_agent` *active-agent* tracking = Growth+), so it should follow the passive
  crawler-logs tier, NOT the active-agent Growth+ gate — unless S6 deliberately unified them. Do
  not over-gate a useful free-of-active-tracking signal to Growth+ by default. The Tier-0 surface
  (§4) is the public exception.
- **(Optional, separately gated — §4)** an EDIT to the Tier-0 sample-audit flow to run a
  lightweight standalone header probe and show the conversion hook. Only do §4 if §2/§3 are green.
- **No** schema/table/column/Inngest-function/crawler additions. serve() unchanged.
- **GAP coverage:** none new — this DEEPENS the existing GAP-2/Layer-1 "CDN blocking detection"
  (LLD 5191) from a silent signal into a customer-facing diagnostic + conversion surface.

---

## 2. FILE 1 — `lib/crawler/cdn-shield-detector.ts` (pure utility, no DB, no network)
Create the detector as a pure function over `(statusCode, headers)`. It must be safe to call
with lower-cased OR mixed-case header keys (normalise internally — Playwright/undici header
casing varies). It returns the diagnostic; it does NOT touch the DB (the caller persists).

Required shape and behaviour (Claude Code: implement to this contract exactly):
```typescript
// lib/crawler/cdn-shield-detector.ts
export interface FirewallDiagnostic {
  isBlockedByCDN: boolean;
  detectedFirewall: 'Cloudflare' | 'Akamai' | 'Vercel' | 'Unknown' | 'None';
  remediationSnippet: string;
}

const BLOCK_CODES = new Set([403, 429, 503]);
// The canonical AI crawler UA allowlist (one source of truth — reused in the snippet text):
const AI_USER_AGENTS = 'GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|PerplexityBot|Google-Extended|CCBot';

export class CdnShieldDetector {
  /**
   * Pure: turns an already-fetched crawl status + headers into a firewall diagnostic.
   * Honest-data rule: a block requires BOTH a CDN fingerprint AND a block status code.
   * A 200 behind Cloudflare is NOT a block.
   */
  static analyzeHeaders(statusCode: number, headers: Record<string, string>): FirewallDiagnostic {
    // 1. normalise header keys to lower-case once
    // 2. fingerprint the CDN:
    //    Cloudflare: 'cf-ray' present OR server === 'cloudflare'
    //    Vercel:     'x-vercel-id' present OR server === 'vercel'
    //    Akamai:     server includes 'akamai' OR any 'x-akamai-*' header present
    //    else: no recognised CDN
    // 3. isBlockedByCDN = (statusCode ∈ {403,429,503}) AND (a CDN was fingerprinted OR set 'Unknown')
    //    - CDN fingerprinted + block code  → detectedFirewall = that vendor, isBlockedByCDN = true
    //    - block code + NO CDN fingerprint → detectedFirewall = 'Unknown', isBlockedByCDN = true
    //    - not a block code                → detectedFirewall = vendor-if-present else 'None',
    //                                        isBlockedByCDN = false
    // 4. remediationSnippet:
    //    - blocked + a known vendor (Cloudflare/Vercel/Akamai) → vendor-specific WAF allow-rule text (below)
    //    - blocked + 'Unknown'                                 → generic edge-allow guidance (below)
    //    - not blocked                                         → 'No active AI-crawler block detected at the edge/firewall.'
    return /* { isBlockedByCDN, detectedFirewall, remediationSnippet } */;
  }
}
```
Remediation snippet text (Claude Code: implement these exact, plain-text, copy-pasteable
strings — they are the customer deliverable; keep `${AI_USER_AGENTS}` interpolated):
- **Cloudflare:**
  ```
  Cloudflare is blocking AI search crawlers from reading <brand domain>.
  Fix: Cloudflare dashboard → Security → WAF → Custom rules → Create rule.
  Field: User-Agent  |  Operator: contains  |  Value: (GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|PerplexityBot|Google-Extended|CCBot)
  Action: Allow (Skip remaining custom rules).
  Also: Security → Bots → set "AI Scrapers and Crawlers" to Allow (if present on your plan).
  ```
- **Vercel:**
  ```
  Vercel's firewall is blocking AI search crawlers from reading <brand domain>.
  Fix: Vercel project → Settings → Firewall → add an Allow rule for User-Agents matching:
  (GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|PerplexityBot|Google-Extended|CCBot)
  If using Attack Challenge Mode, add these user-agents to the bypass list.
  ```
- **Akamai:**
  ```
  Akamai Bot Manager is blocking AI search crawlers from reading <brand domain>.
  Fix: Akamai Control Center → Bot Manager → add the above AI user-agents to an Allow/Monitor
  category (not Deny). Confirm your edge rules return 200 to GPTBot.
  ```
- **Unknown (block code, no recognised CDN):**
  ```
  An edge security layer is returning a block response to AI search crawlers for <brand domain>.
  Fix: in your CDN/WAF/firewall, allow these user-agents:
  (GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|PerplexityBot|Google-Extended|CCBot)
  ```
Keep the detector **domain-agnostic and pure**: return the snippet with the literal token
`<brand domain>` in it; the caller/UI does the substitution
(`snippet.replace('<brand domain>', brand.domain)`) at render time. Do NOT add a `domain` arg to
`analyzeHeaders` — keeping the function a pure `(statusCode, headers) → diagnostic` mapping is what
makes the §11 snippet assertions deterministic (the tests check for the literal token + the AI
user-agent allowlist; a `domain`-arg variant would make the asserted strings brand-dependent).

---

## 3. FILE 2 — wire the detector into the EXISTING crawl (no new crawl)
Edit `inngest/functions/content-structure-audit.ts` (the Sprint 6 weekly crawl that already
runs `crawlSite(brand.domain, { userAgent: 'GPTBot/1.1' })`, LLD 3385). The crawler already has
the status code + response headers in hand — pass them to the detector. Do NOT add a fetch.

- After the GPTBot crawl returns for the brand's primary URL(s), call
  `CdnShieldDetector.analyzeHeaders(statusCode, headers)`.
- If `isBlockedByCDN`: set `error_type = 'blocked_cdn'` on the `crawler_visit_logs` row for that
  page (the column exists — LLD 5225; do NOT alter the table). Carry `detectedFirewall` +
  `remediationSnippet` in the content-structure result / `gaps` JSONB the UI reads — **as the
  SINGLE source for the UI**. Do NOT also write a vendor/firewall column to `crawler_visit_logs`
  (it has none by canon — only `error_type`), and do NOT add one: a dual write (row column + JSONB)
  creates two sources of truth for the same fact. The row carries the boolean state
  (`error_type='blocked_cdn'`); the JSONB carries the vendor + snippet. Both are regenerable from
  `detectedFirewall` via the pure detector, so no column is needed.
- If `lib/crawler/index.ts` does not currently surface response headers/status to the caller, add
  an OPTIONAL return field (e.g. `crawlSite` returns `{ ..., responseStatus, responseHeaders }`)
  WITHOUT changing existing call sites' behaviour (additive, defaulted) — same additive-contract
  discipline as the rest of Phase 2.
- **Honest-data:** only write `blocked_cdn` on a real block per §0.5. A 200 behind Cloudflare
  writes nothing. Do not fabricate a block to make the hook fire.
- This block detection is ALSO consumed by §8.4a (already built): when the primary pages are
  `blocked_cdn`, the task_* booleans are already forced false. This enhancement does not change
  that; it adds the customer-facing remediation on top.

---

## 4. (OPTIONAL — separately gated) FILE 3 — the Tier-0 sample-audit conversion hook
**Gate:** only do this AFTER §2 + §3 are merged and green. The Tier-0 sample audit
(`slug='sample'`, ChatGPT-only, 90-second, no login — Sprint 10 HC1; AD-02 5-dimension page)
does **NOT** run the Playwright crawl — so it cannot reuse the §3 crawl path. It needs a
**lightweight standalone header probe**:
- In the Tier-0 sample-audit code path, add a single `fetch(brandUrl, { method: 'GET', headers:
  { 'User-Agent': 'GPTBot/1.1' }, redirect: 'manual' })` with a tight timeout (≤5s) and
  `signal` abort — this must NOT slow the 90-second sample budget; run it in parallel with the
  ChatGPT scan, and if it times out, skip silently (no hook shown).
- Pass that probe's `status` + `headers` to `CdnShieldDetector.analyzeHeaders(...)` (reuse the
  same utility — single source of truth).
- If `isBlockedByCDN`, render the conversion hook on the sample results page:
  > "Your AI visibility score is being dragged down by an infrastructure block. **<detectedFirewall>
  >  is silently blocking AI search engines** (ChatGPT, Claude, Perplexity, Google) from reading
  >  your site. Sign up free to get the exact firewall bypass rules for your site." → [Sign up free]
- This is a teaser: show that a block exists + the vendor; the full copy-pasteable WAF rule is
  the post-signup deliverable (Starter+ per the original Gemini framing, or Free — Sri's call;
  default: show the vendor + "blocked" free, gate the exact rule text behind signup).
- **Abuse note:** the probe hits an arbitrary visitor-supplied domain (the sample audit already
  does this for the LLM scan, so the SSRF surface is pre-existing) — reuse whatever domain
  validation the sample audit already applies before fetching; do NOT introduce a new unvalidated
  outbound fetch to a raw user string without that existing guard.

---

## 5. (RECOMMENDED) ALSO RESOLVE — the parked Visit API SEC-A/SEC-B hardening
Not strictly part of the CDN feature, but it's the same Sprint-6 public-endpoint surface and is
currently a known LLD-vs-prompt gap (the S6 prompt §13 records SEC-A/SEC-B as "LLD items for Sri
to decide"; the LLD at 5762–5780 already specifies them as HARDENED v8.67). Since the LLD wins,
apply them to `app/api/visit/route.ts` now so the public endpoint matches canon:
- **SEC-B (do FIRST, before any DB work):** IP-based rate-limit BEFORE the brand-token DB lookup
  (→429), plus a short-TTL (≈60s) negative cache for unknown tokens (return 401 on repeat without
  a SELECT). Prevents un-throttled DB-amplification on an unauthenticated endpoint.
- **SEC-A:** validate `new URL(body.url).host === brand.domain` (or a known subdomain) → 422/drop
  otherwise. A public token holder must not be able to log visits for arbitrary URLs.
- Final step order (LLD 5762–5780): (a) Zod-validate body → (b) SEC-B IP throttle → (c) SEC-B
  negative-cache check → (d) brand-token lookup, 401 if absent (and cache the miss) → (e) SEC-A
  domain check → (f) per-token rate-limit → (g) emit `visit/ingested` → (h) 202.
If you'd rather keep this decision separate, SKIP §5 — it does not block the CDN feature. But do
not ship the public Visit route to production without it.

---

## 10. CLAUDE CODE PROMPT (paste this to apply the enhancement)
> Read this enhancement prompt top-to-bottom, then run the §0.3 STEP-0 GATE. If any gate line
> prints STOP, do not proceed — report which surface is missing and stop.
>
> If all gates pass, implement in this order:
> 1. Create `lib/crawler/cdn-shield-detector.ts` exactly to the §2 contract — a PURE function
>    over (statusCode, headers), honest-data rule from §0.5 (block requires a CDN fingerprint
>    AND a 403/429/503 status; a 200 behind a CDN is NOT a block). Include the exact remediation
>    snippet strings from §2. No DB, no network, no new deps.
> 2. Create `tests/phase2/sprint6/cdn-shield-detector.test.ts` covering: Cloudflare+403 → blocked;
>    Cloudflare+200 → NOT blocked (the honest-data case — assert false); Vercel+403 → blocked,
>    Vercel vendor; Akamai server header+503 → blocked; 403 with no CDN fingerprint → 'Unknown',
>    blocked; nginx+200 → 'None', not blocked; mixed-case header keys → still detected; snippet
>    for each vendor contains the AI user-agent allowlist. Run under LLM_MODE=mock; no real fetch.
> 3. Edit `inngest/functions/content-structure-audit.ts` per §3: run the detector on the
>    already-fetched GPTBot crawl result; on a real block write `crawler_visit_logs.error_type
>    ='blocked_cdn'` (existing column — do NOT alter the table) and carry `detectedFirewall` +
>    `remediationSnippet` in the content-structure result/`gaps` JSONB. If `lib/crawler/index.ts`
>    doesn't surface status/headers, add them as additive, defaulted return fields without
>    changing existing call sites. Do NOT add a new crawl or a new column.
> 4. Edit the retrieval UI (crawler-logs view / RetrievalHub) to show a "AI Crawler Access
>    Blocked" alert card with the remediation snippet + copy-to-clipboard, ONLY when a block is
>    detected; tokens/ARIA per the existing retrieval components (no hex-alpha on var(); use
>    color-mix). Gate it to the SAME tier as the built S6 crawler-logs / retrieval view it lives in
>    (block detection is a passive-crawl output → follow the passive crawler-logs tier per §1; do
>    NOT hard-gate to Growth+ unless S6 deliberately unified them — LLD 3170: passive = Starter+,
>    active-agent = Growth+).
> 5. (Only if steps 1–4 are green) §4 Tier-0 hook: add a ≤5s parallel GPTBot header probe to the
>    sample-audit path (reuse the sample audit's existing domain guard before fetching), feed it
>    to the same detector, and render the conversion teaser on a real block. Skip silently on
>    timeout.
> 6. (Recommended, optional) §5: harden `app/api/visit/route.ts` with SEC-A + SEC-B per the LLD
>    5762–5780 step order. If skipping, say so explicitly in the summary.
>
> CONSTRAINTS: additive only — no schema/table/column/Inngest-function/crawler additions; serve()
> count unchanged. The detector file lives in `lib/crawler/`, NEVER `lib/platform/` (no collision
> with local-ai-trust-scorer.ts). A block is asserted only on a real status+header signal — never
> on the mere presence of a CDN. Then run §12 verification greps and report results.

---

## 11. TESTS REQUIRED
- `tests/phase2/sprint6/cdn-shield-detector.test.ts` — the pure-function cases listed in §10.2.
  The single most important assertion: **Cloudflare header + status 200 → `isBlockedByCDN===false`**
  (proves we did not replicate Gemini's "any CDN = blocked" bug).
- A wiring test (or extend the existing content-structure-audit test) asserting that a mocked
  GPTBot crawl returning 403 + a Cloudflare header causes `error_type='blocked_cdn'` to be
  persisted, and a 200 does not. LLM_MODE=mock; no real network.

---

## 12. VERIFICATION GREPS
```bash
# detector exists, in the RIGHT place (lib/crawler, NOT lib/platform):
test -f lib/crawler/cdn-shield-detector.ts && echo "OK location" || echo "FAIL location"
test ! -f lib/platform/cdn-shield-detector.ts && echo "OK no platform collision" || echo "FAIL: collides with platform"
# honest-data rule present: a block requires a status code, not just a CDN header
grep -qE "403|429|503" lib/crawler/cdn-shield-detector.ts && echo "OK block codes" || echo "FAIL: no block-code gating"
# the AI user-agent allowlist is in the snippet text:
grep -qE "GPTBot.*ClaudeBot.*PerplexityBot|ClaudeBot|PerplexityBot" lib/crawler/cdn-shield-detector.ts && echo "OK UA allowlist" || echo "FAIL: no UA allowlist"
# wired into the EXISTING crawl function, writing the EXISTING column:
grep -qE "CdnShieldDetector|analyzeHeaders" inngest/functions/content-structure-audit.ts && echo "OK wired into crawl" || echo "FAIL: not wired"
grep -qE "blocked_cdn" inngest/functions/content-structure-audit.ts && echo "OK writes blocked_cdn" || echo "FAIL: doesn't persist blocked_cdn"
# NO new table/column was added for the firewall (additive discipline — must find NOTHING):
! grep -rqE "ADD COLUMN.*(firewall|cdn|remediation)" db/ && echo "OK no new columns" || echo "FAIL: a firewall column was added — not allowed"
# NO new Inngest function, serve() unchanged (count should match the post-S6 total, e.g. 23):
grep -c "createFunction\|inngest.createFunction" inngest/ -r 2>/dev/null | tail -1
# the honest-data test case exists (Cloudflare + 200 => not blocked):
grep -qE "200" tests/phase2/sprint6/cdn-shield-detector.test.ts && grep -qE "false|toBe\(false\)" tests/phase2/sprint6/cdn-shield-detector.test.ts && echo "OK 200-not-blocked test" || echo "FAIL: missing the 200-not-blocked test"
# (if §5 applied) Visit API hardened per LLD:
grep -qE "new URL\(.*host|brand\.domain" app/api/visit/route.ts && echo "OK SEC-A" || echo "NOTE: SEC-A not applied (ok if intentionally skipped)"
```

---

## 13. PITFALLS / ANTI-PATTERNS (specific to this enhancement)
- **Asserting a block from a CDN header alone (Gemini v1's bug).** A 200 behind Cloudflare is
  NOT blocked. Block REQUIRES a 403/429/503. This is the honest-data line — violating it floods
  customers with false "you're blocked" alarms and burns trust (the opposite of the moat).
- **Putting the detector in `lib/platform/`.** That collides with `local-ai-trust-scorer.ts`
  (the /100 composite). The detector belongs in `lib/crawler/`. (This is the exact collision the
  Gemini package would have caused — do not recreate it.)
- **Adding a `firewall` / `remediation_snippet` / `cdn_*` column or a new table.** Not needed and
  not allowed — `error_type='blocked_cdn'` already exists; carry vendor + snippet in the result
  payload / `gaps` JSONB, regenerable from `detectedFirewall`. This keeps the change zero-schema.
- **Opening a second crawl / second network fetch in §3.** The GPTBot crawl already ran; reuse
  its status + headers. (The §4 Tier-0 probe is the ONE allowed extra fetch, because Tier-0 does
  not run the Playwright crawl — and it's tightly time-boxed and gated.)
- **Letting the §4 Tier-0 probe slow the 90-second sample budget.** Parallelise it, ≤5s timeout,
  skip silently on timeout. The sample audit's <90s conversion window is sacred (LLD Tier-0 note).
- **Skipping the sample audit's existing domain guard before the §4 probe.** Reuse whatever
  validation the sample flow already applies before fetching a visitor-supplied domain; do not add
  a new raw unvalidated outbound fetch.
- **Showing the full WAF rule text on Tier-0 for free.** Default: show "blocked + vendor" free,
  gate the exact copy-pasteable rule behind signup (that's the conversion mechanic). Sri can
  change this, but don't give away the deliverable that's meant to drive signup.

---

## 14. DISPOSITION OF THE FULL GEMINI PACKAGE (why only THIS is applied)
For the record — what was in the Gemini "market-moat" package and why only the CDN remediation
delta survived into a build prompt:
- **CDN remediation snippet + Tier-0 hook → APPLIED here.** The one genuinely net-new idea: canon
  had the CDN *check* (LLD 5191) but not the customer-facing WAF-bypass *snippet* or the Tier-0
  *conversion hook*. (Note: Gemini's detector logic had a false-positive bug — block on any CDN
  header — which this prompt fixes with status-code gating.)
- **`crawler_visit_logs` cols (is_active_agent/referrer_ai_session/visit_purpose/error_type) →
  ALREADY CANON** (LLD 974–975, PATCH W-02/Z-01). Not applied — would duplicate columns.
- **`visibility_trends` cols (ai_referral_sessions/ai_lead_estimate/market_competition_label) →
  ALREADY CANON** (LLD 6215–6216, 6117; CHANGE 2 + PATCH AD-01). Not applied.
- **`content_structure_audits` cols (outbound_citation_count/has_author_attribution/
  citation_probability_score) → ALREADY CANON** (LLD 2569–2581, PATCH Y-03, with a defined
  formula Gemini's bare columns lacked). Not applied.
- **Agentic task /20 score (booking/pricing/service_area/faq) → ALREADY CANON** (LLD 1179–1180);
  its *detection* (the real gap) was landed by the Sprint 6 v1.5 prompt's §8.4a — NOT by Gemini's
  `local-ai-trust-scorer.ts` (which collided with the canonical file of that name).
- **Visit API (`app/api/visit/route.ts`) → ALREADY CANON, and MORE SECURE in canon** (LLD
  5762–5780, SEC-A + SEC-B). Gemini's version omitted both hardenings. §5 above applies the
  canonical hardened version, not Gemini's.
- **Competitor Landscape doc → strategic affirmation, no code.** Confirms the moats; nothing to build.

---

## CHANGELOG
# v1.3 (26 Jun 2026): Fix-1 completion (gate precision). v1.1 fixed the block-alert tier in §1
#   (passive crawler-logs tier, not Growth+), but the §10 Claude-Code-prompt block still said
#   "Keep it behind the existing Growth+ crawler-analytics gate" — so §1 and §10 contradicted each
#   other on the same decision, and the bundle driver echoed the stale §10. Aligned §10 to §1: the
#   card follows the built S6 crawler-logs view's tier (passive-crawl output → Starter+ per LLD
#   3170), not the active-agent Growth+ gate. Wording only — no scope/behaviour change. (Found in
#   the bundle review; the driver was corrected in the same pass.)
# v1.2 (26 Jun 2026): One-line consistency fix. §1's summary bullet still said "persist
#   error_type='blocked_cdn' + detectedFirewall to the crawler_visit_logs row", which contradicted
#   the v1.1 §3 single-source rule (vendor + snippet in gaps JSONB ONLY; row carries error_type
#   only). Updated the §1 bullet to match §3 + §13 (JSONB is the single UI source; no vendor column
#   on crawler_visit_logs). Wording only — no scope/behaviour change; §3/§11/§12/§13 unchanged.
# v1.1 (26 Jun 2026): Independent review fixes (3 minor, none blocking — verdict was PASS).
#   (1) Gate precision (§1): the block-alert card was gated Growth+ via is_active_agent (LLD 3170),
#       but block detection is a PASSIVE GPTBot-crawl output (passive = Starter+ per the same line).
#       Changed to follow the built S6 crawler-logs view's tier, not the active-agent Growth+ gate,
#       to avoid over-gating a useful signal. (2) Single-source persistence (§3): removed the dual
#       "store detectedFirewall on the row AND in JSONB" wording that could yield two sources of
#       truth; vendor + snippet now live in gaps JSONB ONLY (row carries error_type='blocked_cdn').
#       (3) Detector purity (§2): pinned the domain-agnostic path (return literal '<brand domain>'
#       token; caller/UI substitutes) and explicitly forbade a `domain` arg on analyzeHeaders, so
#       the §11 snippet assertions stay deterministic. No scope/behaviour change otherwise.
# v1.0 (26 Jun 2026): Initial. The net-new CDN-shield-detector + remediation-snippet + Tier-0
#   conversion hook extracted from the Gemini package, reconciled against LLD v8.68 + Sprint 6
#   prompt v1.5. Status-code-gated detection (fixes Gemini's any-CDN-is-blocked false positive),
#   placed in lib/crawler/ (no platform collision), zero-schema (reuses error_type='blocked_cdn'),
#   crawl-reuse (no second fetch except the gated Tier-0 probe). Optional §5 folds in the
#   canonical SEC-A/SEC-B Visit-API hardening since it's the same public-endpoint surface.
