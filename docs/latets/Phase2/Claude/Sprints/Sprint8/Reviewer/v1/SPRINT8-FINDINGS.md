# VisibleAU Phase 2 — SPRINT 8 PROMPT: GATE 2 FINDINGS (independent review)
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: visibleau-p2-sprint-8-prompt.md **v1.0** (Governance Intelligence, Layer 7)
# Canon used: visibleau-phase2-v8.65-complete-REVIEWED-r2 (authorized; v8.67's five hygiene/
#   security edits touch NONE of Layer 7 or the fanout spec — the handoff A1 confirms a v8.66/
#   v8.65 r2 canon is equally valid here). v8.67 anchors map to r2 at ≈ −84 in Layer 7; I verified
#   every cited line by CONTENT, not number.
# Method: derived independently from the LLD (Layer 7 8423-8600; fanout 3782-3805/6446; RBAC
#   8470) + the prototype + the S3/S4/S5/S6 prompts on disk (to verify the cross-sprint producers),
#   then compared to the prompt. Ran the Section C checks (C1-C10).

---

## 1. VERDICT — **PASS-WITH-FIXES**

A strong, faithful prompt: all four governance tables reproduce the LLD exactly, the 3-layer
auth + RBAC matrix is correct, the fanout extension *spec* (trigger array + map + retry-
idempotency) matches the LLD, OQ-1 is correctly raised not invented, and serve() stays 25/25.
Two fixes — one MODERATE (the #1-risk fanout area), one LOW-MOD — plus a ruling on OQ-1. Both
fixes share one root cause: **S8's backward edits to *upstream* sprints' code are under-specified**
— the prompt scopes the §4 tree to S8's own new files + the single fanout edit, but two
deliverables actually require editing S3/S4/S5/S7 code, and the prompt doesn't list those edits.

---

## 2. RULING on OQ-1 (`local_seo_results`) — **DEFER (recommend to Sri)**

The prompt's handling is **correct**: it builds only the four governance tables and raises
local_seo_results as an open question rather than inventing it. I verified independently:
- `grep -c "CREATE TABLE local_seo_results"` on the canon = **0** — no DDL anywhere. The only
  artifacts are a prose "Sprint 8" tag (LLD 3822), two columns referenced in the
  local_ai_trust_score formula (gmb_completeness_score ×0.25, nap_consistency_score ×0.20, LLD
  5488), and two lib filenames.
- The master plan + Layer 7 + the S8 plan entry scope this sprint as governance-only (tables 35–38).

**Recommendation: DEFER to a dedicated local-SEO pass.** Do not invent a schema in S8 — it would
violate the grounded/anti-drift method and risk locking a wrong design into a table that feeds a
trust score. S6's `local_ai_trust_score` stays NULL by design (consistent with S6b-02) until
resolved. **An LLD addition is required either way** — when Sri does define it (columns: gmb_
completeness_score 0–100, nap_consistency_score 0–100, directory/suburb JSONB; a writer — likely
a `run-local-seo` Inngest fn or an audit-pipeline pass; tier gate; retention), it gets a real DDL
+ its own sprint. The prompt already states all of this in §0.6 — endorse it.

---

## 3. FINDINGS

### S8-01 — [MODERATE] Two of the five fanout producer emits were NOT built upstream — the prompt over-asserts they were (the #1-risk area)
- **Where:** §8.1 / §10 step 3 — "**Verify the producers emit:** S3–S6 functions **were built to
  emit these** … S3's aggregate-visibility-trend emits visibility/trend-updated; the S5
  acknowledge API must emit hallucination/acknowledged."
- **The fanout *spec* is correct** — both the trigger array (5 events) and the deliveryEventName
  map (5 slash→dot) match the LLD verbatim (VALID_EVENTS 3782-3786; map 3802-3805). The problem
  is the **producer side**. I checked all five producers against the LLD *and the producing-sprint
  prompts on disk*:

  | Event | Producer | Built upstream? |
  |---|---|---|
  | report/generated | S4 generate-narrative-report | ✓ S4 §8.1 emits it (WH-01a) |
  | hallucination/detected | S5 detect-hallucinations | ✓ S5 §8.1 emits it (WH-01b) |
  | agent/readiness-scored | S6 score-agent-readiness | ✓ S6 §8.4 emits it (WH-01d) |
  | **visibility/trend-updated** | S3 aggregate-visibility-trend | **✗ 0 refs in the S3 prompt** — §8.2 says only "UPSERT visibility_trends"; no emit in the prose |
  | **hallucination/acknowledged** | S5 acknowledge PATCH route | **✗ 0 refs in the S5 prompt** — the route only sets `is_acknowledged`; the emit is LLD-specified *only* in the webhook spec (3804), NOT in the acknowledge-route spec |

- **Why it matters (MODERATE):** these two webhooks are the *point* of the sprint, and as built
  they'd be **dead** — fanout subscribes and maps them, but nothing emits, so a subscribed
  customer silently receives nothing. The prompt's "verify the producers emit" is the right
  instinct, but the accompanying assertion **"S3–S6 functions were built to emit these"** is
  false for these two and would lead a builder to *assume* they exist and skip adding them.
  (`hallucination/acknowledged` is the higher-risk of the two: its emit lives only in the webhook
  spec, never in the route spec; `visibility/trend-updated` is in the aggregate-visibility-trend
  LLD spec the S3 prompt references at 6446, so it *may* have been built — but the S3 prose omits
  it, so it's not safe to assume.) These are also latent gaps in S3/S5 that those sprints' reviews
  (mine included) didn't surface — which is exactly what the consumer-side check is for.
- **Required fix:** replace the "were built" assertion with an explicit instruction:
  > S8 must **ADD** two emits the producing sprints did not build:
  > (1) `visibility/trend-updated` in `aggregate-visibility-trend.ts`, after each
  >     `visibility_trends` UPSERT (LLD 6446, WH-01c), `data: { organizationId, brandId, periodLabel }`;
  > (2) `hallucination/acknowledged` in the `PATCH …/hallucinations/[hid]` acknowledge route,
  >     on `is_acknowledged` set true (LLD 3804), `data: { organizationId, … }`.
  > The other three (report/generated, hallucination/detected, agent/readiness-scored) already
  > exist — verify only.

  And add both files to the §4 tree as **edits** (today only `fanout-webhooks.ts` is listed there).
  Strengthen the §12 grep to assert the emits at the source, e.g.
  `grep -Rc "'visibility/trend-updated'" inngest/functions/aggregate-visibility-trend.ts # → ≥1`
  and `grep -Rc "'hallucination/acknowledged'" app/api/brands/\[id\]/hallucinations/\[hid\]/route.ts # → ≥1`.

### S8-02 — [LOW-MOD] Five of the seven audited actions live in upstream routes the prompt doesn't list as edits
- **Where:** §6.1 / §9 / §4 tree / §11 / §12 — the prompt requires `recordAction` on all 7 Phase 2
  actions, but treats them as if they're all in S8's surface.
- **The gap:** of the 7 audited actions, only **2** are in S8's own code (`data_residency_accessed`
  = S8's data-residency GET; `feature_flag_changed` = the ops flag path). The other **5 are in
  upstream routes**: `draft_approved`/`draft_dismissed` (S4 draft route), `journey_triggered` (S7
  journey-run route), `hallucination_acknowledged` (S5 acknowledge route — the same route as
  S8-01), `competitive_benchmark_viewed` (S3 benchmark route). The §4 tree lists **only S8's own
  routes**; the prompt never says "edit these existing routes to call recordAction." Worse, the
  safeguards don't catch it: the §11 `audit-trail.test.ts` is **unit-level** (asserts recordAction
  *handles* the 7 action values, not that the 7 *sites* call it), and the §12 grep
  (`grep -Rc "recordAction" app/api/ # → ≥1`) passes if it appears even once.
- **Why it matters (LOW-MOD):** the audit trail is a governance/Privacy-Act compliance feature; a
  build that wires only S8's 2 own actions yields an audit log silently missing journey triggers,
  acknowledgements, draft approvals, and benchmark views — and nothing in the tests/greps flags it.
- **Required fix:** in §6.1/§9, explicitly name the **5 upstream routes** S8 must edit to add
  recordAction (S4 draft approve/dismiss, S7 journey-run, S5 acknowledge, S3 benchmark) and list
  them in the §4 tree as edits; add an integration-level assertion (recordAction is invoked at each
  of the 7 sites) and a per-site §12 grep rather than the blanket `≥1`.

---

## 4. CLEAN — verified independently this pass
- **C1/C2 — all four tables match the LLD verbatim:** audit_trail (user_id nullable; the AT-01
  Phase 2 action + resource_type enums, LLD 8433-8442); org_members (FKs to the **users mirror,
  not auth_members**; role owner/admin/analyst/viewer; brand_access null=all; the IT-01/IC-01
  invitation lifecycle + single-use nanoid(21) token + cancel-only-unaccepted; UNIQUE(org,user));
  data_residency_log (**UNIQUE(org,data_type) declarative UPSERT, DR-01**; the DR-02 retention
  values mirroring RT-01 — audit/evidence/pdf=12mo, llm_cache=30d, crawler_logs=90d; "declarative
  not event log"); org_feature_flags (UNIQUE(org,flag_key); the canonical flag set; **operator-set
  only**; priority org_feature_flags > env > defaults).
- **C3 — the 3-layer auth model + RBAC matrix** reproduced correctly (Better Auth session →
  users.role org-level → org_members brand-level; the matrix: run-audit owner/admin/analyst,
  approve owner/admin, invite owner/admin, delete-brand owner-only, view all; LLD 8470/8533).
- **C4 — the fanout *spec*** is correct: both the trigger array and the deliveryEventName map
  match LLD 3782-3805; **and the retry-idempotency is present and sound** (webhook_deliveries dedup
  on endpointId + event id, step.run per endpoint POST) — the builder correctly applied my
  S7-pass-2 forward note. (The only fanout gap is the producer emits — S8-01.)
- **C5 — OQ-1 raised, not invented** (verified grep=0). Ruling above: DEFER.
- **C6 — RLS + barrel + writer:** all 4 tables get RLS USING+WITH CHECK with the MI-01 DROP POLICY
  guard; setRlsContext on protected routes; cross-org→404; the phase2-governance barrel export is
  called out; record-data-residency.ts is correctly a runtime UPSERT (DR-01), not a seed file.
- **C7 — UI anchors exist** (prototype FIX-15 vs my FIX-14 copy = ~30-line offset, not an error):
  TeamManagement @2772 (prompt cites 2800), DataResidency @3006 (cites 3034); STATES + RESPONSIVE
  + both themes + role-gating specified per screen.
- **C9 — §1 enumeration is COMPLETE; the S1-02/S6-03 under-enumeration pattern did NOT recur.**
  §1 accounts for all five lib/governance files: four "lib modules" (audit-trail, access-control,
  feature-flags, data-residency) in one bullet + record-data-residency.ts as the "1 declarative
  writer (§5.5)" in another + the lib/feature-flags/index.ts edit. The split (modules vs the DR-01
  writer) is a defensible categorization, and every §4-tree file is named. Sections 0–14 + §6U +
  the §0.6 OPEN QUESTIONS block all present.
- **serve() = 25/25** — fanout-webhooks is a Phase-1 function S8 *extends*; no new function (§8.1).

---

## 5. NEXT STEP
Two fixes + the OQ-1 decision:
- **S8-01** — explicitly instruct S8 to ADD the two missing producer emits (visibility/trend-updated
  in aggregate-visibility-trend; hallucination/acknowledged in the acknowledge route), list both as
  §4-tree edits, and add source-level greps; verify the other three only. MODERATE.
- **S8-02** — name the 5 upstream routes S8 must edit for recordAction, list them as edits, and
  add an integration-level assertion + per-site greps. LOW-MOD.
- **OQ-1** — DEFER (your call): no canon DDL, don't invent; S6's score stays NULL; an LLD addition
  + a dedicated sprint when you're ready.
With S8-01 + S8-02 applied (v1.1), Sprint 8 is ready for Claude Code. The schema/RBAC/residency/
flags core is solid; both fixes are about making the cross-sprint backward edits explicit so the
webhook chain and the audit trail are actually complete, not half-wired.

**Forward note for Sprint 9 (AI Visibility Autopilot UX — the final sprint):** NO new tables — it
reads everything from S1–S8 and demonstrates ONE end-to-end Autopilot loop (Audit → Prioritize the
#1 gap → Explain → Execute → Measure) + the Action Progress Tracker + the Health Check banner + the
per-prompt trend API. Given S8: a good S9 check is whether the loop's "Measure"/Health surfaces
read the now-live webhook + agent-readiness + wins-feed data consistently (and the latest-audit
read-filter theme from S7b-03 if the benchmark feeds the loop). After S9: the Gate-3 cross-prompt
audit, then build.

— End of SPRINT8-FINDINGS.md
