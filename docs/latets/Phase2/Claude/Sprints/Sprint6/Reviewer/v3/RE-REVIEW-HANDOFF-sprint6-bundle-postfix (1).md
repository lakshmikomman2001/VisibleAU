# RE-REVIEW HANDOFF — VisibleAU Phase 2 Sprint 6 BUNDLE (post-fix verification)
**For:** a fresh Claude chat asked to confirm a just-corrected Sprint 6 bundle is now conflict-free.
**Date:** 26 Jun 2026. **Your job:** verify that **3 specific fixes** were applied correctly and that
**nothing else regressed** — then do a backstop conflict sweep. Do NOT rubber-stamp. Paste this whole
file at the start of the review chat, attach the artifacts in §2, then work through §5–§8.

> **This is a RE-review, not a first review.** The bundle was already independently reviewed (verdict
> PASS-WITH-FIXES); 3 one-line fixes were applied and the bundle repackaged. Your primary task is §5
> (confirm the 3 fixes landed) + §6 (confirm no regression). §7 is the full conflict sweep as a
> backstop. If you find the 3 fixes are correct and nothing regressed, the bundle is ship-ready.

---

## 1. WHAT YOU ARE REVIEWING (one paragraph)
VisibleAU is an Australian GEO/AEO visibility-auditing SaaS. Phase 2 is a 9-sprint build on top of a
built Phase 1, designed to LLD **v8.68** (Gate-3 audited). This bundle builds **Phase 2 Sprint 6 —
Retrieval Intelligence + Agent Readiness** plus a net-new **CDN Shield enhancement**. It has three
prompt files: the **core S6 build prompt (v1.5)**, the **CDN enhancement delta (now v1.3)**, and a
**driver** that runs them back-to-back. A prior bundle review found the bundle sound EXCEPT for one
inconsistency that appeared in two places: the CDN block-alert UI gate was specified as "Growth+" in
some spots and "passive crawler-logs tier" in others. **3 fixes were applied** to resolve it (detailed
in §4). You are confirming those fixes are correct and complete.

**Build-state context (so you don't mis-scope):** Phase 1 Sprints 1–10 BUILT (manual + unit + E2E);
P1 S11–12 designed-not-built; Phase 2 designed-not-built (zero sprints built). This is a review of
PROMPTS, not built code. Sprint 6 is reached only after P1 S11–S12 and P2 S1–S5.

---

## 2. ARTIFACTS TO LOAD
From the corrected bundle `visibleau-p2-sprint6-bundle-2026-06-26.zip` (attach all five):
1. **`visibleau-p2-sprint-6-prompt.md`** — core S6 build, **v1.5** (736 lines). Should be UNCHANGED by
   this fix round — verify that.
2. **`visibleau-p2-sprint6-cdn-shield-enhancement.md`** — CDN delta, **v1.3** (423 lines). The file
   that received Fix 1.
3. **`RUN-sprint6-core-plus-cdn-enhancement.md`** — the driver (147 lines). Received Fixes 2 + 3.
4. **`README.md`** (65 lines) — manifest; version refs updated to v1.3.
5. **`REVIEW-HANDOFF-sprint6-bundle.md`** (222 lines) — the ORIGINAL (pre-fix) review brief, kept as
   history. (This file you're reading now supersedes it for the re-review.)

External canon (NOT in the bundle — it WINS over all prompts):
6. **`visibleau-7layer-lld.md` v8.68** — verify before reviewing:
   ```bash
   grep -m1 "^# Version:" visibleau-7layer-lld.md          # → # Version: 8.68
   grep -c "ATTRIBUTION CORRECTION" visibleau-7layer-lld.md # → 3
   ```
   If version < 8.66 or marker is 0, STOP — stale LLD.

---

## 3. THE ONE DECISION THAT WAS FIXED (background)
The CDN enhancement adds an "AI Crawler Access Blocked" UI alert card. **What tier gates it?**
- The card is driven by the **passive GPTBot crawl** (the weekly `content-structure-audit.ts` run),
  NOT by active-agent visit tracking.
- **LLD 3170** sets the tiers: passive log import = **Starter+**; `is_active_agent` *active-agent*
  tracking = **Growth+**.
- Therefore the block alert should follow the **passive crawler-logs tier** (Starter+ class), NOT be
  hard-gated to **Growth+**. Over-gating to Growth+ would hide a useful signal from Starter customers.

The bug: the enhancement's §1 was fixed (in v1.1) to say "passive tier, not Growth+", but its §10
Claude-Code-prompt block STILL said "Keep it behind the existing Growth+ crawler-analytics gate" — so
§1 and §10 contradicted each other, and the **driver echoed the stale §10**. Since §10 (and the driver)
are what the builder actually executes, the fix hadn't truly landed. The 3 fixes resolve this.

**Correct end state (what you're verifying):** §1, §10, AND the driver all say the same thing — gate the
card to the built S6 crawler-logs view's tier (passive → Starter+ class), not the active-agent Growth+
gate. The prompts deliberately say "match whatever the built S6 UI uses" rather than asserting a fixed
tier, so the builder resolves it against real code — that's the intended design, not vagueness.

---

## 4. THE 3 FIXES THAT WERE APPLIED (your checklist subject)
- **Fix 1 — enhancement `visibleau-p2-sprint6-cdn-shield-enhancement.md` §10 (≈line 296).** The §10
  Claude-Code-prompt gate wording was changed from "Keep it behind the existing Growth+
  crawler-analytics gate" to "Gate it to the SAME tier as the built S6 crawler-logs / retrieval view…
  passive-crawl output → follow the passive crawler-logs tier per §1; do NOT hard-gate to Growth+…
  (LLD 3170: passive = Starter+, active-agent = Growth+)." **Enhancement bumped v1.2 → v1.3** with a
  changelog entry.
- **Fix 2 — driver `RUN-sprint6-core-plus-cdn-enhancement.md` (Phase B step 3, ≈line 98).** The driver's
  echo of the stale §10 wording ("the existing Growth+ crawler-analytics gate") was changed to "the
  SAME tier as the built S6 crawler-logs view (passive-crawl output → passive crawler-logs tier per the
  enhancement §1, not the active-agent Growth+ gate)."
- **Fix 3 — driver prerequisites (≈line 14).** A stale version reference to the enhancement ("the
  net-new CDN delta, v1.0") was corrected to "v1.3".
- **Propagation:** README (heading, review-history line, diagram label) and the embedded original
  handoff were updated to v1.3. The core S6 prompt (v1.5) was NOT touched.

---

## 5. RE-REVIEW CHECKLIST — DID THE 3 FIXES LAND? (✅/⚠️/❌ with grep evidence)

**Fix 1 — enhancement §10 aligned**
- [ ] §10's gate wording no longer says "Keep it behind the existing Growth+ crawler-analytics gate".
      `grep -n "Keep it behind the existing Growth+" visibleau-p2-sprint6-cdn-shield-enhancement.md` →
      **expect 0 matches** (the bare instruction is gone).
- [ ] §10 now says passive-tier. `grep -n "follow the passive crawler-logs tier per §1"
      visibleau-p2-sprint6-cdn-shield-enhancement.md` → **expect ≥1** (≈line 296).
- [ ] §1 and §10 now AGREE: both reference "passive crawler-logs tier, not the active-agent Growth+
      gate". (§1 ≈line 107–109; §10 ≈line 296–298.) Read both — confirm no contradiction remains.
- [ ] Header is **v1.3**; the CHANGELOG has a v1.3 entry describing the §10↔§1 alignment.

**Fix 2 — driver gate aligned**
- [ ] Driver Phase B step 3 no longer says "the existing Growth+ crawler-analytics gate". `grep -n
      "Growth+ crawler-analytics gate" RUN-sprint6-core-plus-cdn-enhancement.md` → **expect 0** (the
      bare instruction is gone; any "Growth+" left should only be in the LLD-3170 *explanation*).
- [ ] Driver step 3 now says "passive crawler-logs tier per the enhancement §1, not the active-agent
      Growth+ gate" (≈line 98–99).

**Fix 3 — driver version reference**
- [ ] `grep -n "net-new CDN delta, v1" RUN-sprint6-core-plus-cdn-enhancement.md` → reads **v1.3**, not
      v1.0/v1.1/v1.2.

**Propagation**
- [ ] README references the enhancement as **v1.3** in all spots (heading line 21, diagram line 45,
      review-history line ~25). `grep -n "v1.2" README.md` → **expect 0** (except none).
- [ ] Bundle handoff (`REVIEW-HANDOFF-sprint6-bundle.md`) version refs read v1.3, except one historical
      "after the v1.2 fix" line (≈123) intentionally preserved as a description of a past event — that
      one is correct to keep.

---

## 6. REGRESSION CHECK — DID ANYTHING ELSE MOVE? (the critical part of a fix re-review)
A fix round can accidentally disturb things. Confirm it did NOT:
- [ ] **Core S6 prompt is byte-identical to the approved v1.5.** `diff` it against the known-good v1.5
      if you have it, or confirm its header is `Version: 1.5` and §8.4a is intact (task-fit detection
      in `score-agent-readiness.ts`, NOT `local-ai-trust-scorer.ts`; SaaS computes task_score; reuses
      P1-S7 answer-capsule finder). The fixes touched only the enhancement + driver + README + handoff,
      never the core. **If the core changed, that's a ❌** — flag it.
- [ ] **The enhancement's substance is unchanged except §10's gate wording.** The detector contract
      (§2, pure function, 403/429/503 + CDN fingerprint), the §3 single-source JSONB persistence, the
      §4 Tier-0 hook, the §5 SEC-A/SEC-B hardening, the §11 tests (incl the Cloudflare+200→not-blocked
      assertion), the §12 greps — all should be IDENTICAL to before. Only the §10 gate line + header +
      changelog changed. Confirm no other section moved.
- [ ] **The driver's sequencing is unchanged except the two edits.** Phase 0 pre-flight, the Phase A
      checkpoint gate before Phase B, the two-commit structure, the LLD-wins rules — all intact. Only
      the Phase-B-step-3 gate wording + the v1.0→v1.3 reference changed.
- [ ] **No new contradiction was introduced.** Grep the WHOLE bundle: every "Growth+" mention should
      now be either (a) part of the LLD-3170 *explanation* (passive=Starter+, active-agent=Growth+) or
      (b) a changelog entry *documenting* the fix — NOT a bare "gate the card to Growth+" instruction.
      `grep -rn "Growth+" *.md` and read each hit in context.

---

## 7. BACKSTOP — FULL CONFLICT SWEEP vs CANON (in case the fix round exposed something)
These passed in the prior review; re-confirm the load-bearing ones still hold (cite LLD lines):
- [ ] **Additive only.** Neither the core nor the enhancement adds a table/column outside documented
      ALTERs. Enhancement = ZERO schema. (Grep both for `ADD COLUMN`/`CREATE TABLE`/`pgTable` — only
      the core's 4 new Layer-1 tables + the brand_token ALTER should appear; the enhancement adds none.)
- [ ] **`crawler_visit_logs.error_type` already exists** (**LLD 5225**) — enhancement WRITES
      `'blocked_cdn'`, never adds. The 14 existing cols (**LLD 974**) are not re-added.
- [ ] **One canonical crawler**, GPTBot/1.1 (**LLD 3385**) — enhancement §3 reuses the already-fetched
      status+headers; the §4 Tier-0 probe is the ONLY extra fetch (Tier-0 has no Playwright crawl).
- [ ] **No `lib/platform/` collision** — CDN detector in `lib/crawler/cdn-shield-detector.ts`; core
      §8.4a task-fit logic in `score-agent-readiness.ts`. Neither in `lib/platform/` (canonical
      `local-ai-trust-scorer.ts` lives there — **LLD 5520/5540**).
- [ ] **Honest-data block rule** — `isBlockedByCDN` requires CDN fingerprint AND 403/429/503; a 200
      behind a CDN is NOT blocked. The §11 Cloudflare+200→`false` test is present.
- [ ] **Visit API hardened** — enhancement §5 (optional) matches LLD **5762–5780** step order
      (Zod → SEC-B IP throttle → SEC-B negative cache → token lookup/401 → SEC-A domain check →
      per-token limit → emit `visit/ingested` → 202). No regression.
- [ ] **serve() = 25 total** (23 after S6, +0 from enhancement). Core states running-total-23; driver
      final-report expects 23.
- [ ] **`blocked_cdn` ownership is complementary, not double-spec.** Core §8.4a *consumes*
      `blocked_cdn` (task booleans → false); enhancement §3 *sets* it + adds remediation UI. One
      writes, one reads — confirm they layer, don't contradict.
- [ ] **Status enums not unified** (audits `'complete'` / workflow_runs `'completed'`); the core's new
      tables don't compare spellings.
- [ ] **Clerk in the LLD body = documented drift C-04** (Better Auth canonical) — do NOT flag it.

---

## 8. DELIVERABLE FROM YOUR REVIEW
1. **Verdict:** are the 3 fixes correctly applied AND nothing regressed? (CONFIRMED-SHIP-READY /
   FIXES-INCOMPLETE / REGRESSION-FOUND.)
2. **Fix-verification table:** Fix 1 / Fix 2 / Fix 3 / propagation — each ✅/⚠️/❌ with grep evidence.
3. **Regression table:** core unchanged? enhancement substance unchanged? driver sequencing unchanged?
   no new contradiction? — each ✅/❌.
4. For any ⚠️/❌, a **ready-to-paste correction** (exact file + section + change + why).
5. If all green: state explicitly that the bundle is internally consistent and ship-ready, and that the
   only deferred decision (the exact S6 crawler-logs tier) is correctly left to build-time resolution.

**Reviewer discipline:** the **LLD v8.68 WINS** over all prompts. Grep before asserting; cite line
numbers; never trust an unchecked claim. Distinguish a deliberate design choice (e.g. "match the built
S6 UI's tier" is intentional deferral, not vagueness; snippet-in-JSONB instead of a column is a choice
to avoid schema drift) from a real conflict. A ready-to-paste fix for every issue, including minor ones.

---

## 9. QUICK-REFERENCE — canon line cites (verified against LLD v8.68)
- Tier: passive log import = Starter+ / `is_active_agent` active tracking = Growth+ (the fixed gate): **3170–3171** (+ Free+Starter crawler_visit_logs **3187**)
- `crawler_visit_logs.error_type` (WRITE `'blocked_cdn'`, don't add): **5225**; 14 existing cols: **974**
- One-canonical-crawler / GPTBot UA `crawlSite(brand.domain, { userAgent: 'GPTBot/1.1' })`: **3385** (3384–3392)
- `lib/platform/local-ai-trust-scorer.ts` (collision-guard file, /100 NULL-for-SaaS): **5520/5540**
- agent_readiness `task_score` formula booking(5)+pricing(5)+service_area(5)+faq(min n,5): **1179–1180** (cols **5508–5514**)
- Visit API SEC-A + SEC-B hardened step order: **5762–5780**
- "CDN blocking detection" as an existing check the enhancement DEEPENS: **5191**
- Already-canon Gemini cols NOT to re-add: visibility_trends **6215–6216**/**6117**; content_structure_audits **2569–2581**
- Canon version gate: `# Version: 8.68`; `ATTRIBUTION CORRECTION` ×3
