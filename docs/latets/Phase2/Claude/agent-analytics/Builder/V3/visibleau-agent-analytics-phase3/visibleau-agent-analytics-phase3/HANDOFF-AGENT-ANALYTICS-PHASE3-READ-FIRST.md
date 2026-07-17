# HANDOFF — VisibleAU Agent Analytics (Phase 3) — READ THIS FIRST

You are picking up **Agent Analytics** — a Phase 3 feature for VisibleAU. The design is **done and
conflict-clean**; the next step is **building it** via Claude Code. This document is everything you need.

---

## 1. WHO / WHAT
- **Sri** — Sydney solo founder, senior full-stack dev, weekend pace. Prefers OSS, bootstrap-first,
  direct communication **without padding**. Values honest correctness over reassurance — flag a real
  problem once, clearly; never rubber-stamp; never manufacture findings to look thorough.
- **VisibleAU** — AU-first GEO/AEO AI-visibility SaaS. Measures a brand's presence across
  ChatGPT/Claude/Gemini/Perplexity. **Phase 1 + Phase 2 are BUILT and shipped.**
- **Agent Analytics** — a **Phase 3** feature. **Layer 1 (Retrieval) EXTENSION — not a new layer.**
  Design-complete, not yet built.

## 2. THE RELAY — how work happens here
- **This chat** (reviewer/spec) reads canon + writes **ready-to-paste Claude Code `.md` prompts** to
  `/mnt/user-data/outputs/`.
- **A separate Claude Code chat** applies them to `C:\startup\VisibleAU\src\`.
- **Sri pastes results back** inline or as screenshots.
- ⚠️ **STANDING RULE: a `.md` prompt for EVERY finding (incl. LOW) and every diagnostic step.** Never
  ask Sri to run raw commands/psql/greps — wrap everything in a Claude Code prompt with a **Report-back**
  block. Group related issues where sensible.

## 3. WHAT AGENT ANALYTICS IS (2 minutes)
VisibleAU already has `crawler_visit_logs` — it records **which AI bot visited which URL**. Agent
Analytics closes three gaps and adds one differentiator:
1. **Verification** — today the table trusts the `User-Agent` string; there's no `source_ip`. A
   competitor scraping prices while claiming to be `GPTBot` is recorded as GPTBot. AA adds a 3-path
   verification engine (CIDR → FCrDNS → ASN) producing a 3-state verdict (`verified`/`unverified`/`spoofed`).
2. **Referral attribution** — no human-referral data today, so the **crawl-to-referral ratio** (the
   sellable metric: *"GPTBot fetched your booking page 400 times and sent 0 visitors"*) isn't computable.
   AA adds `ai_referral_hits`.
3. **Ingestion for snippet-less clients** — AU SMBs on cPanel/shared hosting can't install the JS
   snippet. AA adds log-file upload + (optionally) Cloudflare Logpush.
4. **THE DIFFERENTIATOR — the CDN Shield join** — cross-references CDN Shield's *diagnosis*
   (blocked/allowed) with the logs' *observed reality* (crawling/absent) → 4 verdicts. **No competitor
   can do this — it needs both halves, and only VisibleAU has both.**

## 4. THE FILES IN THIS BUNDLE
```
visibleau-agent-analytics-phase3/
  design/
    visibleau-agent-analytics-LLD-v1.5.md        ← THE DESIGN (authoritative for this feature)
    visibleau-agent-analytics-prototype-v1.0.jsx ← the UI mock (Figma-grade), aligned to LLD v1.5
    fix-AA-E1-stale-invariant-baseline.md        ← a fix prompt (see §7) — apply if not already applied
  sprint-prompts/
    visibleau-p3-sprint-1-prompt.md              ← BUILD THIS FIRST (Verification + Ingestion, no UI)
    visibleau-p3-sprint-2-prompt.md              ← THEN THIS (Attribution + all Surfaces)
  canon-reference/
    visibleau-phase2-LLD-v8.70.md                ← Phase 2 CANON (the authority AA is built against)
    visibleau-phase2-prototype-FIX17.jsx         ← Phase 2 CANON design system + tab/gating model
```
**Precedence when things disagree:** Phase 2 canon (v8.70 + FIX17) **wins** over the AA LLD, which **wins**
over the AA prototype. A prototype contradicting the LLD → fix the prototype; an LLD contradicting canon
→ fix the LLD.

## 5. THE DESIGN IS DONE — how solid it is
This design has been audited **hard** — do not re-open settled questions or manufacture new ones:
- **LLD audits (v1.0→v1.5):** 14 conflicts resolved (AA-C1…C14) + AA-E1 (stale invariant baseline) + two
  v1.5 internal-consistency fixes. Version history is in the LLD header.
- **Prototype audits (5 passes):** 17 conflicts resolved (AA-P1…P17). Trend across passes: **9→5→5→1→0
  — a converging audit.** The well of legitimate findings is essentially dry.
- **A fresh 6-axis cross-check** (data contract, honesty rules, CDN-Shield join, tiering, events,
  invariants) found exactly **one** issue (AA-E1) — and it wasn't a design error, it was canon's stale
  counts leaking in. Everything else verified clean, to line numbers.
- ⚠️ **The lesson: if you audit an axis and it's clean, SAY "clean." Do NOT invent conflicts to look
  thorough — that is its own failure mode.** A review that says "checked axis Y, clean" is a valid,
  valuable result. This design is genuinely close to build-ready.

## 6. ⚠️ THE NON-NEGOTIABLE RULES (from the whole VisibleAU project — these are LOAD-BEARING)

### 6.1 TWO DATABASES — the single most dangerous pitfall
- `visibleau` — **dev** (empty)
- `visibleau_prod` — **the DB the app actually runs against** (real data: 19 audits, 3,405 citations,
  Metropolitan + Bondi brands)
- ⚠️ **Every migration + seed MUST reach BOTH, verified with psql.** The dev-applied/prod-missing gap has
  caused **5+ critical failures** — in Phase 2 Sprint 8 it took **every brand route down (44 routes 500'd)**.
- Connection: `postgresql://postgres:password@localhost:5432/{visibleau|visibleau_prod}`

### 6.2 THE CORE THESIS (proven ~50+ times) — greps/tests passing ≠ works on screen
1. **Build the DB answer key BEFORE opening the page** — else a plausible-wrong value (0/100, "improved
   0.0 points") reads as correct.
2. **Click the buttons** — dead links / nav-orphans only surface by clicking (shipped 4× in Phase 2).
3. **Watch the SERVER TERMINAL** — dead event chains are invisible in code AND in the browser.
4. **Ask whether a control that LOOKS present actually DOES anything** — the Phase 2 paywall was a CSS
   blur; a tier gate that renders but enforces nothing is cosmetic (F28).
5. **Verify at 3 levels** — integration + E2E render-proof + grep. A grep asserting a string *exists*
   proves nothing about whether the code *runs*.
6. **Presence ≠ correctness** — cross-check computed rows against source data (that's how phantom/seed
   rows get caught).

### 6.3 Recurring bug classes to guard against (all bit Phase 2)
- **envelope-unwrap** — `Array.isArray(body)` on a `{key:[...]}` envelope → silent empty state, no crash,
  no test failure. Read `body.key`.
- **null-vs-zero** — truthy checks (`x && …`, `?? 0`) treating a real 0 or a missing row the same →
  fabricated zeros. Use `!= null`. "Never measured" (NULL) ≠ "measured zero."
- **dot-vs-slash event seams** — emitter/listener disagree (`audit.complete` vs `audit/complete`) → dead
  chain, all tests green. Cost Sprint 7 dearly. A terminal-read real run is the only proof.
- **client-only tier gate** — cosmetic; enforce server-side too.
- **stale counts in prose** — a hard-coded "25" survived 15+ additions. Point at
  `scripts/qa/inngest-serve-manifest.txt`, never a literal.

### 6.4 Standard conventions (canon-binding)
- Tier source-of-truth = **`subscriptions.tier`**, NEVER `organizations.tier`.
- RLS: direct-`organization_id`; cross-org → **404 not 401**; `setRlsContext` before every query;
  `assertBrandAccess` on every brand route.
- Events: **dot external, slash internal.**
- UI: no hex-alpha on `var()`; responsive; loading=skeleton, error=boundary, **never blank**;
  `prefers-reduced-motion` honored; existing `--layer-retrieval` token — **no new colour**; Better Auth
  (no Clerk).

## 7. THE ONE OPEN FIX (apply if Sri hasn't already)
`design/fix-AA-E1-stale-invariant-baseline.md` — corrects canon v8.70's stale invariant counts. **Note:**
the AA LLD is already at v1.5 with the AA-E1 fix folded in (§9 says serve() 40→43, tables 71→74). The fix
prompt's **Part 2 (sync canon v8.70 itself)** may still be outstanding — it proposes option A (edit every
header) vs option B (one authoritative "current invariants" block; **recommended**). **This is Sri's
decision — do not mass-edit canon unilaterally.** Confirm with Sri whether Part 2 was applied.

## 8. HOW TO START BUILDING
1. **Confirm the current canon.** ⚠️ These canon files are a **July-9 snapshot** — the Phase 2 *code* has
   moved past them (Sprint 9 + a cross-prompt "Gate 3" audit landed afterward). The LLD document itself
   was unchanged since then, so it's current *as a doc*, but the true serve()/table counts come from the
   repo's `inngest-serve-manifest.txt`, not these files' headers. **If Sri has newer canon, use it.**
2. **Build P3-S1 first** (`sprint-prompts/visibleau-p3-sprint-1-prompt.md`) — Verification + Ingestion,
   no UI. It's plumbing: the ALTER, 3 tables, the verification engine, the registry seed, log ingestion.
3. **Walk it** — build the DB answer key, run a real ingestion, watch the terminal (the dot-vs-slash
   proof). **Expect the walk to find bugs the tests miss** — that's been true every sprint. Write a fix
   prompt for each.
4. **Then P3-S2** (`sprint-prompts/visibleau-p3-sprint-2-prompt.md`) — Attribution + all Surfaces.
   ⚠️ **§7.0 leads it: BUILD the crawler card** — canon promised a "Sprint 9 crawler analytics card" that
   was **never built**; `crawler_visit_logs` has been collecting data since Sprint 6 with **no screen to
   read it** (an orphan-reader table). AA delivers that missing card. Use a **count card, not a score
   card** (a score card's bar fills to 100% for a raw count).
5. **Acceptance for P3-S2:** the ratio renders WITH its honesty caveat; the CDN-Shield join produces ≥1
   real finding on Metropolitan Plumbing; **verified on the RENDERED screen**, not just green tests.

## 9. TWO SPRINT-PROMPT NOTES (already handled, but know them)
- **serve() count:** the prompts say **43** (P3-S1 takes it 40→43). If you open the LLD and see any
  "serve()=28", that's a stale figure already corrected in v1.5 — **trust 43** (source of truth is the
  manifest).
- **Tier gate (P3-S2 §9):** the LLD's normative mechanism is a **`TierGate` client overlay**. The prompt
  *additionally recommends* server-side `assertTier('growth')` on the ratio + CDN-join routes — this is
  hardening **beyond** the LLD (the F28 "client-only gate is cosmetic" lesson), **flagged as an addition
  for Sri to approve**, not an LLD requirement. Don't present it as the LLD's spec.

## 10. KEY ANSWER-KEY DATA (for render-proofs)
- **Metropolitan Plumbing** = `418f321f-2489-4560-aaa9-895728580465` (tradies, 19 audits, real crawl +
  CDN Shield data — the brand to test AA against).
- **Bondi Plumbing** = `0f531803-b529-4d09-9fd6-b6272b5baba8`.

---

**Bottom line:** Agent Analytics is designed, audited to convergence, and build-ready. Build **P3-S1 →
walk → P3-S2**, apply the two-DB discipline religiously, and **prove every surface on the rendered screen
with a DB answer key** — because on this project, "looks complete" has been wrong ~50 times and "the
screen agrees with the database" is the only thing that's been right. Write every fix as a ready-to-paste
Claude Code `.md` with a behavioural break-proof and a report-back block.
