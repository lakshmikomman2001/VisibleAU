# VisibleAU Phase 2 — SPRINT 9 PROMPT: AI Visibility Autopilot UX (FINAL SPRINT)
# Version: 1.2 | Built against: LLD v8.67 (REVIEWED-r2) | Sprint: 9 of 9 | 3 weeks
# Source anchors (r2/v8.67): Sprint 9 plan (~9050–9090; tracker ~9060, trend API + the v8.16
# join fix ~9075), the explainability contract (~5556), the Autopilot-loop step backing (~802),
# prototype EnhancedDashboard 1089, HealthCheck 1399, AutopilotLoop 3127. NOTE: line numbers are
# navigational — open the region; the LLD wins.

> HOW TO USE: read §0, then paste §10 into a fresh Claude Code session on the VisibleAU repo.
> §1–§9 are the spec; §11–§14 are tests/acceptance/pitfalls/handoff. When this prompt and the
> LLD disagree, THE LLD WINS and this prompt is the bug.
>
> ⚠️ THIS SPRINT IS DIFFERENT: it adds **NO new tables, NO new Inngest functions, NO migration**
> (serve() stays 25/25). It is **pure frontend + read-only API routes** over the data S1–S8
> already built. The deliverable is making the Autopilot loop VISIBLE — the aha moment. There is
> no §5 schema section.

---

## 0. READ FIRST — CONTEXT & CONVENTIONS

### 0.1 What Sprint 9 is
**AI Visibility Autopilot UX (Layer — the visible loop)** — the final sprint. VisibleAU's
positioning is **Monitor → Explain → Prioritize → Execute → Measure** (NOT Monitor → Measure →
Report). Sprint 9's primary story is ONE complete Autopilot loop, made visible end-to-end:
**Audit complete → #1 gap identified (Prioritize) → Explanation shown (Explain) → Draft generated
(Execute) → customer approves in 1 click → re-audit runs ~48h later → "Your citation rate
improved 14%" (Measure).** This loop ALREADY exists in the data model (topical_coverage_gaps →
remediation_tasks priority-ranked → content_drafts generated → status='approved' → workflow_runs
triggers re-audit → score_after computed). **S9 makes it visible — it builds no new pipeline.**
Plus: the Action Progress Tracker, the AI Visibility Health Check packaging, the per-prompt trend
chart, and persona-aware dashboards (Agency / SMB / local tradie). (LLD 9050–9090.)

### 0.2 Prerequisites — everything S9 reads is already built
Sprints 1–8 merged. S9 is a read/personalisation layer over: topical_coverage_gaps +
remediation_tasks + content_drafts + workflow_runs (S2/S3 — the loop), visibility_trends +
share_of_voice_snapshots + the wins-feed (S3 — Measure), citations (Phase 1 — the per-prompt
trend), agent_readiness_scores + the Entity-Home/llms.txt data (S6), the narrative/alert surfaces
(S4/S5), brand_entity_scores + LinkedIn/consensus/Knowledge-Panel/Wikidata (S5), and the
explainability annotations (S6 lib/platform/explainability.ts). **Nothing here requires a new
producer** — if a value isn't present, it's a wiring bug in the owning sprint, not an S9 build.

### 0.3 Verify you are on the right LLD before starting
```bash
grep -m1 "^# Version:" visibleau-7layer-lld.md          # → # Version: 8.67 (or 8.66/8.65 — all valid) | Date: June 2026
grep -cE "ATTRIBUTION CORRECT(ED IN CROSS-REVIEW|ION)" visibleau-7layer-lld.md   # → ≥1
```
Canon is `visibleau-phase2-v8.67-complete-REVIEWED` (v8.66 / v8.65 r2 also valid). If the version
is below 8.65 or the marker count is 0, STOP — stale LLD.

### 0.4 SHARED CONVENTIONS (binding; from master plan §7)
- **Better Auth** canonical; **zero Clerk**. Page routes `[brandId]`; API routes `[id]`.
- **`subscriptions.tier`**, never `organizations.tier`. **Tier gates:** the Autopilot loop view,
  Health Check, Action Progress Tracker, per-prompt trend, and persona dashboards are **Growth+**
  (the aha moment for every paying customer); the Agency multi-brand command centre is Agency+.
- **NO migration, NO new tables, NO barrel-export change** (there are no new schema files). **NO
  new Inngest function** — serve() stays at 25/25.
- **READ-ONLY routes:** the new API routes are GETs that read existing tables. No writes except
  where a route re-uses an EXISTING write path (e.g. the 1-click approve re-uses S2's
  content_drafts approve action — it is NOT a new write here).
- **THE v8.16 JOIN FIX (binding for the per-prompt trend):** `citations` has **no brand_id
  column** — filter by brand via `citations.audit_id → audits.brand_id`. Never write
  `citations.brand_id` (it doesn't exist; that was the v8.16 bug).
- **THE EXPLAINABILITY CONTRACT (platform-wide, GAP 9 / v8.33):** every customer-facing score,
  gap, and insight S9 displays must carry the `{ score, explainability }` shape (rationale +
  confidence_note + top_action) from S6's ExplainabilityService — S9 RENDERS it, doesn't
  regenerate it. The loop's "Explain" step IS this contract made visual.
- **BRAND-ACCESS ENFORCEMENT (carried from S8b-01) — PREREQUISITE: S8 must be built first.** Any
  S9 route that is brand-scoped (`/api/brands/[id]/…`) MUST call the **`assertBrandAccess(user,
  brandId)`** gate that **Sprint 8 v1.3 builds in code** (lib/governance/access-control.ts, S8b-01
  — a throwing brand-scope guard, distinct from S8's `canPerform` action-predicate), and the
  Autopilot "Execute"/approve action MUST run through it — so the Autopilot cannot act outside a
  member's permitted brands. Do NOT re-introduce an un-enforced brand path. **Note on §14:** the
  gate itself is real once S8 ships (S9 builds AFTER S8 in sequence, so it's available); the ONLY
  deferred piece (the LLD-hygiene item in §14) is *formalising assertBrandAccess in the LLD* —
  canon currently documents neither it nor canPerform. So S9 may rely on the gate; if for any
  reason S8's assertBrandAccess is not yet in the codebase when S9 is built, STOP and build it
  first — S8b-01 is an S9 build prerequisite, not a post-Gate-3 nicety.
- **UI** token-driven (dark + `[data-theme="light"]`; `color-mix` for faint fills, RT-01;
  `--focus-ring`/`--elevation`; `tabular-nums`; ARIA per FIX 13; reduced-motion reset from S2 —
  the Autopilot/Health gradient banners are animated, so they MUST honour the reduced-motion
  reset). The `${jsVar}30` template-literal hex-alpha borders in the prototype (HealthCheck
  dimension cards, Autopilot step accents) are VALID — they interpolate a JS color var, not a
  `var(--x)` string; keep them.

### 0.5 The one query that matters most — the Action Progress Tracker (LLD 9060)
**The most important retention metric, and it's one query, no new table:** "4 of 11 gaps closed
this month. Your citation rate: ↑8%." Source:
`COUNT(remediation_tasks WHERE status='complete' AND updated_at >= period_start)` over the total
for the period, plus the citation-rate delta from visibility_trends. Losing customers say "I
don't know if this is working" — this answers it. Ships on the Growth+ dashboard.

---

## 1. WHAT SHIPS THIS SPRINT (all frontend + read-only)
- The **Autopilot Loop view** (§6U.2) — the 5-step visible loop (prototype AutopilotLoop 3127).
- The **AI Visibility Health Check** (§6U.3) — traffic-light per dimension + one recommended
  action (prototype HealthCheck 1399).
- The **Action Progress Tracker** (§6U.4 / §0.5) — the one-query retention metric on the dashboard.
- The **per-prompt trend chart** (§6U.5 + §9) — a sparkline per prompt row + a read-only trend route.
- **Persona-aware dashboards** (§6U.6) — Agency command centre / SMB health-check / local-tradie
  views; the Growth+ persona dropdown filter on prompt results.
- Read-only API routes (§9): the per-prompt trend + the action-progress summary.
- **NO** new tables, Inngest functions, or migrations. serve() = 25/25.
- **GAP coverage:** closes GAP 10 (the Autopilot UX / segment-aware experience) — the last GAP.

---

## 2. DEPENDENCIES TO INSTALL
None new. Charts use the existing charting lib already used in the Phase 1/Phase 2 dashboards
(do NOT introduce a second chart library — reuse what the SoV/visibility-trend views use).

## 3. ENVIRONMENT VARIABLES (additions)
None.

---

## 4. PROJECT STRUCTURE ADDITIONS
Every file below is specified in §6U / §9. No file appears without a spec. **No db/ changes.**
```
app/(auth)/brands/[brandId]/
├── autopilot/page.tsx              // §6U.2 the visible 5-step loop
├── health-check/page.tsx           // §6U.3 AI Visibility Health Check (post-audit packaging)
└── (dashboard personalisation in the existing overview/page.tsx — §6U.6)
app/(auth)/dashboard/page.tsx        // EDIT: add the Action Progress Tracker (§6U.4) + persona shaping (§6U.6)

components/domain/autopilot/
├── autopilot-loop.tsx              // the 5-step stepper (presentational step states — §6U.2)
├── loop-step-card.tsx              // one step (icon, title, desc, status done/current/pending, time)
├── health-check-panel.tsx          // traffic-light dimension cards + one recommended action
├── action-progress-tracker.tsx     // "N of M gaps closed this month · citation rate ↑X%"
├── prompt-trend-sparkline.tsx      // §6U.5 per-prompt 12-week sparkline
└── persona-dashboard.tsx           // §6U.6 Agency / SMB / local-tradie shaping + persona filter

app/api/brands/[id]/prompts/[promptId]/trend/route.ts   // §9 GET per-prompt weekly mention-rate (v8.16 join)
app/api/brands/[id]/action-progress/route.ts            // §9 GET the tracker summary (one query, §0.5)

tests/phase2/sprint9/  (§11)
```

---

## 5. (NO DATABASE CHANGES THIS SPRINT.)
Sprint 9 adds no tables, columns, indexes, or migration. Everything reads existing S1–S8 schema.
If a needed value is absent, fix the owning sprint — do not add schema here.

---

## 6. (NO NEW lib/ MODULES.)
S9 reads existing libs: lib/platform/explainability.ts (S6 — render its output), the wins-feed +
visibility-trend reads (S3), the remediation/workflow reads (S2). Any small client-side helpers
live with their components in components/domain/autopilot/.

---

## 6U. UI SPECIFICATION — the heart of this sprint

GLOBAL UI RULES (per S2 §6U): tokens only; `color-mix` faint fills (RT-01); `--focus-ring` +
`--elevation`; `tabular-nums`; ARIA per FIX 13; the reduced-motion reset from S2 (the
Autopilot/Health gradient banners are auto-animated — they MUST be covered). Each screen has a
STATES matrix + a `RESPONSIVE:` line. Shared foundation exists from S2 — consume it. All
score-bearing surfaces render the `{ score, explainability }` contract (§0.4).

### 6U.2 Autopilot Loop view — autopilot/page.tsx + autopilot-loop.tsx + loop-step-card.tsx (prototype 3127)
The 5-step visible loop: (1) Audit complete (score · engines · prompts); (2) #1 gap identified
(the top-priority remediation_task / topical_coverage_gap — Prioritize); (3) Explanation shown
(the explainability rationale + confirmed-research evidence — Explain); (4) Draft approved (the
content_draft — Execute, with the 1-click approve re-using S2's existing approve action, gated by
assertBrandAccess); (5) Re-audit + Measure — **the per-fix lift, subject to the LLD's HONESTY
RULE (binding, v8.27 — this was a real bug the LLD fixed):** show a lift number ONLY where the
validation re-audit has actually run, i.e. the task's **`score_after IS NOT NULL`**; until then
step 5 shows **"validation audit scheduled — pending,"** NOT a projected/estimated number. The
per-fix delta is the task's **`lift_achieved`** (= score_after − score_before for THIS fix's
re-audit), NOT the overall visibility_trends change attributed to one fix (that would
over-attribute). Handle a **flat or negative** outcome honestly (the real delta / "no measurable
change yet") — never always "improved X%." (The canonical query uses
`FILTER (WHERE score_after IS NOT NULL)`, LLD 7824; never display projected lift as measured.)
**NOTE — this differs from the §6U.4 Action Progress Tracker**, whose citation-rate delta IS a
real measured week-over-week visibility_trends trend (with an up/down arrow) — that one is fine;
only this per-fix loop claim needs the score_after gate.
**CRITICAL — the step states are PRESENTATIONAL:** `step.status` here is `'done' | 'current' |
'pending'` (a timeline stepper concept), **NOT** remediation_tasks.status (the DB enum is
open|in_progress|ready_for_review|complete|wont_fix). Do NOT unify them — the remediation-task
LIST UI elsewhere uses the real enum; this stepper maps the loop's progress to its own 3 states.
STATES — loading: step skeletons; loop-not-started (no gaps yet / brand just created): an
EmptyState explaining the loop will populate after the first audit + gap; in-flight (step 4/5
pending): the current step highlighted, future steps dashed/pending; **measure-pending (step 5,
`score_after IS NULL` — the validation re-audit hasn't run): show "validation audit scheduled —
pending", NOT a lift number** (the honesty rule — this is a DATA gate, not just the stepper
visual); measure-complete (score_after IS NOT NULL): the real lift_achieved (incl flat/negative);
error: boundary.
**RESPONSIVE:** the 5-step timeline is horizontal on `≥lg`, vertical (stacked step cards) on `<lg`.

### 6U.3 AI Visibility Health Check — health-check/page.tsx + health-check-panel.tsx (prototype 1399)
The post-first-audit experience packaged as a Health Check (NOT a raw results page) — "the
highest-value UX decision in Phase 2," the trial→paid conversion moment. A hero banner (autopilot
gradient — reduced-motion-safe) + **5 traffic-light sections that SYNTHESISE across layers**
(Phase 1 multidim + S7 technical + S6 agent readiness) — this cross-layer synthesis is the whole
point; do NOT show the raw audit multidim scores. **Per the LLD (the dimensions + green/amber/red
thresholds, derived at display time — no new columns):**
- **AI SENTIMENT** ← `audits.scoreSentimentNumeric` (green ≥70 / amber 40–69 / red <40)
- **AI PRESENCE** ← `audits.scoreFrequency` (green ≥60 / amber 30–59 / red <30)
- **SITE READINESS** ← `technical_audits.scoreComposite` (green ≥75 / amber 45–74 / red <45)
- **LOCAL AUTHORITY** ← `agent_readiness_scores.local_ai_trust_score` (**skip for SaaS brands** —
  the score is NULL there per S6/D-01, and NULL until local_seo_results exists per S6b-02)
- **#1 ACTION** (the 5th section) ← `remediation_tasks WHERE status='open' ORDER BY priority
  LIMIT 1`, shown with its explainability rationale + a "Start this action →" CTA that leads into
  the Autopilot loop (§6U.2).
Each section gets a plain-English one-sentence interpretation (the explainability templates). Use
the green/amber/red status map (not the prototype's great/good/moderate/poor 4-band scale).
**⚠️ PROTOTYPE MISMATCH (escalation — touches the prototype):** the prototype HealthCheck (1399)
currently renders the WRONG dimensions (Frequency/Position/Sentiment/Context/Accuracy — raw
`audits` multidim, omitting Site Readiness + Local Authority). The LLD governs ("the LLD wins,
this prompt is the bug"); build the four cross-layer dimensions + the #1 action above, and the
prototype needs the same correction so prototype and LLD agree.
STATES — loading: section skeletons; pre-audit (no audit yet): "Run your first audit to see your
Health Check"; partial (insufficient audits): show with the confidence_note caveat; SaaS brand:
Local Authority hidden, the other three + #1 action shown; error: boundary.
**RESPONSIVE:** section cards `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`; the hero stacks on `<md`.

### 6U.4 Action Progress Tracker — action-progress-tracker.tsx on dashboard/page.tsx (§0.5, LLD 9060)
On the Growth+ dashboard: "N of M gaps closed this month. Your citation rate: ↑X%." Reads the
§9 action-progress route (the one query). The single most important retention surface — it must
be prominent, not buried.
STATES — loading: skeleton; empty (no tasks this period): "No gaps closed yet this month — here's
your top priority" linking the #1 gap; error: boundary.
**RESPONSIVE:** a compact stat card; the citation-rate delta uses tabular-nums + an up/down arrow.

### 6U.5 Per-prompt trend — prompt-trend-sparkline.tsx in the existing prompt-results table (§9)
A small 12-week mention-rate sparkline under each prompt row (Growth+), reading the §9 trend route
(the v8.16 audits-join query). e.g. "best plumber Bondi": 8% → 12% → 22% → 34%.
STATES — loading: a shimmer in the sparkline cell; empty (<2 weeks of data): "Not enough history
yet"; error: a muted dash, no boundary needed (it's an inline cell).
**RESPONSIVE:** the sparkline is fixed-width; on `<sm` it moves below the prompt text rather than
inline.

### 6U.6 Persona-aware dashboards — persona-dashboard.tsx + the dashboard edit (LLD 9085)
Pure frontend personalisation (NO schema): shape the overview by persona —
- **Agency:** multi-brand command centre + a cross-brand task queue (Agency+).
- **SMB:** Health Check + top 5 fixes + Mention-Source archetype + LinkedIn presence score +
  Knowledge Panel status + brand-mention count vs vertical benchmark.
- **Local tradie:** suburb visibility + agent readiness + the AU directory checklist (Priority 1)
  + consensus score + Entity-Home check + Wikidata status + Reddit AU-subreddit mention feed +
  YouTube presence score + embedding-page gap alert.
- **Persona filter (Growth+):** a prompt-results dropdown filtering by `persona_tag` (existing data).
STATES — loading: skeletons per section; the persona is derived from the brand's existing
vertical/tier (no new field); error: boundary.
**RESPONSIVE:** the Agency command centre is a multi-column grid on `≥lg`, single column on `<lg`.

---

## 7. (No CLI changes this sprint.)

## 8. (No Inngest changes this sprint — serve() stays 25/25.)
S9 adds no Inngest function. The loop's re-audit is triggered by S2's EXISTING workflow_runs path
(content_drafts.status='approved' → re-audit) — S9 only VISUALISES it; do not add a new function.

---

## 9. API ROUTES (read-only GETs; `[id]` params; Better Auth + setRlsContext + assertBrandAccess; cross-org → 404)
- `GET /api/brands/[id]/prompts/[promptId]/trend` — weekly mention-rate for one prompt over the
  last 12 weeks (Growth+). **THE v8.16 JOIN (binding):**
  ```sql
  SELECT DATE_TRUNC('week', c.created_at) AS week,
         COUNT(CASE WHEN c.brand_mentioned THEN 1 END)::float / NULLIF(COUNT(*), 0) AS mention_rate
  FROM citations c
  JOIN audits a ON c.audit_id = a.id
  WHERE a.brand_id = ? AND c.prompt = ?
  GROUP BY week ORDER BY week
  ```
  citations has NO brand_id — the audits join is the only correct brand filter.
- `GET /api/brands/[id]/action-progress` — the tracker summary (Growth+): gaps-closed-this-period
  (`COUNT(remediation_tasks WHERE status='complete' AND updated_at >= period_start)` / total) +
  the citation-rate delta from visibility_trends (§0.5).
Both routes: Better Auth session + setRlsContext + **assertBrandAccess** (S8b-01) + org scoping;
Zod on params; correct codes; cross-org → 404. Both READ-ONLY (no writes).

---

## 10. CLAUDE CODE PROMPT (paste this to open Sprint 9 — the FINAL sprint)

> You are implementing **VisibleAU Phase 2 — Sprint 9: AI Visibility Autopilot UX** — the FINAL
> sprint. Sprints 1–8 are merged. Authority: `visibleau-7layer-lld.md` v8.67, the Sprint 9 plan
> (~9050) + the explainability contract (~5556). Where this prompt and the LLD differ, the LLD wins.
>
> ⚠️ THIS SPRINT ADDS NO NEW TABLES, NO MIGRATION, NO NEW INNGEST FUNCTION (serve() stays 25/25).
> It is pure frontend + two read-only GET routes over data S1–S8 already built. Do NOT create
> schema, a migration, or an Inngest function. If a value you need to display is missing, that's a
> bug in the owning sprint — surface it, don't add schema here.
>
> Build, in order:
> 1. The read-only API routes (§9): GET …/prompts/[promptId]/trend (the per-prompt weekly
>    mention-rate — use the v8.16 JOIN: citations JOIN audits ON c.audit_id=a.id WHERE
>    a.brand_id=? — citations has NO brand_id), and GET …/action-progress (the tracker: gaps
>    closed this period / total + citation-rate delta). Both: Better Auth + setRlsContext +
>    assertBrandAccess (S8b-01) + cross-org → 404; READ-ONLY.
> 2. The Autopilot Loop view (§6U.2): the 5-step visible loop (Audit → #1 gap → Explain → Draft
>    approved → Re-audit/Measure) reading topical_coverage_gaps/remediation_tasks (the gap),
>    explainability (the rationale), content_drafts (the draft, 1-click approve re-using S2's
>    EXISTING approve action through assertBrandAccess — NOT a new write). MEASURE step (S9b-01 —
>    the honesty rule, binding): show a lift number ONLY where the task's score_after IS NOT NULL
>    (the validation re-audit ran); otherwise "validation audit scheduled — pending" — NOT a
>    projected number. The per-fix delta is the task's lift_achieved (score_after − score_before),
>    NOT the overall visibility_trends change; show flat/negative honestly. CRITICAL: step.status
>    is PRESENTATIONAL ('done'|'current'|'pending') — do NOT unify it with remediation_tasks.status.
> 3. The AI Visibility Health Check (§6U.3): hero banner (reduced-motion-safe) + 5 traffic-light
>    sections that SYNTHESISE ACROSS LAYERS per the LLD (NOT the prototype's raw audit multidim):
>    AI SENTIMENT (audits.scoreSentimentNumeric, green ≥70/amber 40-69/red <40), AI PRESENCE
>    (audits.scoreFrequency, ≥60/30-59/<30), SITE READINESS (technical_audits.scoreComposite,
>    ≥75/45-74/<45), LOCAL AUTHORITY (agent_readiness_scores.local_ai_trust_score, SKIP for SaaS),
>    and the #1 ACTION (top open remediation_task by priority) with a "Start this action →" CTA into
>    the loop. green/amber/red status (not great/good/moderate/poor). The prototype HealthCheck
>    (1399) shows the wrong dims — the LLD governs; flag the prototype to match.
> 4. The Action Progress Tracker (§6U.4) on the Growth+ dashboard: "N of M gaps closed this month ·
>    citation rate ↑X%" from the action-progress route — make it prominent.
> 5. The per-prompt trend sparkline (§6U.5) under each prompt row (Growth+), reading the trend
>    route; reuse the existing chart library (no second one).
> 6. The persona-aware dashboards (§6U.6): Agency command centre (Agency+) / SMB health-check /
>    local-tradie views + the Growth+ persona-tag prompt-results filter — pure frontend shaping,
>    no new field (derive from the brand's existing vertical/tier).
> 7. Render the { score, explainability } contract on every score-bearing surface (don't
>    regenerate it — render S6's annotations). Both themes; STATES + RESPONSIVE per screen; ARIA
>    per FIX 13; the animated banners honour the reduced-motion reset.
>
> Constraints: TS strict, no `any`. LLM_MODE=mock in tests. subscriptions.tier (never
> organizations.tier). Tier gates: loop/health/tracker/trend/persona = Growth+, Agency command
> centre = Agency+. Reuse the existing chart lib. Run §12 greps + §11 tests and report.

---

## 11. TESTS REQUIRED (LLM_MODE=mock)
- `prompt-trend.test.ts` — the trend route uses the audits JOIN (NOT citations.brand_id); weekly
  buckets; mention_rate = mentioned/total with NULLIF guard; <2 weeks → "not enough history";
  Growth+ gated; assertBrandAccess enforced (out-of-scope brand → 404).
- `action-progress.test.ts` — gaps-closed = COUNT(remediation_tasks status='complete' AND
  updated_at >= period_start) / total; citation-rate delta from visibility_trends; empty-period
  state; Growth+ gated.
- `autopilot-loop.test.ts` — the 5 steps map to the right sources (gap → remediation_task/
  topical_coverage_gap; explain → explainability; draft → content_draft; measure → score delta);
  step.status is presentational and NOT conflated with remediation_tasks.status; the 1-click
  approve calls S2's existing approve path through assertBrandAccess (no new write path).
  **S9b-01 (the Measure honesty rule): when score_after IS NULL the loop shows "validation audit
  scheduled — pending", NOT a lift number; when score_after IS NOT NULL it shows the task's
  lift_achieved (assert a flat/negative delta is shown honestly, not coerced to "improved X%");
  the per-fix number is lift_achieved, not the overall visibility_trends change.**
- `health-check.test.ts` — the 5 sections are the CROSS-LAYER set (AI Sentiment ←
  scoreSentimentNumeric, AI Presence ← scoreFrequency, Site Readiness ← technical_audits.
  scoreComposite, Local Authority ← agent_readiness_scores.local_ai_trust_score, + #1 action),
  with the green/amber/red thresholds; Local Authority is SKIPPED for SaaS brands; one recommended
  action = the top-priority open remediation_task; pre-audit + partial (confidence_note) states.
  (Asserts the prototype's raw audit multidim is NOT what's rendered.)
- `explainability-render.test.ts` — score-bearing S9 surfaces render the { score, explainability }
  shape (rationale non-empty, >30 chars per the contract); S9 renders, does not regenerate.
- `brand-access-s9.test.ts` — every brand-scoped S9 route calls assertBrandAccess; a member with
  brand_access=[A] gets 404 on brand B (the S8b-01 gate is not re-bypassed).

## 12. VERIFICATION GREPS
```bash
# NO schema / migration / Inngest / barrel change this sprint
test -z "$(ls db/migrations/*sprint9* 2>/dev/null)" && echo "OK: no sprint9 migration"
grep -REc "CREATE TABLE" db/migrations/ 2>/dev/null | grep -i sprint9 || echo "OK: no sprint9 CREATE TABLE"
grep -Rc "serve(" app/api/inngest/route.ts >/dev/null && echo "serve() untouched (still 25 fns — no S9 addition)"
# THE v8.16 JOIN: trend route uses audits join, NOT citations.brand_id
grep -Rc "JOIN audits" app/api/brands/\[id\]/prompts/\[promptId\]/trend/route.ts        # → ≥1
grep -Rc "citations.brand_id\|c.brand_id" app/api/brands/\[id\]/prompts/\[promptId\]/trend/route.ts  # → 0 (the v8.16 bug)
# action-progress: the one query
grep -REc "remediation_tasks|status.*complete" app/api/brands/\[id\]/action-progress/route.ts  # → ≥1
# the loop step states are presentational, not the DB enum
grep -REc "done|current|pending" components/domain/autopilot/loop-step-card.tsx          # → ≥1
# S9b-01: the Measure step honours the honesty rule (gate on score_after; lift_achieved per-fix)
grep -REc "score_after|lift_achieved" components/domain/autopilot/autopilot-loop.tsx components/domain/autopilot/loop-step-card.tsx  # → ≥1
grep -Rc "open\|in_progress\|ready_for_review\|wont_fix" components/domain/autopilot/autopilot-loop.tsx  # → 0 (don't use the task enum here)
# explainability rendered (not regenerated)
grep -Rc "explainability\|rationale" components/domain/autopilot/                        # → ≥1
# S9-02: Health Check synthesises ACROSS LAYERS (technical_audits + agent_readiness), not raw audit multidim
grep -REc "scoreComposite|technical_audits|local_ai_trust_score|agent_readiness" app/\(auth\)/brands/\[brandId\]/health-check/ components/domain/autopilot/health-check-panel.tsx  # → ≥1
grep -Rc "scorePosition\|scoreContext\|scoreAccuracy" components/domain/autopilot/health-check-panel.tsx  # → 0 (the prototype's raw dims are NOT the Health Check)
grep -Rc "ExplainabilityService\|annotate(" components/domain/autopilot/                 # → 0 (S9 renders, doesn't generate)
# brand-access gate on S9 brand routes (S8b-01 carried forward)
grep -Rc "assertBrandAccess" app/api/brands/\[id\]/prompts/\[promptId\]/trend/route.ts app/api/brands/\[id\]/action-progress/route.ts  # → ≥2
# reduced-motion safe (animated banners) + no second chart lib + no hex-alpha-from-var bug
grep -Rc "prefers-reduced-motion\|motion-reduce" components/domain/autopilot/ app/\(auth\)/brands/\[brandId\]/health-check/  # → ≥1
grep -REc "var\(--[a-z-]+\)[0-9a-fA-F]{2}" components/domain/autopilot/                   # → 0 (var()+hex bug; ${jsVar}30 is fine)
# RESPONSIVE + setRlsContext + no Clerk
grep -RcE "md:|sm:|lg:" app/\(auth\)/brands/\[brandId\]/autopilot/ app/\(auth\)/brands/\[brandId\]/health-check/  # → ≥1
grep -Rc "setRlsContext" app/api/brands/\[id\]/action-progress/route.ts                  # → ≥1
grep -Rc "Clerk\|@clerk" components/domain/autopilot/ app/api/brands/\[id\]/prompts/      # → 0
```

## 13. COMMON PITFALLS / SPRINT 9 ANTI-PATTERNS
- **Adding schema / a migration / an Inngest function.** S9 adds NONE — it's frontend + read-only
  GETs over existing data. serve() stays 25/25. A missing value is an upstream bug, not an S9 table.
- **The v8.16 citations.brand_id trap.** citations has NO brand_id — the per-prompt trend MUST
  filter via `citations.audit_id → audits.brand_id`. Using citations.brand_id is the v8.16 bug.
- **Health Check showing the raw audit multidim (S9-02).** The Health Check is a CROSS-LAYER
  synthesis — AI Sentiment + AI Presence (audits), SITE READINESS (technical_audits), LOCAL
  AUTHORITY (agent_readiness, skip for SaaS), + the #1 action — with green/amber/red thresholds.
  Do NOT render the prototype's Frequency/Position/Sentiment/Context/Accuracy raw scores; that
  loses the synthesis that makes the screen the conversion moment. The LLD governs; the prototype
  needs the same correction.
- **Showing unverified "improvement" in the loop's Measure step (S9b-01).** The honesty rule
  (v8.27) is binding: display a lift number ONLY where score_after IS NOT NULL (the validation
  re-audit ran); until then show "validation audit scheduled — pending". The per-fix number is the
  task's lift_achieved, NOT the overall visibility_trends change (over-attribution), and a flat/
  negative result must be shown honestly — never always "improved X%". This is the product's core
  proof-of-value claim; a premature/projected number re-introduces the exact v8.26 bug the LLD fixed.
- **Conflating the loop's step.status with remediation_tasks.status.** The Autopilot stepper uses
  presentational 'done'|'current'|'pending'; the DB enum (open|in_progress|ready_for_review|
  complete|wont_fix) is the remediation-task LIST UI's concern. Keep them separate.
- **Regenerating explainability.** S9 RENDERS S6's { score, explainability } annotations — it does
  not call ExplainabilityService.annotate() (that's the scoring routes' job). An empty rationale
  is a build failure.
- **A new write path for the 1-click approve.** The loop's "Execute"/approve re-uses S2's EXISTING
  content_drafts approve action through assertBrandAccess — it is NOT a new write.
- **Dropping the brand-access gate (S8b-01).** Every brand-scoped S9 route + the Autopilot approve
  must call assertBrandAccess, or the Autopilot can act outside a member's brands.
- **A second chart library.** Reuse the one the SoV/visibility-trend views already use.
- **Animated banners ignoring reduced-motion.** The Autopilot/Health gradient banners auto-animate
  — they must inherit the S2 reduced-motion reset.
- **Burying the Action Progress Tracker.** It's the #1 retention surface ("is this working?") —
  prominent on the Growth+ dashboard, not a footnote.
- **Tier mis-gating.** Loop/health/tracker/trend/persona = Growth+; the Agency command centre =
  Agency+.

## 14. HANDOFF — PHASE 2 COMPLETE → GATE 3
After Sprint 9, **all 9 Phase 2 sprints are built**: the 7-layer platform (37 tables, 25 Inngest
functions, 16 GAPs) plus the visible Autopilot loop that ties it together. GAP 10 (the final GAP)
is closed. **Next is NOT another sprint — it's Gate 3:** the final cross-prompt audit across all
9 sprint prompts (consistency of conventions, event names, the cross-sprint contracts — the
dual-emit, the fanout extension, the brand-access gate, the unit rules, the CASCADE/SET NULL
choices — and that nothing one sprint defers is left unbuilt by its owner). Then the consolidated
LLD-hygiene pass (the queued items: S7b-02 run-comparison step structure; the S8-01 source emits
for visibility/trend-updated + hallucination/acknowledged; the S8b-01/02/03 brand-access +
role-ceiling + privilege-audit formalisations — note **S8b-01's assertBrandAccess is an S9 build
prerequisite** (S8 builds it in code; the LLD pass only *formalises* it); the **S9-02 Health Check
prototype↔LLD reconciliation** (the prototype HealthCheck must move to the four cross-layer
dimensions the LLD specifies); and OQ-1 local_seo_results if/when defined), then
the build phase. **Reminder of the deliberate deferral:** S6's local_ai_trust_score stays NULL by
design (S6b-02) until local_seo_results is defined in a dedicated local-SEO pass — that is the one
piece of Phase 2 scope intentionally left for later, not a gap to close in S9.

## CHANGELOG
- v1.2 — Gate 2 pass-2 finding applied (the 'Measure'-claim integrity angle), validated against
  canon first. S9b-01 [MODERATE]: the loop's step-5 Measure ('citation rate improved 14%') carried
  NO honesty rule (grep=0) — but the LLD has an explicit, hard-won one (1787-1852, 7824): lift is
  shown ONLY where the task's score_after IS NOT NULL (the validation re-audit actually ran);
  otherwise 'validation audit scheduled — pending', never a projected number. This was a real bug
  the LLD fixed (v8.26 summed lift_achieved WITHOUT the filter and would have shown unreal
  'improvement'; v8.27 hard-coded FILTER (WHERE score_after IS NOT NULL) into the canonical query).
  My step 5 also said 'from visibility_trends / score_after' — ambiguous between the per-fix
  lift_achieved and the overall trend (over-attribution). Fixed §6U.2 (step 5 + STATES = a DATA
  gate, not just the stepper visual), §10 step 2, §11 (the autopilot-loop test asserts pending-when-
  NULL + lift_achieved + honest flat/negative), §12 grep, §13 pitfall: gate on score_after IS NOT
  NULL; per-fix lift_achieved (= score_after − score_before), not the overall visibility_trends
  change; flat/negative shown honestly. (The §6U.4 Action Progress Tracker is left as-is — its
  citation-rate delta IS a real measured week-over-week visibility_trends trend with an up/down
  arrow, not a projected per-fix lift; only the loop's per-fix claim needed the gate.) No
  structural/feature change; this hardens the product's core proof-of-value surface. Pass-2
  confirmed the v1.1 fixes (S9-01 assertBrandAccess clarity, S9-02 Health Check dimensions) correct
  and surgical, and the rest CLEAN (the v8.16 JOIN, explainability render-not-regenerate, the
  presentational step states, the 1-click approve re-use, tier gating, §1-vs-tree, serve()=25/25).
  With this, Sprint 9 is clean across two passes — PHASE 2 PROMPT GENERATION IS COMPLETE.
- v1.1 — Gate 2 findings applied (reviewer chat), both validated against canon + the S8 prompt
  on disk first. S9-01 [MODERATE]: the reviewer (working from S8 v1.2) flagged that S9 calls
  assertBrandAccess but S8 only had canPerform. Recheck: S8 v1.3 ALREADY built assertBrandAccess
  (the S8b-01 fix added exactly that throwing brand-scope guard), so S9 is not calling a
  nonexistent function — but the reviewer's deeper point held: my §14 read as deferring the gate
  while §0.4/§9 assumed it built. Clarified §0.4 — S8 v1.3 builds assertBrandAccess in CODE
  (distinct from canPerform; S9 builds after S8, so it's available, and is a build PREREQUISITE),
  and the ONLY deferred item (§14) is *formalising it in the LLD* (canon has 0 refs to either term,
  confirmed). S9-02 [MODERATE — prototype-vs-LLD conflict on the headline surface]: §6U.3 followed
  the prototype's raw audit multidim (Frequency/Position/Sentiment/Context/Accuracy), but the LLD
  (9145-9154 / 2336) specifies the Health Check as a CROSS-LAYER synthesis — AI Sentiment
  (audits.scoreSentimentNumeric), AI Presence (audits.scoreFrequency), SITE READINESS
  (technical_audits.scoreComposite), LOCAL AUTHORITY (agent_readiness_scores.local_ai_trust_score,
  skip for SaaS), + the #1 ACTION (top open remediation_task) = the 5 sections, each green/amber/red.
  My version omitted the two cross-layer dims that ARE the synthesis. By 'the LLD wins', rewrote
  §6U.3/§10/§11/§12/§13 to the LLD dimensions + thresholds + SaaS skip, and flagged the prototype
  HealthCheck (1399) as needing the same correction (an LLD-pass/prototype reconciliation item in
  §14). Confirmed the LLD '5 sections' is internally consistent (2336 enumerates all five incl the
  #1 action — no escalation needed). No structural/feature change; the fixes correct a UI surface
  + clarify a dependency. Reviewer confirmed CLEAN: the v8.16 JOIN exact, the tracker query, the
  loop sources + presentational step states, explainability render-not-regenerate, the
  no-schema/no-Inngest discipline (serve()=25/25), tier gating, and the §1-vs-tree enumeration.
- v1.0 — Initial Sprint 9 prompt (the FINAL sprint), generated single-pass against verified LLD
  v8.67 (REVIEWED-r2). Plan/tracker/trend detail cited to LLD ~9050–9090; the explainability
  contract to ~5556; UI to prototype EnhancedDashboard (1089) + HealthCheck (1399) + AutopilotLoop
  (3127); conventions from master plan §7. Distinct from prior sprints: NO new tables, NO
  migration, NO new Inngest function (serve() stays 25/25) — pure frontend + 2 read-only GET
  routes over existing S1–S8 data, making the Autopilot loop (Audit→Prioritize→Explain→Execute→
  Measure) VISIBLE. Carries the cross-sprint contracts it depends on: the v8.16 citations/audits
  JOIN (per-prompt trend), the explainability contract (render, don't regenerate), the loop's
  presentational step states (NOT the remediation_tasks enum), and the S8b-01 brand-access gate
  (the Autopilot must not act outside a member's brands). Closes GAP 10 (the last GAP). Awaiting
  Gate 2.
