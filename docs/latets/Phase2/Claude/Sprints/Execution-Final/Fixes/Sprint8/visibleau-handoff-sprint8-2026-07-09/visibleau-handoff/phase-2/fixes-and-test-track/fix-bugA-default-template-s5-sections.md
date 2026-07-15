# Claude Code — FIX Bug A: default-report-template seed missing the 5 S5 sections (they're DEAD on the default path)

The 5 S5 report sections (linkedin_performance, consensus_score, knowledge_panel_status, source_type_gaps,
evidence_snapshots) are wired in narrative-generator's switch cases and RENDER correctly with seeded data — but they're
DEAD for real customers because they're not in the DEFAULT report's section list. The smoke only saw them because a
custom template was hand-inserted. Fix the ROOT: the per-org **is_default report template seed** (the canonical
mechanism), NOT a hardcoded DEFAULT_SECTIONS constant.

Env: Windows repo `C:\startup\VisibleAU\src\`. App runs on LOCAL PROD `visibleau_prod`; dev `visibleau`. Never real prod.

## ⚠️ STEP 0 — Bug B spec-confirmation (do NOT build an unspecced section)
Before touching anything, confirm what's ALREADY decided by canon (I checked — verify in-repo):
- **Bug B (hallucination_risk report section) is NOT a bug — do NOT build it.** Canon: the 12 ReportSection types
  (S5 spec §218-220) do NOT include hallucination_risk. Every "hallucination + report" reference is the ALERT or a
  webhook event or an Enterprise SWOT health metric — never a narrative report section. Hallucination risk ships as the
  **hub card + email alert** (both working). Building a report section = unspecced scope creep. SKIP Bug B.
```bash
# Confirm hallucination_risk is not a defined ReportSection type (should return nothing in the union):
grep -rn "hallucination_risk" lib/communication/types.ts db/schema/*.ts
# Confirm the 12 types (no hallucination_risk among them):
grep -n "linkedin_performance\|consensus_score\|knowledge_panel_status\|source_type_gaps\|evidence_snapshots\|executive_summary\|agent_readiness\|entity_home_status" lib/communication/types.ts | head
```
Report: hallucination_risk is NOT in the ReportSection union (confirming Bug B is not-a-bug). If it somehow IS listed or
canon elsewhere requires it, STOP and report — otherwise proceed with Bug A only.

## STEP 1 — Find the default-template seed + how the report route selects sections
The canonical mechanism (S5 spec §88, §198-199; LLD 8170): a per-org `is_default=true` "Default Report" template; the
report route reads `WHERE organization_id=$orgId AND is_default=true LIMIT 1`, falling back to all-core-sections (§203).
```bash
cat db/seed/default-report-template.ts 2>/dev/null || find db/seed -name "*default*template*"
# What sections does the default template currently seed? (expect S4-only — the bug)
grep -n "sections\|include\|linkedin\|consensus\|knowledge_panel\|source_type\|evidence\|executive_summary\|score_breakdown\|order" db/seed/default-report-template.ts
# How does generate-narrative-report choose sections (template vs DEFAULT_SECTIONS fallback)?
grep -n "DEFAULT_SECTIONS\|is_default\|template.sections\|filter.*include\|all-core\|resolveTemplate" inngest/functions/generate-narrative-report.ts lib/communication/*.ts
```
Report: the default template's current section list (confirm it's the 5 S4 sections only), AND whether the generator
reads the template or falls back to a hardcoded DEFAULT_SECTIONS. (If DEFAULT_SECTIONS is the fallback used when no
template resolves, it ALSO needs the S5 sections for the fallback path — but the TEMPLATE seed is the primary fix.)

## STEP 2 — Add the 5 S5 sections to the default-template seed (include:true, correct order)
Update `db/seed/default-report-template.ts` so the default template's `sections` array includes the 5 S5 sections with
`include: true` and sensible `order` (after the S4 sections). Match the existing section-entry shape (type + include +
order + any label).
```ts
// the default template sections should now be the 5 S4 + 5 S5 (10 total, all include:true):
//   executive_summary, score_breakdown, mention_source_divide, fan_out_coverage, topical_gap_summary,   (S4)
//   linkedin_performance, consensus_score, knowledge_panel_status, source_type_gaps, evidence_snapshots  (S5)
// (do NOT add hallucination_risk — not a section. Do NOT add S6 slots agent_readiness/entity_home_status — S6.)
```
- **CONDITION-AWARENESS (critical):** including a section in the template (`include:true`) makes it ELIGIBLE; whether it
  actually RENDERS for a given brand is decided by the narrative generator's PER-SECTION condition. Confirm the
  generator already gates these correctly (esp. §240: **knowledge_panel_status renders only when
  knowledge_panel_present=false OR knowledge_panel_accurate=false**). So the template says "eligible", the generator's
  condition says "render when there's something to say" — do NOT make the template unconditionally force-render a
  section that should be conditional. Verify each S5 section's generator condition matches its spec rule:
```bash
grep -n "knowledge_panel_present\|knowledge_panel_accurate\|case \"knowledge_panel\|case \"linkedin\|case \"consensus\|case \"source_type\|case \"evidence\|include\|return null\|if (" lib/communication/narrative-generator.ts | head -25
```
Report each S5 section's render condition. If knowledge_panel is NOT gated on present=false/accurate=false, that's a
separate condition bug to note (it would render even when the panel is fine — violating §240).

## STEP 3 — Re-seed existing orgs (the seed only helps NEW orgs unless re-run)
The seed runs at org creation; existing orgs (incl. Test Org Agency 1) already have an S4-only default template. Update
them:
```bash
# Either re-run the seed idempotently (UPSERT the default template's sections), or a one-off UPDATE to add the S5
# sections to existing is_default templates. Confirm the seed is idempotent (UPSERT / ON CONFLICT) so re-running is safe.
# For the existing test org, update its is_default template's sections to include the 5 S5 sections.
```
Report: existing orgs' default templates now include the S5 sections (verify Test Org Agency 1's default template).

## STEP 4 — VERIFY on the DEFAULT path (no hand-inserted template) — the real test
Delete/ignore the test template you inserted for the smoke. Then, using the DEFAULT template only:
1. Generate a report for Metropolitan (Agency org, has seeded S5 data) → open the PDF / read narrative_text.
2. Confirm the 5 S5 sections NOW render on the DEFAULT path (linkedin 45, consensus 67, knowledge_panel "present but
   inaccurate" — which satisfies the accurate=false condition so it SHOULD show, source_type 3/1-critical, evidence).
3. Confirm knowledge_panel's CONDITION works: it renders here (accurate=false). (Optional: a brand with
   present=true/accurate=true should OMIT it — proving the condition, not a blanket render.)
Report: the S5 sections render on the default path (no custom template), and the knowledge_panel condition is honored.

## STEP 5 — Report
- Bug B confirmed not-a-bug (hallucination_risk not a section type) — skipped.
- Bug A fix: default-template seed now includes the 5 S5 sections (include:true); existing orgs re-seeded.
- Condition-awareness: each S5 section's render condition verified (esp. knowledge_panel §240); template = eligible,
  generator condition = actual render.
- Default-path smoke: 5 S5 sections render WITHOUT a hand-inserted template; knowledge_panel condition honored.
- (Note Bug C separately: S5 sections render as narrative-text, not structured PDF cards — cosmetic, deferred.)

## Constraints
- Fix the TEMPLATE SEED (canonical mechanism, §5.4/LLD 8170), not a hardcoded DEFAULT_SECTIONS. If DEFAULT_SECTIONS is a
  real fallback path, add the S5 sections there too, but the template is primary.
- Condition-aware: include:true = eligible; the generator's per-section condition decides actual render. Do NOT
  force-render knowledge_panel unconditionally (§240 says only when present=false OR accurate=false).
- Do NOT build hallucination_risk (Bug B — not a section). Do NOT add S6 slots (agent_readiness, entity_home_status).
- Re-seed EXISTING orgs (idempotent) — the fix must reach orgs that already have an S4-only default template.
- Verify on the DEFAULT path (no hand-inserted template) — that's the customer path that was dead. Local prod, never real prod.
- LLD v8.70 / §5.4 win.

## NOTE
Bug A's root is the default-report-template SEED being S4-only (§5.4/LLD 8170 — the canonical section mechanism), not a
missing constant. Add the 5 S5 sections to the seed (include:true) AND re-seed existing orgs, so the sections reach the
DEFAULT customer path (the smoke only saw them via a hand-inserted template). Keep it CONDITION-AWARE: the template makes
a section eligible; the generator's per-section condition (esp. knowledge_panel only when present=false/accurate=false,
§240) decides actual render — don't blanket-force-render. Bug B (hallucination_risk section) is NOT a bug — canon has no
such report section; it's hub-card + alert by design; do not build it. Verify the S5 sections render on the DEFAULT path
with no custom template. Bug C (cards vs text) is cosmetic, separate.
