# P3-S2 · MANUAL WALK — Agent Analytics screens, step by step (exact navigation)

> **What this is:** a click-by-click rendered-screen walk of every Agent Analytics surface S2 built, plus
> every screen they depend on. This is the review the whole project method exists for — **greps/tests
> passing ≠ the screen shows the truth.** S2's report passed 39 tests but explicitly deferred the render
> test, the CDN-join-on-real-data test, and the nav guard. Those three are where the bugs are.
>
> **Where you run this:** logged into the app (the seed gave you `sri@visibleau.local`). Per the terminal
> earlier, you're on **`Database: visibleau_prod`**, Agency tier, brand **Metropolitan Plumbing**
> (`418f321f-2489-4560-aaa9-895728580465`).
>
> ⚠️ **REAL LLM MODE — do NOT click "Run audit"** anywhere (~US$0.50–2 each). Nothing in this walk needs an
> audit.
>
> ---
> ## THE ANSWER KEY — build this understanding BEFORE looking at any screen
> **`crawler_visit_logs` is EMPTY for Metropolitan on prod** (established repeatedly this session — no real
> traffic, no uploads on prod). So the HONEST expected state of every AA screen in **Phase 1** of this walk
> is **zero / empty**:
> - Crawler card counts (retrieval/indexing/training) → **0 / 0 / 0**
> - Verification split (verified/unverified/spoofed) → **0 / 0 / 0**
> - Crawl-to-referral ratio → **"0 visitors sent"** (never ∞, never a crash, never "NaN")
> - CDN-Shield join → every bot's crawl-half is **never_seen** (so verdicts are `not_blocked_never_visited`
>   or `self_blocked` depending on the robots matrix — NOT `healthy` or `robots_violation`, since those need
>   observed crawling)
> - Coverage gap → likely "all pages uncrawled" or an empty-but-explained state
>
> ⚠️ **This all-zero state is CORRECT, not a bug.** The bug is if a screen instead: **crashes**, shows
> **"NaN"/"undefined"/"Infinity"**, shows a **blank white panel** (no skeleton, no empty-state message —
> the "never render a blank div" rule), or shows a **plausible-wrong number** (e.g. a ratio card filling a
> bar to 100%, or counts that don't match the empty DB). Phase 1 catches those.
>
> **Phase 2** (optional, at the end) ingests a synthetic log so the screens have DATA — the only way to test
> that non-zero values render correctly. Testing only the empty state would miss every "renders data wrong"
> bug.
>
> ---
> ## HAVE THESE OPEN
> - The **browser** logged in.
> - The **server terminal** visible (you'll watch it during navigation for 500s / failed data fetches).
> - **DevTools → Network tab** open (F12) — to see each API call's status + response shape as screens load.

---

# PHASE 1 — Walk every screen in its real (empty) state

## STEP 1 — Get to the Retrieval tab (the parent screen)

1. In the browser, go to: **`localhost:3000/brands/418f321f-2489-4560-aaa9-895728580465`**
   (the Metropolitan brand detail page — the tile grid).
2. Click the **Retrieval** tile (bottom-right of the grid: "Retrieval — Agent readiness & crawlers").
   - URL becomes `/brands/418f321f-.../retrieval`.
   - ⚠️ **CHECK:** the Retrieval Intelligence hub renders (you've seen this — "53/100 Agent Readiness",
     "Crawler Visits: 0"). Note the "Crawler Visits: 0" — consistent with the empty answer key.
3. ⚠️ **Watch the terminal** as it loads: `/brands/.../retrieval` should be **200**. Note the load time
   (it's been 8–10s — a perf issue, but not an S2 bug).

**⚠️ RECORD:** Did the Retrieval hub load without error? Is "Crawler Visits" 0 (matches answer key)?

---

## STEP 2 — Find the Agent Analytics entry point (the AA-P2 "section within the tab")

S2 built AA as a **section within the Retrieval tab**, NOT a new tile (AA-P2). So there is either:
- (a) an **"Agent Analytics" section** rendered further down the Retrieval hub page, or
- (b) a **sub-link/sub-tab** on the Retrieval hub leading to `/brands/.../retrieval/agent-analytics`.

1. **Scroll down the Retrieval hub page.** Look for an "Agent Analytics" heading/section below the existing
   cards (Crawler Logs, Content Structure, Agent Readiness, Entity Home, llms.txt).
2. If there's a link/card labelled **Agent Analytics** (or "Crawler analytics", "AI bot traffic"), note
   where it is and click it.
3. If nothing appears on the hub, navigate **directly** to:
   **`localhost:3000/brands/418f321f-2489-4560-aaa9-895728580465/retrieval/agent-analytics`**

⚠️ **THIS IS THE FIRST REAL FINDING CHECK (nav-orphan — AA-17):**
- If you could reach Agent Analytics **only** by typing the URL (no link/section anywhere on the Retrieval
  hub) → that's a **nav-orphan** (the bug that shipped 4× in Phase 2). The screen exists but nothing links
  to it. **RECORD it.**
- If there's a visible, clickable entry point → good, note where it is.

**⚠️ RECORD:** How did you reach Agent Analytics — a visible link (where?) or only by typing the URL?
Terminal status for the `/retrieval/agent-analytics` route (200?).

---

## STEP 3 — The Agent Analytics section / crawler card (AA-1 Overview — the §7.0 card)

You're now on the Agent Analytics surface. Against the prototype `AgentAnalyticsHub`, expect: the **crawler
COUNT card** (retrieval/indexing/training), the **VerificationSplit** (3 states), the **RatioCard**, and
below, the **volume charts / vendor table / CDN-join table**.

⚠️ **In the Network tab**, watch the calls fire as this loads:
- `GET /api/brands/418f321f-.../agent-analytics/overview` → should be **200**
- `GET .../agent-analytics/ratio` → **200** (you're Agency, so Growth features unlock)
- `GET .../agent-analytics/cdn-join` → **200**
- `GET .../agent-analytics/coverage` → **200**

**Check each element against the empty-DB answer key:**

**3a — Crawler COUNT card:**
- ⚠️ retrieval / indexing / training counts = **0 / 0 / 0**? (matches empty DB)
- ⚠️ Is it a **COUNT card** (raw numbers, NO progress bar) — not a score card with a bar filled to 100%?
  (AA-P7 — a 100%-full bar on a raw count is the specific bug this rule prevents.) **Look at the card: is
  there a bar? If yes, is it filling to 100% on a zero/raw count? → BUG.**

**3b — VerificationSplit:**
- ⚠️ verified / unverified / spoofed shown as **3 separate values**, all **0**? (AA-05 — never merged into
  one headline).
- ⚠️ Is the headline count **verified-only** (not total)? With empty DB all are 0, so check the *labels*
  are present and separate even at zero.

**3c — RatioCard (the headline metric):**
- ⚠️ Shows **"0 visitors sent"** (or similar) — **NOT** "NaN", "Infinity", "∞", "0:0", or a crash?
  (The prototype's rule: denominator 0 → "0 visitors sent", never divide-by-zero.)
- ⚠️ Is the **AA-13 honesty caveat visible ON the card** ("referral is a lower bound / the real ratio is
  better than shown")? It must be inline and readable, **not** buried in a tooltip or absent. **Read the
  card — is the caveat text actually there?**
- ⚠️ Is there a **benchmark** line ("GPTBot averages ...:1")?

**3d — Loading / empty states (the "never blank" rule):**
- ⚠️ While loading, did you see a **skeleton**, or a blank white area? (Blank = bug.)
- ⚠️ For any card with no data, is there an **explained empty state** ("no AI crawler has visited yet —
  this is itself a finding"), or just a blank panel / a bare "0" with no context?

**⚠️ RECORD for STEP 3:** For each of 3a/3b/3c/3d — matches answer key, or a specific defect (crash / NaN /
blank / 100%-bar / missing caveat / merged verification)? Paste the Network status of all 4 GET calls, and
⚠️ **if any returned 200 but the card shows 0/empty, open that call's Response in Network and check the
shape** — is the route returning `{overview:{...}}` while the card reads the bare object? (envelope-unwrap
— the S9 F11 / Crawler-Visits-0 class). This is the single most likely S2 bug.

---

## STEP 4 — The CDN-Shield join table (the differentiator, §5.3)

Still on the Agent Analytics section, find the **CDN-Shield join table** (from `CdnShieldJoinTable`).

⚠️ **Answer-key reasoning for the empty-crawl state:** the join is CDN-Shield's *diagnosis* (blocked/allowed
per the robots matrix — Metropolitan HAS this, the "27 AI bot matrix" from the brand page) × the logs'
*reality* (crawling/never_seen — all **never_seen** here, since crawl logs are empty). So every row should
resolve to either:
- `not_blocked_never_visited` (bot allowed in robots, but never observed crawling — a discoverability
  finding), or
- `self_blocked` (bot blocked in robots AND never seen — "invisible by your own config"),
- and **NOT** `healthy` or `robots_violation` (both require *observed crawling*, which is absent).

**Check:**
- ⚠️ Does the table **render rows** (using the robots-matrix half), or is it **empty/crashed**? A standalone
  bot tool would have no diagnosis half — the whole point is VisibleAU has both. If the table is empty
  because it *requires* crawl rows to render at all, that's a finding (it should still show the
  diagnosis-half verdicts).
- ⚠️ Are the verdicts **only** from the 4-verdict set? Any 5th label, any "undefined" verdict → BUG.
- ⚠️ Is this table **Growth-gated correctly**? You're Agency so you see it — note whether there's a TierGate
  overlay that should NOT be there for you (it should be unlocked at Agency).

**⚠️ RECORD:** Does the CDN-join table render with real robots-matrix verdicts, or is it empty/crashed? Which
verdicts appear? Any 5th/undefined verdict?

> ⚠️ **NOTE on the acceptance criterion:** the S2 report's pending item "CDN-join produces ≥1 real finding on
> Metropolitan" — with crawl logs empty, the join CAN still produce findings from the diagnosis half
> (`not_blocked_never_visited` / `self_blocked`), so it should NOT be blank. But a `healthy` or
> `robots_violation` verdict is **impossible** on current data (needs observed crawling). So "≥1 finding"
> should be satisfiable NOW as a discoverability finding; if the table is blank, that's the bug.

---

## STEP 5 — Pages & Coverage screen (AA-3)

The prototype has a **Pages & Coverage** screen (coverage gap = sitemap pages no AI bot has fetched).

1. Look for a **"Pages & Coverage"** link/tab within the Agent Analytics section (or a sub-navigation).
   If present, click it. If it's a separate route, note the URL.
2. ⚠️ This depends on `GET .../agent-analytics/coverage` (Growth) — watch it in Network (**200**?).

**Check against answer key (empty crawls = every page is a "gap"):**
- ⚠️ Does it show the **coverage gap** (pages never crawled) — which, with empty logs, is likely **all**
  sitemap pages — presented as an **insight** ("N pages no AI bot has fetched"), NOT a raw empty list or a
  crash?
- ⚠️ Is the empty/full state **explained**, or blank?

**⚠️ RECORD:** Did Pages & Coverage render? Coverage GET status? Is the gap presented as an explained
insight or a blank/crash?

---

## STEP 6 — Setup / Connect panel (AA-4)

The prototype has a **Setup panel** (the 3 ingestion paths: upload / snippet / Logpush, with "received N
hits").

1. Find the **Setup** / **Connect** / **Data sources** link within Agent Analytics. Click it.
2. **Check:**
   - ⚠️ Are the **3 ingestion paths** shown (upload, JS snippet, Logpush)?
   - ⚠️ Since nothing's configured/ingested on this brand, is there an **explained empty state** —
     specifically the canon one: *"Connected — no AI crawler has visited yet. This is itself a finding..."*
     — or just a blank panel / a bare "0 hits"?
   - ⚠️ Is there an **upload control** here? (S1's upload route exists; S2 may surface a UI for it here.) If
     so, note it — that's the browser entry point to the S1 upload path.

**⚠️ RECORD:** Setup panel renders? 3 paths shown? Empty state explained (the "this is itself a finding"
message) or blank?

---

## STEP 7 — Tier-gate behavioural proof (the F28 lesson — is the gate REAL?)

You're **Agency** tier, so you see everything. The risk (F28: the Phase 2 paywall was a cosmetic CSS blur)
is that the Growth gate on `ratio` + `cdn-join` **renders** but doesn't **enforce server-side**. The report
claims server-side `assertTier` was added — this proves it.

**In DevTools Console, hit the Growth-gated routes directly** (your session cookie authenticates you; but
the SERVER should still check tier):
```js
const b = "418f321f-2489-4560-aaa9-895728580465";
for (const path of ["ratio", "cdn-join", "coverage"]) {
  const r = await fetch(`/api/brands/${b}/agent-analytics/${path}`, { credentials: "same-origin" });
  console.log(path, r.status);
}
```
- ⚠️ As **Agency**, these should all be **200** (you're entitled). That's the positive case.
- ⚠️ **The real gate test needs a Starter-tier session**, which you don't have handy. So instead, do the
  *structural* check: **read the route file** `app/api/brands/[brandId]/agent-analytics/ratio/route.ts` and
  confirm it actually calls `assertTier('growth')` (or equivalent) **before** returning data — not just a
  client-side `<TierGate>` overlay. If the route has NO server-side tier check, the gate is cosmetic (F28) —
  a Starter user could curl the ratio. **RECORD whether the server-side check is present in the route code.**

**⚠️ RECORD:** All 3 routes 200 as Agency? Is `assertTier('growth')` actually in the ratio + cdn-join route
code (server-side), or only a client overlay?

---

## STEP 8 — Nav-guard coverage (AA-17 — the 5th nav-orphan check)

The new `agent-analytics` route must be registered in the repo-wide set-difference nav guard (the test that
catches nav-orphans). This shipped broken 4× in Phase 2.
- ⚠️ Confirm the new route (`/brands/[brandId]/retrieval/agent-analytics`) is **included in the nav guard's
  known-routes set** (grep the nav-guard test/manifest for the agent-analytics path). If it's absent, the
  guard isn't covering it → a future nav-orphan can ship silently.

**⚠️ RECORD:** Is the agent-analytics route in the nav-guard manifest/test?

---

# PHASE 2 — (Optional) Seed data so non-zero values can be tested

Everything above tests the **empty state**. To test that the screens render **real data** correctly (ratio
with an actual number, verification split with real verified/spoofed counts, CDN-join `healthy`/
`robots_violation` verdicts), the crawl table needs rows. **This writes to prod** — so backup + tagged rows
+ cleanup, exactly like the S1 manual test.

⚠️ **Only do this if you want to test the data-rendering paths now.** Otherwise stop after Phase 1 — the
empty-state walk already catches crashes, envelope-unwrap, blank panels, and the gate/nav findings.

1. **Backup:** `pg_dump ... visibleau_prod --file=backup_pre_S2walk_$(date +%s).dump` (confirm non-zero).
2. **Ingest a tagged synthetic log** via the S1 manual test's console `fetch`
   (`P3S1-MANUAL-upload-route-test.md` Step 2), URLs tagged `/p3s1test-`. This lands 8 crawler rows
   (7 legit + 1 spoof) for Metropolitan.
3. **Re-walk STEP 3 + STEP 4** and check the screens now show **real values**:
   - ⚠️ Crawler card counts now non-zero (retrieval/indexing/training reflecting the 8 rows)?
   - ⚠️ VerificationSplit now shows the split (0 verified — all TEST-NET — but unverified count = 8, spoofed
     handling correct)?
   - ⚠️ Ratio card: 8 crawls / 0 referrals → still **"0 visitors sent"** (correct — no referral rows)?
   - ⚠️ CDN-join: any bot now observed crawling → does its verdict flip to `healthy` (if allowed) or
     `robots_violation` (if blocked in robots but crawling)? This is the differentiator producing a
     data-driven verdict.
4. **CLEANUP (mandatory):**
   ```sql
   DELETE FROM crawler_visit_logs
   WHERE brand_id='418f321f-2489-4560-aaa9-895728580465' AND visited_url LIKE '/p3s1test-%';
   SELECT count(*) FROM crawler_visit_logs
   WHERE brand_id='418f321f-2489-4560-aaa9-895728580465';  -- expect 0
   ```

**⚠️ RECORD for Phase 2:** Did non-zero data render correctly on the crawler card, verification split, and
CDN-join? Any value that was wrong vs the 8-row answer key? Cleanup returned count to 0?

---

# REPORT-BACK (paste inline, per step)

For **each** step, note: **rendered OK (matches answer key) / DEFECT (describe)**.
- STEP 1 Retrieval hub: loaded? Crawler Visits 0?
- STEP 2 ⚠️ **nav-orphan:** reached AA via a link (where?) or only by typing the URL?
- STEP 3 crawler card / verification split / ratio: ⚠️ counts 0? COUNT-card no 100%-bar? ratio "0 visitors
  sent" not NaN/∞? AA-13 caveat visible on card? skeletons not blanks? ⚠️ **all 4 GET statuses + any
  envelope-unwrap** (200 but empty card → check Response shape).
- STEP 4 CDN-join: renders robots-matrix verdicts, or empty/crash? only 4-verdict set?
- STEP 5 Pages & Coverage: rendered? coverage as insight or blank?
- STEP 6 Setup: 3 paths? "this is itself a finding" empty state or blank?
- STEP 7 ⚠️ **tier gate:** all 3 routes 200 as Agency? is `assertTier('growth')` in the route CODE
  server-side, or client-only (cosmetic → F28)?
- STEP 8 ⚠️ **nav guard:** is the agent-analytics route in the nav-guard manifest?
- PHASE 2 (if run): did real data render correctly? cleanup to 0?

**⚠️ THE VERDICT at the top:**
> **Do the Agent Analytics screens render the TRUTH?** Specifically: no crashes/NaN/blank panels; the
> empty state is honest-and-explained (not a fake number); the ratio never divides by zero; the AA-13
> caveat is on the ratio card; verification shows 3 separate states; the CDN-join renders 4-verdict-only;
> the tier gate is enforced server-side (not cosmetic); and the route is not a nav-orphan. YES → S2's UI is
> proven on the rendered screen. NO → list each defect; those are the real S2 bugs the 39 green tests hid.

**Constraints recap:** build the answer key first (empty DB → honest zeros, NOT bugs); the bug is
crash/NaN/blank/plausible-wrong/missing-caveat/cosmetic-gate/nav-orphan; watch the Network tab for
envelope-unwrap (200 + empty card = check response shape); DON'T click Run audit; Phase 2 writes to prod →
backup + tagged rows + cleanup to 0.
