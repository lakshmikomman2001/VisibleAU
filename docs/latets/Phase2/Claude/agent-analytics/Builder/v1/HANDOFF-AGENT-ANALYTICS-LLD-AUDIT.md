# HANDOFF — Agent Analytics LLD v1.2: THIRD-ANGLE CONFLICT AUDIT

**You are a fresh reviewer chat.** Your job: audit **Agent Analytics LLD v1.2** against **Phase 2 canon** and
find conflicts the previous two audits missed. Read this whole document first.

> **The single most important instruction:** two audits have already run. They found **14 conflicts** (9 then 5).
> **Every single one came from the designer trusting their own recall instead of reading canon.** Do not repeat
> that. **Read canon before you assert anything.** If you find yourself writing "canon says X" from memory — stop,
> grep it.

---

## 0. THE DOCUMENTS

| File | What it is |
|---|---|
| `visibleau-agent-analytics-LLD-v1.2.md` | **THE DOCUMENT UNDER AUDIT.** 540 lines, 18 sections, 22 rules (AA-01…AA-22), 14 ledgered conflicts (AA-C1…AA-C14). |
| `visibleau-phase2-LLD-v8.70.md` | **CANON. THE AUTHORITY.** ~9,000 lines. **Where v1.2 and v8.70 disagree, v8.70 WINS.** |
| `visibleau-phase2-prototype-FIX17.jsx` | **CANON.** The Figma-grade UI reference — exact tokens, screens, tier gates, component shapes. |
| `visibleau-p2-sprint-*.md` (S1–S9) | Sprint prompts. Each has §11 (tests), §12 (verification greps), §13 (anti-patterns). |
| `visibleau-agent-analytics-LLD-v1.0.md` / `v1.1.md` | **WITHDRAWN.** Kept only so you can see what was wrong. **Do not design from these.** |

---

## 1. WHAT THE FEATURE IS (30 seconds)

VisibleAU is an AU-first GEO/AEO AI-visibility auditing SaaS (audits how ChatGPT/Claude/Gemini/Perplexity see and
cite a brand). It has `crawler_visit_logs` — it already records **which AI bot visited which URL**.

**Agent Analytics closes exactly three gaps:**
1. **No verification.** The table trusts the `User-Agent` string. There is **no `source_ip` column**. A competitor
   scraping prices while claiming to be `GPTBot` is recorded as GPTBot.
2. **No referral side.** No human-referral data at all → the **crawl-to-referral ratio** (the sellable metric —
   *"GPTBot fetched your booking page 400 times and sent 0 visitors"*) is **not computable today**.
3. **No ingestion for clients who can't install the snippet** (AU SMBs on cPanel/shared hosting).

Plus the differentiator: the **CDN Shield join** — cross-referencing CDN Shield's *diagnosis* (blocked/allowed)
with the logs' *observed reality* (crawling/absent). No competitor can do this; it needs both halves.

---

## 2. THE TWO AUDITS ALREADY DONE (so you don't redo them)

### Audit 1 (v1.0 → v1.1): 9 conflicts — **AA-C1…AA-C9**
Axes examined: table numbering, layer model, purpose taxonomy, existing tables, ingestion, security, tiering,
retention, counted invariants.

**The big ones:**
- **AA-C1:** v1.0 proposed a new table `ai_crawler_hits`. **`crawler_visit_logs` already exists** (14 cols).
  Canon LLD line 5233 states verbatim: *"into the existing crawler_visit_logs table — **no second table
  needed**."* → v1.2 **ALTERs** the existing table.
- **AA-C2:** v1.0 invented a 4-value purpose enum. Canon's `visit_purpose` **already exists** with
  `retrieval | indexing | training` — and canon's `retrieval` means what v1.0 called `agent`. **An inverted
  semantic collision on the same column.** → v1.2 adopts canon's enum verbatim.
- **AA-C4:** v1.0 proposed "Layer 8". Canon: **7 layers, 7 WCAG-AA-verified colour tokens, no 8th slot.** →
  v1.2 is **Layer 1 (Retrieval) extended**.
- **AA-C6:** v1.0 designed a new collector endpoint. The **Visit API already exists and is hardened** (SEC-A:
  URL host must equal brand domain, because the brandToken is necessarily public; SEC-B: IP throttle *before*
  any DB work + negative cache for unknown tokens). → v1.2 reuses it.

### Audit 2 (v1.1 → v1.2): 5 more — **AA-C10…AA-C14**
Axes examined: **the GAP register, the tier-gate table (TG-02), the prototype's actual screens, the middleware
matcher.** *(Different axes = new findings. Same axes would have found nothing.)*

**The big ones:**
- **AA-C10 [HIGH]:** v1.1 proposed gating crawler logs to Starter+ and called Free access "a leak to fix."
  **Canon LLD 3198: *"Free + Starter: `crawler_visit_logs` + `llmstxt_versions` (near-zero cost, real value)."***
  It is a **deliberate Free-tier acquisition hook.** v1.1 would have **stripped a feature canon ships on purpose
  and called it a bug fix.** → v1.2 inverted: Free keeps the visits; **verification** is Starter; **ratio +
  CDN-join** are Growth. The paid uplift is *trust and attribution*, not access.
- **AA-C11 [HIGH]:** v1.1 asked the build to fix a "carried S6 tier-gate bug." **It was already fixed at v8.56
  (TG-02).** A stale item trusted from memory.
- **AA-C13:** v1.1 left "was the S9 crawler card built?" as a blocking unknown. **Answer: NEVER BUILT.** Prototype
  FIX17 has **zero** crawler UI. So `crawler_visit_logs` has been **collecting data since S6 with no reader** —
  an **orphan-reader table** (the mirror of canon's own §1816 finding: *"orphan tables — `data_residency_log` has
  no writer"*). Agent Analytics **delivers an S9 promise that was never kept.**

---

## 3. YOUR JOB — THIRD-ANGLE AUDIT (the unexamined axes)

**Do NOT re-audit the axes above.** They're done. Audit these instead — each is a plausible source of conflict
that neither previous pass touched:

### Axis A — **Event / webhook conventions (HIGHEST PRIORITY)**
v1.2 §10 proposes 3 Inngest functions and 3 events (`crawler-log/uploaded`, `crawler-hits/ingested`,
`crawler.impersonation-detected`).
- Canon has a **dot-vs-slash convention** that **cost Sprint 7 dearly**: `run-audit` emitted `audit.complete`
  (dot) while 4 functions listened on `audit/complete` (slash) → **they silently never fired, and every test
  passed.** A repo-wide convention guard now exists.
- **Check:** does v1.2's event naming actually match the canon convention? Which events go in `VALID_EVENTS`?
  Which need `EVENT_NAME_MAP` entries (the S8 WH-01 webhook fanout)? Does the proposed
  `crawler.impersonation-detected` collide with, or need to be added to, the WH-01 event list? **Grep the S8
  prompt's §8.1 for the exact WH-01 spec.**
- Is `serve()=28` right, or does canon count differently? (Canon precedent, line 947: *"the Visit API is a route,
  not a function"* — so routes don't count. Does that change the arithmetic?)

### Axis B — **Report template / PDF integration**
- Canon has a `default-report-template` with per-section `include:` flags. **This has caused a recurring bug
  across S5 and S6** (`entity_home` / `agent_readiness` shipped with `include:false` — computed but never
  rendered in reports).
- **Check:** does v1.2 say anything about report inclusion? (It probably doesn't — that may itself be the
  finding.) Should Agent Analytics appear in generated reports / the white-label agency PDF? If yes, that's a
  missing spec. If it's Agency-tier white-label, does §8's tier table cover it?

### Axis C — **RLS + the org/brand isolation pattern**
- Canon's pattern: `organization_id` → **direct-org_id RLS** (USING + WITH CHECK); cross-org read → **404 not
  401**; `setRlsContext(db, orgId)` before every query; `assertBrandAccess()` on every brand route.
- v1.2 says `ai_bot_registry` + `ai_bot_ip_ranges` are **global reference data, no org scoping** (mirroring
  `org_feature_flags`' operator-set-only pattern).
- **Check:** is that actually the canon pattern for global tables? Does canon *have* a precedent for a
  non-org-scoped table, and does it match? Does `ai_referral_hits` need `assertBrandAccess` on its routes? Does
  the RLS policy shape match canon's exactly (naming, USING+WITH CHECK, the 404 rule)?

### Axis D — **Retention cron + `data_residency_log`**
- Canon **RT-01**: `crawler_visit_logs` = **90 days**, enforced by a retention cron, and **declared in
  `data_residency_log`** (ap-southeast-2, supabase, AES-256).
- v1.2 adds 3 tables and says "add `data_residency_log` rows" + "retention aligned at 90 days."
- **Check:** does canon's retention cron enumerate tables explicitly (i.e. would it need editing)? Is
  `data_residency_log` seeded from a hardcoded list (v1.2's new rows would need to go *somewhere* specific)?
  **Canon's own audit found `data_residency_log` has NO WRITER** — so how do rows get in at all? Does v1.2's
  assumption ("add rows") even work?

### Axis E — **The migration + the two-DB discipline**
- **The single most damaging recurring bug in this project (5+ occurrences).** Migrations get applied to dev
  (`visibleau`) but not to local prod (`visibleau_prod`, which the app actually runs against). In **S8 this took
  every brand route down** (`org_members` missing → `assertBrandAccess` → 42P01 → 500 on all 44 routes).
- **Check:** does v1.2's §12 sprint split make the two-DB requirement unmissable? Is the ALTER idempotent? Does
  the proposed dedup unique index (v1.2 §2.1) **collide with the Visit API's existing write pattern** (v1.2's own
  OQ-A2 flags this as unverified — **go verify it**)?

### Axis F — **Anything else you notice**
The previous audits found things by *looking at axes nobody had looked at*. Pick your own. The prototype's
component inventory, the `explainability contract`, the Action Center task-type enum, the alert system, the
`llms.txt` interaction, the tier-gate table TG-02 in full, the `crawler_tier` → `visit_purpose` classifier
logic — any of these could hide a conflict.

---

## 4. HOW TO AUDIT (the method that's been working)

1. **Grep canon FIRST, assert SECOND.** Every conflict found so far came from someone asserting from memory.
   Before you write "canon says X" — find the line. Quote the line number.
2. **Look for the *inverted* conflict, not just the missing one.** The worst finding (AA-C10) wasn't "v1.1 forgot
   something" — it was **"v1.1 proposed removing something canon deliberately ships."** Ask of every v1.2 claim:
   *does canon already do this, and does it do it the OPPOSITE way?*
3. **Check the counted invariants.** Canon asserts in **every revision header**: *"37 tables, 16 GAPs,
   serve()=25/25, All 7 Layers intact."* v1.2 §9 declares its delta as **Tables 37→40, GAPs 16→17, serve()
   25→28, Layers 7→7**. **Verify that arithmetic against canon.** (Are the 3 new tables *really* new? Is GAP 17
   *really* new — grep every `[GAP N]`. Is serve()=25 still the current count after S8/S9?)
4. **Check what EXISTS before accepting anything is NEW.** The v1.0 catastrophe was proposing a table that
   already existed. For each of v1.2's 3 new tables and 3 new functions — **grep canon. Does it already exist
   under a different name?**
5. **Prototype ≠ LLD.** Both are canon. They have disagreed before (route paths: prototype `(auth)/team` vs
   prompt `settings/team`). Check v1.2 against **both**.
6. **Report every conflict, including LOW.** Format: what v1.2 says → what canon says (with the line) → the fix.

---

## 5. CONTEXT YOU NEED

**Build state:** Phase 1 (12 sprints) + Phase 2 Sprints 1–7 are DONE (S7 committed `a8f20ed`). **S8 (Governance)
is built and §12-green but its manual verification is INCOMPLETE** — the webhook chain, `recordAction` writes,
the settings screens, and RBAC enforcement have not been walked. **S9 (Autopilot) status uncertain — and AA-C13
proves at least one S9 deliverable (the crawler card) was never built.** Agent Analytics is **post-Phase-2** — it
is not in the build queue yet.

**The bedrock method lesson (why this project audits so hard):** every sprint, the build reports *"N tests pass,
complete, ready to commit."* Every sprint, the manual walk finds real bugs the tests missed (S5: 8, S6: ~10, S7:
7 including 2 HIGH + a broken acceptance criterion). **Greps and tests passing ≠ it works.** The same applies to
design: *"the LLD looks complete"* ≠ it's consistent with canon. **Three design audits, 14 conflicts.**

**Sri's working style:** Sydney solo founder, weekend pace (~8h/wk), direct, no padding. Values honest correctness
over reassurance. **Flag a genuine problem once, clearly, then execute the decision.** Do not rubber-stamp — a
design review that says "looks good" is as useless as a build report that says "44 tests pass."

**Two-chat relay:** the reviewer chat (you) reads canon and writes ready-to-paste Claude Code `.md` prompts to
`/mnt/user-data/outputs/`. A separate Claude Code chat applies them. Sri pastes results back **inline** (uploads
from that chat arrive blank).

---

## 6. YOUR DELIVERABLE

1. **A conflict ledger** — same format as v1.2's §0.2 / §0.2b: `# | what v1.2 says | what canon says (line ref) |
   the fix`. Number them **AA-C15 onward** (C1–C14 are taken).
2. **If you find conflicts → write v1.3** with them fixed, and **retain the ledger** (the ledgers are deliberate
   institutional memory — they stop the next designer repeating the mistake).
3. **If you find none on an axis → say so explicitly.** "Axis C: checked RLS pattern against canon lines X–Y; no
   conflict" is a valuable result. Don't invent findings to look thorough.
4. **Then (only if asked): the sprint prompts** — 2 sprints (P3-S1 Verification+Ingestion, P3-S2
   Attribution+Surfaces), in the Phase-2 house style: Figma-grade prototype spec, §11 test track, §12 verification
   greps, §13 anti-patterns.

---

## 7. THE OPEN QUESTIONS v1.2 LEAVES (Sri decides; flag if your audit changes them)

- **OQ-A1 — RESOLVED by canon (AA-C10):** crawler logs are already Free. The remaining question is **where the
  paid line sits.** v1.2's answer: Free = visits; Starter = verification; Growth = ratio + CDN-join. *Sri to
  confirm.*
- **OQ-A2 — UNVERIFIED, needs checking (see Axis E):** does v1.2's proposed dedup unique index collide with the
  Visit API's existing write pattern? **If it does → dedup in the parser instead.**
- **OQ-A3 — RESOLVED (AA-C13):** the S9 crawler card was never built. No longer blocking.
- **OQ-A4 — WordPress plugin** as an ingestion path (most AU SMBs are WordPress). A **new artefact class**
  (distributed, versioned, supported). *Reviewer recommended: defer to v1.2+.*
- **OQ-A5 — Retention:** keep the flat 90 days (RT-01), or vary by tier? Varying means updating **both** the
  retention cron **and** `data_residency_log`. *Reviewer recommended: keep 90 flat.*

---

**Start with Axis A (events/webhooks) — it's the highest-risk axis, because the dot-vs-slash class of bug is
invisible to tests and cost Sprint 7 four silently-dead functions.** Then work down. Good hunting.
