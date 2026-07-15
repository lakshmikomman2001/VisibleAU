# Claude Code — P1a SMOKE: do the S4 report sections RENDER real S5 data in the PDF? (+ contamination check)

P1a came back "WIRED" — but that was a CODE-READ (the slots query the tables). This is the actual smoke: seed real S5
data, generate a report, OPEN the PDF, and confirm the 5 dormant S4 sections RENDER real content AND show the RIGHT
score/badge/prose (the trust card proved wiring can look right and render WRONG via annotate-contamination). This is the
make-or-break confirmation of Sprint 5's core deliverable.

Env: Windows repo `C:\startup\VisibleAU\src\`. App runs on LOCAL PROD `visibleau_prod` (migrations applied). Never real
prod. Brand: Metropolitan Plumbing 418f321f-2489-4560-aaa9-895728580465 (Agency org — so evidence_snapshots Agency+ gate
is satisfied). LLM_MODE can be mock for the narrative if needed, but the SECTIONS read S5 tables directly.

## The 5 sections ↔ the S5 table each needs (spec lines 33-35) — seed ALL 5 so sections have content:
| Section (report) | Needs a row in | Seed so it renders |
|---|---|---|
| linkedin_performance | linkedin_presence_audits | a presence_score (e.g. 45/100) + some gaps |
| consensus_score | brand_consensus_checks | a consistency_score (e.g. 72) across ≥2 sources |
| knowledge_panel_status | brand_entity_scores (knowledge_panel_* cols) | knowledge_panel_present=true, _accurate=false (→ "present but inaccurate") |
| source_type_gaps | citation_source_intelligence | a few source_type rows, ≥1 critical gap_severity |
| evidence_snapshots | evidence_snapshots | ≥1 snapshot row (Agency+ — org qualifies) |
(hallucination-risk in the report reads open incidents — seed 1 open critical incident so risk > 0 and the section has
signal, NOT the 0/safe empty case.)

## STEP 1 — Seed real S5 rows for Metropolitan (dev-prod, careful)
```bash
# Insert one meaningful row per table for brand 418f321f... (use the real column names from db/schema).
# Confirm the brand's org + audit ids first:
psql "$PROD_URL" -c "SELECT id, organization_id FROM brands WHERE id='418f321f-2489-4560-aaa9-895728580465';"
# Then seed: linkedin_presence_audits, brand_consensus_checks (≥2 sources, avg ~72), brand_entity_scores knowledge_panel_* cols,
# citation_source_intelligence (≥1 critical gap), evidence_snapshots (≥1), hallucination_incidents (1 open critical).
# Use INSERT matching each table's schema; report the rows created.
```
Report the seeded rows (one per table). If a table already has rows for this brand, note it — don't duplicate needlessly.

## STEP 2 — Generate a report + OPEN the PDF
Generate a report for Metropolitan (the reports flow from Sprint 4). Wait for Ready, download/open the PDF.

## STEP 3 — Read each of the 5 sections in the PDF — RENDER + CORRECTNESS + CONTAMINATION
For EACH section, report: (a) does it RENDER (present, not omitted)? (b) real content (prose with the seeded numbers,
not empty, not raw JSON)? (c) is the score/label/prose CORRECT and self-consistent (no contradiction)?
1. **linkedin_performance** → "LinkedIn presence score: 45/100" (the seeded value), coherent.
2. **consensus_score** → "Cross-platform consensus: 72/100 average across N sources" (seeded), coherent.
3. **knowledge_panel_status** → "Knowledge Panel: present but inaccurate" (seeded present=true/accurate=false), coherent.
4. **source_type_gaps** → "N source types, M critical gaps" (seeded), coherent.
5. **evidence_snapshots** → "immutable snapshots being captured" / count, coherent.
Plus the **hallucination-risk** section (the one whose CARD was contaminated): with 1 open critical incident, risk =
15 (LEAST(100, 15×1)). Confirm the section shows a NON-zero risk with prose about the risk — NOT a contradictory badge,
NOT the trust-aggregate score bleeding in (the exact card bug). This is the prime contamination-sibling suspect.

### CONTAMINATION CHECK (the trust-card bug's fingerprint) — for every section:
- Does any section show the WRONG score (e.g. the overall trust aggregate where a specific metric belongs)?
- A label/badge contradicting its number (like the risk card's 0/"High")?
- annotate() rationale describing a DIFFERENT metric than the section's number?
```bash
# How the report sections call annotate / build prose (check for the same wrong-score wiring as the card):
grep -n "annotate\|confidence_label\|rationale\|score:\|overallTrust\|riskLevel\|trustScore" lib/communication/narrative-generator.ts | head -20
```
Report ANY section where score/label/prose disagree.

## STEP 4 — VERDICT
- **PASS (deliverable confirmed):** all 5 sections RENDER real seeded content, each self-consistent, hallucination-risk
  section shows correct non-zero risk, and NO contamination (no wrong-score/contradictory-badge/mismatched-prose in any
  section). Sprint 5's core purpose is genuinely done on screen.
- **PARTIAL/FAIL:** name each section that (a) didn't render, (b) showed empty despite seeded data (wired-but-not-
  reading), (c) showed the WRONG score / a contradiction / contamination. Each is a real bug for the fix list.

## Report
1. Seeded rows (one per table).
2. Per-section: rendered? real seeded content? self-consistent? (the 5 + hallucination-risk).
3. Contamination check result (any wrong-score/badge/prose across sections).
4. Verdict: deliverable confirmed on screen, or the specific sections that are broken.

## Constraints
- REAL data + REAL PDF — this is the smoke, not another code-read. Open the actual PDF and read the sections.
- Local prod `visibleau_prod`, never real prod. Seed carefully (real column names; don't corrupt existing rows).
- The contamination check is the point: the card bug showed wiring can render the wrong score — verify each section
  shows ITS OWN metric, correctly, not the trust aggregate or a contradictory badge.
- No fixes this pass — report what renders. If a section is broken, we scope its fix next.
- LLD v8.70 wins.

## NOTE
"WIRED" (code-read) ≠ "renders correctly" (this smoke) — the trust card proved a wired thing can render a contradictory
score. Seed one real row per S5 table for Metropolitan, generate a report, OPEN the PDF, and confirm all 5 S4 sections
render real seeded content, self-consistent, with the hallucination-risk section (prime contamination suspect) showing
correct non-zero risk. The contamination check — any section showing the wrong score / a contradictory badge / mismatched
prose — is what catches the card bug's siblings. PASS = Sprint 5's core deliverable confirmed on screen; else name the
broken sections.
