# VisibleAU Phase 2 — SPRINT 4 PROMPT: GATE 2 FINDINGS
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: visibleau-p2-sprint-4-prompt.md v1.0 (Communication Intelligence)
# Canon used: visibleau-phase2-v8_65-complete-REVIEWED-r2 (authorized by the handoff — v8.66
#   changed only the prototype reduced-motion reset + LLD changelog; the Sprint 4 regions are
#   identical). The prompt's v8.66 anchors map to r2 at ≈ −29 (changelog growth); verified by
#   content, not line number.

---

## 1. VERDICT — **PASS-WITH-FIXES**

The data/logic core is faithful and the four builder-flagged high-risk areas are **clean and
excellent**: the structural traps (C2 — no-status-column, append-only, typed sections,
schedule mutual-exclusivity), the 11 narrative honesty rules (C3), the event chain + Resend/
theme reuse (C4), and the EM-01 digest dedup (C5) all reproduce the LLD essentially verbatim.
The recurring §1-under-enumeration pattern (S1-02/S2b-01/S3-01) is **fixed** here.

PASS-WITH-FIXES is driven by **one MODERATE** cross-sprint mechanism gap (S4-01 — the S5/S6
section self-activation), plus one LOW LLD-hygiene note (S4-02). No HIGH defect.

---

## 2. FINDINGS

### S4-01 — [MODERATE] "Self-activate with zero code change" is not achievable as written for the S5/S6 sections
- **Claim in the prompt:** §6.1 and §8.1 say generate-narrative-report / narrative-generator
  "reads all source tables as nullable and includes each section only when its table has a row
  — so the S5/S6 sections **self-activate later with zero code change** (CPR-01)." §8.1's read
  list explicitly includes `citation_source_intelligence` (S5), `linkedin_presence_audits` (S5),
  `brand_consensus_checks` (S5), `brand_entity_scores` (S5 cols), `content_structure_audits` (S6).
- **The problem (build-order / compile-order):** at Sprint 4 build+test time, **none of those
  S5/S6 tables exist yet** (they're created in Sprint 5 / Sprint 6). So a literal S4
  implementation cannot achieve "zero code change":
  - The normal Drizzle path requires importing the S5/S6 schema modules — which don't exist in
    S4 → **TypeScript compile error**. So S4 literally cannot write `db.select().from(linkedinPresenceAudits)`.
  - Raw SQL (`SELECT … FROM linkedin_presence_audits`) against a non-existent relation →
    **runtime error** during the S4→S5 window, unless guarded.
  - This differs from Sprint 3's CPR-01, which guarded an EMPTY table that *exists*
    (`comparison_prompt_results`); here the tables are **absent**, which is a different mechanism.
- **The prompt's own test confirms it:** §11 specifies `narrative-generator.test.ts` to assert
  "a section is omitted when its source table has no row (e.g. **linkedin_performance absent
  until an audit row exists**)." In S4 the `linkedin_presence_audits` table doesn't exist, so the
  test can't set up a "no row" condition (the relation is missing entirely) — the test as
  written can't run in S4.
- **Inconsistency within the prompt:** §6.4 frames the alert-composer differently and more
  correctly — "build the composer + templates now … the hallucination/consensus triggers fire
  once their **S5 producers exist**" (i.e. S5 wires them). The narrative-generator's "zero code
  change" claim contradicts that "wired in S5" framing.
- **Required fix (one of, clarify in §6.1/§8.1 and the §11 test):** (a) specify a **table-
  existence guard** for each S5/S6 read — e.g. `to_regclass('linkedin_presence_audits') IS NOT
  NULL` (or a try/catch that treats a missing-relation error as "section omitted") via raw SQL,
  so the function is safe to run in the S4→S5 window and genuinely self-activates; OR (b) drop
  the "zero code change" claim and state that the S4 narrative-generator builds the **section
  framework**, with each S5/S6 section's read wired in the sprint that creates its table (the
  framework receives them) — matching the §6.4 alert-composer framing. Either is fine; the
  current wording is not implementable as-is. No LLD change required (the LLD's RULE 7/10/11 say
  "included when a row exists" — achievable under either fix; only the prompt's "zero code
  change" gloss is the issue).

### S4-02 — [LOW / LLD-hygiene, escalate to Sri — not a prompt defect] generated_reports DDL has a stray-comma typo
- **What I found:** the canonical LLD's `generated_reports` DDL (r2 lines 8207–8208) is:
  `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` (no trailing comma) immediately followed by
  `updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),` (trailing comma before the closing `)`). That's
  a missing comma after `created_at` **and** a stray trailing comma after `updated_at` — invalid raw SQL.
- **Why it's only LOW and not a prompt defect:** the prompt §5.2 lists the columns in prose
  ("…; `created_at`; `updated_at`") and tells Claude Code to emit a Drizzle schema + migration,
  so the Drizzle path won't reproduce the raw-SQL comma error, and any raw migration would fail
  loudly on first run. But the prompt also says "Copy each definition VERBATIM from the LLD," so
  a literal copy of this block would carry the typo.
- **Required fix:** correct the LLD DDL (reviewer can't edit the LLD — **escalate to Sri** as a
  one-character cleanup: add the comma after `created_at`'s `now()`, drop the trailing comma
  after `updated_at`'s `now()`). Optionally the prompt can note "emit clean DDL (the LLD's
  generated_reports block has a stray comma)." Present in v8.66 too (the bump didn't touch this).

---

## 3. RULINGS / OPEN-QUESTION CHECK
The prompt carries **no OPEN QUESTIONS block** (none needed). It correctly scopes the dormant
surfaces (C10): the LinkedIn / consensus / knowledge-panel / entity-home report sections and the
hallucination/consensus alerts are specified-but-not-built-against-nonexistent-tables, with the
§14 handoff naming the S5 tables that light them up — framed as correct, not a gap. (The
*mechanism* for that dormancy is S4-01.)

---

## 4. CLEAN — independently derived against the LLD/prototype (not manufacturing findings)

- **C1 schema (3 tables) — verbatim ✓.** report_templates: `sections` typed (TS-01), `tone`
  3-value enum default 'professional', `is_default`. generated_reports: `audit_id` + `template_id`
  **ON DELETE SET NULL** (E-03 / v8.28), the 10 summary JSONBs, `reports_brand_type_idx`.
  report_delivery_schedules: `brand_id` FK present (R-01, no ON DELETE = soft-delete; nullable =
  org-wide), `template_id` SET NULL.
- **C2 structural traps (highest-value) — PERFECT ✓.** (a) generated_reports has **NO status
  column** — UI-derived from `pdf_url` + `email_sent_at` (CM-01: null→generating; set+unsent→ready;
  sent→published), with a §12 grep asserting 0 status mentions. (b) **APPEND-ONLY** — no UNIQUE,
  no ON CONFLICT (U-13), §12 grep `onConflict → 0`. (c) `sections` typed `ReportSection[]` with all
  **12** enum values (TS-01) reproduced in §6.0. (d) report_delivery_schedules weekly/monthly
  **mutual exclusivity** + the exact Zod `.refine()` pair ("day_of_week required for weekly" /
  "day_of_month required for monthly"), `time_of_day` in **UTC**.
- **C3 narrative honesty — PERFECT ✓.** All **11** rules reproduced verbatim (§6.1), incl. RULE 1
  (no causal language at quality_status='insufficient'), RULE 3 (key win = score_delta>0 AND
  sample_quality>='Likely'), RULE 8 (evidence snapshots Agency+), and RULES 7/10/11 annotated to
  their S5/S6 source tables. (The self-activation *mechanism* = S4-01.)
- **C4 model + event chain + reuse — PERFECT ✓.** generate-narrative-report listens on
  **`trend/aggregated`** (NR-01), emits **`report/generated`** after the INSERT (WH-01a),
  `concurrency: { limit: 5 }` (CC-05), generates **only when an active delivery schedule exists**,
  uses `selectModel(tier, engine, 'narrative_generation')` (MS-02). send-scheduled-reports reuses
  the **Phase 1 Resend singleton** (`from '@/lib/email/client'`; §12 `new Resend( → 0`); pdf-builder
  **imports `lib/pdf/theme.ts`** (not duplicated). Both in serve() → total **11**.
- **C5 EM-01 dedup — PERFECT ✓.** The prompt adds the EXISTS guard to the Phase 1
  send-weekly-digest so a brand with an active weekly Phase 2 schedule is skipped (no double
  Monday email), matching LLD 8234–8246; §12 grep + integration test cover it.
- **C6 seed — ✓.** Per-org `is_default` 'Default Report' template, 5 core sections include:true
  (executive_summary / score_breakdown / mention_source_divide / fan_out_coverage /
  topical_gap_summary), 7 optional false, tone 'professional', `ON CONFLICT DO NOTHING`, with the
  `is_default LIMIT 1` read + all-core fallback (LLD 8150–8170).
- **C7 migration + RLS — ✓.** MI-01 idempotency (CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY IF
  EXISTS); RLS USING + WITH CHECK on all 3 (all carry organization_id).
- **C8 UI — ✓.** ReportsList anchor lands (prototype 2682); derived status badge (never a column);
  template editor (12 toggles + tone); schedule manager (conditional weekly/monthly matching the
  refine); each screen has a STATES matrix + RESPONSIVE line; reduced-motion consumed from S2;
  reports Growth+, schedules Agency+.
- **C9 template/depth + the recurring pattern — ✓ and FIXED.** Sections 0–14 + §6U present; §12
  greps runnable; §10 self-contained. **§1 now enumerates exactly the §4 tree** — 4 lib modules
  (narrative-generator, pdf-builder, delivery-scheduler, alert-composer) = §4 tree functional
  modules = §6.1–§6.4; 2 Inngest fns consistent across §1/§8/§12. The S1-02/S2b-01/S3-01
  under-enumeration pattern did **not** recur. (502 lines; the ~400-line token block is referenced
  by anchor per the established defensible pattern.)
- **C10 dormant surfaces — framed correctly ✓** (mechanism caveat = S4-01).

---

## 5. NEXT STEP
- **S4-01** (specify the S5/S6 self-activation mechanism — `to_regclass`/try-catch guard, or
  reframe as "S4 builds the framework; S5/S6 wire their section reads" + fix the §11 test) —
  MODERATE, the one item worth a v1.1 and a quick decision.
- **S4-02** (LLD `generated_reports` DDL stray comma) — LOW; escalate to Sri as an LLD cleanup;
  optionally have the prompt note "emit clean DDL."
With S4-01 addressed, Sprint 4 is ready for Claude Code. Strong pass: every structural trap, all
11 narrative rules, the event chain, the EM-01 dedup, and the seed are faithful, and the §1
enumeration discipline has held.

— End of SPRINT4-FINDINGS.md
