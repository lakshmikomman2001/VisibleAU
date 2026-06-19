# VisibleAU Phase 2 — SPRINT 9 PROMPT: GATE 2 FINDINGS (independent review) — THE FINAL SPRINT
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: visibleau-p2-sprint-9-prompt.md **v1.0** (AI Visibility Autopilot UX, the visible loop)
# Canon used: v8.65 r2 (authorized; v8.67 touches none of the S9 surfaces). Verified by content.
# Method: S9 is structurally different — no schema/migration/Inngest, pure frontend + 2 read-only
#   GETs — so the weight is on the two read queries, the cross-sprint contracts S9 consumes, and the
#   UI surfaces vs the prototype + LLD. Ran the adapted Section C checks (C1-C10).

---

## 1. VERDICT — **PASS-WITH-FIXES**

A strong, well-scoped final prompt: the v8.16 JOIN is reproduced exactly, the explainability
contract is render-not-regenerate, the loop's step states are correctly presentational (not the
DB enum), the 1-click approve correctly re-uses S2's existing write, the tracker query matches the
LLD, and the no-schema/no-Inngest discipline holds (serve()=25/25). It also conscientiously carries
forward my prior findings. Two MODERATE fixes — one a cross-sprint dependency that's the S8-01
lesson applied to S9 itself, one a prototype-vs-LLD conflict on the headline UX surface.

---

## 2. FINDINGS

### S9-01 — [MODERATE] S9 calls `assertBrandAccess`, but that gate isn't built — S8 has `canPerform`, and §14 itself defers the gate (the S8-01 lesson, recursively)
- **Where:** §0.4, §9, §10, §11, §12 all call **`assertBrandAccess(user, brandId)`** as "the S8
  gate." §14 lists "the S8b-01 brand-access … formalisation" as a **deferred hygiene-pass item**.
- **The problem (three-layered):**
  1. **Name/existence:** S8 v1.2 built **`canPerform(user, org, brandId, action)`** (an
     action-permission predicate), not `assertBrandAccess(user, brandId)` (a throwing brand-scope
     guard). They differ in name, signature, and semantics. `grep` confirms: `assertBrandAccess`
     appears **0×** in the S8 v1.2 prompt and **0×** in the LLD; `canPerform` is the actual S8 name
     (and is also not an LLD term — both are prompt-level constructs).
  2. **Not built:** the dedicated brand-scope gate is exactly my **S8b-01** finding — a *pass-2
     recommendation*, not yet implemented in S8 or the LLD. Per S8b-01, even `canPerform` isn't
     wired into the brand routes as a throwing gate.
  3. **Internal inconsistency:** §0.4/§9 treat `assertBrandAccess` as a built, callable gate, while
     §14 lists the same thing as deferred. So the prompt both assumes-built and defers it.
- **Why it matters (MODERATE):** as written, S9's routes + the Autopilot approve call a function
  that doesn't exist (build-time failure), and the security intent (the Autopilot can't act outside
  a member's brands) silently doesn't hold. It's the very S8-01 lesson the handoff invokes in C10 —
  *don't assume a function an owning sprint didn't build* — applied to S9.
- **What's RIGHT:** carrying the brand-access gate into S9 is the correct instinct (it's the S8b-01
  forward note). The gap is only that the gate isn't real yet.
- **Required fix:** make the dependency explicit and resolve the name. The S8b-01 gate must be
  *implemented* (in S8's code + named in the LLD — `assertBrandAccess(user, brandId)` is a fine
  design, cleaner than overloading `canPerform` for route gating) **before S9 builds**; until then
  S9 must not assume it exists. Reconcile §0.4/§9 (assume-built) with §14 (deferred) — and note that
  S8b-01 is therefore a **prerequisite for S9**, not a post-Gate-3 nicety.

### S9-02 — [MODERATE] The Health Check renders the wrong dimensions — the prompt follows the prototype's raw multidim scores; the LLD specifies a cross-layer synthesis (prototype-vs-LLD conflict)
- **Where:** §6U.3 — "traffic-light per dimension (**Frequency/Position/Sentiment/Context/Accuracy**,
  each great|good|moderate|poor)." This matches the prototype HealthCheck (1371: name: Frequency/
  Position/Sentiment/Context/Accuracy). But the **LLD Health Check spec (9061-9071, and 2272)**
  specifies different dimensions:
  > Health Check **synthesises Phase 1 multidim + Sprint 7 technical + Sprint 6 agent readiness** →
  > **AI SENTIMENT** ← audits.scoreSentimentNumeric (green ≥70/amber 40-69/red <40); **AI PRESENCE**
  > ← audits.scoreFrequency (≥60/30-59/<30); **SITE READINESS** ← technical_audits.scoreComposite
  > (≥75/45-74/<45); **LOCAL AUTHORITY** ← agent_readiness_scores.local_ai_trust_score (skip for
  > SaaS); **#1 ACTION** ← top-priority remediation_task.
- **The conflict:** the prompt (via the prototype) shows the five *raw audit multidim* scores, all
  from `audits`. The LLD's Health Check is a **cross-layer synthesis** whose stated purpose — "the
  highest-value UX decision in Phase 2," the trial→paid moment — is precisely to pull **Site
  Readiness (from technical_audits)** and **Local Authority (from agent_readiness)** *alongside* the
  audit scores. The prompt's version **omits both cross-layer dimensions** (and adds Position/
  Context/Accuracy, which the LLD Health Check doesn't surface), so it loses the synthesis that
  makes the screen valuable. By the prompt's own rule ("the LLD wins, this prompt is the bug"), the
  LLD dimensions govern.
- **Why it matters (MODERATE):** it's the sprint's headline conversion surface, and the build would
  ship the wrong (audit-only) dimensions, not the cross-layer Health Check the LLD designs. It's
  also a genuine **prototype-vs-LLD conflict** that needs deciding, not silently following one side.
- **Required fix (escalate — touches the prototype):** reconcile §6U.3 to the LLD's four
  cross-layer dimensions + the green/amber/red thresholds + the #1 action (skip Local Authority for
  SaaS brands), and flag the prototype HealthCheck (1371) as needing the same update so prototype
  and LLD agree. (Note a minor LLD internal wrinkle to confirm with Sri: 9062/2272 say "5 sections"
  but only four are mapped — confirm the 5th, e.g. an overall/composite band.)

---

## 3. CLEAN — verified independently this pass
- **C1 no-schema/no-pipeline discipline** — the prompt adds no table/migration/barrel/Inngest fn;
  §5/§6/§8 all say "none"; serve()=25/25; and it correctly states a missing value is an upstream
  bug, not an S9 table.
- **C2 the v8.16 JOIN (the one high-risk query) — exact.** §9's query matches the LLD verbatim
  (`citations c JOIN audits a ON c.audit_id = a.id`, `COUNT(CASE WHEN c.brand_mentioned…)/NULLIF…`,
  `WHERE a.brand_id = ? AND c.prompt = ?`), and the "citations has NO brand_id" note (LLD 2422-2426,
  9007-9008) is reproduced in §0.4/§9/§13. The §12 greps (JOIN audits ≥1; citations.brand_id = 0)
  are correct.
- **C3 the Action Progress Tracker query — matches** the LLD (8985-8986): `COUNT(remediation_tasks
  WHERE status='complete' AND updated_at >= period_start)` / total + the citation-rate delta from
  visibility_trends. (The §0.5/anchor cites ~9060; the actual query is at 8985 — a navigational
  imprecision only, content is right.)
- **C4 the Autopilot loop** — the 5 steps map to the right sources (gap → remediation_task/
  topical_coverage_gap; explain → explainability; draft → content_draft; measure → score delta from
  visibility_trends/score_after), and **`step.status` is correctly PRESENTATIONAL** ('done'|
  'current'|'pending'), explicitly NOT remediation_tasks.status — forbidden in §6U.2 + the §12 grep
  + the §13 pitfall. The 1-click approve correctly re-uses S2's existing write (no new write path).
- **C5 the explainability contract — render, not regenerate.** §0.4/§6U/§13 require S9 to render
  S6's `{ score, explainability }` and forbid calling `ExplainabilityService.annotate()` (LLD 5556
  confirms annotate() belongs to the scoring routes). §12 grep enforces it.
- **C7 UI anchors exist** (prototype FIX-15 vs my FIX-14 = ~30-line offset): AutopilotLoop @3099,
  HealthCheck @1371, EnhancedDashboard @1061. STATES + RESPONSIVE + both themes + the reduced-motion
  reset for the animated banners + the note that `${jsVar}30` interpolated hex-alpha is valid.
- **C8/C9** — tier gating is correct (loop/health/tracker/trend/persona = Growth+; Agency command
  centre = Agency+); the §1 surface list matches the §4 component/route tree (the S1-02/S6-03
  under-enumeration pattern does NOT recur).

---

## 4. NEXT STEP & PHASE-2-COMPLETE NOTE
Two MODERATE fixes:
- **S9-01** — implement + name the brand-access gate in S8/LLD before S9 builds; reconcile §0.4/§9
  with §14; treat S8b-01 as an S9 prerequisite. (The intent is right; the gate just isn't real yet.)
- **S9-02** — reconcile the Health Check to the LLD's cross-layer dimensions (AI Sentiment / AI
  Presence / Site Readiness / Local Authority + #1 action) and flag the prototype to match; escalate
  to Sri since it touches the prototype.
With these, Sprint 9 is ready — and **Phase 2 prompt generation is complete** (next is Gate 3, not
another sprint).

**Forward note → Gate 3 (cross-prompt audit).** Two things this review surfaces for Gate 3:
1. **S9's cross-sprint consumption breadth.** S9 is the consumer of nearly everything, and the
   persona dashboards (§6U.6) assume a large surface — LinkedIn presence, Knowledge Panel status,
   Wikidata status, YouTube presence, consensus score, Entity-Home check, embedding-page gap, Reddit
   AU mentions. The prompt rightly punts ("a missing value is an upstream bug"), but Gate 3 should
   verify each is a *real built output* — the S8-01 lesson (the visibility/trend-updated +
   hallucination/acknowledged emits that turned out unbuilt are the precedent).
2. **The queued LLD-hygiene items** the §14 handoff already lists and that this series produced —
   S7b-02 (run-comparison step structure), S8-01 (the two source emits), S8b-01/02/03 (brand-access
   gate [now an S9 prerequisite per S9-01] + role-ceiling + privilege-audit), plus the new S9-02
   Health Check prototype/LLD reconciliation — and the standing OQ-1 local_seo_results deferral
   (S6's local_ai_trust_score stays NULL by design until then).

— End of SPRINT9-FINDINGS.md
