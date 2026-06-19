# VisibleAU Phase 2 — SPRINT 2 PROMPT: Workflow Intelligence
# Version: 1.4 | Built against: LLD v8.67 (REVIEWED-r2) | Sprint: 2 of 9 | 4 weeks
# Source anchors (r2): Sprint 2 plan (~8825), Layer 5 §"WORKFLOW INTELLIGENCE" (~7567),
# tables 29–31 (remediation_tasks 7580, workflow_runs 7846, content_drafts 7885), Inngest
# specs (~7991), MI-01 idempotency (~8645), RLS spec (~8629), prototype WorkflowHub (2096),
# ContentDraftEditor (2231), EnhancedDashboard (1061), shared components (492–840).
# NOTE: line numbers are navigational, not literal — open the cited region; the LLD wins.

> HOW TO USE: read §0, then paste §10 into a fresh Claude Code session on the VisibleAU
> repo. §1–§9 are the spec; §11–§14 are tests/acceptance/pitfalls/handoff. When this
> prompt and the LLD disagree, THE LLD WINS and this prompt is the bug.

---

## 0. READ FIRST — CONTEXT & CONVENTIONS

### 0.1 What Sprint 2 is
**Workflow Intelligence (Layer 5)** — the first user-facing Phase 2 sprint. Ships the
remediation loop: **Recommendation → Task → Draft (with format label) → Approve → Mark
complete → Reaudit measures lift**. Also lands the **shared UI component foundation**
(design tokens + base components) that every later Phase 2 sprint consumes. (LLD 8825–8830.)

### 0.2 Prerequisite
**Sprint 1 must be merged.** Sprint 2's `generate-content-draft` LLM calls flow through
`BudgetPolicyService.estimate()` and `selectModel()` from Sprint 1; tasks read the parent
audit's `quality_status` (the Sprint 1 audits ALTER) for confidence/priority. (LLD 7639.)

### 0.3 Verify you are on the right LLD before starting
```bash
grep -m1 "^# Version:" visibleau-7layer-lld.md          # → # Version: 8.67 (or 8.66/8.65 — all valid) | Date: June 2026
grep -cE "ATTRIBUTION CORRECT(ED IN CROSS-REVIEW|ION)" visibleau-7layer-lld.md   # → ≥1
```
Canon is `visibleau-phase2-v8_65-complete-REVIEWED-r2` (9,192 lines, marker `ATTRIBUTION
CORRECTION`). If the version is below 8.65 (not 8.65 or 8.66) or the marker count is 0, STOP — stale LLD.

### 0.4 SHARED CONVENTIONS (binding; from master plan §7)
- **Better Auth** canonical; **zero Clerk** (any Clerk mention is doc drift C-04).
- Page routes use **`[brandId]`**; API routes use **`[id]`**. (Sprint 2 has both — note the
  task/draft routes are `/api/brands/[id]/...` per the LLD route list.)
- **`subscriptions.tier`**, never `organizations.tier`, for any tier/quota read.
- **TIER_ENGINES** governs engine counts (Free 2 / paid 4) — never hardcode engine lists.
- **`selectModel(tier, engine, useCase)`** for every LLM call — never a hardcoded model
  string (CLAUDE.md §8). `generate-content-draft` uses `useCase='content_draft'`.
- **MI-01 migration idempotency (v8.29):** the whole migration must be re-runnable —
  `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `DROP POLICY IF EXISTS
  "<name>" ON <table>;` before each `CREATE POLICY`. (LLD ~8645.)
- **RLS** USING + WITH CHECK on every tenant table (all 3 Sprint 2 tables carry
  `organization_id` → all 3 get RLS) per the LLD RLS spec (~8629).
- `LLM_MODE=mock` in all tests — never a real LLM call in a test.
- **Status enums are locked and table-specific** (see §0.5).
- **UI** is token-driven: dark default + `[data-theme="light"]` overrides already exist
  (never re-derive them); faint accent fills via `color-mix(in srgb, var(--token) N%,
  transparent)` — never hex-alpha on a `var()` string (RT-01); `--focus-ring` /
  `--elevation` tokens; `tabular-nums` on numeric displays; ARIA per FIX 13 build rules.

### 0.5 The status enums Sprint 2 introduces (copy EXACTLY — do not unify)
- `remediation_tasks.status` = **open | in_progress | ready_for_review | complete |
  wont_fix** (default 'open'). Never 'done'. (LLD 7616.)
- `workflow_runs.status` = **scheduled | running | completed | failed** (default
  'scheduled') — note **'completed'** with -ed. (LLD 7852.)
- `content_drafts.status` = **draft | approved | published | rejected** (default 'draft').
  (LLD 7975.) The Inngest function sets a transient 'pending' → 'draft' on completion
  (LLD 7999) — include 'pending' as the pre-generation value if you model it.
- **CRITICAL:** `workflow_runs.status='completed'` (-ed) and `audits.status='complete'`
  (Phase 1) are **deliberately different spellings on different tables** — never compare
  one to the other. (LLD 7855–7858.)

---

## 1. WHAT SHIPS THIS SPRINT
- 3 new tables (§5): remediation_tasks (#29), workflow_runs (#30), content_drafts (#31).
- 3 Inngest functions (§8): generate-content-draft, trigger-validation-reaudit,
  schedule-workflow-runs — all registered in `serve()`.
- The shared UI component foundation (§6U.0) + the Workflow hub, Tasks kanban, and Content
  Draft editor screens; plus the EnhancedDashboard **base shell + Work Completed card**
  (the SoV strip and Autopilot tracker arrive in S3/S9 — see §6U.5).
- 6 workflow lib modules (§6: task-manager, priority-scorer, content-generator,
  content-format-selector, validation-scheduler, workflow-orchestrator) + the shared
  `progress-summary` helper (§6.6). (The wins
  feed is **Sprint 3** per the LLD — see §6.6 note.)
- API routes (§9): task queue/create/update/complete, drafts list/generate/approve,
  cross-brand task queue, and the progress summary. (The `/wins` route lands in Sprint 3.)
- **GAP coverage:** GAP 8 (content format) lands its `content_format` column + selector
  here (the Layer-1 format advisor is S6; the benchmark UX is S3).

---

## 2. DEPENDENCIES TO INSTALL
No new runtime packages beyond the Phase 1 + Sprint 1 stack (Drizzle, postgres-js, Inngest,
Vercel AI SDK). UI uses the existing Tailwind + lucide-react setup and the Phase 2 design
tokens (added to globals.css in this sprint — §6U.0). Confirm `inngest` ≥ the version
Phase 1 pins (step.sleep + concurrency are used).

---

## 3. ENVIRONMENT VARIABLES (additions)
None new. Draft-generation model routing is governed by `selectModel()` + Sprint 1 budget
policy data; quota by the existing Phase 1 `TIER_AUDIT_LIMITS`. Confirm `RESEND_API_KEY`
exists (the progress summary feeds the existing weekly digest — read-only consumer here).

---

## 4. PROJECT STRUCTURE ADDITIONS
Every file below is specified in §5–§9 / §6U. No file appears without a spec.
```
db/
├── schema/
│   ├── remediation-tasks.ts
│   ├── workflow-runs.ts
│   └── content-drafts.ts
└── migrations/
    └── 00NN_phase2_sprint2_workflow.sql      // 3 CREATEs (IF NOT EXISTS) + indexes + RLS (§5)

lib/workflow/
├── task-manager.ts             // §6.1 CRUD + status transitions
├── priority-scorer.ts          // §6.2 priority INTEGER + confidence_label derivation
├── content-generator.ts        // §6.3 AI draft + recommendation_key→draft_type mapping
├── content-format-selector.ts  // §6.4 [GAP 8] format decision (detected→draft format)
├── validation-scheduler.ts     // §6.5 14-day reaudit scheduling
├── workflow-orchestrator.ts    // §6.5 recurring run management
├── progress-summary.ts         // §6.6 shared "what improved this month" query
├── types.ts                    // WorkflowRunResult interface (§6.0)
└── index.ts
// NOTE: lib/communication/wins-feed.ts is Sprint 3 (LLD assigns wins-feed Phase A to S3).

inngest/functions/
├── generate-content-draft.ts       // §8.1  event 'draft/generate', concurrency 5
├── trigger-validation-reaudit.ts   // §8.2  event 'task/completed', step.sleep 14d
└── schedule-workflow-runs.ts       // §8.3  daily cron, quota-gated

app/(auth)/brands/[brandId]/workflow/
├── page.tsx           // Workflow hub (§6U.2)
├── tasks/page.tsx     // Task kanban Open→In Progress→Review→Done (§6U.3)
└── drafts/page.tsx    // Content drafts + format label + approve/reject (§6U.4)

components/domain/workflow/
├── task-card.tsx · task-kanban.tsx · content-draft-viewer.tsx
├── content-format-badge.tsx · lift-indicator.tsx · fan-out-lift.tsx   // §6U.2–6U.4

components/phase2/            // SHARED FOUNDATION (§6U.0) — consumed by all later sprints
├── tokens.css (or globals.css additions) · LayerBadge · IntelCard · MetricRow
├── SectionHeader · TierGate · EmptyState · StatusBadge · PriorityBadge · ConfidenceBadge

app/api/brands/[id]/tasks/route.ts · tasks/[id]/route.ts · tasks/[id]/complete/route.ts
app/api/brands/[id]/drafts/route.ts · drafts/[id]/route.ts
app/api/brands/[id]/progress/route.ts
app/api/organizations/[id]/tasks/route.ts
// NOTE: app/api/brands/[id]/wins/route.ts is Sprint 3 (wins feed deferred per the LLD).

tests/phase2/sprint2/  (§11)
```

---

## 5. DATABASE SCHEMA ADDITIONS

Translate each into a Drizzle schema file + a raw SQL migration. **Copy column names,
types, defaults, and constraints VERBATIM from the LLD** — anchors inline. Apply **MI-01**:
`CREATE TABLE IF NOT EXISTS` for all 3, `CREATE INDEX IF NOT EXISTS` for all indexes,
`DROP POLICY IF EXISTS` before each `CREATE POLICY`.

### 5.1 remediation_tasks (#29, LLD 7580)
Full column set per the LLD. Key points that are easy to get wrong:
- `recommendation_id` UUID REFERENCES recommendations(id) **ON DELETE SET NULL** (task
  outlives its source — E-03b, LLD 7584).
- **`fan_out_gap_id` UUID and `topical_gap_id` UUID are PLAIN UUID columns this sprint —
  NO FK constraint** (BD-01, LLD 7587–7605). They reference Sprint 3 tables that don't
  exist yet; Postgres rejects a REFERENCES to a missing table. Sprint 3's migration adds
  the FK constraints (`fk_fan_out_gap` → query_fan_out_results, `fk_topical_gap` →
  topical_coverage_gaps, both ON DELETE SET NULL). Add a code comment marking this.
- `linkedin_gap_source` TEXT — slug enum, not a UUID: missing_company_page |
  low_follower_count | missing_showcase_page | no_employee_advocacy |
  incomplete_about_section (SC-01, LLD 7606).
- `consensus_gap_source` TEXT — slug enum: nap_mismatch | category_mismatch |
  hours_mismatch | phone_mismatch | address_mismatch | name_variation (SC-01, LLD 7611).
- `status` TEXT NOT NULL DEFAULT 'open' (enum §0.5). `confidence_label` TEXT
  ('High'|'Medium'|'Low'|null) — **derived by priority-scorer.ts** (§6.2), not user-set.
- `wont_fix_reason` TEXT — **required when status='wont_fix'**; enforce via the Zod
  `.refine()` shown in the LLD (7672) on the PATCH route.
- `effort` TEXT ('low'|'medium'|'high') — denormalized from recommendations.effort, or set
  by the gap-spawned heuristic (LLD 7676–7686).
- `priority` INTEGER NOT NULL — **derived integer rank** (§6.2 formula), priority=1 = top.
- `assigned_to` / `approved_by` reference **users(id) which is UUID** (T6 fix). `reaudit_id`
  REFERENCES audits(id) **ON DELETE SET NULL** (task outlives the re-audit — E-03).
- Numeric before/after columns: score_/fan_out_ NUMERIC(5,2); similarity_ NUMERIC(4,3).
- Indexes: `tasks_brand_status_idx (brand_id, status)`, `tasks_assigned_idx (assigned_to,
  status)` (LLD 7721).

### 5.2 workflow_runs (#30, LLD 7846)
`workflow_type` TEXT ('weekly_audit'|'monthly_report'|'post_fix_validation'|
'fan_out_check'|'linkedin_audit'|'consensus_check'); `status` TEXT DEFAULT 'scheduled'
(enum §0.5, **'completed' with -ed**); `scheduled_for` TIMESTAMPTZ NOT NULL; started_at /
completed_at TIMESTAMPTZ; `result_summary` JSONB typed as **`WorkflowRunResult`** (§6.0 —
must be a typed interface, never `any`; RS-01, LLD 7869).

### 5.3 content_drafts (#31, LLD 7885)
`task_id` REFERENCES remediation_tasks(id) **ON DELETE SET NULL** (draft outlives task —
v8.28). `draft_type` TEXT — the full 13-value enum (underscores): **wikipedia_article |
comparison_article | faq_block | press_release | reddit_comment | linkedin_post |
linkedin_article | answer_capsule | fan_out_content | topical_gap_article | outreach_brief
| how_to_guide | listicle** (LLD 7890–7923). NOTE: `outreach_brief` is a valid column value
but its generator (`outreach-brief-generator.ts`) is **Sprint 6** — do NOT build it here. `content_format` TEXT NOT NULL — **GAP 8** enum (listicle|how_to_guide
|comparison_article|faq_block|expert_article|case_study|press_release|linkedin_article;
LLD 7940). `format_recommendation_reason` TEXT. `title`/`body` TEXT NOT NULL.
`target_sub_query` TEXT; `target_word_count` INTEGER (134–167 passages; 500–2,000 LinkedIn).
`status` TEXT DEFAULT 'draft' (enum §0.5). `word_count`/`target_url`; approved_at/
approved_by(users UUID)/published_at. **Naming-convention note (LLD 7926):** draft_type
uses underscores; Phase 1 recommendation_key uses hyphens — no string equality;
content-generator.ts owns the translation table (§6.3).

### 5.4 RLS (all 3 tables are tenant data — carry organization_id)
Enable RLS on all three with USING + WITH CHECK scoped to
`organization_id = current_setting('app.current_org_id', true)::uuid`, per the LLD RLS
spec (~8629). Apply the MI-01 `DROP POLICY IF EXISTS` guard before each `CREATE POLICY`.

---

## 6. LIB MODULES (LLD 8082–8090)

### 6.0 lib/workflow/types.ts — WorkflowRunResult (verbatim, LLD 7870–7880)
`{ durationMs: number; auditsTriggered?: number; reportsGenerated?: number; auditId?:
string; fanOutResultsCount?: number; linkedinScore?: number; consensusScore?: number;
errorMessage?: string }`. `errorMessage` appears ONLY on status='failed' rows. Cast
`result_summary as WorkflowRunResult`.

### 6.1 task-manager.ts — CRUD + status transitions
Create/read/update tasks; enforce the status enum (§0.5) and the wont_fix_reason refine.
On create, set effort + confidence_label + priority via priority-scorer (§6.2).

### 6.2 priority-scorer.ts — the two derivations (LLD 7621, 7689)
- **confidence_label** from the parent audit's `quality_status`: sufficient→'High',
  partial→'Medium', insufficient→'Low', pending→null. For gap-spawned tasks (no parent
  recommendation), map `visibility_trends.sample_quality`: Confirmed→High, Likely→Medium,
  Hypothesis→Low, null→null.
- **priority INTEGER** = `Impact × ConfidenceWeight ÷ EffortWeight`, then
  `RANK() OVER (PARTITION BY brand_id ORDER BY score DESC)` → integer rank (priority=1 =
  top). Impact = score_before − estimated-after (0–100; use
  topical_coverage_gaps.estimated_citation_impact when recommendation_id is null).
  ConfidenceWeight: sufficient 1.0 / partial 0.7 / insufficient 0.4 / pending 0.5.
  EffortWeight (inverse): low 3 / medium 2 / high 1. **Re-compute after every audit
  completion and every quality_status change.**

### 6.3 content-generator.ts — draft body + naming translation (LLD 7926)
Owns the `recommendation_key (hyphen) → draft_type (underscore)` mapping table
('wikipedia-article'→'wikipedia_article', 'reddit-absence'→'reddit_comment',
'linkedin-presence'→'linkedin_post', …). Generates body via `selectModel(tier, engine,
'content_draft')` (§0.4); never a hardcoded model.

### 6.4 content-format-selector.ts — GAP 8 (LLD 7945)
Resolves `content_structure_audits.content_format_detected → content_drafts.content_format`
per the LLD map (direct matches; product_page→comparison_article; other→expert_article).
press_release/linkedin_article come from recommendation_key mapping, not format detection.

### 6.5 validation-scheduler.ts + workflow-orchestrator.ts
14-day reaudit scheduling (consumed by §8.2) and recurring workflow-run management
(consumed by §8.3).

### 6.6 Shared read-only helper
- **progress-summary.ts** (LLD 7745) — the ONE shared query for "what improved this month",
  surfaced on dashboard, reports, digest, white-label (§6U.5). The SUM FILTER **must
  include `score_after IS NOT NULL`** so only re-audited lift counts (honesty rule). Month
  boundary = `date_trunc('month', now())` UTC (matches Phase 1 quota).
- **wins-feed is NOT built this sprint.** The LLD assigns wins-feed **Phase A to Sprint 3**
  (LLD ~7779: "PHASE A — Sprint 3 (deliver with Visibility Intelligence)"), because the feed
  needs `visibility_trends` and `share_of_voice_snapshots` (both S3 tables) for its
  visibility_up / competitor_down win types. `gap_closed` draws on this sprint's
  remediation_tasks, but the feed as a whole ships in S3. Sprint 2 does NOT create
  `lib/communication/wins-feed.ts` or `GET /api/brands/[id]/wins` — those are in the S3
  prompt. (Phase B `trust_improved` extends the feed in S5.)

---

## 6U. UI SPECIFICATION

GLOBAL UI RULES (apply to every screen below): dark default + `[data-theme="light"]`
overrides already exist — never re-derive them; faint accent fills via `color-mix(in srgb,
var(--token) N%, transparent)` — never hex-alpha on a `var()` string (RT-01); apply
`--focus-ring` on every interactive element and `--elevation-rest/-hover` on cards;
`tabular-nums` on every numeric value; ARIA per FIX 13 (icon-only buttons `aria-label`;
tablists role="tablist"/"tab"/aria-selected; score bars role="img"+aria-label; decorative
icons `aria-hidden`). Every screen specifies its state matrix and a `RESPONSIVE:` line.

### 6U.0 SHARED COMPONENT FOUNDATION (build FIRST — every later sprint consumes it)
Add the Phase 2 design tokens to globals.css (prototype lines 84–490: layer accents,
`[data-theme="light"]` overrides, `--focus-ring`, `--elevation-rest/-hover`, autopilot
gradient, animations). The 400-line token block is referenced by anchor deliberately
(duplicating it invites transcription error) — but reproduce it faithfully, both themes.
Build each shared component with the variants/states below (anchors are the visual source):
- **LayerBadge** (492) — one per layer accent; props: `layer` (7 accent keys), optional
  `size='sm'|'md'`. No interactive state.
- **IntelCard** (527) — props: title, value, optional `unit` (replaces the `/100` suffix —
  e.g. "34%"), optional `delta` (renders a coloured pill; **`delta===0` → NEUTRAL "±0"
  pill**, not green/red), optional `loading`. STATES: default; `loading` → skeleton
  (`aria-busy`); no error state (parent handles). Elevation on hover.
- **MetricRow** (596) — label + value (tabular-nums) + optional bar.
- **SectionHeader** (630) — title + optional action slot.
- **TierGate** (653) — lock overlay; uses `backdropFilter` (NOT the corrupted property name);
  shows required tier + upgrade CTA. STATE: only renders when the gate is locked.
- **EmptyState** (691) — icon + message + optional CTA; used by every list below when empty.
- **StatusBadge** (719) — renders the §0.5 status strings; one colour per status; must style
  every value it receives (no fallthrough).
- **PriorityBadge** (754) — high/med/low pill is a **DERIVED impact band**
  (danger/warning/info), NOT the raw INTEGER `priority` column.
- **ConfidenceBadge** (773) — High/Medium/Low/none.
**RESPONSIVE:** shared components are intrinsically fluid (no fixed widths); they inherit
the responsive grid of whatever screen hosts them. No component-level breakpoints needed.
**MOTION SAFETY (RM-01):** since this sprint adds the animation foundation (gradient-shift,
pulse-ring, score-fill, plus Tailwind `animate-pulse`), wrap it in a global reduced-motion
reset so the infinite/auto-playing motions stop for users who ask for it (WCAG 2.2.2):
`@media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation-duration:.01ms
!important; animation-iteration-count:1 !important; transition-duration:.01ms !important } }`
— the `!important` reset overrides even inline `animation:` props. (This is the build-time
counterpart of the open RM-01 audit item; include it when building the foundation here.)

### 6U.2 Workflow hub — WorkflowHub (prototype 2096)
Layout: LayerBadge "workflow"; 3 stat cards (Open tasks / In progress / Done this month) —
each count driven by a real query and **a stat card MUST equal its task list** (an "Open: N"
card with M≠N open rows is a defect); "Generate draft" + "New task" quick actions (Generate
draft → the drafts route). tabular-nums on counts; `--elevation` on the cards.
STATES — loading: stat cards + list as skeletons (`aria-busy`); empty: EmptyState "No tasks
yet — create one from a recommendation"; error: inline error boundary with retry.
**RESPONSIVE:** stat cards `grid-cols-1 sm:grid-cols-3`; quick actions stack on `<sm`. (If
the prototype's fixed grid is kept verbatim, mark it "RESPONSIVE: deferred to the dedicated
responsive task" — but prefer the `sm:` variant here since this screen ships now.)

### 6U.3 Tasks kanban — task-kanban.tsx / task-card.tsx
Columns Open → In Progress → Review → Done (enum map: ready_for_review="Review",
complete="Done"). task-card shows status (StatusBadge), assigned avatar, due date, the
PriorityBadge (derived band), and lift-indicator (score before→after) once a re-audit has
run (until then show "—"). ARIA: board is keyboard-navigable; cards are buttons with
accessible names ("Task: {title}, status {status}").
STATES — loading: column skeletons; empty per column: muted "Nothing here"; empty board:
EmptyState; error: error boundary.
**RESPONSIVE:** 4 columns on `md+`; on `<md` collapse to a single-column list grouped by
status with sticky status headers (kanban drag is pointer-only — provide the list fallback
for narrow/touch). If deferring, state "RESPONSIVE: deferred to the dedicated responsive task".

### 6U.4 Content draft editor — ContentDraftEditor (prototype 2231) + content-draft-viewer
Draft title + body are `contentEditable` → **role="textbox"** with aria-label "Draft
title" / "Draft body" (body `aria-multiline="true"`); inline `outline:none` is fine (the
`--focus-ring` is box-shadow). content-format-badge shows the GAP 8 format +
`format_recommendation_reason` ("Gemini favours how-to guides for informational queries").
Approve/Reject drive content_drafts.status; StatusBadge renders draft/approved/published/
rejected; target_word_count shown (134–167 passages; 500–2,000 LinkedIn).
STATES — loading: body skeleton (`aria-busy`) while a draft generates (status 'pending');
empty: "No draft yet — Generate draft" CTA; error: generation-failed banner with retry;
saved/approved: success toast (build-time `aria-live="polite"`).
**RESPONSIVE:** single-column editor; the format-badge + actions move from a right rail
(`md+`) to above the editor (`<md`). Editor is full-width fluid.

### 6U.5 Dashboard increment — EnhancedDashboard base (prototype 1061)
This sprint builds the dashboard **shell + the "Work Completed / Measured Impact" two-state
card** (prototype ~1114–1211, inside EnhancedDashboard) driven by progress-summary.ts.
**TWO-STATE DISPLAY (v8.32):** "Work Completed" = COUNT of complete tasks this month (shown
immediately on completion); "Measured Impact" = SUM(lift_achieved) where `score_after IS NOT
NULL`, else **"Validation audit scheduled — measured impact pending"** (never a fabricated or
zero lift — honesty rule). Use the LLD "4 of 11 gaps closed" framing for the count; do not
invent a competing number. The SoV strip (S3) and the Autopilot tracker + Health Check
banner (S9) are **out of scope** — leave their regions for those sprints.
STATES — loading: card skeleton; empty (no completed tasks this month): "No completed work
yet this month" (not a zero that reads as failure); error: error boundary.
**RESPONSIVE:** the dashboard card grid is `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`; the
two-state card spans full width on `<md`.

---

## 7. (No CLI changes this sprint.)


## 8. INNGEST FUNCTIONS (register all 3 in serve(); LLD 7991–8060)

### 8.1 generate-content-draft.ts (LLD 7993)
`{ id: 'generate-content-draft', concurrency: { limit: 5 } }`, event **`'draft/generate'`**
(payload `{ taskId, brandId, orgId, contentFormat }` emitted by the "Generate draft" server
action). On completion, set content_drafts.status 'pending'→'draft'. Model: **`selectModel(
tier, engine, 'content_draft')`** — Growth→mid-tier, Agency/Pro→top-tier; never hardcoded
(MS-01). Concurrency 5 because drafts are on-demand (CC-04).

### 8.2 trigger-validation-reaudit.ts (LLD 8016)
`{ id: 'trigger-validation-reaudit' }`, event **`'task/completed'`** (emitted when a task
PATCHes to status='complete'). Uses **`step.sleep('wait-14-days', '14 days')`** then fires
`'audit/start'` — event+sleep, NOT a cron (TR-01). **QUOTA GATE (U-14):** before firing
`'audit/start'`, call `checkQuota(orgId, brandId)`; if not allowed, **do not fire** — call
`markReauditDeferred(taskId, 'quota_exceeded')`, leave score_after NULL, surface "validation
pending — quota reached" on the task card. Never silently drop. On run, measure
score_after / fan_out_after / similarity_after.

### 8.3 schedule-workflow-runs.ts (LLD 8052)
Daily cron; fires scheduled audits + LinkedIn audits + consensus checks. **Before firing
`'audit/start'`, call `checkQuota(orgId, brandId)`** (same gate as Phase 1 audit-schedules
cron) — Phase 2 runs are additional to the scheduled cadence, never outside the quota gate.
LinkedIn/consensus checks are NOT quota-tracked (only `'audit/start'` consumes the slot).

**serve() registration:** add these 3 functions to the existing array; do not remove any
Phase 1 registration. (The full Phase 2 set reaches 25 across all sprints.)

---

## 9. API ROUTES (LLD 7980–8016) — `[id]` for API params; Better Auth + org scoping; Zod
- `GET /api/brands/[id]/tasks` (filter by status) · `POST …/tasks` (create) ·
  `PATCH …/tasks/[id]` (update — includes the wont_fix_reason refine, §5.1) ·
  `POST …/tasks/[id]/complete` (mark complete **and emit `task/completed`** → §8.2).
- `GET …/drafts` · `POST …/drafts` (emit `draft/generate` → §8.1) · `PATCH …/drafts/[id]`
  (approve/reject/published).
- `GET /api/organizations/[id]/tasks` — cross-brand queue (agency).
- `GET …/progress` — single summary object (no pagination).
- (`GET …/wins` is **Sprint 3** — deferred with wins-feed per the LLD.)
Every route: Better Auth session + organization scoping; Zod on bodies/params; correct
HTTP codes.

---

## 10. CLAUDE CODE PROMPT (paste this to open Sprint 2)

> You are implementing **VisibleAU Phase 2 — Sprint 2: Workflow Intelligence**, the first
> user-facing Phase 2 sprint. Sprint 1 (Platform Foundation) is merged. Authority:
> `visibleau-7layer-lld.md` v8.65 (REVIEWED-r2), the Layer 5 "WORKFLOW INTELLIGENCE"
> section (~7567) and the Sprint 2 plan (~8825). Where this prompt and the LLD differ, the
> LLD wins.
>
> Build, in order:
> 1. The shared Phase 2 UI foundation FIRST: add the design tokens to globals.css
>    (layer accents + [data-theme="light"] overrides + --focus-ring + --elevation +
>    autopilot gradient + animations, prototype 84–490) and the shared components
>    (LayerBadge, IntelCard w/ optional `unit` + neutral ±0 pill, MetricRow, SectionHeader,
>    TierGate w/ backdropFilter, EmptyState, StatusBadge, PriorityBadge as a DERIVED band
>    not the raw INTEGER, ConfidenceBadge).
> 2. Drizzle schemas + one MI-01-idempotent migration for the 3 tables (§5): CREATE TABLE
>    IF NOT EXISTS ×3, indexes IF NOT EXISTS, DROP POLICY IF EXISTS before each CREATE
>    POLICY, RLS USING + WITH CHECK on all 3 (all carry organization_id). CRITICAL:
>    fan_out_gap_id and topical_gap_id are PLAIN UUID this sprint (no FK — their tables are
>    Sprint 3). Copy every enum value-set exactly (§0.5); workflow_runs uses 'completed'
>    (-ed), never compare to audits 'complete'.
> 3. The 5 workflow libs + types.ts (WorkflowRunResult, not `any`) + the shared
>    progress-summary.ts (Measured-Impact SUM counts only score_after IS NOT NULL).
>    priority-scorer derives confidence_label from quality_status and the INTEGER priority
>    rank per the LLD formula. content-generator owns the recommendation_key→draft_type
>    translation table. All LLM calls use selectModel(tier, engine, 'content_draft').
>    DO NOT build wins-feed.ts — the LLD assigns wins-feed Phase A to Sprint 3.
> 4. The 3 Inngest functions (§8), registered in serve() alongside the Phase 1 set:
>    generate-content-draft (event 'draft/generate', concurrency 5), trigger-validation-
>    reaudit (event 'task/completed', step.sleep 14d, quota-gated with markReauditDeferred
>    on over-quota), schedule-workflow-runs (daily cron, quota-gated).
> 5. The Workflow hub / Tasks kanban / Content draft editor screens + the dashboard
>    base shell with the two-state Work Completed / Measured Impact card (honesty rule:
>    Measured Impact only counts score_after IS NOT NULL). Both themes; loading/empty/error
>    states; ARIA per FIX 13 (contentEditable editors = role="textbox" with names).
> 6. The API routes (§9): [id] params, Better Auth + org scoping, Zod (incl the
>    wont_fix_reason refine), the task complete route emits 'task/completed', the draft
>    create route emits 'draft/generate'. (The wins route is Sprint 3, not built here.)
>
> Constraints: TS strict, no `any`. LLM_MODE=mock in tests; never call a real LLM in a
> test. subscriptions.tier (never organizations.tier). selectModel() — no hardcoded models.
> Do not hardcode engine lists (TIER_ENGINES). Run §12 greps + §11 tests and report.

---

## 11. TESTS REQUIRED (LLM_MODE=mock)
- `task-manager.test.ts` — status transitions enforce the §0.5 enum; wont_fix_reason
  required when status='wont_fix' (the Zod refine rejects otherwise).
- `priority-scorer.test.ts` — confidence_label mapping from quality_status; priority rank
  orders by Impact×Confidence÷Effort; re-rank on quality_status change.
- `content-format-selector.test.ts` — detected→draft format map incl product_page→
  comparison_article, other→expert_article.
- `content-generator.test.ts` — recommendation_key (hyphen)→draft_type (underscore)
  translation; selectModel called with 'content_draft' (not a hardcoded model).
- `validation-reaudit.integration.test.ts` — task→complete emits 'task/completed';
  over-quota path calls markReauditDeferred and leaves score_after NULL (no 'audit/start').
- `progress-summary.test.ts` — Measured Impact SUM excludes score_after IS NULL rows.
- `workflow-rls.test.ts` — cross-org reads blocked on all 3 tables.
  (wins-feed tests move to the Sprint 3 prompt.)

## 12. VERIFICATION GREPS
```bash
grep -c "CREATE TABLE IF NOT EXISTS" db/migrations/*sprint2*.sql                    # → 3
grep -c "DROP POLICY IF EXISTS" db/migrations/*sprint2*.sql                         # → 3
# fan_out_gap_id / topical_gap_id are PLAIN UUID this sprint (NO REFERENCES on them)
grep -E "fan_out_gap_id|topical_gap_id" db/migrations/*sprint2*.sql | grep -c "REFERENCES"   # → 0
# status enums spelled correctly
grep -c "'ready_for_review'" db/schema/remediation-tasks.ts                         # → ≥1
grep -c "'completed'" db/schema/workflow-runs.ts                                    # → ≥1  (workflow_runs uses -ed)
grep -RcE "'done'" db/schema/remediation-tasks.ts                                   # → 0   (never 'done')
# no hardcoded model; selectModel used
grep -Rc "selectModel(" inngest/functions/generate-content-draft.ts                 # → ≥1
grep -RnE "'claude-3|'gpt-4|'gemini-" inngest/functions/generate-content-draft.ts   # → 0
# subscriptions.tier, not organizations.tier
grep -RnE "organizations\.tier|org\.tier" lib/workflow/ | grep -iv subscriptions    # → 0
# 3 functions registered in serve()
grep -cE "generateContentDraft|triggerValidationReaudit|scheduleWorkflowRuns" app/api/inngest/route.ts  # → 3
# the two Inngest events + the 14-day sleep
grep -Rc "'task/completed'\|'draft/generate'" app/ inngest/                          # → ≥2
grep -Rc "step.sleep" inngest/functions/trigger-validation-reaudit.ts               # → ≥1
# quota gate present on system-triggered re-audit
grep -Rc "checkQuota\|markReauditDeferred" inngest/functions/trigger-validation-reaudit.ts  # → ≥2
# UI: no hex-alpha on var() (RT-01); focus + tabular numerics present
grep -REc "var\(--[a-z-]+\)[0-9a-fA-F]{2}" components/domain/workflow/ components/phase2/    # → 0
grep -Rc "tabular-nums" components/                                                  # → ≥1
# RESPONSIVE handled on each screen (sm:/md: variants present, or explicit deferral)
grep -RcE "sm:grid-cols|md:grid-cols" app/\(auth\)/brands/                            # → ≥1
# reduced-motion guard present in the animation foundation (RM-01) — wherever tokens live
grep -Rc "prefers-reduced-motion" app/globals.css app/ 2>/dev/null | grep -vc ':0$'      # → ≥1
# no Clerk
grep -Rc "Clerk\|@clerk" lib/workflow/ db/ app/api/brands/                           # → 0
```

## 13. COMMON PITFALLS / SPRINT 2 ANTI-PATTERNS
- **Adding FK constraints to fan_out_gap_id / topical_gap_id this sprint.** They are PLAIN
  UUID until Sprint 3 (BD-01) — a REFERENCES to a not-yet-created table fails the migration.
- **Unifying the status enums.** workflow_runs 'completed' (-ed) ≠ audits 'complete';
  remediation_tasks never uses 'done'; the AutopilotLoop stepper's done/current/pending
  (S9) is unrelated presentational state — don't cross-wire any of these.
- **Binding PriorityBadge to the raw INTEGER `priority`.** The pill is a DERIVED high/med/
  low impact band (from effort + expected impact); priority is a sort rank.
- **Hardcoding the draft model** instead of `selectModel(tier, engine, 'content_draft')`.
- **Firing 'audit/start' without checkQuota** in either Inngest function — system-triggered
  re-audits still consume a quota slot (U-14); over-quota must defer, not drop or error.
- **Displaying projected lift as measured.** Measured Impact counts only score_after IS NOT
  NULL (honesty rule); show the "validation pending" state otherwise.
- **Treating recommendation_key and draft_type as equal strings** (hyphen vs underscore) —
  content-generator.ts owns the translation table.
- **Forgetting RLS on any of the 3 tables** (all carry organization_id) or the MI-01
  idempotency guards.
- **Building wins-feed this sprint.** The LLD assigns wins-feed Phase A to Sprint 3 (it
  needs S3's visibility_trends + share_of_voice_snapshots); only progress-summary is S2.

## 14. HANDOFF TO SPRINT 3
After Sprint 2: the remediation loop + shared UI foundation exist; tasks carry plain-UUID
`fan_out_gap_id`/`topical_gap_id` awaiting their FKs. **Sprint 3 (Visibility Intelligence +
Market Gaps)** creates tables 12–18 (incl query_fan_out_results and topical_coverage_gaps)
and **adds the two FK constraints** (`fk_fan_out_gap`, `fk_topical_gap`, ON DELETE SET NULL)
via ALTER; lights up the SoV dashboard strip; and **builds wins-feed Phase A in full**
(the 5 win types incl visibility_up/competitor_down, now that its S3 data sources exist). Sprint 3 requires: this sprint's remediation_tasks (gap-spawned tasks land
there) and the shared components, plus Sprint 1's budget/provider services.

## CHANGELOG
- v1.4 — Re-pinned to canon v8.67 (consolidated hygiene + security pass: S4-02 DDL
  comma, S5-02 webhook severity enum, S6-02 freshness-tier, SEC-A/SEC-B Visit-route
  hardening). §0.3 version gate now accepts v8.67 (8.66/8.65 still valid). v8.67 changed
  only those five LLD spots — nothing this prompt's core spec contradicts. No other change.
- v1.3 — Re-pinned to canon v8.66 (coordinated RM-01 batch). The §0.3 version check now
  accepts 8.66 (8.65 also valid; v8.66 changed only the prototype reduced-motion reset,
  nothing this prompt cites). No other change.
- v1.2 — Gate 2 pass-2 findings applied (internal-consistency angle), validated first.
  S2b-01 [LOW-MOD]: §1 said "5 workflow lib modules" but the §4 tree has 6 (the uncounted
  one is priority-scorer.ts) — aligned §1 to name all 6 + progress-summary. S2b-02 [trivial]:
  broadened the reduced-motion §12 grep so it matches whether the block lands in globals.css
  or tokens.css (§6U.0 permits either). Pass-2 also re-verified all pass-1 fixes (S2-01..05)
  landed with zero orphans — notably the multi-section wins-feed deferral was confirmed
  consistent across all 8 sections, and the event↔route↔function wiring graph intact. Both
  fixes prompt-internal, no LLD change. (§6U numbering skips 6U.1 — harmless, never
  referenced. Depth: 548 lines, reviewer treats S2-02 as resolved given the inline state
  matrices + the defensible anchor-referenced token block.)
- v1.1 — Gate 2 findings applied (reviewer chat), all validated against r2 canon first.
  S2-01 [MOD]: deferred wins-feed (lib + /wins route + tests) to **Sprint 3** per the LLD's
  explicit Phase-A assignment (LLD ~7779) — Sprint 2 keeps only progress-summary; updated §1,
  §4 tree, §6.6, §9, §10, §11, the pitfalls, and the §14 handoff. S2-02 [MOD]: expanded §6U
  to depth — per-screen `RESPONSIVE:` lines (sm:/md: behaviour or explicit deferral), inline
  state matrices (loading/empty/error/locked/zero-delta) per component and screen, and global
  UI rules; added RESPONSIVE + reduced-motion §12 greps. S2-03 [LOW]: enumerated the 13
  draft_type values inline + noted outreach_brief's generator is S6. S2-04 [LOW]: corrected
  the two-state card sub-anchor ~856→~1114. S2-05: added the prefers-reduced-motion build
  rule to §6U.0 (Sprint 2 builds the animation foundation; ties to the pending RM-01 canon
  item). The LLD "4 win types" wording and the handoff §A1 marker line are optional Sri
  cleanups, not prompt defects. Reviewer confirmed C1/C2/C3 (schema, enums, Inngest) clean.
- v1.0 — Initial Sprint 2 prompt, generated single-pass against verified LLD v8.65
  (REVIEWED-r2). Schema/Inngest/lib/route detail cited to LLD ~7567–8090; UI to prototype
  anchors; conventions from master plan §7. Awaiting Gate 2 review.
