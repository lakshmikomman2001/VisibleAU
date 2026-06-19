# VisibleAU Phase 2 — SPRINT 5 PROMPT: GATE 2 FINDINGS
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: visibleau-p2-sprint-5-prompt.md v1.0 (Trust Intelligence, Layer 3)
# Canon used: visibleau-phase2-v8_65-complete-REVIEWED-r2 (authorized by the handoff — v8.66
#   changed only the prototype reduced-motion reset + LLD changelog; the Layer 3 regions are
#   identical). The prompt's v8.66 anchors map to r2 at ≈ −29; verified by content, not line number.

---

## 1. VERDICT — **PASS-WITH-FIXES** (near-clean for the largest sprint; three LOW/LOW-MOD items)

The biggest sprint so far (6 tables + the brand_entity_scores ALTER, 7 Inngest fns, 11 lib
modules, 8 screens, 6 GAPs) and the substance is strong. All three builder-flagged high-risk
areas are **clean**: the read-time/structural traps (C2), the Inngest event names (C4), and —
the point of the sprint — the **S4→S5 wiring contract (C5)**, whose slot mapping is correct (5
slots wired, 2 correctly deferred to S6). The three findings are clarity/count items (two trace
to LLD wording); no HIGH or structural defect.

---

## 2. FINDINGS

### S5-01 — [LOW-MODERATE] The two consensus-alert thresholds are conflated (<70 in-app vs <60 email)
- **What the LLD says (two distinct alerts, two thresholds):**
  - LLD **7223**: the in-app **Action Center** consensus alert fires at `consistency_score < 70`.
  - LLD **8373**: the **S4 alert-composer (email)** consensus alert fires at `consistency_score < 60`.
- **What the prompt says:** §6.5 is correct ("Action Center alert when score < 70"). But §0.2
  (line 38) writes the wiring as "check-cross-platform-consensus (**score < 60/70**) → the
  consensus alert", and §8.6 (lines 387–388) says "Action Center alert + **the S4 consensus
  alert when score < 70** (and the LLD's < 60 trust threshold for the alert-composer — use the
  LLD's stated thresholds)." So the §8.6 primary statement attaches **< 70** to the S4 alert,
  when the S4 alert-composer email threshold is **< 60** (LLD 8373); < 70 is the *in-app*
  threshold (LLD 7223).
- **Why it matters:** the parenthetical "use the LLD's stated thresholds" points a careful
  builder to the right values, but the explicit number on the S4 alert is wrong/ambiguous — a
  builder could wire the S4 consensus *email* at < 70 instead of < 60. This is part of the very
  S4→S5 contract the sprint exists to deliver, so the threshold should be unambiguous.
- **Required fix:** state the two alerts separately — in-app Action Center consensus alert at
  **< 70** (LLD 7223); S4 alert-composer email consensus alert at **< 60** (LLD 8373) — and drop
  the "< 60/70" shorthand in §0.2. No LLD change.

### S5-02 — [LOW] `hallucination/detected` webhook filter uses a non-existent `high` severity
- **What the prompt says:** §8.1 — "**Emit `hallucination/detected` … for critical+high only**
  (WH-01b)." (The email alert in the *same* function correctly uses "critical+warning".)
- **What I checked:** `hallucination_incidents.severity` is the 3-value enum **`critical |
  warning | info`** (LLD 6749) — there is **no `high`**. The prompt inherits this from the LLD
  itself: the WH-01b webhook spec (LLD **7132–7134**) says "for each … INSERT with
  `severity='critical'|'high'` … Only critical+high to avoid alert fatigue" — referencing a
  severity value that doesn't exist in the enum.
- **Why it matters (LOW):** only the **external webhook** emit is affected (the in-app + email
  paths use the correct critical+warning); but as written a builder can't filter on a
  non-existent `high`. The intent is almost certainly the two non-`info` severities (critical +
  warning), matching the email alert in the same function.
- **Required fix:** in §8.1, filter the webhook emit on **critical + warning** (the two
  non-info severities). **Escalate to Sri** the matching LLD wording (WH-01b at 7132–7134 and the
  changelog refs say `'critical'|'high'` → should be `'critical'|'warning'`).

### S5-03 — [LOW] Component count: §4 tree / §10 say "14 components" but §6U specifies 13
- **What the prompt says:** the §4 tree (line 162) — "components/domain/trust/ (the **14**
  components listed in §6U)" — and §10 step 6 ("the **14** components") both claim 14.
- **What I counted in §6U:** **13** named components — trust-score-card, hallucination-incident-row,
  evidence-snapshot-row, source-gap-card, linkedin-presence-scorecard, linkedin-gap-row,
  consensus-discrepancy-card, entity-authority-grid, knowledge-panel-card, wikidata-status-card,
  youtube-presence-scorecard, youtube-video-audit-row, youtube-gap-card (12 with `.tsx` +
  `linkedin-gap-row` without the extension).
- **Why it matters (LOW):** a builder following the tree expects 14 but §6U details 13 — the
  same class as the §1-vs-tree count drift tracked in earlier sprints, here between §4-tree/§10
  and §6U. (Possibly a missing per-source consensus-row component in §6U.7, or the count is just
  off by one.)
- **Required fix:** reconcile — add the 14th component to §6U (if one was intended) or correct
  the count to **13** in the §4 tree and §10. Minor nit: write `linkedin-gap-row.tsx` with the
  extension to match the other 12.

---

## 3. RULINGS / OPEN-QUESTION CHECK
No OPEN QUESTIONS block (none needed). The forward dependencies are correctly scoped:
refresh-entity-score's `technical-audit/complete` (slash) with the **S7 dual-emit note** (S7's
technical-audit-run must emit BOTH dot for webhooks + slash for internal — RE-01) is a correct
forward instruction; entity_home_status + agent_readiness correctly **remain S6 slots**.

---

## 4. CLEAN — independently derived against the LLD/prototype (not manufacturing findings)

- **C1 schema (6 tables + ALTER) — verbatim ✓.** hallucination_incidents (citation_id SET NULL
  HI-01, claim_type/severity enums, two independent flags, acknowledged_by→users.id, NO risk
  column); evidence_snapshots (audit_id SET NULL, raw_response, Agency+, retention-excluded);
  **brand_entity_scores ALTER = the LLD's 20 nullable cols** incl `organization_id` (+ backfill)
  and `market_code`, **NOT** entity_score / scored_at (D-01; LLD 8811 — I verified the ALTER
  header at LLD 6822, so org_id IS LLD-specified, not invented); citation_source_intelligence
  (audit_id CASCADE, 9-value source_type, 4-value gap_severity); linkedin/consensus/youtube
  tables with their score columns + indexes.
- **C2 read-time/structural traps (highest-value) — PERFECT ✓.** (a) hallucination risk is
  **read-time, no column** — `LEAST(100, 15×crit + 5×warn + 1×info)` over `is_false_positive =
  false` (acknowledging ≠ closing), fixture 1crit+1warn→20 (LLD 6789/CT-04). (b)
  citation_source_intelligence uses **TWO partial unique indexes** (`csi_unique_with_audit`
  WHERE audit_id IS NOT NULL + `csi_unique_aggregate` WHERE audit_id IS NULL), not one UNIQUE
  (LLD 6931). (c) brand_consensus_checks `UNIQUE(brand_id, source_type)` + cron **UPSERT** (CU-01,
  LLD 7215). (d) ALTER omits entity_score/scored_at (D-01). (e) FK ON DELETE: hallucination.
  citation_id + evidence.audit_id SET NULL, citation_source_intelligence.audit_id CASCADE.
- **C3 score formulas — ✓.** linkedin **30/40/30** (company/founder/content) with the threshold
  breakdown (LLD 3344/6964/6969); youtube **15/20/35/20/10** with channel-absent→0 (LLD 3348–3350).
- **C4 Inngest (7 fns) — ✓.** detect-hallucinations (`audit/complete`, emits hallucination/
  detected), capture-evidence-snapshot (`audit/complete`, Agency+), refresh-entity-score
  (`technical-audit/complete` slash + S7 dual-emit note, RE-01), build-citation-source-
  intelligence (`citations/classified` — CI-02, **not** audit/complete), the three monthly crons
  (`0 3 2/3/4 * *`). serve() running total **18** (3+6+2+7) — arithmetic correct.
- **C5 the S4→S5 wiring contract (the point of the sprint) — CORRECT ✓** (modulo the S5-01
  threshold wording). The slot mapping is right: linkedin_presence_audits→**linkedin_performance**,
  brand_consensus_checks→**consensus_score**, brand_entity_scores knowledge_panel cols→
  **knowledge_panel_status**, citation_source_intelligence→**source_type_gaps**,
  evidence_snapshots→**evidence_snapshots** (Agency+) — **5 of the 7** S4 forward slots wired;
  entity_home_status + agent_readiness correctly **left for S6**. Alert triggers:
  detect-hallucinations→hallucination alert, check-cross-platform-consensus→consensus alert.
  (This is consistent with my Sprint-4 S4b-01 note: evidence_snapshots is an S5 slot,
  agent_readiness an S6 slot.)
- **C6 seed — ✓.** citation-source-affinity seeds **8** `source_affinity_note` strings
  (reddit_thread / au_directory / wikipedia / linkedin_post / news_article / youtube_video /
  review_site / brand_owned) — exactly 8 of the 9 enum values (the catch-all `other` correctly
  has no note), `ON CONFLICT DO NOTHING` (LLD 6896–6917).
- **C7 migration + RLS — ✓.** Two MI-01 migrations (tables first, then the ALTER with ADD COLUMN
  IF NOT EXISTS + the org_id backfill); RLS on all 6 new tables; brand_entity_scores keeps its
  Phase-1 JOIN-to-brands posture per the LLD RLS spec.
- **C8 UI — ✓.** TrustHub anchor lands (prototype 2370); the read-time Hallucination Risk card
  (never a column), distinct acknowledge vs false-positive PATCH actions, the citation-source
  affinity note prominent, the score formulas matching §6.5; each screen has STATES + RESPONSIVE;
  Trust hub Growth+, evidence Agency+. (Component count nit = S5-03.)
- **C9 template/depth + the recurring pattern — ✓.** Sections 0–14 + §6U; §12 greps runnable;
  §10 self-contained. **§1 lists 11 lib modules = the §4 tree = §6.1–§6.5** — the
  S1-02/S2b-01/S3-01 under-enumeration pattern did **not** recur. (564 lines.)
- **C10 nothing missing/wrongly built — ✓.** entity_home + agent_readiness remain S6;
  refresh-entity-score reads `abn_verified` before re-checking (no duplicate S7 ABN call);
  evidence_snapshots retention-exclusion noted for S12.

---

## 5. NEXT STEP
Three prompt-internal fixes (two with a tiny LLD-hygiene escalation), no structural change:
- **S5-01** (clarify the two consensus thresholds: in-app < 70, S4 email < 60) — LOW-MOD; the
  one worth getting right since it's part of the S4→S5 contract.
- **S5-02** (webhook filter → critical+warning; escalate the LLD WH-01b `high` wording to Sri) — LOW.
- **S5-03** (reconcile the 14-vs-13 component count) — LOW.
With S5-01 addressed, Sprint 5 is ready for Claude Code. Strong pass on the largest sprint: the
structural traps, the score formulas, the Inngest event taxonomy, and — most importantly — the
S4→S5 wiring contract are all correct.

**Forward note for Sprint 6 (Retrieval Intelligence + Agent Readiness, Layer 1):** S6 creates
crawler_visit_logs, content_structure_audits (+ the entity-home ALTER), llmstxt_versions,
agent_readiness_scores, and must **wire the last two S4 slots** — content_structure_audits →
entity_home_status and agent_readiness_scores → agent_readiness in the S4 narrative-generator —
closing the S4→S6 half of the contract. Also watch the PUBLIC `/api/visit` route (VA-01) for
crawler logging, and confirm S6's §1 enumeration matches its §4 tree (the standing pattern).

— End of SPRINT5-FINDINGS.md
