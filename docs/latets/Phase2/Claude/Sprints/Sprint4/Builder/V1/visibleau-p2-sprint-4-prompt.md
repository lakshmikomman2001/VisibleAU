# VisibleAU Phase 2 — SPRINT 4 PROMPT: Communication Intelligence
# Version: 1.0 | Built against: LLD v8.66 (REVIEWED-r2) | Sprint: 4 of 9 | 4 weeks
# Source anchors (r2/v8.66): Sprint 4 plan (~8939), Layer 6 §"COMMUNICATION INTELLIGENCE"
# (~8129), tables 32–34 (report_templates 8143, generated_reports 8201,
# report_delivery_schedules 8247), narrative RULES 1–11 (~8290), API routes (~8330),
# Inngest specs generate-narrative-report + send-scheduled-reports (~8350), lib modules
# (~8395), MI-01 (~8645), RLS spec (~8629), prototype ReportsList (2682).
# NOTE: line numbers are navigational, not literal — open the cited region; the LLD wins.

> HOW TO USE: read §0, then paste §10 into a fresh Claude Code session on the VisibleAU
> repo. §1–§9 are the spec; §11–§14 are tests/acceptance/pitfalls/handoff. When this
> prompt and the LLD disagree, THE LLD WINS and this prompt is the bug.

---

## 0. READ FIRST — CONTEXT & CONVENTIONS

### 0.1 What Sprint 4 is
**Communication Intelligence (Layer 6)** — turns the analytics into client-facing output:
configurable **narrative reports** (evidence-bounded, no over-claiming), **white-label PDF**
rendering, scheduled **email delivery**, and the **alert composer** (hallucination / drift /
consensus / volatility emails). It consumes Sprint 3's visibility data and Sprint 2's task
summaries. The LinkedIn / consensus / entity-home / knowledge-panel report sections are
specified now but their **data sources land in Sprint 5 + Sprint 6** — the narrative
generator includes each section only when its (nullable) source table has a row, so they
self-activate later (the CPR-01 graceful-degradation pattern). (LLD 8939–8945.)

### 0.2 Prerequisites
Sprints 1–3 merged. S4 reads S3's visibility_trends / query_fan_out_results /
topical_coverage_gaps, S2's remediation summaries, and S1's budget service +
`selectModel()`. It also imports the **Phase 1 Sprint 9** white-label theme helpers
(`lib/pdf/theme.ts`) and the **Phase 1** Resend singleton (`lib/email/client.ts`) — do not
re-create either.

### 0.3 Verify you are on the right LLD before starting
```bash
grep -m1 "^# Version:" visibleau-7layer-lld.md          # → # Version: 8.66 (or 8.65 — both valid) | Date: June 2026
grep -cE "ATTRIBUTION CORRECT(ED IN CROSS-REVIEW|ION)" visibleau-7layer-lld.md   # → ≥1
```
Canon is `visibleau-phase2-v8.66-complete-REVIEWED` (or its v8.65 r2 predecessor — v8.66
changed only the prototype reduced-motion reset, nothing Sprint 4 cites). If the version is
below 8.65 or the marker count is 0, STOP — stale LLD.

### 0.4 SHARED CONVENTIONS (binding; from master plan §7)
- **Better Auth** canonical; **zero Clerk**. Page routes `[brandId]`; API routes `[id]`.
- **`subscriptions.tier`**, never `organizations.tier`. **TIER_ENGINES** governs engine
  counts. **`selectModel(tier, engine, 'narrative_generation')`** for the report LLM call —
  narrative_generation maps to the CHEAPEST model (structured output, not quality-sensitive
  per the cost table); never a hardcoded model string (MS-02).
- **MI-01 migration idempotency (v8.29):** whole migration re-runnable — `CREATE TABLE IF
  NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS "<name>" ON <table>;`
  before each `CREATE POLICY`.
- **RLS** USING + WITH CHECK on every tenant table (all 3 Sprint 4 tables carry
  organization_id → all 3 get RLS) per the LLD RLS spec (~8629).
- `LLM_MODE=mock` in all tests.
- **Tier gating:** reports are **Growth+**; delivery schedules are **Agency+**; evidence
  snapshots in reports are **Agency+** (narrative RULE 8); white-label PDF styling is the
  agency tier's feature. (Tab gate: `reports=Growth` per master plan §7.)
- **UI** token-driven (dark + `[data-theme="light"]`; `color-mix` for faint fills, RT-01;
  `--focus-ring`/`--elevation`; `tabular-nums`; ARIA per FIX 13; reduced-motion reset already
  in the S2 foundation — consume it, don't rebuild).

### 0.5 Status / enum / structural rules Sprint 4 introduces (copy EXACTLY)
- **report status is UI-DERIVED — NO status column (CM-01, LLD 8225).** generated_reports has
  no status field. The Reports List badge is derived from two timestamps: `pdf_url IS NULL`
  → **'generating'**; `pdf_url IS NOT NULL AND email_sent_at IS NULL` → **'ready'**;
  `email_sent_at IS NOT NULL` → **'published'**. Compute via SQL CASE or a mapper; do NOT add
  a column. (Same pattern as conversation_journeys ready/not_run.)
- **generated_reports is APPEND-ONLY (U-13, LLD 8232).** One row per generated report, keyed
  by created_at. NO UNIQUE key, NO ON CONFLICT — every regeneration INSERTs a NEW row (each
  report is a distinct artifact with its own pdf_url + period_label). `updated_at` still
  bumps as pdf_url then email_sent_at are populated async.
- **report_templates.sections is typed `ReportSection[]` (TS-01, LLD 8147)** — a JSONB array
  of `{ type: <12-value enum>; include: boolean; order?: number }`. Cast in code:
  `(template.sections as ReportSection[]).filter(s => s.include)`. The 12 section types are
  enumerated in §6.0.
- `report_templates.tone` = professional | plain_english | executive (default 'professional').
- `report_delivery_schedules.frequency` = weekly | monthly, with **mutual exclusivity**:
  weekly → day_of_week (0–6) set, day_of_month NULL; monthly → day_of_month (1–28) set,
  day_of_week NULL. Enforce via the Zod `.refine()` pair (LLD 8278). time_of_day stored in
  **UTC** (default '23:00'); never store AEST/AEDT.

---

## 1. WHAT SHIPS THIS SPRINT
- 3 new tables (§5): report_templates (#32), generated_reports (#33),
  report_delivery_schedules (#34) + the `generated_reports` index.
- 1 mandatory seed (§5.4): the per-org **is_default report template** — without it
  generate-narrative-report can't resolve a template (it falls back to all-core-sections, but
  the seed is the spec).
- 2 Inngest functions (§8): generate-narrative-report (event-chained off
  `trend/aggregated`), send-scheduled-reports (daily cron) — both registered in `serve()`.
- 4 lib modules (§6): narrative-generator, pdf-builder (extends Phase 1, imports
  lib/pdf/theme.ts), delivery-scheduler, alert-composer.
- Screens (§6U): the Reports list/detail screen (ReportsList prototype 2682), template
  editor, and delivery-schedule manager.
- API routes (§9): report history/generate/detail, template list/create, schedule list/create.
- **GAP coverage:** none new; this sprint *surfaces* GAP outputs (fan-out, topical, archetype
  now; LinkedIn/consensus/entity-home/knowledge-panel sections self-activate when S5/S6 land).

---

## 2. DEPENDENCIES TO INSTALL
`@react-pdf/renderer` (PDF rendering — confirm whether Phase 1 Sprint 9 already installed it
for the white-label PDFs; if present, reuse). `react-email`/`@react-email/components` for the
scheduled-report + alert email templates (confirm Phase 1 already uses these for the weekly
digest — reuse the same setup). No other new runtime packages.

## 3. ENVIRONMENT VARIABLES (additions)
None new. Email uses the existing `RESEND_API_KEY` + the Phase 1 verified domain
(noreply@visibleau.com). PDF storage uses the existing Supabase Storage bucket (pre-signed
URLs, 7-day expiry); confirm the bucket/credentials Phase 1 Sprint 9 already configured.

---

## 4. PROJECT STRUCTURE ADDITIONS
Every file below is specified in §5–§9 / §6U. No file appears without a spec.
```
db/
├── schema/
│   ├── report-templates.ts · generated-reports.ts · report-delivery-schedules.ts
├── migrations/
│   └── 00NN_phase2_sprint4_communication.sql   // 3 CREATEs (IF NOT EXISTS) + index + RLS
└── seed/
    └── default-report-template.ts              // §5.4 (per-org is_default template)

lib/communication/
├── narrative-generator.ts     // §6.1 evidence-bounded narrative (RULES 1–11)
├── pdf-builder.ts             // §6.2 report PDF; imports lib/pdf/theme.ts (do NOT duplicate)
├── delivery-scheduler.ts      // §6.3 schedule management + due-calculation
├── alert-composer.ts          // §6.4 hallucination/drift/consensus/volatility alert emails
├── types.ts                   // ReportSection interface (§6.0) + summary JSONB shapes
└── index.ts

lib/email/templates/
├── scheduled-report.tsx       // §8.2 React Email — report delivery
└── alerts/ (hallucination · drift · consensus · volatility).tsx   // §6.4

inngest/functions/
├── generate-narrative-report.ts   // §8.1 event 'trend/aggregated', concurrency 5, emits 'report/generated'
└── send-scheduled-reports.ts      // §8.2 daily cron, Resend, EM-01 dedup with Phase 1 digest

app/(auth)/brands/[brandId]/reports/
├── page.tsx              // Reports list (§6U.2)
└── [reportId]/page.tsx   // Report detail + PDF download (§6U.3)
app/(auth)/organizations/[orgId]/report-templates/page.tsx   // template editor (§6U.4)
app/(auth)/organizations/[orgId]/delivery-schedules/page.tsx // schedule manager (§6U.5)
components/domain/communication/
├── report-card.tsx · report-status-badge.tsx · section-toggle-list.tsx
├── schedule-form.tsx · tone-selector.tsx

app/api/brands/[id]/reports/route.ts · reports/generate/route.ts · reports/[reportId]/route.ts
app/api/organizations/[id]/report-templates/route.ts
app/api/organizations/[id]/delivery-schedules/route.ts

tests/phase2/sprint4/  (§11)
```

---

## 5. DATABASE SCHEMA ADDITIONS

Copy each definition VERBATIM from the LLD (anchors inline). Apply **MI-01** to the whole
migration.

### 5.1 report_templates (#32, LLD 8143)
`organization_id` NOT NULL REFERENCES organizations(id). `name` TEXT NOT NULL. `template_type`
TEXT NOT NULL. **`sections` JSONB NOT NULL — typed ReportSection[]** (§6.0/§0.5). `tone` TEXT
NOT NULL DEFAULT 'professional' (3-value enum §0.5). `is_default` BOOLEAN NOT NULL DEFAULT
false (the seed target — §5.4). `created_at` / `updated_at` (updated_at set on sections/tone/
name edits).

### 5.2 generated_reports (#33, LLD 8201) — APPEND-ONLY, UI-DERIVED STATUS
`brand_id` NOT NULL REFERENCES brands(id); `organization_id` NOT NULL REFERENCES
organizations(id); `audit_id` REFERENCES audits(id) **ON DELETE SET NULL** (report outlives
its audit — E-03; retention nulls audit_id, keeps the report); `template_id` REFERENCES
report_templates(id) **ON DELETE SET NULL** (immutable artifact survives template deletion —
v8.28); `report_type` TEXT NOT NULL; `period_label` TEXT; `narrative_text` TEXT NOT NULL;
`headline` TEXT NOT NULL; the summary JSONBs (`key_wins`, `key_gaps`, `fan_out_summary`,
`topical_summary`, `mention_source_summary`, `linkedin_summary`, `consensus_summary`,
`entity_home_summary`, `knowledge_panel_summary`, `confidence_notes`); `pdf_url` TEXT (set
async after render); `email_sent_at` TIMESTAMPTZ; `created_at`; `updated_at`. **NO status
column** (§0.5 CM-01). **NO UNIQUE / NO ON CONFLICT** (§0.5 U-13 append-only). Index
`reports_brand_type_idx (brand_id, report_type, created_at DESC)`.

### 5.3 report_delivery_schedules (#34, LLD 8247)
`organization_id` NOT NULL; `brand_id` REFERENCES brands(id) (R-01 — FK present, no ON DELETE
= Phase 1 soft-delete convention; **nullable = org-wide schedule**, non-null = single brand);
`template_id` REFERENCES report_templates(id) **ON DELETE SET NULL**; `frequency` TEXT NOT
NULL (weekly|monthly); `day_of_week` INTEGER (0–6, weekly only); `day_of_month` INTEGER (1–28,
monthly only) — **mutual exclusivity + Zod refine, §0.5**; `time_of_day` TEXT NOT NULL DEFAULT
'23:00' (**UTC**); `recipient_emails` JSONB NOT NULL; `is_active` BOOLEAN NOT NULL DEFAULT
true; `last_sent_at` TIMESTAMPTZ; `created_at`; `updated_at`.

### 5.4 Seed (MANDATORY) — db/seed/default-report-template.ts (LLD 8170)
For each organization, INSERT one `is_default=true` 'Default Report' template with the
canonical sections array (executive_summary / score_breakdown / mention_source_divide /
fan_out_coverage / topical_gap_summary = include:true; the other 7 = include:false), tone
'professional', `ON CONFLICT DO NOTHING`. generate-narrative-report reads
`WHERE organization_id=$orgId AND is_default=true LIMIT 1`, falling back to all-core-sections
if absent.

### 5.5 RLS
All 3 tables carry organization_id → enable RLS with USING + WITH CHECK on organization_id,
MI-01 `DROP POLICY IF EXISTS` guard before each policy.

---

## 6. LIB MODULES

### 6.0 types.ts — ReportSection + summary shapes (LLD 8147)
```ts
export interface ReportSection {
  type: 'executive_summary' | 'score_breakdown' | 'mention_source_divide'
      | 'fan_out_coverage' | 'topical_gap_summary' | 'source_type_gaps'
      | 'agent_readiness' | 'linkedin_performance' | 'consensus_score'
      | 'knowledge_panel_status' | 'entity_home_status' | 'evidence_snapshots';
  include: boolean;
  order?: number;
}
```
Plus typed shapes for the generated_reports summary JSONBs (key_wins, fan_out_summary, etc.).

### 6.1 narrative-generator.ts — evidence-bounded (LLD 8284, RULES 1–11)
The honesty engine. Enforce ALL eleven rules verbatim:
1. **No causal language when quality_status='insufficient'** ("appears to have improved
   based on available samples", never "improved because of …").
2. Always surface confidence notes when a metric is 'Hypothesis' or lower.
3. Key wins require `score_delta > 0 AND sample_quality >= 'Likely'`.
4. Fan-out coverage section when query_fan_out_results exist for the period.
5. Topical gap summary when TCG score < 70%.
6. Mention-Source archetype section when visibility_trends.brand_archetype is present.
7. LinkedIn section when a linkedin_presence_audits row exists (**S5 table — absent until S5;
   section simply omitted until then**).
8. Evidence snapshots only at **Agency+**.
9. AU local citations framed as Priority 1 for SMB/tradie segments.
10. Knowledge Panel section when knowledge_panel_present=false OR knowledge_panel_accurate=
    false (**brand_entity_scores cols — S5; omitted until then**).
11. Entity Home section when entity_home_same_as_count < 3 (**content_structure_audits — S6;
    omitted until then**).
LLM call: `selectModel(tier, engine, 'narrative_generation')` (§0.4). The generator reads all
source tables as nullable and includes each section only when its table has a row — so the
S5/S6 sections self-activate later with zero code change (CPR-01).

### 6.2 pdf-builder.ts — white-label PDF (LLD 8398)
Extend the Phase 1 PDF builder with the new report sections. **Import the canonical theme
helpers from `lib/pdf/theme.ts`** (Phase 1 Sprint 9: `assetToTheme`, `buildThemeStyles`) —
read `agency_brand_assets` for the org's logo/colours/footer and style the PDF; **do NOT
duplicate Sprint 9's theme logic.** Row is inserted first, `pdf_url` populated after
`renderToBuffer()` → upload to Supabase Storage (pre-signed, 7-day expiry).

### 6.3 delivery-scheduler.ts (LLD 8401)
Schedule CRUD + the "is this schedule due now?" calculation (weekly day_of_week / monthly
day_of_month, time_of_day in UTC). Consumed by §8.2.

### 6.4 alert-composer.ts — 4 alert types (LLD 8404)
Compose + send (via the Phase 1 `lib/email/client.ts` Resend singleton — do NOT new up
Resend): **hallucination** (trigger: detect-hallucinations creates a severity='critical'
incident — S5), **drift** (trigger: 'drift/detected' Inngest event — Phase 1 Sprint 8),
**consensus** (trigger: check-cross-platform-consensus finds consistency_score < 60 — S5),
**volatility** (trigger: citation_volatility_score > 15.0 — S3). **NP-01: gate EACH alert on
its OWN notification preference** (emailOnHallucination / emailOnDrift / etc.), never all on
emailOnDrift. The hallucination/consensus triggers fire once their S5 producers exist; build
the composer + templates now (drift + volatility are already wired from Phase 1 / S3).

---

## 6U. UI SPECIFICATION

GLOBAL UI RULES (per S2 §6U): tokens only; `color-mix` faint fills (RT-01); `--focus-ring` +
`--elevation`; `tabular-nums` on numerics; ARIA per FIX 13; reduced-motion reset already
present. Each screen specifies its STATES matrix and a `RESPONSIVE:` line. The shared
component foundation (LayerBadge/IntelCard/TierGate/StatusBadge/etc.) exists from S2 — consume.

### 6U.2 Reports list — ReportsList (prototype 2682)
LayerBadge "reports". A list of generated_reports (report-card.tsx) with the **derived status
badge** (report-status-badge.tsx — generating/ready/published from pdf_url + email_sent_at,
§0.5; NEVER read a status column). Each card: headline, period_label, created_at, status
badge, download action (enabled only when pdf_url present), "Generate report" CTA. Growth+
gate via TierGate; Starter sees a locked teaser.
STATES — loading: card skeletons (`aria-busy`); empty (no reports yet): EmptyState "No reports
yet — Generate your first"; generating (pdf_url null): card shows a 'generating' badge +
disabled download; error: boundary.
**RESPONSIVE:** report cards `grid-cols-1 md:grid-cols-2`; actions stack on `<sm`.

### 6U.3 Report detail — [reportId]/page.tsx
Renders the report's narrative_text + section summaries (the JSONBs), the confidence notes,
and the PDF download (pre-signed URL). Status badge (derived). For Agency white-label, reflect
the org theme.
STATES — loading: skeleton; generating (pdf_url null): "Your report is being generated…" with
the derived 'generating' state, poll/refresh; error: boundary.
**RESPONSIVE:** single-column; section summaries stack; the PDF action is a sticky header on `<md`.

### 6U.4 Template editor — organizations/[orgId]/report-templates
section-toggle-list.tsx renders the 12 ReportSection types with include toggles + drag order
(writes the `order?` field); tone-selector.tsx (professional/plain_english/executive). Editing
sets report_templates.updated_at. is_default badge on the seeded template.
STATES — loading: skeleton; empty (only the default template): show it; error: boundary.
**RESPONSIVE:** the toggle list is single-column; the section list reorders via keyboard too
(not pointer-only) for a11y. On `<md` the tone selector moves above the list.

### 6U.5 Delivery schedule manager — organizations/[orgId]/delivery-schedules
schedule-form.tsx: frequency (weekly/monthly) drives a conditional field — weekly shows
day_of_week, monthly shows day_of_month (the §0.5 mutual exclusivity, enforced client-side to
match the server Zod refine); time_of_day (displayed in the org's local tz but stored UTC);
recipient_emails (multi-entry); is_active toggle. Agency+ gate.
STATES — loading: skeleton; empty: EmptyState "No schedules — add one"; validation error
(e.g. day_of_week missing for weekly): inline field error matching the Zod message; error:
boundary.
**RESPONSIVE:** form is single-column; the day/time row wraps on `<sm`.

---

## 7. (No CLI changes this sprint.)

## 8. INNGEST FUNCTIONS (register both in serve() alongside S1–S3; LLD 8350)

### 8.1 generate-narrative-report.ts (LLD 8351)
- **Trigger (NR-01 v8.44):** listens on the **`trend/aggregated`** Inngest event, which
  aggregate-visibility-trend (S3) emits after writing a visibility_trends row — chains trend
  aggregation → report generation with NO separate cron. **Only generate when
  report_delivery_schedules has an active row for this brand** (check before generating).
- **Concurrency (CC-05):** `concurrency: { limit: 5 }` (Agency Pro 25 brands = 25 month-end
  runs).
- **Model (MS-02):** `selectModel(tier, engine, 'narrative_generation')` — cheapest model;
  never hardcoded.
- **Reads** (all nullable; include a section only if its table has a row): visibility_trends,
  query_fan_out_results, topical_coverage_gaps, citation_source_intelligence (S5),
  linkedin_presence_audits (S5), brand_consensus_checks (S5), brand_entity_scores (S5 cols),
  content_structure_audits (S6). Applies narrative-generator RULES 1–11.
- **Writes:** INSERT a generated_reports row (append-only), then update pdf_url after
  renderToBuffer(). **Emit `report/generated`** (`{ organizationId, brandId, reportId }`) after
  the INSERT (WH-01a — fanout-webhooks maps it to the external `report.generated` webhook).

### 8.2 send-scheduled-reports.ts (LLD 8378)
Daily cron; finds due schedules (delivery-scheduler) and sends via the **Phase 1 Resend
singleton** (`import { resend } from '@/lib/email/client'` — do NOT new up Resend). Email =
`lib/email/templates/scheduled-report.tsx` (React Email): score summary card, top win, top
gap, the PDF attachment (pre-signed Supabase URL 7-day expiry), unsubscribe footer (→ PATCH
is_active=false). Subjects: monthly `'[Brand] AI Visibility Report — [Month YYYY]'`, weekly
`'[Brand] AI Visibility Update — Week of [Date]'`.
- **EMAIL DEDUP (EM-01 v8.38):** Phase 1 send-weekly-digest and this both default to Monday.
  Phase 1's digest MUST skip any brand that has an active weekly report_delivery_schedule (the
  Phase 2 report is the richer superset) — the filter is specified in the LLD at 8264. Ensure
  send-weekly-digest carries that EXISTS filter so Growth+ customers don't get two Monday
  emails. (This is a one-line guard added to the Phase 1 function, not a new function.)

**serve():** add both to the existing array; remove none. (Running Phase 2 total after S4:
3 (S2) + 6 (S3) + 2 (S4) = 11 of the eventual 25.)

---

## 9. API ROUTES (LLD 8330) — `[id]` params; Better Auth + org scoping; Zod; tier-gated
- `GET /api/brands/[id]/reports` — report history (derived status per row).
- `POST …/reports/generate` — generate a narrative (Growth+); emits the generation path.
- `GET …/reports/[reportId]` — report + PDF download (pre-signed URL).
- `GET /api/organizations/[id]/report-templates` · `POST …` (create template).
- `GET /api/organizations/[id]/delivery-schedules` · `POST …` (create schedule — the §0.5
  Zod refine on frequency/day fields; Agency+).
Every route: Better Auth session + org scoping; Zod; correct codes; tier gate (reports
Growth+, schedules Agency+).

---

## 10. CLAUDE CODE PROMPT (paste this to open Sprint 4)

> You are implementing **VisibleAU Phase 2 — Sprint 4: Communication Intelligence** (Layer 6:
> narrative reports, white-label PDF, scheduled delivery, alerts). Sprints 1–3 are merged.
> Authority: `visibleau-7layer-lld.md` v8.66, Layer 6 "COMMUNICATION INTELLIGENCE" (~8129)
> and the Sprint 4 plan (~8939). Where this prompt and the LLD differ, the LLD wins.
>
> Build, in order:
> 1. Drizzle schemas + an MI-01-idempotent migration for the 3 tables (§5): CREATE TABLE IF
>    NOT EXISTS ×3, the reports_brand_type_idx, DROP POLICY IF EXISTS before each CREATE
>    POLICY, RLS on all 3 (all carry organization_id). CRITICAL: generated_reports has NO
>    status column (status is UI-DERIVED from pdf_url + email_sent_at — CM-01) and is
>    APPEND-ONLY (no UNIQUE, no ON CONFLICT — U-13); report_templates.sections is typed
>    ReportSection[] (TS-01); report_delivery_schedules has the weekly/monthly mutual-
>    exclusivity Zod refine and stores time_of_day in UTC.
> 2. The mandatory seed (§5.4): per-org is_default 'Default Report' template with the
>    canonical sections array (5 core included, 7 optional excluded), ON CONFLICT DO NOTHING.
> 3. The 4 lib modules (§6) + types.ts (the ReportSection interface): narrative-generator
>    enforcing RULES 1–11 (no causal language when quality_status='insufficient'; key wins
>    need score_delta>0 AND sample_quality>='Likely'; each section included only when its
>    nullable source table has a row, so the S5/S6 sections self-activate later); pdf-builder
>    importing lib/pdf/theme.ts (do NOT duplicate Sprint 9's theme logic); delivery-scheduler;
>    alert-composer (4 alert types, each gated on its OWN notification preference — NP-01 —
>    sent via the Phase 1 Resend singleton, do NOT new up Resend). All LLM calls use
>    selectModel(tier, engine, 'narrative_generation').
> 4. The 2 Inngest functions (§8), registered in serve() alongside S1–S3: generate-narrative-
>    report (listens on 'trend/aggregated', only generates when an active delivery schedule
>    exists, concurrency 5, emits 'report/generated' after the INSERT), send-scheduled-reports
>    (daily cron, Resend, React Email template with pre-signed PDF attachment). Add the EM-01
>    dedup guard to the Phase 1 send-weekly-digest so a brand with a weekly Phase 2 schedule
>    does not also get the Phase 1 Monday digest.
> 5. The screens (§6U): Reports list (derived status badge, never a status column), report
>    detail + PDF download, template editor (12 section toggles + tone), delivery-schedule
>    manager (conditional weekly/monthly fields matching the Zod refine). Both themes; STATES
>    matrices + RESPONSIVE per screen; ARIA per FIX 13; reports Growth+, schedules Agency+.
> 6. The API routes (§9): [id] params, Better Auth + org scoping, Zod (incl the schedule
>    refine), tier gates.
>
> Constraints: TS strict, no `any`. LLM_MODE=mock in tests. subscriptions.tier (never
> organizations.tier). selectModel() — no hardcoded models/engine lists. Run §12 greps +
> §11 tests and report.

---

## 11. TESTS REQUIRED (LLM_MODE=mock)
- `narrative-generator.test.ts` — RULE 1 (no causal language at quality_status='insufficient');
  RULE 3 (key win needs score_delta>0 AND sample_quality>='Likely'); a section is omitted when
  its source table has no row (e.g. linkedin_performance absent until an audit row exists);
  selectModel called with 'narrative_generation' (not hardcoded).
- `report-status.test.ts` — the derived badge: pdf_url null→generating; pdf_url set +
  email_sent_at null→ready; email_sent_at set→published. (No status column read.)
- `generated-reports.append-only.test.ts` — regenerating INSERTs a new row (no UPSERT/conflict);
  updated_at bumps on pdf_url then email_sent_at.
- `delivery-scheduler.test.ts` — weekly requires day_of_week (refine rejects otherwise),
  monthly requires day_of_month; due-calculation respects UTC time_of_day.
- `default-template.seed.test.ts` — the is_default row exists per org; the 5 core sections are
  include:true.
- `send-scheduled-reports.integration.test.ts` — due schedule sends via the Resend singleton
  with a pre-signed PDF; the EM-01 guard makes Phase 1 digest skip a brand with a weekly schedule.
- `alert-composer.test.ts` — each alert gated on its OWN preference (NP-01): emailOnHallucination
  off suppresses only the hallucination alert, not drift.
- `communication-rls.test.ts` — cross-org reads blocked on all 3 tables.

## 12. VERIFICATION GREPS
```bash
grep -c "CREATE TABLE IF NOT EXISTS" db/migrations/*sprint4*.sql                     # → 3
grep -c "DROP POLICY IF EXISTS" db/migrations/*sprint4*.sql                          # → 3
# NO status column on generated_reports (UI-derived); APPEND-ONLY (no ON CONFLICT)
grep -ic "status" db/schema/generated-reports.ts | grep -qx 0 && echo "no status col OK" || echo "CHECK: status mention"
grep -ic "on conflict\|onConflict" db/schema/generated-reports.ts                    # → 0
# ReportSection typed (TS-01) + the 12 section types present
grep -c "ReportSection" lib/communication/types.ts                                   # → ≥1
grep -c "evidence_snapshots" lib/communication/types.ts                              # → ≥1
# narrative honesty (RULE 1) + model routing
grep -Rc "selectModel(" lib/communication/narrative-generator.ts                     # → ≥1
grep -RnE "'claude-3|'gpt-4|'gemini-" lib/communication/                             # → 0
# event chain + webhook emit
grep -Rc "'trend/aggregated'" inngest/functions/generate-narrative-report.ts         # → ≥1
grep -Rc "'report/generated'" inngest/functions/generate-narrative-report.ts         # → ≥1
# Resend singleton reused (NOT newed up)
grep -Rc "from '@/lib/email/client'" inngest/functions/send-scheduled-reports.ts lib/communication/alert-composer.ts  # → ≥2
grep -RnE "new Resend\(" lib/communication/ inngest/functions/send-scheduled-reports.ts  # → 0
# theme imported, not duplicated
grep -Rc "from '@/lib/pdf/theme'\|lib/pdf/theme" lib/communication/pdf-builder.ts    # → ≥1
# EM-01 dedup guard added to Phase 1 digest
grep -Rc "report_delivery_schedules" inngest/functions/send-weekly-digest.ts         # → ≥1
# schedule mutual-exclusivity refine
grep -Rc "day_of_week required for weekly\|day_of_month required for monthly" app/api/organizations/\[id\]/delivery-schedules/  # → ≥1
# 2 functions registered
grep -cE "generateNarrativeReport|sendScheduledReports" app/api/webhooks/inngest/route.ts     # → 2
# UI: no hex-alpha on var(); RESPONSIVE + tabular
grep -REc "var\(--[a-z-]+\)[0-9a-fA-F]{2}" components/domain/communication/           # → 0
grep -RcE "md:grid-cols|sm:" app/\(auth\)/brands/\[brandId\]/reports/                 # → ≥1
# subscriptions.tier, no Clerk
grep -RnE "organizations\.tier|org\.tier" lib/communication/ | grep -iv subscriptions # → 0
grep -Rc "Clerk\|@clerk" lib/communication/ db/ app/api/brands/                       # → 0
```

## 13. COMMON PITFALLS / SPRINT 4 ANTI-PATTERNS
- **Adding a status column to generated_reports.** Status is UI-DERIVED from pdf_url +
  email_sent_at (CM-01); two timestamps are the source of truth.
- **Making generated_reports an UPSERT table.** It is APPEND-ONLY (U-13) — every regeneration
  is a new row; no UNIQUE, no ON CONFLICT.
- **Causal language in narratives when data is thin.** RULE 1: at quality_status='insufficient'
  use "appears to have improved based on available samples", never "because of".
- **Hardcoding the report model.** Use selectModel(tier, engine, 'narrative_generation') — the
  cheapest model (structured output); a hardcoded string is a CLAUDE.md §8 violation.
- **New-ing up Resend or duplicating the PDF theme.** Import the Phase 1 Resend singleton
  (lib/email/client.ts) and the Sprint 9 theme helpers (lib/pdf/theme.ts) — do not re-create.
- **Gating all alerts on emailOnDrift.** NP-01: each alert checks its OWN preference.
- **Forgetting the EM-01 dedup guard** → customers get the Phase 1 digest AND the Phase 2
  weekly report on the same Monday.
- **weekly/monthly field bleed.** Mutual exclusivity: weekly→day_of_week only; monthly→
  day_of_month only; enforce the Zod refine on both client and server.
- **Storing local (AEST) times.** time_of_day is UTC; convert for display only.
- **Trying to populate LinkedIn/consensus/entity-home sections now.** Their tables are S5/S6;
  the generator omits each section until its row exists — that is correct, not a gap.
- **Missing RLS** on any of the 3 tables, or the MI-01 idempotency guards.

## 14. HANDOFF TO SPRINT 5
After Sprint 4: reports generate (event-chained off trend aggregation), render as white-label
PDFs, deliver on schedule, and the alert composer is built. Several report sections
(LinkedIn, consensus, knowledge-panel, entity-home) and two alert triggers (hallucination,
consensus) are specified but dormant until their data exists. **Sprint 5 (Trust Intelligence,
Layer 3)** creates the tables that light them up: hallucination_incidents (→ hallucination
alert + report risk), brand_consensus_checks (→ consensus alert + consensus_score section),
linkedin_presence_audits (→ linkedin_performance section), the brand_entity_scores ALTER
(→ knowledge_panel_status section), evidence_snapshots, citation_source_intelligence,
youtube_presence_audits. Sprint 5 requires: S1 budget services, Phase 1 brand_entity_scores
(ALTER target), and — for the alerts/report sections to activate — this sprint's
alert-composer + narrative-generator (already built to self-activate).

## CHANGELOG
- v1.0 — Initial Sprint 4 prompt, generated single-pass against verified LLD v8.66
  (REVIEWED-r2). Schema/Inngest/lib/route detail cited to LLD ~8129–8410 + ~8939; UI to
  prototype ReportsList (2682); conventions from master plan §7. §1 module list is the
  complete enumeration of the §4 tree (per the S3-01 lesson). Carries the CPR-01 self-
  activating pattern for the S5/S6 report sections + alert triggers. Awaiting Gate 2.
