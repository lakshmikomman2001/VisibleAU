# REVIEW HANDOFF — VisibleAU Phase 2 Sprint 6 BUNDLE (core + CDN enhancement + driver)
**For:** a fresh Claude chat asked to review the complete Sprint 6 artifact set BEFORE Sri builds it.
**Date:** 26 Jun 2026. **Your job:** verify the three files are individually correct AND mutually
consistent, that the driver sequences them safely, and that nothing conflicts with canon. Do NOT
rubber-stamp — find gaps, conflicts, and overreach. Paste this whole file at the start of the review
chat, attach the artifacts in §2, then work through §5–§8.

> This differs from the earlier handoff (which reviewed the CDN enhancement in isolation). Here you
> review the WHOLE Sprint 6 package together: do the core, the enhancement, and the driver fit?

---

## 1. WHAT YOU ARE REVIEWING (one paragraph)
VisibleAU is an Australian GEO/AEO visibility-auditing SaaS. Phase 2 is a 9-sprint build on top of a
built Phase 1, designed to LLD **v8.68** (Gate-3 audited). This bundle is everything needed to build
**Phase 2 Sprint 6 — Retrieval Intelligence + Agent Readiness** plus a net-new **CDN Shield
enhancement** (the only genuinely-new piece salvaged from a separate "Gemini" enhancement package —
~80% of which duplicated existing canon). The bundle has THREE prompt files: the **core S6 build
prompt (v1.5)**, the **CDN enhancement delta (v1.3)** that layers on top of it, and a **driver
prompt** that runs them back-to-back in one Claude Code session. You are checking all three together.

**Build-state context (so you don't mis-scope):** Phase 1 Sprints 1–10 are BUILT (manual + unit +
E2E); P1 S11–12 designed-not-built; Phase 2 is designed-not-built (zero sprints built). So this is a
review of PROMPTS, not of built code. Sprint 6 is reached only after P1 S11–S12 and P2 S1–S5.

---

## 2. ARTIFACTS TO LOAD
From this bundle (attach all four):
1. **`visibleau-p2-sprint-6-prompt.md`** — core S6 build prompt, **v1.5** (the authority for the
   core build; Gate-3 audited).
2. **`visibleau-p2-sprint6-cdn-shield-enhancement.md`** — CDN delta, **v1.3** (layers on the core).
3. **`RUN-sprint6-core-plus-cdn-enhancement.md`** — the driver (sequences 1 then 2).
4. **`README.md`** — the bundle manifest (how the three relate).

External canon (NOT in this bundle — reference it; it WINS over all prompts):
5. **`visibleau-7layer-lld.md` v8.68** — inside `visibleau-phase2-v8_68-bundle-2026-06-25.zip` at
   `01-lld/` (~9,365 lines). Verify before reviewing:
   ```bash
   grep -m1 "^# Version:" visibleau-7layer-lld.md          # → # Version: 8.68
   grep -c "ATTRIBUTION CORRECTION" visibleau-7layer-lld.md # → 3
   ```
   If version < 8.66 or marker is 0, STOP — stale LLD.
Optional: the full Phase 2 bundle (other 8 sprint prompts + prototype) if Sri provides it.

---

## 3. THE LOCKED FACTS THE BUNDLE MUST NOT VIOLATE (canon invariants)
Hold all three files against these. Cite LLD line numbers in findings.
- **Additive only.** No Phase 1/Phase 2 table altered except documented nullable ALTERs. The
  enhancement claims ZERO schema change — verify.
- **Status enums are table-specific and must NEVER be unified:** `audits.status='complete'` (no -d,
  Phase 1); `workflow_runs.status='completed'` (-ed); the core S6 introduces append-only tables, not
  these — but confirm nothing in S6 compares/unifies status spellings.
- **`crawler_visit_logs.error_type`** already exists: `'blocked_cdn'|'js_render_fail'|'404'|null`
  (**LLD 5225**). The enhancement WRITES `'blocked_cdn'`, never adds the column. The table already
  has 14 cols incl `is_active_agent`/`referrer_ai_session`/`visit_purpose` (**LLD 974**) — re-adding
  any is a ❌.
- **One canonical crawler.** Phase 2 reuses `lib/crawler/index.ts` (Playwright, 20-page/15s/5min),
  crawling as `GPTBot/1.1` (**LLD 3385**, S-04). The enhancement reuses the already-fetched
  status+headers, NOT a second crawl. The ONE allowed extra fetch is the Tier-0 probe (enhancement
  §4), only because Tier-0 has no Playwright crawl.
- **Filename collision risk.** Canon has `lib/platform/local-ai-trust-scorer.ts` (the /100 local
  composite, NULL for SaaS — S6b-02). The enhancement's detector MUST be in **`lib/crawler/`**, never
  `lib/platform/`. Likewise the core's §8.4a task-fit logic must stay in `score-agent-readiness.ts`,
  NOT `local-ai-trust-scorer.ts`.
- **Honest-data.** A CDN block requires a CDN fingerprint AND a 403/429/503 status — never the mere
  presence of a CDN. A 200 behind Cloudflare is NOT blocked. (This fixed a real bug in Gemini's
  draft; the enhancement's §11 mandates the 200-not-blocked test.)
- **`local_ai_trust_score`** is NULL for SaaS AND NULL in the S6→S8 window (because `local_seo_results`
  is a Sprint 8 table supplying 45% of the composite) — the core S6 §6.6 makes this a binding
  decision guarded by `to_regclass('local_seo_results')`. Verify it's a NULL-not-partial choice.
- **Visit API canon-hardened.** `app/api/visit/route.ts` in the LLD (**5762–5780**) specifies SEC-A
  (validate `new URL(body.url).host === brand.domain`) + SEC-B (IP-throttle FIRST, then negative
  cache, then DB). The enhancement §5 applies exactly this; it must match the LLD step order and
  never regress.
- **serve() count.** Phase 2 = 25 Inngest functions total (23 after S6, 25 after S7). The core S6
  adds 5 (running total 23); the enhancement adds NONE. Verify.
- **Tier-0 sample audit** (`slug='sample'`, ChatGPT-only, 90-second, no login — S10 HC1) does NOT run
  the Playwright crawl; its <90s budget is sacred. The enhancement's Tier-0 hook must be lightweight
  (≤5s, parallel, skip-on-timeout) and reuse the sample flow's existing domain guard.
- **Better Auth canonical; zero Clerk.** Any "Clerk" in the LLD body is documented drift **C-04** —
  do NOT flag it. Page routes `[brandId]`; API routes `[id]`.

---

## 4. WHAT EACH FILE CLAIMS TO DO
**Core S6 (v1.5):** 4 tables + brand_token ALTER; 5 Inngest functions in serve(); 10 lib/retrieval
modules + local-ai-trust-scorer + explainability; §8.4a task-fit detection (booking/pricing/
service_area/faq → /20, detection specified, kept OUT of local-ai-trust-scorer.ts); public Visit API;
5 screens; S4 wiring; §8.6 retention extension (guarded); §6.6 local_ai_trust_score NULL window
decision.
**CDN enhancement (v1.3):** 1 pure lib file `lib/crawler/cdn-shield-detector.ts` (+ test); 1 edit to
`content-structure-audit.ts` (run detector on the existing crawl, write `error_type='blocked_cdn'`,
carry vendor+snippet in `gaps` JSONB as the SINGLE UI source — no vendor column); 1 UI alert card
(gated to the passive crawler-logs tier, not the active-agent Growth+ gate); optional §4 Tier-0 hook;
optional §5 Visit-API SEC-A/SEC-B hardening. Explicitly: no schema/column/Inngest-function/crawler
additions; serve() unchanged; detector in `lib/crawler/`; block requires a status code.
**Driver:** Phase 0 pre-flight → Phase A (build core, run its §12 greps + typecheck + tests as
Checkpoint A, commit) → ⛔gate → Phase B (apply enhancement, run its §0.3 Step-0 gate + its §12 greps
as Checkpoint B, commit). Two separable commits; LLD wins; halt on any STOP/GATE.

---

## 5. PER-FILE REVIEW CHECKLIST (✅/⚠️/❌ with evidence)
**Core S6 (v1.5):**
- [ ] §8.4a task-fit detection lives in `score-agent-readiness.ts`, NOT `local-ai-trust-scorer.ts`;
      reuses the existing crawl + the P1-S7 answer-capsule finder (no second crawl); honest-data
      (false on unverifiable/blocked); per-signal-false ≠ SaaS-NULL distinction is correct.
- [ ] §6.6 `local_ai_trust_score` NULL in S6→S8 window, guarded with `to_regclass`, NULL-not-partial,
      with a "Coming soon" UI state. Sound?
- [ ] Append-only crawler_visit_logs + agent_readiness_scores (no UPSERT); content_structure_audits
      UPSERT on (brand_id, page_url); entity_clarity_score ≠ score_of_10.
- [ ] 5 Inngest functions registered in serve() (running total 23); setRlsContext on protected
      routes; cross-org → 404 not 401; selectModel for every LLM call.
- [ ] Visit API §9.1: confirm whether the core ships the BT-01 light version and defers SEC-A/SEC-B
      to the enhancement §5 (that's the intended split) — flag if the core silently ships an
      un-hardened public endpoint with no pointer to §5.

**CDN enhancement (v1.3):**
- [ ] Adds NO new table/column (grep its text for `ADD COLUMN`/`CREATE TABLE`/`pgTable`); writes the
      EXISTING `error_type` column; vendor+snippet in `gaps` JSONB ONLY (single source — confirm §1,
      §3, §13 all agree after the v1.2 fix; earlier the §1 summary contradicted §3).
- [ ] Detector path `lib/crawler/cdn-shield-detector.ts` (NOT `lib/platform/`); NOT already created
      by the core S6 §4 file tree (no double-definition).
- [ ] Honest-data: block requires CDN fingerprint AND 403/429/503; §11 includes the Cloudflare+200 →
      `isBlockedByCDN===false` test (the single most important assertion).
- [ ] UI card gated to the passive crawler-logs tier (LLD 3170: passive=Starter+, active-agent
      Growth+), not over-gated to Growth+.
- [ ] §4 Tier-0 hook gated behind §2/§3, ≤5s parallel probe, reuses existing domain guard, skip on
      timeout; default mechanic (show vendor free, gate exact WAF rule behind signup) stated as
      Sri's call.
- [ ] §5 Visit-API SEC-A/SEC-B matches LLD 5762–5780 step order; clearly optional/skippable; no
      regression.

**Driver:**
- [ ] Phase 0 pre-flight checks the real prerequisites (right LLD, both prompt files present, S1
      budget service, S5 tables, P1-S12 retention cron) and STOPs on failure.
- [ ] Phase A → Checkpoint A (core §12 greps + typecheck + tests) is a HARD gate before Phase B.
- [ ] Phase B runs the enhancement's own Step-0 gate + Checkpoint B, re-runs the S6 suite to prove
      the delta didn't break the core.
- [ ] Produces two separable commits; references the two files by the names they have in this bundle
      (confirm the filenames match — the core file in this bundle is `visibleau-p2-sprint-6-prompt.md`,
      no numeric prefix).

---

## 6. MUTUAL-CONSISTENCY CHECKS (the point of a bundle review — do these explicitly)
- [ ] **Surface contract:** the enhancement edits `content-structure-audit.ts` and the crawler/
      `error_type` column — confirm the core S6 actually BUILDS those exact surfaces (same file
      names, same column) so the enhancement has something real to attach to.
- [ ] **No double-spec of `blocked_cdn` handling:** the core §8.4a already makes `blocked_cdn` force
      the task_* booleans false; the enhancement adds the detector that SETS `blocked_cdn` + the
      remediation UI. Confirm they LAYER (detector sets it → §8.4a consumes it → enhancement UI shows
      remediation) and don't contradict or double-write.
- [ ] **Tier consistency:** the enhancement's block-alert tier (passive crawler-logs) should match
      the tier the core's crawler-logs view actually ships at. Flag if the core ships crawler-logs at
      a different tier than the enhancement assumes.
- [ ] **Visit API ownership:** exactly ONE of {core §9.1, enhancement §5} should own the final
      hardened Visit API. Confirm there's no conflict (core builds light BT-01; enhancement §5 adds
      SEC-A/SEC-B). If both fully specify the route differently, that's a ⚠️.
- [ ] **serve() math:** core says running total 23 after S6; enhancement adds 0. Confirm the driver's
      final-report serve() expectation (23) matches.
- [ ] **Driver ↔ filenames:** the driver references the two prompt files — confirm the referenced
      names exactly match the files in this bundle (so Claude Code can `test -f` them).

---

## 7. SPECIFIC TRAPS (a sloppy review misses these)
- **T1 — Re-adding already-canon columns.** crawler_visit_logs / visibility_trends /
  content_structure_audits columns Gemini wanted are ALREADY canon (LLD 974 / 2295 / 2569). Neither
  the core nor the enhancement should re-add them. (The core ADDS the tables themselves for the first
  time — that's correct; it must not duplicate columns within them or re-ALTER existing P1 tables.)
- **T2 — The 200-behind-CDN false positive.** If the enhancement's detector/tests let a 200 read as
  blocked, the Gemini bug is back. The 200-not-blocked test is the tell.
- **T3 — `lib/platform/` collision.** Detector must be `lib/crawler/`; §8.4a must stay in
  `score-agent-readiness.ts`. Either landing in `lib/platform/` repeats Gemini's collision.
- **T4 — Second crawler / extra fetch.** Enhancement main path reuses the existing crawl; only the
  Tier-0 probe may fetch, and only because Tier-0 has no Playwright crawl.
- **T5 — Visit API regression.** §5 omitting SEC-A or SEC-B, or putting the DB lookup before the IP
  throttle, is a security regression vs LLD 5762–5780.
- **T6 — Tier-0 budget / SSRF.** Tier-0 probe must be ≤5s, parallel, skip-on-timeout, and reuse the
  existing domain guard — never a synchronous un-guarded fetch of a raw user domain.
- **T7 — local_ai_trust_score partial.** In the S6→S8 window it must be NULL, not a partial composite
  (a partial caps a perfect brand at ~55/100 — misleading). Core §6.6.
- **T8 — Clerk drift false alarm (C-04).** "Clerk" in the LLD body is documented drift — Better Auth
  is canonical. Don't raise it.
- **T9 — Recommending a merge.** Don't recommend fusing the core + enhancement into one file; the
  separation preserves the core's Gate-3 provenance and the enhancement's traceability. The driver is
  the intended way to run them together.

---

## 8. DELIVERABLE FROM YOUR REVIEW
1. **Verdict** for the bundle: PASS / PASS-WITH-FIXES / FAIL — separately note if any ONE file drags
   the verdict.
2. **Findings table:** per-file + mutual-consistency items, each ✅/⚠️/❌ with LLD line / file+section
   evidence.
3. For every ⚠️/❌, a **ready-to-paste correction** scoped to the exact file + section.
4. Confirm the enhancement's **§14 disposition table** is accurate (the "already canon at LLD line X"
   claims really hold; CDN remediation + Tier-0 hook is the only net-new piece).
5. Confirm the **driver's sequencing + gates** are safe (Phase A gate before Phase B; both checkpoints
   real; filenames match).

**Reviewer discipline:** LLD v8.68 WINS over all three prompts. Grep canon before asserting; cite line
numbers; never trust an unchecked claim. Distinguish a real conflict from a deliberate design choice
(e.g. snippet-in-JSONB instead of a column is a *choice* to avoid schema drift — judge soundness, don't
reflexively flag). A ready-to-paste fix for every issue, including minor ones.

---

## 9. QUICK-REFERENCE — canon line cites (verified against LLD v8.68)
- crawler_visit_logs already 14 cols (is_active_agent, referrer_ai_session, visit_purpose): **974**
- crawler_visit_logs.error_type column (WRITE, don't add): **5225**
- GPTBot crawl / one-canonical-crawler reuse (S-04): **3384–3392** (key **3385**)
- Tier: passive log import = Starter+ / is_active_agent active tracking = Growth+: **3170–3171** (+ Free+Starter crawler_visit_logs **3187**)
- Visit API SEC-A + SEC-B hardened steps: **5762–5780**
- agent_readiness task_score formula booking(5)+pricing(5)+service_area(5)+faq(min n,5): **1179–1180**
- local_ai_trust_score NULL-for-SaaS deferral (S6b-02): changelog v8.68 head **~37**; composite **~5440**
- visibility_trends ai_referral_sessions/ai_lead_estimate (already canon, not to re-add): col **6215–6216**; market_competition_label **6117**
- content_structure_audits outbound_citation_count/has_author_attribution/citation_probability_score (Y-03, already canon): **2569–2581**
- "CDN blocking detection" as an existing check the enhancement DEEPENS: **5191**, **2556**, **2865**
