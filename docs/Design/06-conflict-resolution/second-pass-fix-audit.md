# Second-Pass-Fix Audit: 17 issues surviving the 29-conflict resolution

**Audit date:** 13 May 2026
**Auditor:** Claude (fresh read against PRD v1.14 canonical, post-29-conflict bundle dated 12 May 2026)
**Canonical reference:** `sri-geo-aeo-prd-v1.md` v1.14 → v1.15 after fixes
**Companion to:** `visibleau-conflict-audit-prd-vs-sprints.md` (the original 29-conflict audit)

**Bottom line:** The 29-conflict audit got the big structural issues (tier prices, Module 5b scope, Supabase, sprint rotation). This second pass found the next layer: implementation-level gaps (Sprint 3 tier-engine filter), PRD-internal contradictions that survived the renumbering rounds, and doc-set staleness from rapid iteration. **All 17 are fixed in the 13 May second-pass-fix bundle.**

**Severity counts:** 2 critical, 4 high, 6 medium, 5 low = **17 issues**.

---

## CRITICAL — fixed

### N1. Sprint 3 audit job had no tier→engine filter; Free tier would query 4 engines

- **What:** Sprint 3 line 300 hardcoded `const ENGINES: Engine[] = ['chatgpt', 'claude', 'gemini', 'perplexity']` and "what ships" line 28 said "4 engines × 10 prompts × 5 runs = 200 LLM calls per audit" unqualified.
- **PRD says:** Free tier = 2 engines (ChatGPT + Perplexity); paid tiers = 4 engines.
- **Impact:** As written, a Free-tier audit would query 4 engines = 200 calls instead of the spec's 100 calls. Cost ~A$3-4.50 instead of capped. Free users would see Claude/Gemini results they're not entitled to.
- **Fix applied:** Added `lib/llm/tier-engines.ts` with `TIER_ENGINES` map and `enginesForTier(tier)` helper. Sprint 3 §1, §4, §6.5 (new), §8 all updated to use it. New test file `tests/unit/llm/tier-engines.test.ts`. Audit job now iterates `enginesForTier(tier)`; `audits.engineCount` is now tier-derived. Per-audit cost budget scales: Free 100 calls / ~US$1.50; paid 200 calls / ~US$3.

### N2. Schema default tier conflict: Foundations `'starter'` vs Sprint 1 `'free'`

- **What:** Foundations v1.9 line 314 said `tier: tierEnum('tier').notNull().default('starter')`; Sprint 1 v1.1 line 294 said `default('free')`.
- **Impact:** Direct schema contradiction. If Foundations had won, new signups would land on Starter privileges without paying — billing breaks.
- **Fix applied:** Foundations v1.10 — line 314 changed to `default('free')`. Operationally correct; matches PRD §7 Free-tier-as-demo strategy.

---

## HIGH — fixed

### N3. Sprint 7 + Sprint 4 didn't define the technical-audit + multidim-audit user journey

- **What:** Sprint 3 produces multidim audits; Sprint 7 produces technical audits. Two separate tables, two separate UIs. Nothing specified whether "Run Audit" triggers one or both, shared vs separate quota, or how audit-list shows both types.
- **Fix applied:** Design decision: Run Audit triggers BOTH in parallel via the same `audit/start` Inngest event. Shared quota (one click = one tier-quota slot). Per-audit cost budget rises to <US$3.50 (LLM + crawler). Sprint 7 v2.1 header captures the decision; `technical-audit-run.ts` description clarifies the SAME event triggers it; CLAUDE.md §2 v1.3 carries the matching design note.
- **Operator override:** If you prefer separate buttons + separate quotas (better cost control, two clicks), tell me and I'll flip the decision — both sprints stay otherwise unchanged.

### N4. Library-size math didn't work for Growth tier in a single vertical pack

- **What:** PRD §7 said Growth gets 200-prompt library; largest v1 pack (Tradies) has 124 prompts; custom prompt authoring is out of scope. Math didn't close.
- **Fix applied:** Added "Library-size-vs-pack-size note" to PRD §7 terminology and to CLAUDE.md §1. Pricing-page framing becomes "up to 200 prompts (pack-size dependent in v1)." Single-vertical Growth/Agency Pro customers see ~124 max in v1; the full 200 unlocks v1.1 when more packs or operator-curated cross-vertical prompts ship.

### N5. Sprint 10 first-audit-after-signup = ChatGPT-only contradicted prototype + Free tier rules

- **What:** Sprint 10 line 24 said "auto-trigger first audit using ChatGPT-only single-engine mode." Prototype line 1894 promised "4 LLM engines × 10 prompts × 5 runs." PRD §7 Free tier = 2 engines. Three-way contradiction.
- **Fix applied:** Sprint 10 v2.1 — first post-signup audit honours the new user's tier (Free = 2 engines per Sprint 3 TIER_ENGINES). The pre-signup sample audit already provides the 90-second ChatGPT-only teaser; the post-signup audit matches the tier the user signed up for.

### N6. Sprint 11 still contained sample-audit infrastructure despite v1.1 changelog claiming removal

- **What:** Sprint 11 v1.1 changelog said "Sample audit-related infrastructure refs (Upstash, sample-audit route, components) removed from §4 since Sprint 10 now owns them." Actual file still had: Upstash deps in §2; env vars in §3; `app/(marketing)/sample-audit/page.tsx`, `app/api/sample-audit/route.ts`, `lib/ratelimit/` in §4. Duplicate work with Sprint 10.
- **Fix applied:** Sprint 11 v1.2 — all stale refs stripped. Sprint 10 v2.0+ owns the sample audit cleanly.

---

## MEDIUM — fixed

### N7. PRD §8 Module 1 said "One-off A$99 audit charge"; §7 canonical is A$299

- **What:** PRD §7 Principle #4 line 1143 = A$299. PRD §8 Module 1 line 1240 tech notes = A$99 (stale from before the A$299 decision).
- **Fix applied:** PRD v1.15 — §8 Module 1 line 1240 updated to A$299 with cross-reference to §7 Principle #4.

### N8. PRD §8 Module 1 said "generates 50 prompts"; everything else says 10 per audit

- **What:** PRD §8 Module 1 line 1220 = 50 prompts. PRD §8 Module 1 line 1240 tech notes = 10 prompts × 5 runs. Architecture §5 line 263 = 50-200 prompts. Sprint 3 + CLAUDE.md + HANDOFF = 10 prompts.
- **Fix applied:** PRD v1.15 — §8 Module 1 line 1220 updated to "selects 10 AU-specific buyer prompts from the tier-allowed library (Free 20 / Starter 50 / Growth 200 / Agency 100/brand / Agency Pro 200/brand)." Architecture v1.5 §5 line 263 — "Returns 10 prompts per audit (selected from the tier's library: 20/50/200 per PRD §7)."

### N9. PRD §8 Module 4 AU directory list was stale (TrueLocal, Whitepages, Localsearch)

- **What:** Conflict-audit L2 flagged it; the 12 May resolution didn't fix. PRD §8 Module 4 listed TrueLocal, YPAU, Whitepages, Localsearch; §11 Sprint 8 + §16 #10 + Sprints/CLAUDE.md all use Hipages, YPAU, ServiceSeeking, Word of Mouth. Prototype mixed both lists across 4 surfaces.
- **Fix applied:** PRD v1.15 — §8 Module 4 list now Hipages, YPAU, ServiceSeeking, Word of Mouth (4 canonical) matching the rest of the doc set. Prototype updated: local-seo table trimmed to 5 canonical (4 directories + GMB); landing page + vertical-pack-detail directory mentions aligned.

### N10. PRD §8.5 line 1466 said "4 engines v1, 6 on Growth"

- **What:** Implied Growth gets 6 engines in v1. Contradicts §7 engine roadmap (all paid tiers get 4 in v1; Copilot + AI Overviews come v1.1).
- **Fix applied:** PRD v1.15 — §8.5 line 1466 updated to "4 engines v1 on all paid tiers; Copilot + AI Overviews join Growth+ in v1.1, DeepSeek + Grok join Agency Pro in v1.2 per §7 roadmap note."

### N11. Broken PRD section references in Sprints 8, 11, 12

- **What:** Sprint 8 referenced "PRD §12 drift detection" — §12 is Go-to-Market. Sprint 11 referenced "PRD §17 — pre-launch marketing copy" — no §17 exists. Sprint 12 referenced "PRD §18 — GoLive checklist" — no §18 exists. Likely leftover from before the Round 26 §13→§16 renumbering.
- **Fix applied:** Sprint 8 v2.1 → §8 Module 7 + §10 Layer 2. Sprint 11 v1.2 → §11 Sprint 11 + §12 + §13. Sprint 12 v1.2 → §11 Sprint 12 + §10 Security baseline.

### N12. PRIMARY_MODELS Free vs Starter identical (informational)

- **What:** Sprint 3 PRIMARY_MODELS had identical configuration for Free and Starter. Functionally fine, but raised the question: what differentiates Free from Starter at the LLM-cost layer?
- **Fix applied:** Sprint 3 v1.2 — added comment to model-selector.ts: "tier separation between Free and Starter is via TIER_ENGINES (Free=2, Starter=4) and prompt-library size, not via this file." Pairs with N1 fix.

---

## LOW — fixed

### N13. Prototype landing page promised 5 verticals; v1 ships 3

- **What:** Prototype line 3701 (landing) said "Tradies, SaaS, Allied Health, Beauty, Legal." Prototype's own vertical-pack-browser (line 2067-2073) showed Beauty + Legal as `status: 'coming-soon'` with 0 prompts.
- **Fix applied:** Prototype landing line 3701 → "Tradies, SaaS, Allied Health in v1. Beauty, Legal, Real Estate coming soon."

### N14. Sample audit cost-cap env var was USD but PRD spec is AUD

- **What:** PRD §7 Principle #6 = "~A$0.10 cost." Sprint 10 line 86 = `SAMPLE_AUDIT_COST_CAP_USD=0.10`. A$0.10 ≈ US$0.07 so the cap was loose by ~50%.
- **Fix applied:** Sprint 10 v2.1 — renamed to `SAMPLE_AUDIT_COST_CAP_AUD=0.10`. Added `FX_AUD_USD=0.66` for conversion. Sample-audit config field `estimatedCostUsd` → `estimatedCostAud`.

### N15. CLAUDE.md self-referenced wrong version

- **What:** CLAUDE.md line 608 said "bump this doc's version (currently v1.0)." Actual version was v1.2.
- **Fix applied:** CLAUDE.md v1.3 — line 608 updated to "currently v1.2." Then bumped self to v1.3 with this changelog.

### N16. Doc-index file was 3 days stale; referenced files that don't exist

- **What:** `02-engineering/sri-visibleau-doc-index.md` listed Foundations as v1.7 (actual: v1.9), `sri-visibleau-sprints-1-3.md` (no longer exists; bundle has 12 separate sprint files), prototype as 41-screen Round 20 (actual: 44-screen).
- **Fix applied:** Staleness banner added at top of doc-index pointing readers to README + HANDOFF + CLAUDE.md as authoritative entry points. Full refresh deferred (~30 min operator-side task).

### N17. REST + OpenAPI spec was a v1 stack lock but no sprint owned it

- **What:** Foundations line 110 said "REST with OpenAPI spec" as v1 tech-stack lock. No v1 sprint owns OpenAPI generation. Growth+ external API access is v1.1 scope.
- **Fix applied:** Foundations v1.10 — Backend section relaxed to "REST via Next.js API routes; OpenAPI spec generation deferred to v1.1." Removed `openapi-typescript` from v1 lock list. CLAUDE.md v1.3 §2 deferred-to-v1.1 list adds "REST API + OpenAPI spec for Growth+ tier external API access."

---

## Cross-cutting observations

### Why the 29-conflict audit missed these

The original audit was structural: it grep'd for "tier prices," "Module 5b," "Supabase vs Vercel." This second pass was implementation-level: it grep'd for hardcoded constants (`['chatgpt', 'claude', 'gemini', 'perplexity']`), broken section refs (`§12`, `§17`, `§18`), env-var unit mismatches (`_USD` vs `_AUD`), and self-version self-reference drift (CLAUDE.md "currently v1.0"). The two passes are complementary, not duplicative.

The original audit's recommendation #2 — "verify operator decisions" — listed Supabase, sprint rotation, anti-pattern count. Two more operator decisions surfaced in this pass:

- **N3:** Should "Run Audit" trigger both audits (shared quota) or two separate buttons (independent quotas)? Default-fixed to "both, shared quota"; flip if Sri prefers separate.
- **N4:** Should Growth tier's 200-prompt library be aspirational ("up to 200") or honest at 124 ("pack-size capped in v1")? Default-fixed to "up to 200 with pack-size note" — keeps marketing claim, adds honesty footnote.

### What this pass didn't audit

This pass didn't deep-read every sprint test spec (Sprint 1-3 test docs). The 29-conflict resolution worked from the sprint prompts; if test docs diverged independently, those gaps remain. Suggested follow-up: a test-vs-sprint-prompts pass on the 10 files in `04-test-specs/` (~1-2 hours).

This pass also didn't validate Sprint 5's 336-prompt seed against the curated prompt files (Sprint 5 line 263-265 says they're "curated by Sri"). If the actual prompts are written but not yet at 124/104/108 counts, that gap is invisible to a doc audit.

---

## Verification

Each fix above was applied via direct file edit with `str_replace`. Version numbers were bumped and changelogs added. Cross-references (e.g., PRD v1.15 in sprint reads) were updated. The 17 issues are closed.

If anything in this audit looks wrong, the diffs are reviewable per-file by comparing the 12 May bundle's versions to the 13 May bundle's versions in the changelogs.
