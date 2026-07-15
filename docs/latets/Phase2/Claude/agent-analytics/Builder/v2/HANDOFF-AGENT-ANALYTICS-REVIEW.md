# HANDOFF — Agent Analytics: review the LLD **and** the prototype **together** for conflicts

**You are a fresh reviewer chat.** Your job: read the Agent Analytics **LLD v1.3** and its **prototype** side by
side, check them against **Phase 2 canon**, and find conflicts — LLD↔prototype, LLD↔canon, prototype↔canon.
Read this whole document first.

> **The single most important instruction, learned the hard way over 5 prior audits:**
> **Grep/read the source BEFORE you assert anything.** Every conflict found so far (18 across LLD + prototype)
> came from a designer trusting recall instead of reading canon. If you catch yourself writing "canon says X"
> from memory — stop, and find the line. And its mirror is equally true: **once an artifact is actually correct,
> the honest result is "no conflict on this axis." Do NOT manufacture findings to look thorough — that is its own
> failure mode.** A review that says "checked axis Y, clean" is a valid, valuable result.

---

## 0. THE FILES

```
agent-analytics/
  visibleau-agent-analytics-LLD-v1.3.md        ← UNDER REVIEW (the design)
  visibleau-agent-analytics-prototype-v1.0.jsx ← UNDER REVIEW (the UI, Figma-grade)
phase-2-canon/
  visibleau-phase2-LLD-v8.70.md                ← CANON. THE AUTHORITY. ~9,000 lines.
  visibleau-phase2-prototype-FIX17.jsx         ← CANON. The design system + tab/gating model.
```

**Precedence when things disagree:** Phase 2 canon (v8.70 + FIX17) **wins** over the Agent Analytics LLD, which
**wins** over the Agent Analytics prototype. So: a prototype that contradicts the LLD → fix the prototype; an LLD
that contradicts canon → fix the LLD.

---

## 1. WHAT THE FEATURE IS (60 seconds)

VisibleAU is an AU-first GEO/AEO AI-visibility SaaS. It already has `crawler_visit_logs` — it records **which AI
bot visited which URL**. **Agent Analytics (Layer 1 / Retrieval — an EXTENSION, not a new layer)** closes three
gaps:
1. **No verification** — the table trusts the `User-Agent` string; there's no `source_ip`. A competitor scraping
   prices while claiming to be `GPTBot` is recorded as GPTBot.
2. **No referral side** — no human-referral data, so the **crawl-to-referral ratio** (the sellable metric:
   *"GPTBot fetched your booking page 400 times and sent 0 visitors"*) isn't computable today.
3. **No ingestion for clients who can't install the snippet** (AU SMBs on cPanel/shared hosting).

Plus the differentiator: the **CDN Shield join** — cross-referencing CDN Shield's *diagnosis* (blocked/allowed)
with the logs' *observed reality* (crawling/absent). No competitor can do this; it needs both halves.

---

## 2. THE STATE OF PLAY — 18 conflicts already found and fixed

This has been audited hard. **Do not re-find these — they're resolved.** Knowing them tells you which axes are
exhausted.

### LLD audits (v1.0→v1.3): 14 conflicts (AA-C1…AA-C14). The big ones:
- **AA-C1:** v1.0 proposed a new table `ai_crawler_hits`; **`crawler_visit_logs` already exists** (canon line
  5233: *"no second table needed"*). → LLD now ALTERs it.
- **AA-C2:** v1.0 invented a 4-value purpose enum; canon's `visit_purpose` is **`retrieval | indexing |
  training`**, and canon's `retrieval` means what v1.0 called `agent` — an **inverted semantic collision.** →
  adopted canon's enum verbatim.
- **AA-C4:** v1.0 said "Layer 8"; canon is **7 layers, 7 WCAG-verified tokens, no 8th.** → Layer 1 extended.
- **AA-C10 [HIGH]:** v1.1 proposed *removing* Free-tier crawler logs, calling it a "leak fix" — but canon ships
  them deliberately. → inverted.

### Prototype audits (4 passes): 17 conflicts (AA-P1…AA-P17). The big ones:
- **AA-P2 [architectural]:** invented a standalone route; canon's Retrieval is a **tab in `BrandIntelTabs`**
  (`minTier:'Starter'`). → it's a section inside the tab, no new route/tile.
- **AA-P3 [HIGH]:** exposed that **LLD §8's "Free ✅ crawler visits" was UNREACHABLE** (the tab is Starter-gated).
  → **LLD v1.3 §8 was rewritten to fix this** (see §3 below — this is the freshest change and the place a new
  reviewer should look hardest).
- **AA-P7:** used `IntelCard` (a *score* card) for raw counts → 100%-full bars. → new `CountCard`.
- **AA-P12/P15:** verification bar was double the canonical height + skipped reduce-motion; no loading/error
  states anywhere. → fixed.
- **AA-P17:** headline count didn't equal the sum of per-bot counts. → reconciled.

**The trend across passes: 9 → 5 → 5 → 1 → 0.** This is a *converging* audit. A prototype is finite; the well of
legitimate findings is nearly dry. **If your pass finds nothing on an axis, say so — that is the expected and
correct result on many axes now.**

---

## 3. THE FRESHEST CHANGE — scrutinise this first (§8 of the LLD)

LLD **v1.3 just rewrote §8** to resolve AA-P3. The resolution is subtle and worth checking carefully:
- **LLD 3198** (canon) is a *data-retention* decision: *"Free + Starter: `crawler_visit_logs`"* → Free-org data
  is **retained**.
- **Prototype FIX17 line 1051** (canon) is the *UI gate*: the Retrieval tab is `minTier:'Starter'` → Free
  **cannot open the surface**.
- v1.3's resolution: **these aren't contradictory** — Free's data is retained but the analytics UI is Starter-
  gated. The value ladder is **access (Starter) → trust/verification (Starter) → attribution/ratio+CDN-join
  (Growth)**.

**Check:** Does the prototype's tier switcher + `TierGate` usage actually match v1.3 §8? (The prototype dev-nav
omits 'Free' and gates the ratio + CDN-join at Growth via `TierGate` — confirm that's consistent with the LLD's
new table.) Does anything else in the LLD still imply Free can *see* the analytics? Is the "surface = tab
minTier, sub-features = TierGate overlays" split stated the same way in both files?

---

## 4. YOUR JOB — REVIEW BOTH TOGETHER (the axes worth checking)

The prior audits examined each artifact somewhat separately. **Your value-add is cross-checking them AS A PAIR.**

### Axis A — **LLD↔prototype data-contract agreement (highest priority)**
For every table/field the LLD §2 defines, does the prototype's mock use the **exact same names**?
- LLD schema: `crawler_visit_logs` (+ `source_ip`, `verification_status`, `verified_via`, `bytes`,
  `ingest_source`), `ai_bot_registry`, `ai_bot_ip_ranges`, `ai_referral_hits`. Fields: `crawler_name`, `vendor`,
  `visit_purpose`, `crawler_tier`, `verification_status`, `ai_platform`.
- The prototype was already corrected once (AA-P8) from `ua:`→`crawler_name`, per-bot→per-vendor ratio. **Re-verify
  every field name in the mock against the LLD's DDL.** Any drift Claude Code would build wrong.

### Axis B — **The three-state verdict + honesty rules, consistent in both**
- LLD **AA-05**: headline metrics count `verified` ONLY; `unverified`/`spoofed` shown separately, never merged.
- LLD **AA-13**: the ratio's referral side is a LOWER bound (caveat must be on the card).
- **Check:** does the prototype's `VerificationSplit` + `RatioCard` + `HonestyNote` actually enforce these, and do
  the LLD and prototype describe them the same way? Is the 25%-unverified alert (LLD AA-05) in both?

### Axis C — **The CDN Shield join (AA-15) — the differentiator, in both**
- LLD §5.3 defines 4 verdicts from (Shield says × Logs say).
- **Check:** does the prototype's `CdnShieldJoinTable` render exactly those 4 verdicts with the LLD's copy? Any
  fifth state, or a missing one?

### Axis D — **Tiering end-to-end (LLD §8 ↔ prototype gating ↔ canon tab)**
Already flagged in §3. This is the freshest and most conflict-prone area. Trace it through all three files.

### Axis E — **Invariant delta (LLD §9) vs canon reality**
LLD claims: Tables 37→40, GAPs 16→17, serve() 25→28, Layers 7 (unchanged). **Verify each against canon** — grep
every `[GAP N]`, confirm the 3 new tables really are new (not already in canon under another name), confirm
serve() is 25 today.

### Axis F — **Anything the prior 5 passes didn't touch.**
Candidates not yet deeply audited: the Action Center task-type enum (LLD §6 vs prototype `FindingsStrip` tasks),
the event/webhook naming (LLD §10 dot-vs-slash — the S7 bug class), the RLS/`assertBrandAccess` claims, the
`data_residency_log` writer question (canon's own audit found that table has no writer — does the LLD's "add
rows" even work?), the retention cron. Pick fresh axes; report clean ones as clean.

---

## 5. HOW TO REVIEW (the method that works)

1. **Read the source, then assert.** Every one of the 18 conflicts came from asserting from memory. Quote line
   numbers.
2. **Look for the INVERTED conflict, not just the missing one.** The worst finding (AA-C10) was "the design
   proposes REMOVING something canon deliberately ships." Ask of every claim: *does canon already do this, and the
   OPPOSITE way?*
3. **Cross-check the pair.** LLD says field `X`; prototype mock uses `Y` → conflict. LLD §8 table says Starter;
   prototype gates at Free → conflict. This pairwise check is your main job.
4. **Check what EXISTS before accepting anything NEW.** Grep canon for every "new" table/function/token.
5. **Report clean axes as clean.** "Axis C: checked CdnShieldJoinTable against LLD §5.3 lines X–Y; 4 verdicts
   match; no conflict" is a real result. The trend is 9→5→5→1→0 — expect many clean axes now.

---

## 6. CONTEXT

**Build state:** Phase 1 + Phase 2 Sprints 1–7 DONE (S7 committed `a8f20ed`). S8 (Governance) built + §12-green,
manual verification incomplete. S9 uncertain. **Agent Analytics is post-Phase-2 — design only, not in the build
queue.**

**The two-DB discipline (the project's most damaging recurring bug — 5+ times):** migrations get applied to dev
(`visibleau`) but not local prod (`visibleau_prod`, which the app runs against). In S8 this took every brand
route down. The LLD §12 must make this unmissable — check it does.

**The bedrock lesson (why this audits so hard):** every sprint the build reports "N tests pass, complete." Every
sprint the walk finds real bugs the tests missed. **"Looks complete" ≠ "is correct."** The same is true of
design: 18 conflicts across 5 audits of a document that each time "looked done." But the mirror holds too — this
one is now genuinely close to done, so **don't invent conflicts to fill a quota.**

**Sri's style:** Sydney solo founder, weekend pace, direct, no padding. Values honest correctness over
reassurance. Flag a real problem once, clearly. Don't rubber-stamp; don't manufacture.

**Relay:** reviewer chat (you) reads canon + writes ready-to-paste Claude Code `.md` prompts to
`/mnt/user-data/outputs/`. A separate Claude Code chat applies them. Sri pastes results back inline.

---

## 7. YOUR DELIVERABLE

1. **A conflict ledger** — format: `# | what the LLD/prototype says (file + line) | what it should say (canon
   line) | fix`. Number entries **AA-C15 / AA-P18 onward** (C1–C14 and P1–P17 are taken).
2. **Per axis, state the result** — conflict(s) found, OR "checked, clean" with the lines you verified.
3. **If conflicts found → fix them** in the relevant file (prototype if it contradicts the LLD; LLD if it
   contradicts canon), and **retain the ledgers** (they're institutional memory).
4. **Then, only if asked → the sprint prompts**: 2 sprints (P3-S1 Verification+Ingestion, P3-S2
   Attribution+Surfaces), Phase-2 house style — Figma-grade prototype spec, §11 test track, §12 verification
   greps, §13 anti-patterns, the two-DB migration discipline.

---

## 8. THE ONE KNOWN-OPEN ITEM (verify it's actually closed)

LLD §8 was *just* rewritten (v1.3) to fix the Free/Starter contradiction (AA-P3). **This is the freshest edit and
the most likely place for a residual inconsistency.** Confirm the LLD and prototype now agree end-to-end on
tiering — that's the highest-value thing you can check first.

**Start with Axis D (tiering) and Axis A (data contract) — they're the two most conflict-prone and the two where
LLD↔prototype agreement matters most for the build. Then work outward. Report clean axes as clean.**
