# VisibleAU Phase 2 — REVIEWER HANDOFF (Sprint-Prompt Production, GATE 1)
# Date: June 2026 | Written by: the BUILDER chat (the original chat, which authored the
# v8.61 lineage handoffs and the Playbook, and built the SPRINT-MASTER-PLAN under review)

YOUR ROLE. You are the independent REVIEWER for Phase 2 sprint-prompt production. The
builder chat produces deliverables; you verify them against canon before anything
becomes canonical. Sri is the courier between chats. The relay has already caught real
errors in both directions (e.g. the v8.65 attribution correction) — your job is to keep
that bar. Derive your own view from the files first, then compare with the builder's
claims; never accept a printed battery result without re-running it.

Respond in English only (Telugu only if Sri explicitly asks in your conversation).

---

## SECTION A — VERIFY YOUR INPUTS (run BEFORE any review; STOP on any failure)

You should have received TWO zips from Sri:

A1. visibleau-phase2-v8.65-complete-REVIEWED.zip  (canon)
    • grep -m1 "^# Version:" visibleau-7layer-lld.md → "# Version: 8.65 | Date: June 2026"
    • grep -c "FIX 14 (v8.65)" visibleau-prototype-phase2.jsx → 1
    • grep -c "ATTRIBUTION CORRECTED IN CROSS-REVIEW" visibleau-7layer-lld.md → 1
      (this marker distinguishes the REVIEWED copy — without it the upload is stale)
    • Sizes: LLD 9,189 lines / 634,741 bytes; prototype 3,390 lines / 177,657 bytes
    • The zip also contains visibleau-NEW-CHAT-HANDOFF-v8.65.md — read its Sections D
      (locked facts) and F (do-not-fix list); both are binding on this review.

A2. visibleau-p2-GATE1-review-bundle.zip  (the deliverable under review)
    • SPRINT-MASTER-PLAN.md            v1.0 — status line reads "AWAITING REVIEW GATE 1"
    • visibleau-p2-SPRINT-PROMPT-PLAYBOOK-v1.0.md — the rules you enforce (§6 invariants,
      §7 reviewer checklist)
    • MANIFEST.txt — builder's battery results (to be independently re-derived, not trusted)

Optional (only needed from Gate 2 onward): the original canonical bundle's
04-sprint-prompts/ folder (Phase 1 prompt precedent for depth calibration).

---

## SECTION B — CONTEXT IN 60 SECONDS

• Phase 2 = 9 sprints (S1 Platform Foundation → S9 Autopilot UX), LLD v8.65, 37 new
  tables (manifest #1–38, #21 = ALTER on Phase 1 brand_entity_scores), 25 Inngest
  functions, 16 GAPs, 14 prototype screens + shared component foundation.
• Process (Playbook §1): Step 1 master plan → GATE 1 (you, now) → per-sprint prompt
  generation with a gate per batch → final cross-prompt audit (Gate 3).
• The SPRINT-MASTER-PLAN is the drift-killer: ownership maps with LLD/prototype line
  anchors, dependency graph, shared conventions block, and per-sprint context packs.
  Generation sessions will read ONLY the plan + their pack — so an error in the plan
  propagates into every prompt. Gate 1 is therefore the highest-leverage review of the
  whole programme. Be strict.

---

## SECTION C — GATE 1 INSTRUCTIONS (your task now)

C1. INDEPENDENT BATTERY (Playbook §6, Gate-1 set) — re-derive, don't trust:
    • Table map: exactly 38 rows; every COMPLETE TABLE INVENTORY entry (LLD 8728–8784)
      appears exactly once; sprint assignment matches the LLD sprint plan's own ranges
      (S1: 1–7 · S2: 29–31 · S3: 12–18 · S4: 32–34 · S5: 19–25 incl #21 ALTER ·
      S6: 8–11 · S7: 26–28 · S8: 35–38 · S9: none). grep "^CREATE TABLE" count = 37.
    • Inngest map: 25 names match the serve() registry (LLD 4511–4545) one-to-one;
      layer→sprint assignment consistent with the roster.
    • GAP map: 1–16 all present (GAP index LLD 527–553), no number missing, multi-layer
      GAPs (4, 8) list every contributing sprint.
    • Screen map: all 14 screenMap ids (prototype 3294–3307) assigned; the four Phase-1
      ids (brand-list / action-center / vertical-packs / billing) excluded per handoff
      §F.3; shared components assigned to S2.
    • Dependency graph: acyclic; every "requires" is an earlier sprint's "provides".

C2. ANCHOR SAMPLING — pick ≥8 line anchors from the plan at random (mix of CREATE
    TABLE anchors, Inngest spec anchors, GAP/sprint-section anchors, prototype component
    anchors) and verify each lands on what the plan says it does. One bad anchor =
    finding; three = systemic, bounce the plan.

C3. CONVENTIONS + CANON CHECK — the plan's §7 conventions block must not contradict the
    v8.65 handoff §D locked facts; the plan must not "fix" anything in §F. Watch
    especially: status enums, INTEGER priority, percentage units, CT-04 formula, D-01
    (no entity_score column), RT-01 color-mix rule, tier gates.

C4. RULE ON OPEN QUESTIONS Q1–Q4 (plan header). The builder proposed answers but did
    not decide. Give an explicit ruling for each — confirm the proposal, amend it, or
    escalate to Sri if it needs a product decision:
    Q1 dashboard increments S2 base / S3 SoV strip / S9 tracker+banner.
    Q2 HealthCheck ships S9; LLD's "Sprint 10" read as post-S9 packaging guidance.
    Q3 S2 "fan-out improvement" acceptance facet activates after S3 (no resequencing).
    Q4 S4 LinkedIn/consensus report sections use the CPR-01 null-placeholder contract
       until S5 populates.

C5. JUDGEMENT PASS — beyond the mechanical checks: do the sprint boundaries make sense?
    Is anything in the LLD sprint plan (8814–9010) NOT captured by the plan (e.g. the
    Action Progress Tracker, per-prompt trend API + v8.16 join note, CPR-01 contract,
    Agency+ journey gate with Growth teaser copy)? Omissions are findings.

---

## SECTION D — FINDINGS FORMAT (what you send back)

Produce GATE1-FINDINGS.md containing:
1. Verdict: PASS / PASS-WITH-FIXES / FAIL.
2. Numbered findings GP1-01, GP1-02, … each with: severity (HIGH/MOD/LOW), the claim in
   the plan, the evidence (LLD/prototype line you checked), and the required fix.
3. Explicit rulings for Q1–Q4 (one line each).
4. Your independently-derived battery results (so the builder can diff against its own).
5. A clean pass is a valid result — do NOT manufacture findings; say "clean" if clean.
Zip it for Sri to relay back. The builder applies fixes, bumps the plan to v1.1 with a
changelog note, and only then starts Sprint 1 prompt generation.

---

## SECTION E — WHAT YOU MUST NOT DO

• Do not generate sprint prompts (builder's job) or edit the LLD/prototype/plan yourself
  — findings go back through Sri.
• Do not bump LLD/prototype versions; a genuine LLD gap is escalated, not patched here.
• Do not re-litigate the handoff §F do-not-fix items or rewrite changelog history.
• Do not treat the builder's MANIFEST battery as evidence — your numbers are the evidence.

— End of reviewer handoff. Run Section A now, then Gate 1 per Section C.
