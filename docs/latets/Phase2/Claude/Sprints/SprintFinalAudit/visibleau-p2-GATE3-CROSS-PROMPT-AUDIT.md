# VisibleAU Phase 2 — GATE 3: CROSS-PROMPT AUDIT (the final gate before build)
# Auditor: builder chat | Date: June 2026 | Canon: LLD v8.67 (REVIEWED-r2)
# Scope: all 9 sprint prompts at their latest versions —
#   S1 v1.4 · S2 v1.4 · S3 v1.3 · S4 v1.3 · S5 v1.3 · S6 v1.3 · S7 v1.2 · S8 v1.3 · S9 v1.2
# Gate 3 is NOT per-sprint review (each sprint passed two reviewer passes). It checks CONSISTENCY
# and COMPLETENESS ACROSS the nine prompts: that conventions match, event names line up
# producer↔consumer, table ownership is exact, and — the lesson this series taught — nothing one
# sprint DEFERS or ASSUMES is left unbuilt by its owner.

---

## VERDICT — PASS-WITH-FIXES
The nine prompts are internally consistent and the cross-sprint contracts line up end-to-end. One
real cross-prompt fix (G3-01, MODERATE — a platform-wide contract two scored sprints omit), plus
the already-known LLD/prototype-hygiene queue (which Gate 3 confirms is complete and correctly
owned). With G3-01 applied, the prompt set is build-ready pending the consolidated v8.68 LLD +
prototype pass.

---

## CHECK RESULTS

### A. TABLE OWNERSHIP — ✓ PASS (37 tables, each owned once, no gaps/dupes)
Collated the §1 "new tables" claims across all nine and reconciled against the #1–38 manifest:
- S1: #1–7 (7) + the `audits` ALTER · S6: #8–11 (4) · S3: #12–18 (7) · S5: #19,20,22,23,24,25
  (6 new) + the **brand_entity_scores ALTER** (#21 is a Phase 1 table S5 extends — NOT a new
  table, per D-01/no-entity_score) · S7: #26–28 (3) · S2: #29–31 (3) · S4: #32–34 (3) · S8:
  #35–38 (4) · S9: **0** (pure frontend).
- Sum = 37 new tables + 1 ALTER target (#21). Every number #1–38 appears exactly once; no gaps,
  no duplicates. **The 37-table invariant holds across the nine prompts.**

### B. CROSS-SPRINT EVENT GRAPH — ✓ PASS (every consumer has an accounted-for producer)
Mapped every internal slash-event and the dot/slash dual forms:
- **The dual-emit** (`technical-audit.complete` dot + `technical-audit/complete` slash): S7 emits
  BOTH; S5's refresh-entity-score + S6's score-agent-readiness/audit-entity-home consume the
  slash. Names agree. ✓
- `journey/run-requested`: S7 route emits → S7 run-journey consumes. ✓
- `audit/complete`: Phase 1 emits → S7 run-comparison-prompts consumes. ✓
- `visit/ingested`: S6 Visit API emits → S6 crawler-log-ingest consumes. ✓
- **The 5 fanout webhook events** (S8 is the consumer/mapper): `report/generated` (S4 emits ✓),
  `hallucination/detected` (S5 emits ✓), `agent/readiness-scored` (S6 emits ✓) — producers
  pre-exist and are verified real; `visibility/trend-updated` + `hallucination/acknowledged` have
  **no upstream producer**, but S8's S8-01 fix correctly OWNS adding both as backward edits
  (aggregate-visibility-trend.ts + the acknowledge route), listed in S8's §4 tree with source
  greps. So every consumer's producer is accounted for. ✓
- **Observation (not a defect; → LLD-hygiene):** the two S8-added emits live only as instructions
  inside S8; the S3/S5 prompts themselves don't mention them, so a reader of S3/S5 alone wouldn't
  know. The queued S8-01 LLD item (add the emits to their *source* specs) resolves this.

### C. CONVENTION CONSISTENCY — ✓ PASS (1 real finding → G3-01)
- **Tier source:** all nine use `subscriptions.tier`; the `organizations.tier` hits are all the
  *prohibition* statement ("never organizations.tier"), not misuse. ✓
- **Zero Clerk:** all nine; the "clerk" hits are the prohibition + the §12 grep-guard. ✓
- **MI-01 idempotency:** present in all eight table-building sprints (S1–S8); S9 correctly omits
  it (no migration). ✓
- **The explainability contract `{ score, explainability }`:** **G3-01 — see findings.** S6 ✓ and
  S9 ✓ reference it; **S3 and S5 do NOT**, yet both expose score-bearing GET routes. This is a
  real cross-prompt gap.

### D. DEFERRED / FORWARD-DEPENDENCY COMPLETENESS — ✓ PASS (no orphaned defer)
Every item one sprint defers is picked up by its owning later sprint:
- S4's narrative slots → S5 wires 5, S6 wires the last 2 (all 12 sections wired). ✓
- S3's CPR-01 "Coming soon" benchmark → S7 fills comparison_prompt_results. ✓
- S2's BD-01 plain-UUID forward refs (fan_out_gap_id/topical_gap_id) → S3 adds the 2 FK ALTERs. ✓
- S6's local_ai_trust_score = NULL until local_seo_results (S6b-02) → S8 OQ-1 defers (standing
  ruling) → S9 reminds it stays NULL by design. ✓ (the one DELIBERATE deferral — see below.)
- S6 builds the full crawler (S6b-03) → S7 reuses/extends, doesn't rebuild. ✓

### E. S9's WIDE CONSUMPTION — ✓ PASS (no assumed-but-unbuilt value)
S9's persona dashboards + loop read a broad surface; each maps to a real built output: LinkedIn
presence / Knowledge Panel / Wikidata / YouTube / consensus (S5), Entity Home + agent readiness
(S6), Mention-Source archetype (S3), Reddit AU mentions (S2/S3), the wins-feed + visibility trends
(S3). The S8-01 failure mode (a consumer assuming an unbuilt producer) does NOT recur in S9. ✓

### F. UNIT RULES (MS-01/02) — ✓ PASS
S3 owns THE UNIT RULE (mention_rate/citation_rate/brand_share/competitor_share are PERCENTAGES;
mention_source_ratio is 0–1, NULL when mention_rate=0). S9 reads these metrics and respects the
convention; no other sprint redefines them. ✓

### G. WRITE-SEMANTICS CONSISTENCY — ✓ PASS
Append-only tables stated consistently (S4 generated_reports; S6 crawler_visit_logs +
agent_readiness_scores; S8 audit_trail). CASCADE/SET NULL choices consistent (S7 journey_id +
audit_id CASCADE; S2 remediation_tasks SET NULL forward refs). The S7-pass-2 retry-idempotency
theme (step-wrapped writes / dedup) is applied in S7 (run-journey persist step) and S8 (fanout
webhook_deliveries dedup). ✓

### H. serve() INNGEST COUNT — ✓ PASS (reaches exactly 25/25)
S2(3) + S3(6) + S4(2) + S5(7) + S6(5) + S7(2) + S8(0, extends Phase-1 fanout) + S9(0) = **25**.
S7 declares "reaches 25/25"; S8 "stays 25/25"; S9 "stays 25/25". Arithmetic and declarations
agree. ✓

---

## FINDINGS

### G3-01 — [MODERATE] The explainability contract is platform-wide, but S3 and S5 omit it on their scored routes
- **Where:** the LLD states the contract repeatedly and unambiguously (LLD 2279/2740/3234/5525/
  5537/5567): **"every score-bearing Phase 2 API response MUST include"** the `{ score,
  explainability }` shape (rationale / confidence_note / top_action; an empty rationale fails CI).
  S6 references it (12×, with the "create lib/platform/explainability.ts if not already present"
  pattern) and S9 references it (23×, render-not-regenerate). **S3 and S5 reference it 0×.**
- **The gap:** S3 ships `GET /api/brands/[id]/visibility` (trends + SoV + archetype + scores) and
  S5 ships `GET /api/brands/[id]/trust` (trust summary + score_of_10 + read-time risk + consensus)
  — both unambiguously score-bearing responses. Neither prompt wires the mandatory contract, so a
  build would ship these two routes WITHOUT the explainability annotations the platform requires
  (and S5/S3 are the heaviest scored sprints in the series). It's a cross-prompt inconsistency:
  the contract is honoured in S6/S9 but silently dropped in the two earliest scored sprints.
- **Why it matters (MODERATE):** explainability is GAP 9 and a NON-NEGOTIABLE acceptance criterion
  (CI fails on an empty rationale); the visibility + trust scores are exactly the high-value
  numbers customers see first. Shipping them as raw scores without the "Where/Why/What next/
  Impact/Confidence" annotation breaks the platform contract on its most-used surfaces.
- **Ownership note:** since the contract uses the "create lib/platform/explainability.ts if not
  already present" pattern and S3 runs before S5/S6, **S3 should be the sprint that first creates
  ExplainabilityService** (or notes it may already exist) and wires it into `/visibility`; S5
  wires it into `/trust`. (S6 already has the create-or-reuse note; it stays.)
- **Required fix (S3 + S5 prompts):**
  1. **S3 §0.4/§6/§9:** add the explainability contract — `/api/brands/[id]/visibility` (and any
     other scored S3 route) passes its data through `ExplainabilityService.annotate()` before
     responding; create `lib/platform/explainability.ts` if not already present (S3 is the first
     scored sprint); the visibility UI surfaces the rationale/confidence_note/top_action; a §12
     grep + a §11 test (rationale non-empty, >30 chars per the contract).
  2. **S5 §0.4/§6/§9:** the same for `/api/brands/[id]/trust` (and the other scored S5 routes) —
     annotate before responding (reuse the service S3 created), surface the fields, grep + test.
  Both are render/annotate wiring, not schema — no structural change, nothing existing touched.

---

## DELIBERATE NON-FINDINGS (verified intentional — do NOT "fix")
- **local_seo_results NOT built (OQ-1).** No canon DDL; the master plan + Layer 7 scope S8 as
  governance-only. S6's local_ai_trust_score stays NULL by design (S6b-02); reviewer + builder
  ruled DEFER to a dedicated local-SEO pass. The Health Check's LOCAL AUTHORITY dimension already
  skips it for SaaS and shows it pending otherwise. Confirmed intentional.
- **The Autopilot loop's presentational step states** (`done`/`current`/`pending`) are NOT
  remediation_tasks.status — the prototype + S9 both document this as intentional.
- **generated_reports status is UI-derived** (no column); the report sections are unwired slots
  wired by their owning sprint. Confirmed across S4/S5/S6.
- **organizations.tier / Clerk grep hits** are prohibition statements + grep-guards, not misuse.

---

## THE CONSOLIDATED LLD + PROTOTYPE HYGIENE QUEUE (for the v8.68 pass — Gate 3 confirms it complete)
This is the batch to fold into one coordinated canon + prototype touch after G3-01 is applied:
1. **S7b-02** — give run-comparison-prompts a step structure parallel to run-journey's SN-01
   (retry-safety + LLM cost). [LLD]
2. **S8-01 source emits** — add `visibility/trend-updated` (to aggregate-visibility-trend's spec)
   and `hallucination/acknowledged` (to the acknowledge-route spec) at SOURCE, so canon is
   self-consistent (the prompts already build them via S8 backward-edits). [LLD]
3. **S8b-01** — formalise `assertBrandAccess` (or brand-level RLS) in the LLD as the canonical
   brand-isolation mechanism. **Note:** S8 v1.3 builds it in code and S9 consumes it, so this is
   documentation-catch-up, but it matters (S9 depends on it). [LLD]
4. **S8b-02** — add an "Assign owner role | owner only" row to the RBAC matrix. [LLD]
5. **S8b-03** — add `member_role_changed` + `member_removed` (resource_type org_member) to the
   audit_trail action enum. [LLD]
6. **S9-02** — reconcile the **prototype** HealthCheck (currently Frequency/Position/Sentiment/
   Context/Accuracy) to the LLD's four cross-layer dimensions (AI Sentiment / AI Presence / Site
   Readiness / Local Authority) + the #1 action. **The first prototype change since FIX 15.**
   [PROTOTYPE + a confirmatory LLD note]
7. **G3-01** (this audit) — once applied to the S3/S5 prompts, optionally note in the LLD that the
   explainability contract is created in S3 (the first scored sprint). [prompt fix primary; minor
   LLD note]
8. **OQ-1** — define `local_seo_results` DDL if/when Sri builds it; until then S6's
   local_ai_trust_score stays NULL by design. [LLD — deferred, Sri's call]

---

## CROSS-PROMPT AUDIT SUMMARY
- **8 of 8 structural checks PASS** (table ownership, event graph, deferred-item completeness,
  S9 consumption, unit rules, write-semantics, serve() count, UI conventions).
- **1 convention check yields 1 MODERATE finding** (G3-01: explainability contract missing on
  S3/S5 scored routes).
- The cross-sprint contracts that took the most review effort all line up end-to-end: the
  dual-emit, the fanout extension + its two added source emits, the brand-access gate (built S8 →
  consumed S9), the explainability contract (the one gap is S3/S5 omission), the CPR-01 benchmark
  completion, the BD-01 FK forward-refs, the crawler build-once, the unit rules, the
  retry-idempotency theme.
- **One deliberate deferral stands** (OQ-1 local_seo_results → S6 NULL by design).

**Recommended sequence:** apply G3-01 to S3 + S5 (bump to v1.4 each), then run the single
consolidated v8.68 LLD + prototype hygiene pass folding items 1–8 above, then build.

— End of GATE3-CROSS-PROMPT-AUDIT.md
