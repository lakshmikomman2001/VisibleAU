# VisibleAU Phase 2 — SPRINT 2 PROMPT: GATE 2 FINDINGS (PASS 2 — fix-validation + fresh angle)
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: visibleau-p2-sprint-2-prompt.md **v1.1** (Workflow Intelligence)
# Canon used: visibleau-phase2-v8_65-complete-REVIEWED-r2 (LLD v8.65, 9,192 lines)
# Pass-1 angle: fidelity-to-LLD + correctness rules + template (findings S2-01..05).
# Pass-2 angle (this doc): THE PROMPT AGAINST ITSELF — internal wiring-graph integrity
#   (event↔route↔function), file/identifier/count consistency across all sections, and
#   grep executability. (v1.1 removed a feature across 8 sections — exactly where orphans appear.)

---

## 1. VERDICT — **PASS-WITH-FIXES** (near-clean: one LOW-MOD count + one trivial; otherwise clean)

**(a) v1.1 fixes — ALL VERIFIED CORRECTLY APPLIED**, including the high-risk multi-section
wins-feed deferral with **zero orphan references**:
- **S2-01 (wins-feed → Sprint 3) — applied consistently, no orphans.** All 12 wins-feed /
  `/wins` mentions now say "Sprint 3 / deferred / do NOT build": §1 (lib list + API list),
  §4 tree (lib + route both replaced with S3 NOTEs), §6.6 ("wins-feed is NOT built this
  sprint", LLD ~7779 cited), §9 ("`GET …/wins` is Sprint 3"), §10 (step 3 "DO NOT build
  wins-feed.ts"; step 6 "wins route is Sprint 3"), §11 (wins-feed.test removed), §13 pitfall
  ("Building wins-feed this sprint" is now the anti-pattern), §14 handoff ("Sprint 3 builds
  wins-feed Phase A in full"). Nothing in S2 still constructs it. ✓
- **S2-02 (§6U depth) — applied.** Added GLOBAL UI RULES; each shared component now lists
  props/variants/STATES; each screen (6U.2–6U.5) has a STATES matrix AND a `RESPONSIVE:` line
  (sm:/md: behaviour or explicit deferral); added the RESPONSIVE and reduced-motion §12
  greps. The checkable ★6U gaps are closed. (Depth note below.) ✓
- **S2-03 (draft_type) — applied.** §5.3 enumerates all **13** values inline
  (wikipedia_article…listicle) matching LLD 7892–7923, with the note that `outreach_brief`
  is a valid column value whose generator is **Sprint 6** (not built here). ✓
- **S2-04 (anchor) — applied.** §6U.5 now cites "prototype ~1114–1211, inside
  EnhancedDashboard". ✓
- **S2-05 (reduced-motion) — applied.** §6U.0 carries the `@media (prefers-reduced-motion:
  reduce)` reset matching the RM-01 pattern, with the inline-`animation:`-override note. ✓

**(b) Fresh-angle (internal consistency + wiring + grep executability) — clean except S2b-01/02:**
- **Wiring graph intact:** `draft/generate` is emitted by `POST …/drafts` (§9) and consumed
  by generate-content-draft (§8.1); `task/completed` is emitted by `POST …/tasks/[id]/complete`
  (§9) and consumed by trigger-validation-reaudit (§8.2); both verified end-to-end and tested
  (validation-reaudit.integration.test.ts). ✓
- **Route files consistent:** §4 tree lists 7 `route.ts` files (tasks, tasks/[id],
  tasks/[id]/complete, drafts, drafts/[id], progress, organizations/[id]/tasks); §9 describes
  exactly those 7 (wins removed from both). ✓
- **Test files consistent:** §11 lists 7 tests, all mapping to §4-tree modules; wins-feed.test
  correctly removed. ✓
- **§-reference integrity:** every `§N`/`§N.M` reference resolves to a real header; no dangling
  references. ✓
- **Counts:** "3 tables" and "3 Inngest functions" are consistent across §1/§5/§8/§12. ✓

---

## 2. NEW FINDINGS (pass 2)

### S2b-01 — [LOW-MOD] §1 lib-module count (5) disagrees with the §4 tree / §6 (7)
- **Internal inconsistency:** §1 says "**5 workflow lib modules** (§6) + the shared
  `progress-summary` helper (§6.6)" — i.e. 6 modules named. But the §4 tree `lib/workflow/`
  lists **7 functional modules** (task-manager, **priority-scorer**, content-generator,
  content-format-selector, validation-scheduler, workflow-orchestrator, progress-summary)
  + types.ts + index.ts, and §6 specifies each of them (§6.1–§6.6, where §6.5 covers two
  files). The uncounted module is **`priority-scorer.ts` (§6.2)** — a substantial one (the
  priority-rank formula + confidence_label derivation).
- **What I checked:** counted the §4 tree (7 functional `.ts` excluding types/index) vs the
  §1 phrasing (6 named) vs the §6 subsections (6.1–6.6). The LLD's own lib block (LLD
  8065–8073) also lists only 5 and omits priority-scorer (it's referenced in LLD prose at
  7623/7666), so §1 likely inherited the LLD block's 5-count while the §4 tree correctly
  ADDED priority-scorer + progress-summary — leaving §1 stale vs the prompt's own tree.
- **Why it matters:** same class as Sprint 1's S1-02 (a count that disagrees with the tree);
  Playbook §4.1 wants the structure self-consistent. No build impact (the tree + §6.2 fully
  specify priority-scorer), but it's a real inconsistency a reviewer should bounce.
- **Required fix:** align §1 to the tree — e.g. "**6 workflow lib modules** (task-manager,
  priority-scorer, content-generator, content-format-selector, validation-scheduler,
  workflow-orchestrator) + the shared `progress-summary` helper." No LLD change.

### S2b-02 — [LOW / trivial] reduced-motion §12 grep target vs the flexible token file
- **Inconsistency:** the new §12 grep is `grep -c "prefers-reduced-motion" app/globals.css
  → ≥1`, but §4 tree and §6U.0 allow the tokens (and thus the reduced-motion block) to live
  in **`tokens.css` (or globals.css additions)**. If the build puts them in `tokens.css`,
  the grep returns 0 — a false failure.
- **Fix:** either standardize the token/animation file to `app/globals.css` (and say so in
  §4/§6U.0), or broaden the grep target (e.g. `grep -Rc "prefers-reduced-motion"
  app/globals.css app/**/tokens.css`). Trivial.
- (Also trivial, no fix needed: §6U numbering jumps 6U.0 → 6U.2 with no 6U.1; harmless —
  6U.1 is never referenced, so no dangling reference.)

---

## 3. DEPTH NOTE (S2-02 follow-through — informational, not a re-finding)
v1.1 is **548 lines** (up from 477), still under the Playbook/handoff ~900 "presumptively
under-specified" floor. However, the floor is a heuristic, and the substance is now there:
§6U has per-component variant/state specs and a per-screen `RESPONSIVE:` line + state matrix.
The residual sub-900 length is driven by a **deliberate, defensible** choice stated in §6U.0
— the ~400-line design-token block is referenced by prototype anchor rather than inlined
("duplicating it invites transcription error"), with "reproduce it faithfully, both themes."
Given the token block is the canonical source in the bundle and re-typing it is genuinely
error-prone, this is a reasonable §4.3 judgment, not under-specification. **S2-02 is treated
as resolved**; I am not re-flagging depth.

---

## 4. CLEAN — verified this pass (not manufacturing findings)
- All five pass-1 fixes (S2-01..05) verified correctly applied; the wins-feed deferral is
  consistent across all 8 sections with zero orphans.
- Event↔route↔function wiring graph intact and tested. ✓
- Route files (7) and test files (7) consistent between §4 tree and §9/§11; wins artifacts
  cleanly removed. ✓
- §-reference integrity: no dangling section references. ✓
- New §12 greps are logically sound and would pass against a faithful build: the RESPONSIVE
  grep (`sm:grid-cols|md:grid-cols`) matches the grids §6U.2/6U.3/6U.5 now specify; the
  reduced-motion grep matches §6U.0 (modulo the S2b-02 file-path nit). ✓
- The §6.6 heading correctly changed plural→singular ("Shared read-only helper") to reflect
  only progress-summary remaining — good edit hygiene. ✓
- C1/C2/C3 (schema, enums, Inngest) remain clean from pass 1 — v1.1 did not touch them.

---

## 5. FORWARD NOTE FOR THE SPRINT 3 REVIEW
S2-01 moved a concrete deliverable into Sprint 3. When Sprint 3 is reviewed, confirm it
**builds wins-feed Phase A in full**: `lib/communication/wins-feed.ts` + `GET
/api/brands/[id]/wins` (Starter+, LIMIT 20 / ?limit max 50, PA-01) + `wins-feed.test.ts`,
with the 5 Phase-A win types (new_citation, new_engine_coverage, visibility_up,
competitor_down, gap_closed). Sprint 2's §14 handoff states this contract correctly.

---

## 6. NEXT STEP
Two prompt-internal fixes, no LLD change:
- **S2b-01** (align §1's lib count to the §4 tree — count `priority-scorer.ts`) — LOW-MOD,
  the one worth a v1.2 bump.
- **S2b-02** (reduced-motion grep target vs `tokens.css`/`globals.css`) — trivial.
With S2b-01 applied, Sprint 2 is ready for Claude Code. This was a near-clean pass: v1.1
correctly absorbed every pass-1 finding (notably the clean multi-section wins-feed deferral),
and the fresh internal-consistency angle surfaced only one real low-mod count inconsistency
plus one trivial grep-target nit.

— End of SPRINT2-FINDINGS-PASS2.md
