# Third-Pass-Fix Audit: 8 cascade regressions surviving the second-pass-fix

**Audit date:** 13 May 2026 (later same day, after the 17-issue second-pass-fix)
**Auditor:** Claude (Sri's explicit "one more clean audit" request)
**Canonical reference:** PRD v1.15, CLAUDE.md v1.3, Foundations v1.10, Architecture v1.5, all sprints + prototype post-second-pass-fix
**Companion to:** `visibleau-conflict-audit-prd-vs-sprints.md` (29-conflict audit) and `second-pass-fix-audit.md` (17-issue audit)

**Bottom line:** The second-pass-fix made structurally-correct changes to canonical statements (TIER_ENGINES, Run-Audit-fires-both, library-cap-vs-pack-size) but **did not grep-propagate the changes to every doc surface** that referenced the old assertions. This pass caught those cascade regressions. **All 8 fixed.** This is exactly the failure mode CLAUDE.md §12 warns against (verification before claim) — and I did it twice in one day. The audit-pass pattern itself has diminishing returns; a fourth pass would likely find 3-4 minor items.

**Severity counts:** 2 critical, 4 high, 1 medium, 1 low (with cascade-corrected version bumps) = **8 issues**.

---

## CRITICAL — fixed

### B1. N1 fix didn't propagate to Sprint 3 §0 goal, §11 handoff step, or Sprint 4 UI

- **What:** Second-pass N1 added `TIER_ENGINES` (Free=2, paid=4) and updated Sprint 3 §1 + §4 + §6.5 + §8. But:
  - Sprint 3 §0 line 5 (Goal statement) still said "Expand the audit job from 1 engine × 1 run to 4 engines × 5 runs = 200 LLM calls. Per-audit cost budget <$3 USD." — unqualified, contradicts the v1.2 TIER_ENGINES.
  - Sprint 3 §11 handoff step 6 still said "loop 4 engines × 10 prompts × 5 runs = 200 calls" — hardcoded.
  - Sprint 4 audit-running screen spec hardcoded "Querying 4 engines × 5 runs (X/200 LLM calls)" and budget "US$3" — Free tier user would see wrong UI.
  - Sprint 4 audit-results-rich header hardcoded "Audit #X · 4 engines · 10 prompts × 5 runs = 200 LLM calls" — would mis-display for Free.
  - Sprint 4 per-engine breakdown specified "4 cards (ChatGPT/Claude/Gemini/Perplexity)" — Free user would see 2 empty Claude+Gemini cards.
- **Fix applied:**
  - Sprint 3 v1.3 §0 line 5: "up to 4 engines × 5 runs per prompt = up to 200 LLM calls (tier-derived: Free 2 engines/100 calls, paid 4 engines/200 calls per TIER_ENGINES). Per-audit cost budget <US$3 (paid tier) or ~US$1.50 (Free)."
  - Sprint 3 §11 step 6: now calls `enginesForTier(tier)` instead of hardcoded 4.
  - Sprint 4 v1.3 audit-running: progress text + budget text templated from `audit.engineCount`. Paid renders "4 engines × 5 runs (X/200)"; Free renders "2 engines × 5 runs (X/100)" + budget switches $3/$1.50.
  - Sprint 4 v1.3 audit-results-rich header: templated `{engineCount} engines · 10 prompts × 5 runs = {engineCount × 50} LLM calls`.
  - Sprint 4 v1.3 per-engine breakdown: renders `engineCount` cards (paid 4, Free 2); empty engines don't render.

### B2. N3 design lacked schema support for the "+ technical audit badge" claim

- **What:** Second-pass N3 said Sprint 4 audit-list would show a "+ technical audit" badge when both audits completed. But:
  - `technical_audits` schema had no `audit_id` FK to the multidim audit row.
  - Sprint 4 audit-list spec didn't include the badge column.
  - The only available join would have been `(brand_id, created_at within 10min)` — a fragile time-window heuristic that breaks if the technical audit takes >10min or the user fires two audits in quick succession.
- **Fix applied:**
  - Sprint 7 v2.2 `technical_audits` schema gains `auditId: uuid('audit_id').references(() => audits.id)` (nullable to allow future standalone technical audits, but populated for the N3 design).
  - Sprint 7 v2.2 adds indexes: `(auditId)` for audit-list joins, `(brandId, createdAt DESC)` for brand-level history.
  - Sprint 4 v1.3 audit-list spec gains a "technical-audit badge" column rendered when `technical_audits.audit_id` matches; renders inertly in Sprint 4 (links activate in Sprint 7).

---

## HIGH — fixed

### B3. Tier-aware audit description didn't propagate to UX copy surfaces

- **What:** Second-pass N1 changed the Sprint 3 audit job to tier-aware, but UX copy in:
  - HANDOFF.md tagline (§3 "What you're shipping")
  - HANDOFF.md Sprint 3 sub-section
  - Sprint 11 landing copy "How it works" step 3
  - Prototype audit-running screen step 3 (hardcoded "4 engines × 5 runs (87/200)")
  - Prototype wizard tutorial first-audit copy
  - Prototype landing how-it-works step 2 ("200 LLM calls across 4 engines")
  - Prototype docs methodology page "How we run audits" (5-step "Total: 200 LLM calls per audit")
  - ...all still said "200 LLM calls / 4 engines" unqualified.
- **Fix applied:**
  - HANDOFF.md §3 tagline + Sprint 3 sub-section: "up to 200 LLM calls (paid); 100 calls (Free); engine count via TIER_ENGINES."
  - Sprint 11 landing how-it-works: "up to 200 LLM calls across 4 engines. Free tier note: Free runs 100 calls across 2 engines."
  - Prototype 4 copy locations now tier-aware (audit-running comment notes the screen shows paid-tier illustrative case; wizard text shows both; landing + docs show both). The prototype itself stays as a mockup — real app templates from `audit.engineCount`.

### B4. Foundations + CLAUDE.md cost-target lines drift

- **What:** Foundations §line 765 still said "Audit completion time: < 10 minutes for 50-prompt audit." Foundations line 768 still said "Audit cost target: < US$3 per 50-prompt audit at v1 scale." CLAUDE.md line 439 said "Per-audit cost target: <US$3 (≈A$4.50) for full Sprint 3 multi-engine audit." None reflected the tier-aware split or the N3 combined-audit budget.
- **Fix applied:**
  - Foundations v1.11 §Performance: completion time + cost target both rewritten with paid/Free split and combined multidim+technical budget <US$3.50.
  - CLAUDE.md v1.4 §10: cost line rewritten — paid <US$3 (200 calls), Free ~US$1.50 (100 calls), combined N3 <US$3.50.

### B5. Three more broken PRD section references

- **What:**
  - Sprint 6 §0 line 14 said "PRD v1.14 §11 — Action Center spec." §11 is Roadmap and Milestones. Action Center lives at §8 Module 5.
  - Sprint 6 §6 line 171 said "Per PRD §11.4. The filter ..." — §11.4 doesn't exist. Anti-patterns table lives at §8.5.
  - Architecture line 1057 said "per PRD §11.5" for tier-aware model selection. §11.5 doesn't exist. Tier-based provider routing lives at §10 Layer 3.
- **Fix applied:** All three corrected in Sprint 6 v1.2 + Architecture v1.6.

---

## MEDIUM — fixed

### B6. Sprint 9 quota model didn't document the N3 shared-quota decision

- **What:** Second-pass N3 said "Shared quota: one Run Audit click = one tier-quota slot." But Sprint 9 §6 (`TIER_AUDIT_LIMITS`) didn't document whether the quota counts multidim only, technical only, or both — and didn't specify which table the quota check reads from. Without explicit documentation, a future Claude Code build would either double-count (adding `technicalAuditsPerMonth` and gating both) or under-count.
- **Fix applied:** Sprint 9 v2.1 §6 gained a "Shared multidim + technical-audit quota" paragraph: one click = one slot; quota check reads `audits` table only; `technical_audits` is satellite via `audit_id` FK. Combined per-audit cost budget <US$3.50 paid / ~US$2 Free. Operator-override path noted if Sri later wants separate quotas.

---

## LOW — fixed

### B7. Doc-index TL;DR still misdirected despite my second-pass banner

- **What:** Doc-index TL;DR (line 18) still pointed readers to "sri-visibleau-sprints-1-3.md" — a combined sprints file that doesn't exist in the bundle (was split into 12 separate sprint files). My second-pass N16 staleness banner documented this drift but the actual TL;DR line still pointed there.
- **Fix applied:** Doc-index TL;DR rewritten to point to HANDOFF first, then PRD/Architecture/Foundations, then individual sprint prompts at `03-sprint-prompts/sri-visibleau-sprint-N-prompt.md` (N=1 first), with a parenthetical noting the bundle has 12 separate sprint files.

### B8. Sprint 6 PRD version reference stale

- **What:** Sprint 6 §0 line 14 referenced "PRD v1.14" and line 15 referenced "Foundations v1.9." Current bundle has PRD v1.15 + Foundations v1.10 (rising to v1.11 in this third pass). Bundled with the B5 fix above.
- **Fix applied:** Sprint 6 v1.2 §0 — PRD ref v1.14 → v1.15; Foundations ref v1.9 → v1.10.

---

## Cross-cutting observations

### Why these survived the second pass

The second pass made canonical statements (N1: tier-aware engines; N3: Run-Audit-fires-both; N8: 10 prompts not 50). It updated the Sprint 3, Sprint 7, and PRD files where those canonical statements live. It did NOT:

1. **Grep-propagate the canonical change.** Sprint 4 references the audit data model heavily but I didn't search Sprint 4 for `"200 LLM calls"` or `"4 engines"` after the N1 fix. Same for HANDOFF copy and prototype.
2. **Verify the schema supports the design.** N3 said "+ technical audit badge" without checking whether `technical_audits` had the FK needed for the join.
3. **Update non-canonical references.** Foundations §Performance has its own cost-target line that echoes the PRD line; fixing the PRD line didn't fix the Foundations echo.

### The pattern (and the cost)

This is exactly the failure mode CLAUDE.md §12 "verification before claim" warns against — and I did it twice in two passes. The lesson is: after changing a canonical statement, the audit isn't done until I've grep'd the changed terms across every file in the doc set. ~5 minutes of grep would have caught B1, B3, B4, B5 in one shot.

### Audit-pass diminishing returns

29 conflicts → 17 → 8. Each pass catches roughly 50% of what's left. A fourth pass would likely find 3-4 minor items — probably more stale version references in test specs, more PRD-version-bump cascades, maybe one more cost-target echo somewhere. **At this point Sri's marginal time is better spent starting Sprint 1 than running another audit.** The doc set is in good shape; the residual drift is non-blocking.

### What this pass didn't audit

- Test specs in `04-test-specs/` — still hardcoded `expect(audit.engineCount).toBe(4)` in 4 places, plus `expect(citationRows.length).toBe(200)`. These need parameterization for Free-tier coverage. **Recommended Sprint 3 implementation-time task** (~30 min): when Claude Code builds Sprint 3, also update the test specs to parameterize the engine count by setting the test org's tier explicitly and asserting `enginesForTier(tier)`. The current "tier defaults to 'starter'" test-fixture default keeps the tests passing as-is for paid-tier coverage; Free-tier tests need to be added.
- Sprint 5 vertical-pack seed verification — Sprint 5 promises 124/104/108 prompts; if the actual seed files are written but at different counts, that's invisible to a doc audit. Operator-side verification at Sprint 5 build time.
- Sprint 2 mock fixtures vs Sprint 3 expansion — mock fixtures exist for `chatgpt` (Sprint 2) + 3 more engines (Sprint 3). I didn't check if all 16 (4 engines × 4 scenarios) are committed; this is a Sprint 3 build-time check.

These are not regressions — they're known follow-ups that belong to the implementation phase, not the doc phase.

---

## Verification

Each fix above was applied via `str_replace`. Version numbers were bumped (CLAUDE.md v1.3→v1.4; Foundations v1.10→v1.11; Architecture v1.5→v1.6; Sprint 3 v1.2→v1.3; Sprint 4 v1.2→v1.3; Sprint 6 v1.1→v1.2; Sprint 7 v2.1→v2.2; Sprint 9 v2.0→v2.1). Changelog entries added. README + HANDOFF updated. Final grep-verification confirmed all 8 issues closed.

If anything in this audit looks wrong, the diffs are reviewable per-file by comparing the second-pass-fix bundle's versions to this bundle's versions in the changelogs.
