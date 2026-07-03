# Claude Code — Sprint 3 Section 2 · BE-3: CROSS-SPRINT GAPS (S1→S3), report-first

BE-1 (72 tests) + BE-2 (62 tests) are green, **0 source bugs** — S3 in isolation is solid. BE-3 tests the
**integration seams**: where Sprint 3's code consumes/extends **Sprint 1, Sprint 2, and Phase 1** code. The goal is
to catch mismatches at the boundaries — S3 assuming something about an earlier sprint's contract that isn't true.

> **Report-first (unchanged):** write + run, **REPORT failures — do NOT fix source.** A failure may be a real
> cross-sprint contract bug OR a wrong test. Only BE-4 changes source, post-review.
> **Dev DB only** (seed + tear down). RLS tests under **`rls_test_role` (non-superuser)**.
> Focus: the SEAMS. Don't re-test S3 in isolation (BE-1/BE-2 covered that) — test where S3 meets earlier sprints.

## The real cross-sprint dependencies (from the Sprint 3 prompt)
- **S1 (budget/provider):** fan-out LLM calls flow through `BudgetPolicyService.estimate()` + **`selectModel(tier,
  engine, ...)`**; respects the Sprint 1 budget `max_fan_out_sub_queries` (default 12) and per-tier engine counts
  (Free 2 / paid 4). Never hardcode engine/model lists.
- **S2 (workflow):** the two FK ALTERs onto **`remediation_tasks`** (fk_fan_out_gap, fk_topical_gap); wins-feed's
  **gap_closed** reads S2 `remediation_tasks`; the shared **serve() array** (S1+S2+S3 = 9 functions).
- **Phase 1:** wins-feed reads the **citations table** (new_citation, new_engine_coverage); `sample_quality` reuses
  **`lib/confidence-labels/classify.ts`** (not re-implemented); topical-gaps seeds topic_cluster from
  **`vertical_pack_prompts.topic`**; SoV/mentions read Phase 1 audit data.

---

## BE-3 tests — the seams

### 1. S1 budget + model selection (fan-out)
- **selectModel used, no hardcoded models/engines:** run fan-out for a Free-tier vs paid-tier brand; assert the
  engines used come from the **tier's configured engine set** (Free 2 / paid 4), via `selectModel` — NOT a
  hardcoded list. Grep-guard `'claude-3|'gpt-4|'gemini-` = 0 in lib/visibility is fine as a static check, but ALSO
  assert behaviourally that a tier change changes the engines exercised.
- **Budget cap enforced:** set `max_fan_out_sub_queries` low (e.g. 3) via the Sprint 1 budget path; assert fan-out
  produces **≤ the cap**, not the default 12. Prove the S1 budget service actually gates S3's fan-out (call it,
  count the rows).
- **`BudgetPolicyService.estimate()`** is invoked on the fan-out LLM path (the S1 cost-control seam) — assert it's
  consulted (spy/mock), not bypassed.

### 2. S2 remediation_tasks FK seam
- **The FKs reference S2's real columns:** fk_fan_out_gap → `remediation_tasks.fan_out_gap_id` →
  query_fan_out_results(id); fk_topical_gap → `remediation_tasks.topical_gap_id` → topical_coverage_gaps(id).
  Assert against the **actual S2 remediation_tasks schema** (the columns S2 created as plain UUIDs) — a real insert
  of a remediation_task referencing a real fan-out/topical row succeeds; referencing a non-existent id is rejected
  or SET NULL per the constraint.
- **ON DELETE SET NULL end-to-end:** create an S2 remediation_task linked to an S3 topical/fan-out gap; delete the
  gap; assert the **task survives** with the FK column NULL (the S2 task outlives the S3 gap — BD-01).

### 3. wins-feed cross-sprint reads (the biggest seam — reads S1/P1/S2/S3)
- **gap_closed (reads S2):** seed a **completed** S2 remediation_task; assert wins-feed emits a `gap_closed` win
  reading the real S2 `remediation_tasks` (status/shape as S2 defines it).
- **new_citation / new_engine_coverage (reads Phase 1 citations):** seed Phase 1 citation rows; assert those win
  types populate from the **real citations table** (not an S3 table).
- **visibility_up / competitor_down (reads S3):** seed visibility_trends / share_of_voice_snapshots deltas; assert
  those win types populate.
- **Attribution honesty across all:** `reason` prefixed **"likely linked to:"** regardless of source sprint;
  LIMIT 20 / ?limit max 50.

### 4. Phase 1 classify.ts reuse (no re-implementation)
- `sample_quality` on visibility_trends / share_of_voice_snapshots comes from the **Phase 1
  `lib/confidence-labels/classify.ts`** — assert the classification matches what the Phase 1 helper returns for the
  same inputs (i.e. S3 delegates to it, doesn't re-implement a divergent copy). Confirm the label set (Confirmed |
  Likely | Hypothesis | Insufficient data).

### 5. vertical_pack_prompts seam (topical gaps + fan-out)
- topical-gap-calculator seeds `topic_cluster` from **DISTINCT `vertical_pack_prompts.topic`** with hyphen→
  underscore; assert against the **real Phase 1 vertical_pack_prompts** data (not a fixture that diverges from the
  actual topic values).
- fan-out's `original_prompt_id` REFERENCES vertical_pack_prompts(id) **ON DELETE SET NULL** — deleting a prompt
  nulls the fan-out provenance but keeps the fan-out row (CK3).

### 6. The event seam (S-earlier pipeline → S3 consumers)
- **S3 consumes what the pipeline actually emits:** the audit pipeline (earlier sprints) emits **`audit.complete`**
  (dot). Assert S3's 5 functions listen on the **exact string the pipeline emits** — emit the real pipeline event
  and confirm the S3 functions fire (not a hand-crafted event that differs from production). This is the
  cross-sprint half of the wiring (BE-1 tested S3's side; BE-3 confirms alignment with the emitter).
- **serve() array:** all 9 functions (S1 + S2 + S3) registered in the single
  `app/api/webhooks/inngest/route.ts` — assert S3's 6 didn't drop any S1/S2 registration (count + names).

## INVARIANTS
- Test the SEAMS, not S3 in isolation. Assert against the **real** S1/S2/Phase-1 schemas + services (not fixtures
  that could drift from the actual earlier-sprint contracts).
- Report-first: REPORT any seam mismatch (e.g. S3 assuming a remediation_tasks column that S2 named differently, or
  a citations column shape mismatch) — do NOT fix. Only BE-4 changes source.
- Dev DB; `LLM_MODE=mock`; RLS under `rls_test_role`; tear down; never prod.
- `subscriptions.tier` (never `organizations.tier`); `selectModel` (no hardcoded models); TS strict, no `any`.

## VERIFY / REPORT
- Pass/fail counts. For any failure: the **seam** (which S3↔S-earlier boundary), expected vs actual, and
  **code-bug vs wrong-test** assessment (don't fix).
- Specifically confirm: budget cap actually gates fan-out (≤ cap, not 12); tier change changes engines used
  (selectModel, not hardcoded); the FK ON DELETE SET NULL keeps the S2 task; wins-feed reads the REAL S2
  remediation_tasks + Phase 1 citations (not S3 stand-ins); sample_quality delegates to the Phase 1 classify.ts;
  topic_cluster seeded from real vertical_pack_prompts; S3 functions fire on the pipeline's real `audit.complete`;
  serve() has all 9.
- Any genuine cross-sprint regression flagged (for BE-4) — with the seam + why.
- Full suite still green; dev-DB only; data torn down.

## NEXT
BE-4 (run-all + fix — the ONLY pass that may change source, post-review). Given BE-1/BE-2 found 0 source bugs, BE-4
may be a clean confirmation run unless BE-3 surfaces a seam mismatch. Then Section 3 (Frontend Unit) — components
with mock data, **including updating any donut-specific assertions to the new ranked-bars sov-donut.tsx**.
