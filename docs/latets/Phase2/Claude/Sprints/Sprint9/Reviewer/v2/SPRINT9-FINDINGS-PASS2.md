# VisibleAU Phase 2 — SPRINT 9 PROMPT: GATE 2 FINDINGS (PASS 2 — fix-validation + fresh angle)
# Reviewer: independent reviewer chat | Date: June 2026 | THE FINAL SPRINT
# Reviewing: visibleau-p2-sprint-9-prompt.md **v1.1** (AI Visibility Autopilot UX)
# Canon used: v8.65 r2 (authorized; v8.67 touches none of the S9 surfaces). Verified by content.
# Pass-1 angle: the read queries + cross-sprint contracts + UI-vs-LLD → S9-01 (assertBrandAccess),
#   S9-02 (Health Check dimensions).
# Pass-2 angle (this doc): THE "MEASURE" CLAIM'S INTEGRITY — the loop's payoff and VisibleAU's core
#   promise ("we improved your AI visibility by X%"). How the delta is computed, whether it can fire
#   before the validation re-audit actually measures it, and whether it stays honest on a flat/
#   negative result. Not examined by any prior pass; the right lens for the loop's headline moment.

---

## 1. VERDICT — **PASS-WITH-FIXES** (v1.1 fixes correct; one new MODERATE item from the fresh angle)

The v1.1 fixes are applied correctly and thoroughly (diff-verified). The fresh angle then found one
real MODERATE item: the loop's Measure step doesn't carry the LLD's explicit "honesty rule" for
displaying lift — a rule the LLD itself added as a bug fix.

**(a) v1.1 fixes — VERIFIED CORRECTLY APPLIED (diff against v1.0):**
- **S9-01 (the assertBrandAccess gate) — resolved.** The changelog surfaces the key development:
  **S8 v1.3 built `assertBrandAccess` in code** (lib/governance/access-control.ts — exactly the
  S8b-01 throwing brand-scope guard, distinct from `canPerform`). §0.4 now states the gate is built
  in S8 v1.3, marks it an explicit **S9 build PREREQUISITE** with a STOP guard if it's absent at
  build time, and reconciles §14 (only *formalising it in the LLD* is deferred, not the code). The
  name/existence + §14 inconsistency are both cleared. (I reviewed S8 v1.2, which had only
  `canPerform`; I take the S8 v1.3 claim at face value — the STOP guard covers the residual risk.)
- **S9-02 (the Health Check dimensions) — fully fixed.** §6U.3 is rewritten to the LLD cross-layer
  synthesis: AI Sentiment ← scoreSentimentNumeric, AI Presence ← scoreFrequency, **Site Readiness ←
  technical_audits.scoreComposite**, **Local Authority ← agent_readiness_scores.local_ai_trust_score
  (skip for SaaS — correctly tied to S6b-02/D-01)**, + the #1 action as the 5th section, all
  green/amber/red; with an explicit "do NOT render the raw audit multidim," the prototype-mismatch
  escalation, and cascading §10/§11/§12/§13/§14 updates. It also resolved the "5 sections vs 4
  dims" question (the 5th is the #1 action).

---

## 2. FRESH ANGLE — THE "MEASURE" CLAIM'S COMPUTATION & ATTRIBUTION INTEGRITY

VisibleAU's positioning is Monitor → Explain → Prioritize → Execute → **Measure**; Measure is the
differentiator, and the loop's step 5 ("your citation rate improved 14%") is the moment the product
proves its worth. I traced how that number is computed and gated:

| Surface | Metric | Honest? |
|---|---|---|
| Action Progress Tracker (§6U.4) | citation-rate delta from visibility_trends (week-over-week) + up/down arrow | ✓ a real measured trend; handles down |
| **Autopilot loop step 5 (§6U.2)** | "improved 14%" attributed to the approved fix, "from visibility_trends / score_after" | **✗ S9b-01 — no score_after-IS-NOT-NULL gate; can fire before the re-audit measures it** |

---

## 3. NEW FINDING (pass 2)

### S9b-01 — [MODERATE] The loop's Measure step doesn't carry the LLD's "honesty rule" — it can display unverified/projected "improvement"
- **Where:** §6U.2 step 5 — "Re-audit + Measure (the score delta, e.g. 'citation rate improved 14%'
  from visibility_trends / score_after)." The loop's only "pending" handling is the stepper *visual*
  (step 5 dashed until reached). A targeted search finds the honesty rule stated **nowhere** in the
  prompt.
- **The LLD rule it's missing (and the LLD added this as a fix):** lift/improvement is shown **only
  where `score_after IS NOT NULL`** — i.e. a validation re-audit actually ran and measured the
  result; until then the surface shows **"validation audit scheduled — pending,"** never a projected
  number (LLD 1461-1462: "preserves the honesty rule — no projected lift"; LLD 1787: "show lift only
  where score_after IS NOT NULL (a re-audit ran)"). This was a real bug: a v8.26 lift query summed
  `lift_achieved` **without** the `score_after IS NOT NULL` filter and "would have displayed
  'improvement' that [wasn't real]" — fixed in v8.27 by hard-coding `FILTER (WHERE score_after IS
  NOT NULL)` into the canonical query (LLD 7740).
- **Why it matters (MODERATE):** step 5 is the product's core proof-of-value claim. As written, the
  prompt's stepper "pending" is presentational, not a data gate — so a builder could show a premature
  or projected "improved 14%" before the re-audit completes (re-introducing the exact v8.27 bug), and
  "from visibility_trends / score_after" is ambiguous about *what* the delta is — the **per-task
  `lift_achieved`** (score_after − score_before for *this* fix's re-audit) versus the **overall**
  visibility_trends change attributed to the one fix (over-attribution). Showing unverified or
  misattributed improvement is a direct credibility/correctness risk on the surface that most needs
  to be trustworthy.
- **Required fix (§6U.2 step 5 + the §11 autopilot-loop test + a §13 pitfall):**
  1. Gate the Measure number on **`score_after IS NOT NULL`**; until the validation re-audit has run,
     step 5 shows **"validation audit scheduled — pending,"** not a number (the LLD honesty rule).
  2. Make the source precise — the per-fix delta is the task's **`lift_achieved`** (from its
     re-audit), not the overall visibility_trends change pinned on one fix.
  3. Handle a **flat/negative** outcome honestly (e.g. "no measurable change yet" / the real delta) —
     not always "improved X%."
  (The §6U.4 tracker is fine as-is: its citation-rate delta is the real week-over-week visibility_
  trends change with an up/down arrow — a measured trend, not a projected per-fix lift. Only the
  loop's per-fix claim needs the gate.)

---

## 4. CLEAN — verified this pass
- The v1.1 fixes (S9-01, S9-02) are correctly applied and surgical (a §0.4 dependency clarification +
  the §6U.3 Health Check rewrite + cascading §10-§14 updates); no structural/feature change.
- **The Action Progress Tracker (§6U.4) is honest** — gaps-closed (remediation_tasks status=
  'complete') + the citation-rate delta from visibility_trends week-over-week, with an up/down arrow
  (handles a decline); matches LLD 8985-8986. It's a measured trend, not a projected lift.
- Pass-1 CLEAN holds: the v8.16 citations/audits JOIN (exact); the explainability contract
  (render-not-regenerate); the loop's presentational step states (≠ remediation_tasks.status); the
  1-click approve re-using S2's existing write through assertBrandAccess; tier gating; the §1-vs-tree
  enumeration; no-schema/no-Inngest discipline (serve()=25/25).

---

## 5. NEXT STEP & PHASE-2 STATUS
One MODERATE fix:
- **S9b-01** — carry the LLD honesty rule into the loop's Measure step (gate on score_after IS NOT
  NULL; "pending" until the re-audit measures it; per-fix lift_achieved not the overall trend; honest
  on flat/negative). A focused §6U.2 + test + pitfall edit.
With S9b-01 applied (v1.2), Sprint 9 is ready — and **Phase 2 prompt generation is complete.**

**Phase 2 review summary (all 9 sprints, both passes):** every sprint landed PASS-WITH-FIXES; the
fixes were applied cleanly each round. The cross-sprint contracts now line up — the dual-emit
(S7/S5/S6), the fanout extension + its two added source emits (S8-01), the brand-access gate
(S8b-01 → built in S8 v1.3 → consumed by S9), the explainability contract, the unit/idempotency
rules. **Next is Gate 3, not another sprint.**

**Carry-forward to Gate 3 (cross-prompt audit) + the LLD-hygiene pass** — the consolidated queue
this series produced:
- S7b-01/02 (run-journey row-write step; run-comparison SN-01-style step structure).
- S8-01 source emits (visibility/trend-updated, hallucination/acknowledged) actually added in S8 v1.x.
- S8b-01 assertBrandAccess (built S8 v1.3) — **formalise in the LLD**; S8b-02 (owner-role ceiling);
  S8b-03 (audit member_role_changed / member_removed).
- **S9-02** Health Check prototype ↔ LLD reconciliation (the prototype must move to the four
  cross-layer dimensions).
- **S9b-01** the Measure honesty rule (if the loop ends up computing its own delta rather than
  reusing the canonical `FILTER (score_after IS NOT NULL)` query, confirm the gate at Gate 3).
- S9's broad cross-sprint consumption (esp. the persona dashboards) — verify each assumed value is a
  real built output (the S8-01 lesson).
- The standing OQ-1 local_seo_results deferral (S6's local_ai_trust_score stays NULL by design).

I can run Gate 3 (the cross-prompt consistency audit across all 9 prompts) when you're ready.

— End of SPRINT9-FINDINGS-PASS2.md
