# VisibleAU Phase 2 — SPRINT 2 PROMPT: GATE 2 FINDINGS
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: visibleau-p2-sprint-2-prompt.md v1.0 (Workflow Intelligence)
# Canon used: visibleau-phase2-v8_65-complete-REVIEWED-r2 (LLD v8.65, 9,192 lines)
# Method: derived each check from the LLD/prototype directly; every cited line opened.
# (Note: the prompt's anchors are r2-accurate — the builder used r2 — so no line offset.)

---

## 1. VERDICT — **PASS-WITH-FIXES**

The three highest-risk areas the builder flagged are **clean and excellent**: schema
fidelity (C1, incl. the BD-01 plain-UUID trap), the locked enums (C2, incl. the
completed-vs-complete trap), and the Inngest specs (C3) are reproduced from the LLD
essentially verbatim. The prompt has clearly absorbed every Sprint-1 lesson (either-marker
regex, navigational anchors, MI-01 idempotency with greps, `[id]` API params).

PASS-WITH-FIXES is driven by **two MODERATE items** — a wins-feed sprint-ownership deviation
(S2-01) and the §6U UI depth gap (S2-02) — plus three LOW items. No HIGH defect.

---

## 2. FINDINGS

### S2-01 — [MODERATE] wins-feed Phase A is built a sprint early vs the LLD
- **Claim in the prompt:** §6.6 says "wins-feed.ts … **Phase A (this sprint) implements 5
  win types**" (new_citation, new_engine_coverage, visibility_up, competitor_down,
  gap_closed), guarding the two S3-sourced types until S3 lands; §4 tree puts
  `lib/communication/wins-feed.ts` + the `GET …/wins` route in Sprint 2.
- **What I checked (LLD ~7771):** the LLD explicitly assigns this to **Sprint 3** —
  "**PHASE A — Sprint 3 (deliver with Visibility Intelligence): Implement these … win types
  using Phase 1 + Sprint 2/3 data**" (new_citation, new_engine_coverage, visibility_up,
  competitor_down, gap_closed). `gap_closed` draws on `remediation_tasks` (S2), but the LLD
  delivers the **feed** in S3, after `visibility_trends` / `share_of_voice_snapshots` exist.
- **Why it matters:** the prompt presents an S2 build as settled fact while the LLD says S3,
  with no deviation note. Per the playbook (the LLD wins; §4.7 deviations are flagged, not
  silently decided), this is a reviewer call. Building early isn't functionally "wrong" —
  the end state after S3 is identical, and scaffolding with graceful degradation mirrors the
  LLD's own CPR-01 null-contract pattern — but it contradicts an explicit LLD sprint
  assignment.
- **Required fix (one of):** (a) defer `wins-feed.ts` + `GET …/wins` to **Sprint 3** per the
  LLD (keep only `progress-summary.ts` + `GET …/progress` in S2 — those are genuinely S2,
  feeding the dashboard card); OR (b) if the early S2 scaffold is intended, **add an OPEN
  QUESTION / deviation note** ("LLD assigns wins-feed Phase A to Sprint 3; we scaffold in S2
  with degradation because `gap_closed` + the Phase-1 types are available and `/wins` fits
  the S2 API surface — confirm") and escalate the sprint-assignment to Sri. No LLD edit by
  the reviewer. (Minor: the LLD prose says "these 4 win types" then lists 5 — the prompt's
  "5" matches the enumerated list and is correct; the LLD's "4" is a stale count worth a
  one-word Sri cleanup, not a prompt defect.)

### S2-02 — [MODERATE] §6U UI spec is under the depth floor and omits the RESPONSIVE line
- **Claim in the prompt:** §6U covers the shared foundation + 3 screens + dashboard
  increment, addressing both themes, loading/empty/error states, ARIA (FIX 13), and
  tabular-nums — good coverage. But the whole prompt is **477 lines**.
- **What I checked:** the Reviewer Handoff C7 itself says "Sprint 2 HAS UI, so §6U is
  expected and **the prompt should clear the ~900-line depth floor**"; the Playbook §3 sets
  the same floor ("under ~900 lines for a 4-week sprint is presumptively under-specified —
  reviewer will bounce it") for UI-bearing sprints. 477 < 900. Two concrete gaps inside §6U:
  - **No per-screen `RESPONSIVE:` line.** Playbook ★6U and the §6 Gate-2 invariant require
    every screen to carry a `RESPONSIVE:` note (intended `sm:`/`md:` behaviour OR an explicit
    "RESPONSIVE: deferred to the dedicated responsive task"). §6U.2–6U.5 have none. Mobile-
    responsive is also one of the four standing non-negotiables.
  - **Tokens/states referenced by anchor, not carried inline.** §6U.0 says "add the design
    tokens to globals.css (prototype 84–490)" and "build the shared components … preserving
    tokens/states exactly" pointing to anchors, rather than carrying the per-component token
    values + state matrices inline. Playbook §4.3 says Claude Code must reproduce the screen
    **without opening the prototype**. (For the 400-line token block, an anchor is
    defensible to avoid error-prone duplication — but the per-component states/variants
    should be spelled out.)
- **Why it matters:** this is the exact under-specification the whole playbook exists to
  prevent (Phase 1's ~12 post-build UI-fix cycles). The schema/Inngest sections are dense;
  the thinness is concentrated in the UI section, which is the part Phase 2 most expands.
- **Required fix:** expand §6U to per-component/per-screen depth — add the `RESPONSIVE:`
  line to each screen (spec or explicit deferral), and carry the component state matrices
  (loading/empty/error/locked/zero-delta) and key token usages inline. This will also
  naturally lift the prompt toward the depth floor. No LLD change.

### S2-03 — [LOW] `draft_type` enum referenced, not enumerated inline
- **Claim in the prompt:** §5.3 says `draft_type` is "the full enum at LLD 7890; underscores,
  e.g. 'wikipedia_article'" — it does not list the 13 values. (By contrast it fully
  enumerates the 8 `content_format` values.)
- **What I checked (LLD 7892–7923):** the full set is wikipedia_article | comparison_article
  | faq_block | press_release | reddit_comment | linkedin_post | linkedin_article |
  answer_capsule | fan_out_content | topical_gap_article | **outreach_brief** | how_to_guide
  | listicle.
- **Why it matters:** Playbook §4.2 (copy enum sets verbatim with the line cited). Also,
  `outreach_brief` is an **accepted column value** but its generator
  (`outreach-brief-generator.ts`) is **Sprint 6** (LLD 7922) — the prompt correctly does NOT
  build it here (good, C8), but a reader given only "the full enum at LLD 7890" might wire it
  up. **Fix:** enumerate the 13 `draft_type` values inline and add a one-line note that
  `outreach_brief` is a valid column value whose generator lands in S6 (not built in S2).

### S2-04 — [LOW] Dashboard two-state card sub-anchor is wrong (~856 → ~1114)
- **Claim in the prompt:** §6U.5 cites the "Work Completed / Measured Impact two-state card
  (prototype **~856 region**)."
- **What I checked:** in the r2 prototype that card lives at **lines ~1114–1211**, inside
  `EnhancedDashboard` (which §6U.5 also, correctly, anchors at 1061). Line 856 is in the
  `Phase2Sidebar` region — unrelated.
- **Why it's only LOW:** anchors are declared navigational, and the primary anchor (1061) is
  correct, so a builder lands in the right component. **Fix:** change "~856" to "~1114".

### S2-05 — [LOW, ties to the open RM-01 finding] §6U.0 builds animations with no reduced-motion guard
- **Claim in the prompt:** §6U.0 instructs adding "autopilot gradient, animations" to
  globals.css (prototype 84–490) — i.e. Sprint 2 builds the `Phase2Styles` animation
  foundation — but says nothing about `prefers-reduced-motion`.
- **Link:** this is the build-time counterpart of the open **RM-01** finding (the prototype's
  infinite `gradient-shift` / `pulse-ring` / `animate-pulse` have no `prefers-reduced-motion`
  guard). Since Sprint 2 is the sprint that builds this foundation, it's the right place to
  bake the guard in. **Fix (when RM-01 is resolved):** add to §6U.0 "wrap animations in a
  `@media (prefers-reduced-motion: reduce)` reset (the global `!important` reset overrides
  even inline `animation:` props)," and add it to the shared UI conventions. Deferred to the
  RM-01 decision; not blocking.

### Bundle nit (not a prompt defect) — handoff §A1 greps the stale marker
The Sprint 2 reviewer handoff §A1 still says `grep -c "ATTRIBUTION CORRECTED IN CROSS-REVIEW"
→ 1`, while the MANIFEST and the prompt §0.3 correctly use the r2 marker `ATTRIBUTION
CORRECTION` (either-marker regex). The canon on record is r2, so this is just an internal
inconsistency in the handoff doc — worth aligning the handoff to the r2 marker, but it does
not affect the build (the prompt's §0.3 is correct).

---

## 3. RULINGS / OPEN-QUESTION CHECK
The prompt carries **no OPEN QUESTIONS block** (none needed — master-plan Q1–Q4 don't bind
S2). It correctly follows master-plan **Q1**: the dashboard increment is the base shell +
Work Completed card only, deferring the SoV strip (S3) and Autopilot tracker + Health Check
banner (S9). ✓

---

## 4. CLEAN — independently derived against the LLD/prototype (not manufacturing findings)

- **C1 schema (all 3 tables) — verbatim ✓.** `remediation_tasks`: `recommendation_id` /
  `reaudit_id` ON DELETE SET NULL; **`fan_out_gap_id` / `topical_gap_id` PLAIN UUID, no FK**,
  with the Sprint-3 ALTER named (BD-01, LLD 7587–7603); both slug enums (`linkedin_gap_source`
  5 values, `consensus_gap_source` 6 values) verbatim; `assigned_to` → `users(id)` UUID;
  indexes `tasks_brand_status_idx` / `tasks_assigned_idx`. `workflow_runs`: `workflow_type`
  6-value enum; `result_summary` typed `WorkflowRunResult` (RS-01) reproduced field-for-field.
  `content_drafts`: `task_id` ON DELETE SET NULL; `content_format` GAP-8 8-value enum +
  selector map (product_page→comparison_article, other→expert_article) verbatim;
  `approved_by` → `users(id)` UUID.
- **C2 enums + traps ✓.** `remediation_tasks.status` open|in_progress|ready_for_review|
  complete|wont_fix (never 'done'); `workflow_runs.status` 'completed' (-ed) with the explicit
  "never compare to audits 'complete'" call-out (§0.5); `recommendation_key`(hyphen)→
  `draft_type`(underscore) translation owned by content-generator.ts; PriorityBadge = derived
  band, not the INTEGER `priority`. The priority formula (Impact×ConfidenceWeight÷EffortWeight,
  RANK() OVER PARTITION BY brand_id) and confidence_label mapping reproduce LLD 7665–7701 /
  7620–7632 exactly.
- **C3 Inngest (highest-risk) — perfect ✓.** generate-content-draft: event `'draft/generate'`,
  concurrency 5 (CC-04), `selectModel(tier,engine,'content_draft')` not hardcoded (MS-01),
  status pending→draft. trigger-validation-reaudit: event `'task/completed'`,
  `step.sleep('wait-14-days','14 days')` (not cron, TR-01), the U-14 quota gate
  (`checkQuota` → `markReauditDeferred(taskId,'quota_exceeded')`, score_after left NULL,
  "validation pending — quota reached", never silently drop). schedule-workflow-runs: daily
  cron, quota-gated before `'audit/start'`, LinkedIn/consensus not quota-tracked. All 3 in
  serve() with a §12 grep.
- **C4 migration + RLS ✓.** MI-01 idempotency (`CREATE TABLE/INDEX IF NOT EXISTS`, `DROP
  POLICY IF EXISTS` before `CREATE POLICY`) in §0.4/§5/§10 + §12 greps; RLS USING + WITH CHECK
  on all 3 tenant tables.
- **C5 anchors ✓ (except S2-04).** Every cited component anchor lands correctly: LayerBadge
  492, IntelCard 527 (unit + ±0), MetricRow 596, SectionHeader 630, TierGate 653, EmptyState
  691, StatusBadge 719, PriorityBadge 754, ConfidenceBadge 773; WorkflowHub 2096,
  ContentDraftEditor 2231, EnhancedDashboard 1061. The two-state card honesty rule is correct
  (Measured Impact counts only `score_after IS NOT NULL`, else the "validation pending" state).
- **C6 honesty rule ✓.** progress-summary SUM FILTER includes `score_after IS NOT NULL`
  (LLD 7740–7745); month boundary `date_trunc('month', now())`. wins-feed degrades when S3
  tables absent and caps at LIMIT 20 / ?limit 50 (PA-01). (Placement = S2-01.)
- **C8 nothing wrongly built/dropped ✓.** `outreach_brief` generator correctly NOT built
  (S6); the Action Progress Tracker 4-surface placement is captured (progress-summary
  surfaced on dashboard/reports/digest/white-label, LLD 7725–7730); wins-feed Phase B
  `trust_improved` correctly deferred to S5.

---

## 5. NEXT STEP (per Reviewer Handoff §D)
Builder applies the fixes and bumps to v1.1:
- **S2-01** (resolve the wins-feed sprint placement — defer to S3 per the LLD, or flag +
  escalate the early-scaffold to Sri) — the one item needing a decision.
- **S2-02** (expand §6U to depth: per-screen `RESPONSIVE:` line + inline state matrices).
- **S2-03 / S2-04** (enumerate `draft_type` + the outreach_brief/S6 note; fix the ~856→~1114
  anchor) — quick.
- **S2-05** folds in with the RM-01 decision (still Sri's call); not blocking.
No LLD change is required for any S2 finding (the LLD "4 win types" wording and the handoff
marker line are optional cleanups). With S2-01 and S2-02 addressed, Sprint 2 is ready for
Claude Code.

— End of SPRINT2-FINDINGS.md
