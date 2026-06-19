# VisibleAU Phase 2 — SPRINT 5 PROMPT: GATE 2 FINDINGS (PASS 2 — fix-validation + fresh angle)
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: visibleau-p2-sprint-5-prompt.md **v1.1** (Trust Intelligence, Layer 3)
# Canon used: visibleau-phase2-v8_65-complete-REVIEWED-r2 (authorized; v8.66 deltas don't touch L3).
# Pass-1 angle: fidelity-to-LLD + correctness rules (findings S5-01, S5-02, S5-03).
# Pass-2 angle (this doc): INNGEST EVENT PRODUCER→CONSUMER GRAPH INTEGRITY across sprints —
#   does every event an S5 function LISTENS on have a real producer, and every event it EMITS
#   a consumer, with names consistent across the boundary? Plus grep-executability of S5's
#   distinctive §12 greps. Genuinely new: S5 is the most event-dependent sprint, and a dangling
#   subscription / producer-consumer mismatch is invisible to single-sprint fidelity.

---

## 1. VERDICT — **PASS-WITH-FIXES → near-clean** (all v1.1 fixes correct; one LOW grep-precision item)

The three v1.1 fixes are all correctly applied with no new inconsistency, and the fresh
event-graph angle found **no wiring conflicts**. The only new item is a LOW imprecision in one
§12 self-check grep (S5b-01).

**(a) v1.1 fixes — ALL VERIFIED CORRECTLY APPLIED:**
- **S5-01 (consensus thresholds) — fixed.** §0.2 now reads "the consensus EMAIL alert at
  `consistency_score < 60` (LLD 8402 — distinct from the in-app Action Center consensus alert at
  < 70, LLD 7252)", and §8.6 now spells out "TWO DISTINCT consensus alerts at TWO thresholds:
  Action Center < 70 (LLD 7252); S4 alert-composer EMAIL < 60 (LLD 8402). Wire both at their own
  threshold — do not conflate." The "< 60/70" shorthand is gone. §6.5 (already correct at < 70)
  was correctly left untouched. ✓
- **S5-02 (webhook severity) — fixed.** §8.1 now filters `hallucination/detected` on **critical +
  warning** (the two non-info severities), with an explicit note that the LLD's WH-01b wording
  (`'critical'|'high'`) references a non-existent severity and the email-alert path in the same
  function uses critical+warning. The LLD WH-01b `'high'` wording is flagged to Sri (changelog). ✓
- **S5-03 (component count) — fixed.** §4 tree and §10 now say **13 components** (the builder
  verified the LLD's list is also 13 — no missing component, the count was just off), and
  `linkedin-gap-row.tsx` got its extension. ✓
- **Edit hygiene:** a surgical 18-line diff touching only §0.2, §4 tree, §6U.6, §8.1, §8.6, §10,
  and the changelog. (v1.1 cites v8.66 line numbers — 7252/8402/7161 — which map to my r2 at +29,
  consistent.) No new inconsistency.

**(b) Fresh angle (event-graph integrity) — clean; (c) grep-executability — one LOW item (S5b-01).**

---

## 2. FRESH ANGLE — INNGEST EVENT PRODUCER→CONSUMER GRAPH (no wiring conflicts)

S5 has the most cross-sprint event dependencies of any sprint. I traced each subscription and
emit to its counterpart in the LLD:

**Events S5 functions LISTEN on — every one has a real producer:**
- **`audit/complete`** (detect-hallucinations §8.1 PC-03; capture-evidence-snapshot §8.2 PC-04) —
  the **Phase 1 canonical event** (LLD 964); LLD 966–971 confirms the six functions that listen on
  it, including these two S5 ones. Producer (Phase 1 audit pipeline) exists. ✓
- **`citations/classified`** (build-citation-source-intelligence §8.4 CI-02) — emitted by **S3's
  classify-citation-sources** (LLD 6545–6546 the emit; LLD 7186 the matching listen). S3 is built
  before S5, so the producer exists. ✓ Correctly **not** `audit/complete` (must wait for
  classification).
- **`technical-audit/complete`** (refresh-entity-score §8.3 RE-01) — emitted by **S7's
  technical-audit-run** as a **forward dependency**, with the dual-emit requirement LLD-backed:
  LLD 1001–1002 confirms S7 must emit BOTH `technical-audit.complete` (dot, webhook) AND
  `technical-audit/complete` (slash, internal). The prompt's §8.3 forward note matches the LLD
  exactly. (Until S7 lands, refresh-entity-score simply doesn't fire — the intended design, same
  class as the S4 dormant slots.) ✓

**Events S5 functions EMIT — the consumer exists (forward):**
- **`hallucination/detected`** (detect-hallucinations §8.1) — consumed by **fanout-webhooks**
  (LLD 7134 maps it → external `hallucination.detected`). fanout-webhooks is a **Sprint 8**
  function (LLD 3449/3789/3880), so the emit precedes its consumer — which is harmless (an Inngest
  event with no current listener is a no-op; S8's fanout-webhooks picks it up when built). The
  emit is correctly specified now. ✓

**Slash/dot convention — consistent across every boundary.** Internal chaining events use slash
(`audit/complete`, `citations/classified`, `technical-audit/complete`, `hallucination/detected`);
the external webhook forms use dot (`hallucination.detected`). Producer and consumer agree on the
name at each edge. ✓

Net: no dangling subscription, no producer/consumer name mismatch, no missing emit. The S5 event
wiring is sound.

---

## 3. NEW FINDING (pass 2)

### S5b-01 — [LOW] The §12 "no risk column" grep false-fails on the schema's own risk comment
- **Where:** §12 — `grep -ic "risk_score\|risk " db/schema/hallucination-incidents.ts | grep -qx 0 && echo "no risk col OK"`.
- **The problem:** the pattern `"risk_score\|risk "` (case-insensitive, "risk" + a space) matches
  **comment** text, not just a column. The prompt itself mandates the CT-04 explanation
  ("**NO risk column** — risk is read-time …; risk = LEAST(100, …)"), so the generated schema will
  almost certainly contain lines with "risk " — and the grep will match them.
- **Confirmed by test:** against a realistic `hallucination-incidents.ts` that has **no** risk
  column but carries the expected "NO risk column / risk = LEAST(…)" comments, the grep matched
  **2 lines** → `grep -qx 0` fails → the "no risk col OK" message never prints, i.e. the self-check
  reports failure on a correct schema. A column-targeted grep
  (`grep -iE "^\s*risk[_a-zA-Z]*\s*:" db/schema/hallucination-incidents.ts` → empty) passes correctly.
- **Why it matters (LOW):** the schema is fine; this only undermines the §12 self-check (Claude
  Code sees a "failure" on a correct build and either wastes time or mis-"fixes" it). It's a
  verification-precision bug, not a build defect.
- **Required fix:** tighten the grep to target a **column declaration**, not comments — e.g.
  `grep -iE "^\s*risk[_a-zA-Z]*\s*:" db/schema/hallucination-incidents.ts` must be empty, or grep
  for `risk_score` only (a real column name) excluding comment lines. No LLD change.

---

## 4. CLEAN — verified this pass
- All three v1.1 fixes correctly applied; §0.2/§8.6 state the two consensus thresholds separately;
  §8.1 filters the webhook on critical+warning; the component count is reconciled to 13; surgical
  diff, no new inconsistency.
- **Event-graph integrity:** every S5 subscription has a real producer (`audit/complete`=Phase 1,
  `citations/classified`=S3, `technical-audit/complete`=S7 forward with the dual-emit note); the
  one emit (`hallucination/detected`) has a consumer (S8 fanout-webhooks, forward); slash/dot
  convention consistent across all edges; no dangling subscriptions.
- **Other §12 greps execute** (the two partial-index grep returns 2; the ADD-COLUMN ≥18 is
  satisfied by the 20-column ALTER; the consensus ON CONFLICT grep is sound) — only the
  no-risk-column grep mis-fires (S5b-01).
- The pass-1 high-risk areas remain clean (v1.1 didn't touch them): the read-time/structural
  traps (C2), the score formulas (C3), the Inngest event taxonomy (C4), and the S4→S5 wiring
  contract (C5 — 5 slots wired + 2 deferred to S6).
- The §1-vs-tree enumeration discipline still holds (11 lib modules = §4 tree = §6.1–§6.5).

---

## 5. NEXT STEP
One LOW prompt-internal fix, no LLD change:
- **S5b-01** — tighten the §12 no-risk-column grep to target a column declaration (so it doesn't
  false-fail on the mandated CT-04 comment). Worth a quick v1.2 touch; not blocking.
With S5b-01 addressed, Sprint 5 v1.1 is ready for Claude Code. This was a near-clean pass on the
largest sprint: the v1.1 fixes are correct, the cross-sprint event graph is fully wired (no
dangling subscriptions or producer/consumer mismatches), and the only item is a self-check grep
imprecision.

Forward note for Sprint 6: it closes the **last two** S4 slots (content_structure_audits →
entity_home_status; agent_readiness_scores → agent_readiness). For its event graph, confirm the
new S6 functions' triggers — especially the PUBLIC `/api/visit` route (VA-01) and any
`visit/ingested`-style events — have matching producers/consumers, and that S6's §1 enumeration
matches its §4 tree (the standing pattern).

— End of SPRINT5-FINDINGS-PASS2.md
