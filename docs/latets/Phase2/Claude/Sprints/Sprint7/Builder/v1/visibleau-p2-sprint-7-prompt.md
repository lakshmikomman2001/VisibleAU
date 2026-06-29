# VisibleAU Phase 2 — SPRINT 7 PROMPT: Conversational Discovery Intelligence
# Version: 1.0 | Built against: LLD v8.67 (REVIEWED-r2) | Sprint: 7 of 9 | 4 weeks
# Source anchors (r2/v8.67): Sprint 7 plan (~9032), Layer 4 §"CONVERSATIONAL DISCOVERY
# INTELLIGENCE" (~7457), tables conversation_journeys 7469, journey_run_results 7500,
# comparison_prompt_results 7530; Inngest run-journey + run-comparison-prompts (~7570); the
# dual-emit requirement on technical-audit-run (~1064, ~7246); the crawler reuse/UA note
# (~3343); lib modules (~7640); API routes (~7556); MI-01 (~8700); RLS (~8684); prototype
# DiscoveryHub (2944). NOTE: line numbers are navigational — open the region; the LLD wins.

> HOW TO USE: read §0, then paste §10 into a fresh Claude Code session on the VisibleAU
> repo. §1–§9 are the spec; §11–§14 are tests/acceptance/pitfalls/handoff. When this prompt
> and the LLD disagree, THE LLD WINS and this prompt is the bug.

---

## 0. READ FIRST — CONTEXT & CONVENTIONS

### 0.1 What Sprint 7 is
**Conversational Discovery Intelligence (Layer 4)** — how customers discover the brand through
**multi-turn AI conversations** (journeys) and how it fares **head-to-head against competitors**
(comparison prompts). Ships: pre-built journeys per vertical, multi-turn journey execution
against 4 engines with turn-by-turn scoring, and the competitor comparison runner — which
**completes the Sprint 3 Competitive Benchmark** (fills the CPR-01 "Coming soon" data that S3
deferred to S7). It also discharges two infrastructure obligations that S5/S6 depend on:
**ensuring `technical-audit-run.ts` emits both the dot and slash event forms**, and
**the shared `lib/crawler/index.ts`** (coordinated with S6). (LLD 9032–9047.)

### 0.2 Prerequisites & the two cross-sprint obligations (required this sprint)
Sprints 1–6 merged. S7 reads S1's services + `selectModel()`/`LLMService`, Phase 1's
`brands.competitors` TEXT[] + `audits`, and S3's competitive-benchmark scaffold.
- **OBLIGATION 1 — technical-audit-run.ts dual-emit (RE-01/SR-01/AE-01).**
  `technical-audit-run.ts` is a **Phase 1 function** (fired in parallel with run-audit.ts on
  `audit/start`; it already scores brand_entity_scores AU signals). It currently emits only the
  webhook form. **S7 MUST ensure it emits BOTH:** `technical-audit.complete` (dot, for webhook
  delivery / VALID_EVENTS) AND `technical-audit/complete` (slash, for internal chaining). Three
  S5/S6 functions listen on the slash form — refresh-entity-score (S5), score-agent-readiness
  (S6), audit-entity-home (S6) — and stay dormant until this dual-emit lands. This is a small,
  surgical change to an existing function, not a rebuild.
- **OBLIGATION 2 — the shared crawler `lib/crawler/index.ts`.** Per S6 §0.2/§13, **Sprint 6
  already built the full working Playwright crawler** (20-page budget, 15s/page, 5min total).
  **S7 REUSES it — do NOT recreate it.** The only crawler change S7 may need is confirming the
  optional `userAgent` param exists (S6 added it: default Playwright UA for human-simulation
  technical audits; `'GPTBot/1.1'` override for content-structure-audit). If for any reason S6's
  crawler isn't present, build it per that spec — but the canonical owner is whichever of S6/S7
  lands first, and they must NOT both build it.

### 0.3 Verify you are on the right LLD before starting
```bash
grep -m1 "^# Version:" visibleau-7layer-lld.md          # → # Version: 8.67 (or 8.66/8.65 — all valid) | Date: June 2026
grep -cE "ATTRIBUTION CORRECT(ED IN CROSS-REVIEW|ION)" visibleau-7layer-lld.md   # → ≥1
```
Canon is `visibleau-phase2-v8.67-complete-REVIEWED` (8.66/8.65 also valid — v8.67 was a
hygiene+security pass touching five spots Sprint 7 doesn't depend on). If version is below 8.65
or marker count is 0, STOP — stale LLD.

### 0.4 SHARED CONVENTIONS (binding; from master plan §7)
- **Better Auth** canonical; **zero Clerk**. Page routes `[brandId]`; API routes `[id]`.
- **`subscriptions.tier`**, never `organizations.tier`. **TIER_ENGINES** governs engine counts
  (Growth+ = 4 engines chatgpt/claude/gemini/perplexity; Free/Starter = 2 = chatgpt/perplexity).
  Every LLM call goes through **`LLMService.complete()`** with the right `task` (journeys +
  comparison use `task='brand_mention'`, same as the audit flow) and **`selectModel()`** — never
  a hardcoded model string.
- **MI-01 migration idempotency (v8.29):** whole migration re-runnable — `CREATE TABLE IF NOT
  EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS "<name>" ON <table>;` before each
  `CREATE POLICY`; CHECK constraints added idempotently.
- **RLS** USING + WITH CHECK on every tenant table (all 3 new tables carry organization_id → all
  get RLS). Every protected route calls **`setRlsContext(db, currentUser.organizationId)`**
  before any query; cross-org → **404, not 401**.
- **isEngineEnabled() gating (Sprint 12 JD3):** before dispatching to each engine, check
  `isEngineEnabled(provider)` — it takes **PROVIDER** names (`openai|anthropic|google|perplexity`),
  NOT engine names. Map first: `{ chatgpt:'openai', claude:'anthropic', gemini:'google',
  perplexity:'perplexity' }`. Keep Engine names for the `engine` column writes; gate on the
  mapped provider. A run against 0 enabled engines logs a warning and returns early.
- `LLM_MODE=mock` in all tests.
- **Tier gates (v8.19 regating — IMPORTANT):** the **conversation_journeys CUSTOMER-FACING UX is
  Agency+ only** (Growth sees a locked teaser: "See how customers discover your brand through
  multi-turn AI conversations → Agency A$499"). The **data model + Inngest functions are built
  in full regardless**. **comparison_prompt_results stays at Growth+** (the "am I winning vs
  competitor?" insight — simpler, high-value for all paid). The journey CREATE/run API is
  Agency+; the comparison API is Growth+.
- **UI** token-driven (dark + `[data-theme="light"]`; `color-mix` faint fills, RT-01;
  `--focus-ring`/`--elevation`; `tabular-nums`; ARIA per FIX 13; reduced-motion reset from S2).
- **THE EXPLAINABILITY CONTRACT (LLD 5490)** still applies to score-bearing responses (journey
  score, comparison verdict): include `rationale`/`confidence_label`/`confidence_note`/`top_action`
  via `ExplainabilityService.annotate()`.

### 0.5 The structural rules + enums + score formulas Sprint 7 introduces (copy EXACTLY)
- **prompt_sequence is typed `JourneyTurn[]` (PS-01/TS-01, LLD 7475)** — JSONB array of
  `{ turn: number; prompt: string; intent: 'awareness'|'followup'|'compare'|'decide' }`. Cast
  `prompt_sequence as JourneyTurn[]`. Zod on create: `z.array(JourneyTurnSchema).min(2).max(8)`
  (**2–8 turns**). Prompts may contain a `{brandName}` placeholder substituted at run time.
- **conversation_journeys.vertical** CHECK constraint — Phase 1 verticalEnum
  `'tradies'|'allied_health'|'saas'` **plus v1.1** `'professional_services'|'real_estate'`. Use a
  CHECK in the migration (added idempotently). `buyer_stage` = awareness|consideration|decision.
- **journey_run_results.journey_id ON DELETE CASCADE (E-03b, LLD 7503)** — journey_id is NOT
  NULL; deleting a journey definition orphans its runs, so CASCADE (SET NULL is impossible on a
  NOT NULL column). `turn_results` JSONB = `[{ turn, prompt, brand_mentioned, position,
  context_label, competitors_mentioned }]`.
- **journey_score formula (lib/conversational/journey-scorer.ts, LLD 7516):** base =
  `(brand_appeared_in_n_turns / total_turns) × 100`; **early-mention bonus** = first_mention_turn
  1 → +10, turn 2 → +5, turn 3+ → 0; **cap at 100.0**. Example: 3 of 5 turns, first mention turn
  1 → `(3/5×100)+10 = 70.0`. (Rationale: unprompted turn-1 mention in an awareness journey is the
  highest-value signal.)
- **comparison_prompt_results.audit_id ON DELETE CASCADE (E-03, LLD 7533)** — per-audit
  comparison analytics, deleted with the audit at 12-mo retention (without it,
  audit-data-retention would FK-violate). `brand_won` is BOOLEAN **nullable** (a prompt may be
  inconclusive); `brand_mentioned`/`competitor_mentioned` NOT NULL.

---

## 1. WHAT SHIPS THIS SPRINT
- 3 new tables (§5): conversation_journeys (#26), journey_run_results (#27),
  comparison_prompt_results (#28) + their indexes + the vertical CHECK.
- 1 mandatory seed (§5.5): **3 pre-built journeys per vertical** (the acceptance criterion).
- 2 Inngest functions (§8): run-journey (event-driven, Agency+ data, step-per-turn-per-engine),
  run-comparison-prompts (on `audit/complete`) — both registered in `serve()`.
- **The technical-audit-run.ts dual-emit** (§8.3 — Obligation 1) + **crawler reuse** (§0.2 —
  Obligation 2). These complete S5/S6's dormant dependencies; the final serve() count reaches 25.
- 4 lib modules (§6): journey-runner, journey-scorer, comparison-runner, intent-classifier.
- Screens (§6U): the Discovery hub, journeys (Agency+ gated), comparisons (Growth+).
- API routes (§9): journeys list/create/run/results, comparisons.
- **The S3 Competitive Benchmark completion** — comparison_prompt_results now has data, so S3's
  CPR-01 "Coming soon" card resolves to the real comparison view (§6U.4 / §14).
- **GAP coverage:** GAP 4 (the conversational/comparison half — the L3 citation-source half
  shipped in S5).

---

## 2. DEPENDENCIES TO INSTALL
None new. Playwright is already present (S6's crawler). Journeys/comparison use the existing
LLMService + provider SDKs.

## 3. ENVIRONMENT VARIABLES (additions)
None new. Engine enablement uses the existing `LLM_ENGINE_*_ENABLED` env vars via
isEngineEnabled().

---

## 4. PROJECT STRUCTURE ADDITIONS
Every file below is specified in §5–§9 / §6U. No file appears without a spec.
```
db/
├── schema/
│   ├── conversation-journeys.ts · journey-run-results.ts · comparison-prompt-results.ts
├── migrations/
│   └── 00NN_phase2_sprint7_discovery.sql   // 3 CREATEs (IF NOT EXISTS) + indexes + vertical CHECK + RLS
└── seed/
    └── prebuilt-journeys.ts                // §5.5 (3 journeys × each vertical)

lib/conversational/
├── journey-runner.ts        // §6.1 multi-turn prompt execution
├── journey-scorer.ts        // §6.2 the journey_score formula
├── comparison-runner.ts     // §6.3 head-to-head competitor prompts
├── intent-classifier.ts     // §6.4 classify prompts by buyer stage
├── types.ts                 // JourneyTurn interface (§0.5) + turn_results shape
└── index.ts

inngest/functions/
├── run-journey.ts               // §8.1 step-per-turn-per-engine, concurrency 3, Agency+ data
├── run-comparison-prompts.ts    // §8.2 on 'audit/complete', concurrency 3
└── technical-audit-run.ts       // §8.3 EDIT the Phase 1 function: add the dual-emit (dot+slash)

app/(auth)/brands/[brandId]/discovery/
├── page.tsx              // Discovery hub (§6U.2)
├── journeys/page.tsx     // Journey list + results (§6U.3, Agency+)
└── comparisons/page.tsx  // Competitor comparison results (§6U.4, Growth+)
components/domain/discovery/
├── journey-flow-chart.tsx · journey-result-card.tsx · comparison-verdict-card.tsx

app/api/brands/[id]/journeys/route.ts                  // GET list / POST create (Agency+)
app/api/brands/[id]/journeys/[journeyId]/run/route.ts  // POST execute
app/api/brands/[id]/journeys/[journeyId]/results/route.ts  // GET history
app/api/brands/[id]/comparisons/route.ts               // GET comparison results (Growth+)

tests/phase2/sprint7/  (§11)
```

---

## 5. DATABASE SCHEMA ADDITIONS

Copy each definition VERBATIM from the LLD (anchors inline). Apply **MI-01** to the migration.

### 5.1 conversation_journeys (#26, LLD 7469)
`brand_id`/`organization_id` NOT NULL FKs; `journey_name`; `vertical` (the **CHECK** §0.5);
`buyer_stage` (3-value); **`prompt_sequence` JSONB NOT NULL typed `JourneyTurn[]`** (§0.5);
`is_active` BOOLEAN DEFAULT true; `created_at`/`updated_at` (updated_at on is_active toggle or
prompt_sequence edit).

### 5.2 journey_run_results (#27, LLD 7500)
`journey_id` NOT NULL REFERENCES conversation_journeys(id) **ON DELETE CASCADE** (§0.5);
`brand_id`/`organization_id` NOT NULL; `engine`; `run_at`; `turn_results` JSONB (§0.5);
`brand_appeared_in_n_turns` INT NOT NULL; `total_turns` INT NOT NULL; `journey_score`
NUMERIC(5,2); `first_mention_turn` INT. Indexes `journey_results_brand_idx (brand_id, run_at
DESC)` + `journey_results_journey_idx (journey_id, run_at DESC)`.

### 5.3 comparison_prompt_results (#28, LLD 7530)
`brand_id`/`organization_id` NOT NULL; `audit_id` REFERENCES audits(id) **ON DELETE CASCADE**
(§0.5); `competitor_domain`; `prompt`; `engine`; `brand_won` BOOLEAN **nullable**;
`brand_mentioned`/`competitor_mentioned` BOOLEAN NOT NULL; `verdict_snippet`; `run_at`. Indexes
`comparison_brand_idx (brand_id, run_at DESC)` + `comparison_audit_idx (audit_id)` +
`comparison_competitor_idx (brand_id, competitor_domain, run_at DESC)`.

### 5.4 RLS
All 3 tables carry organization_id → enable RLS with USING + WITH CHECK on organization_id,
MI-01 `DROP POLICY IF EXISTS` guard before each policy.

### 5.5 Seed (MANDATORY) — db/seed/prebuilt-journeys.ts (acceptance: 3 per vertical, LLD 9046)
Seed **3 pre-built `conversation_journeys` per vertical** (tradies, allied_health, saas,
professional_services, real_estate), each a 2–8-turn JourneyTurn[] spanning awareness →
followup → compare/decide with the `{brandName}` placeholder. `is_active=true`,
`ON CONFLICT DO NOTHING`. (These are template journeys an org can clone/activate.)

---

## 6. LIB MODULES (LLD 7640)

### 6.0 types.ts — JourneyTurn + turn_results shape (LLD 7475)
```ts
export interface JourneyTurn {
  turn: number;                                                  // 1-indexed
  prompt: string;                                                // may contain {brandName}
  intent: 'awareness' | 'followup' | 'compare' | 'decide';
}
```
Plus the `turn_results` row shape (`{ turn, prompt, brand_mentioned, position, context_label,
competitors_mentioned }`).

### 6.1 journey-runner.ts (LLD 7570)
Executes a journey's prompt_sequence turn-by-turn against the enabled engines. Substitutes
`{brandName}`; calls `LLMService.complete({ task: 'brand_mention', … })` per turn; parses each
response for brand mention / position / context / competitors; assembles turn_results. **Carries
conversation context across turns** (a journey is multi-turn — later turns see earlier
exchanges, not isolated prompts). Persists each turn result inside its step closure (§8.1).

### 6.2 journey-scorer.ts (LLD 7516)
The journey_score formula (§0.5) — base ratio × 100 + early-mention bonus, cap 100.0; derive
`brand_appeared_in_n_turns`, `total_turns`, `first_mention_turn` from turn_results.

### 6.3 comparison-runner.ts (LLD 7607)
For each `brand.competitors` domain, run "[Competitor] vs [Brand]"-style prompts against the
brand's TIER_ENGINES; parse `brand_won` (nullable — inconclusive allowed), brand/competitor
mention, and a `verdict_snippet`; INSERT comparison_prompt_results. Only runs if
`brands.competitors` is non-empty.

### 6.4 intent-classifier.ts (LLD 7640)
Classify a prompt by buyer stage (awareness/consideration/decision) — used to label journey
turns and organise the journey-builder UI.

---

## 6U. UI SPECIFICATION

GLOBAL UI RULES (per S2 §6U): tokens only; `color-mix` faint fills (RT-01); `--focus-ring` +
`--elevation`; `tabular-nums`; ARIA per FIX 13; reduced-motion reset from S2. Each screen has a
STATES matrix + a `RESPONSIVE:` line. Shared foundation exists from S2 — consume it. Score-bearing
views surface the explainability fields (§0.4).

### 6U.2 Discovery hub — DiscoveryHub (prototype 2944)
LayerBadge "discovery". For **Agency+**: the journeys summary + the comparison summary. For
**Growth**: the comparison summary is live, the journeys section is a **locked teaser** ("See how
customers discover your brand through multi-turn AI conversations → Agency A$499") via TierGate.
STATES — loading: skeletons; empty (no journeys/comparisons yet): EmptyState; Growth (journeys
locked): TierGate teaser; error: boundary.
**RESPONSIVE:** summary tiles `grid-cols-1 md:grid-cols-2`.

### 6U.3 Journeys — journeys/page.tsx (Agency+) + journey-flow-chart.tsx + journey-result-card.tsx
Agency+ gated (the whole screen). journey-flow-chart.tsx visualises the turn sequence (turn →
prompt → intent); journey-result-card.tsx shows a run's journey_score + per-turn brand-mention
markers + first_mention_turn. Journey list with run + create actions.
STATES — loading: skeleton; empty: "No journeys yet — clone a pre-built one to start"; locked
(non-Agency): TierGate; running: per-turn progress; error: boundary.
**RESPONSIVE:** the flow chart scrolls horizontally on `<md`; result cards single-column.

### 6U.4 Comparisons — comparisons/page.tsx (Growth+) + comparison-verdict-card.tsx
Per-competitor head-to-head: comparison-verdict-card.tsx shows brand_won (win/loss/inconclusive
when null), the verdict_snippet, brand vs competitor mention, per engine. **This screen is what
S3's Competitive Benchmark "Coming soon" card now links to** — once comparison_prompt_results has
rows, the S3 benchmark shows the real comparison data (see §14).
STATES — loading: skeleton; empty (no competitors set / no runs): EmptyState "Add competitors to
your brand to see head-to-head results"; inconclusive (brand_won null): a neutral verdict card;
error: boundary.
**RESPONSIVE:** verdict cards `grid-cols-1 md:grid-cols-2`.

---

## 7. (No CLI changes this sprint.)

## 8. INNGEST FUNCTIONS (register the 2 new in serve() alongside S2–S6; EDIT technical-audit-run)

### 8.1 run-journey.ts (LLD 7570)
- **Trigger:** event-driven (journey run requested via the API / a scheduled re-run). **Agency+
  data** (the journey UX is Agency-gated; the function runs for Agency journeys).
- **Concurrency (CC-03):** `concurrency: { limit: 3 }` (each journey = ~5 turns × 4 engines = 20
  LLM calls; 3×20 = 60 max concurrent — lower than fan-out to avoid starving the audit queue).
- **isEngineEnabled gate (§0.4):** filter engines via the provider map; 0 enabled → warn + return.
- **STEP STRUCTURE (SN-01 — critical):** use `step.run()` **per engine per turn** with STABLE
  deterministic names (`turn-${i}-${engine}` is fine since i + engine are fixed from the journey
  definition). Persist each turn result **inside** its step closure so an Inngest retry skips
  completed steps — without steps, a failure at turn 4 restarts all 20 calls (quota waste).
- Writes journey_run_results (one row per engine per run) with the journey-scorer output.

### 8.2 run-comparison-prompts.ts (LLD 7607)
- **Trigger (PC-05):** listens on **`audit/complete`** (fires after each audit).
- **Concurrency (CC-02):** `concurrency: { limit: 3 }` (Agency Pro 25 brands × 3 competitors × 4
  engines = 300 without a limit; 3×12 = 36 max).
- **isEngineEnabled gate** on the brand's TIER_ENGINES; **competitor source** = `brands.competitors`
  TEXT[] (only runs if non-empty). LLM via `LLMService.complete({ task: 'brand_mention' })`.
- Writes comparison_prompt_results — **this is what fills S3's CPR-01 "Coming soon" benchmark.**

### 8.3 technical-audit-run.ts — EDIT the Phase 1 function: add the DUAL-EMIT (Obligation 1, LLD 7246)
`technical-audit-run.ts` already exists (Phase 1; fired in parallel with run-audit.ts on
`audit/start`; scores brand_entity_scores AU signals). **On completion it must emit BOTH:**
```ts
inngest.send({ name: 'technical-audit.complete', data: { brandId, orgId, auditId } }); // dot — webhook/VALID_EVENTS
inngest.send({ name: 'technical-audit/complete', data: { brandId, orgId, auditId } }); // slash — internal chaining
```
The slash form is what refresh-entity-score (S5), score-agent-readiness (S6) and audit-entity-home
(S6) listen on — they remain dormant until this lands. **Do NOT rebuild the function or its
8-dimension scoring; only add the second emit** (if the dot emit isn't present either, add both).
Verify `technical-audit.complete` is in the webhook VALID_EVENTS set.

**serve():** add run-journey + run-comparison-prompts to the existing array; technical-audit-run
is already registered (Phase 1). (Running Phase 2 total after S7: 3 (S2) + 6 (S3) + 2 (S4) +
7 (S5) + 5 (S6) + 2 (S7) = **25** — the full set.)

---

## 9. API ROUTES (LLD 7556) — `[id]` params; Better Auth + setRlsContext + org scoping; Zod;
cross-org → 404; score-bearing responses carry the explainability fields (§0.4).
- `GET /api/brands/[id]/journeys` — active journeys list.
- `POST …/journeys` — create journey (**Agency+** — v8.19 regated; Zod `JourneyTurn[]` 2–8).
- `POST …/journeys/[journeyId]/run` — execute a journey (Agency+).
- `GET …/journeys/[journeyId]/results` — journey run history.
- `GET …/comparisons` — competitor comparison results (**Growth+**).
Every route: Better Auth session + setRlsContext + org scoping; Zod; correct codes; the tier gate
(journeys Agency+, comparisons Growth+).

---

## 10. CLAUDE CODE PROMPT (paste this to open Sprint 7)

> You are implementing **VisibleAU Phase 2 — Sprint 7: Conversational Discovery Intelligence**
> (Layer 4: multi-turn journeys + competitor comparison). It also completes the Sprint 3
> Competitive Benchmark and discharges two cross-sprint obligations. Sprints 1–6 are merged.
> Authority: `visibleau-7layer-lld.md` v8.67, Layer 4 "CONVERSATIONAL DISCOVERY INTELLIGENCE"
> (~7457) and the Sprint 7 plan (~9032). Where this prompt and the LLD differ, the LLD wins.
>
> Build, in order:
> 1. Drizzle schemas + an MI-01-idempotent migration for the 3 tables (§5): CREATE TABLE IF NOT
>    EXISTS ×3, the indexes, the vertical CHECK constraint (tradies/allied_health/saas/
>    professional_services/real_estate, added idempotently), DROP POLICY IF EXISTS before each
>    CREATE POLICY, RLS on all 3. CRITICAL: prompt_sequence is typed JourneyTurn[] (2–8 turns,
>    Zod min(2).max(8)); journey_run_results.journey_id ON DELETE CASCADE (NOT NULL parent);
>    comparison_prompt_results.audit_id ON DELETE CASCADE (so retention can purge); brand_won is
>    nullable (inconclusive allowed).
> 2. The seed (§5.5): 3 pre-built journeys per vertical (5 verticals), each a 2–8-turn
>    JourneyTurn[] with the {brandName} placeholder, ON CONFLICT DO NOTHING.
> 3. The 4 lib/conversational modules + types.ts (§6): journey-runner (multi-turn execution
>    carrying conversation context across turns; LLMService.complete task='brand_mention'),
>    journey-scorer (the EXACT formula: (appeared/total)×100 + early-mention bonus 10/5/0, cap
>    100.0), comparison-runner (per brands.competitors, brand_won nullable, verdict_snippet),
>    intent-classifier. selectModel — no hardcoded models.
> 4. The 2 new Inngest functions (§8), registered in serve(): run-journey (event-driven, Agency+
>    data, concurrency 3, isEngineEnabled provider-mapped gate, step.run() per engine per turn
>    with STABLE names + persist-in-step so retries skip completed turns), run-comparison-prompts
>    (on 'audit/complete', concurrency 3, brand's TIER_ENGINES, reads brands.competitors, writes
>    comparison_prompt_results — this fills S3's CPR-01 benchmark).
> 5. **OBLIGATION 1 — edit the Phase 1 technical-audit-run.ts to emit BOTH** 'technical-audit.
>    complete' (dot, webhook) AND 'technical-audit/complete' (slash, internal). Do NOT rebuild it
>    or its scoring — only add the second emit; ensure the dot event is in the webhook
>    VALID_EVENTS. This lights up refresh-entity-score (S5) + score-agent-readiness/
>    audit-entity-home (S6), which listen on the slash form.
> 6. **OBLIGATION 2 — REUSE the shared lib/crawler/index.ts that Sprint 6 already built** (full
>    Playwright crawler, 20-page/15s/5min, with the optional userAgent param). Do NOT recreate a
>    second crawler. (If S6's isn't present, build it per that spec — but it must be one shared
>    module.)
> 7. The 3 Discovery screens (§6U) + the 3 components: the hub (journeys Agency+ / comparisons
>    Growth+), the journey flow-chart + result card (Agency+ gated), the comparison verdict card
>    (Growth+) — which is what S3's "Coming soon" benchmark now links to. Both themes; STATES +
>    RESPONSIVE per screen; ARIA per FIX 13.
> 8. The API routes (§9): [id] params, Better Auth + setRlsContext + org scoping, Zod (the
>    JourneyTurn[] schema), tier gates (journeys Agency+, comparisons Growth+), cross-org → 404.
>
> Constraints: TS strict, no `any`. LLM_MODE=mock in tests. subscriptions.tier (never
> organizations.tier). selectModel() + LLMService — no hardcoded models/engine lists. Run §12
> greps + §11 tests and report.

---

## 11. TESTS REQUIRED (LLM_MODE=mock)
- `journey-scorer.test.ts` — (appeared/total)×100 + early-mention bonus (turn1 +10 / turn2 +5 /
  turn3+ 0); cap at 100.0; the 3-of-5-turns-first-at-1 → 70.0 fixture.
- `journey-runner.test.ts` — {brandName} substitution; conversation context carries across turns;
  turn_results shape; isEngineEnabled provider-map gate (0 enabled → early return).
- `run-journey.integration.test.ts` — step.run() per engine per turn with stable names; a retry
  after a mid-journey failure skips completed turns (no full restart).
- `comparison-runner.test.ts` — only runs when brands.competitors non-empty; brand_won nullable
  (inconclusive); writes comparison_prompt_results; TIER_ENGINES respected (Growth 4 / Starter 2).
- `technical-audit-dual-emit.test.ts` — technical-audit-run emits BOTH 'technical-audit.complete'
  (dot) AND 'technical-audit/complete' (slash); the dot is in webhook VALID_EVENTS; the slash
  wakes refresh-entity-score / score-agent-readiness / audit-entity-home.
- `journey-vertical-check.test.ts` — the vertical CHECK accepts the 5 values, rejects others;
  prompt_sequence Zod rejects <2 or >8 turns.
- `comparison-cascade.test.ts` — deleting an audit cascades comparison_prompt_results (no FK
  violation, so retention works); deleting a journey cascades journey_run_results.
- `s3-benchmark.integration.test.ts` — once comparison_prompt_results has rows, the S3
  Competitive Benchmark route returns real comparisonData (not the CPR-01 null/"Coming soon").
- `discovery-rls.test.ts` — cross-org reads blocked on all 3 tables; protected routes call
  setRlsContext; journeys API Agency+, comparisons API Growth+.

## 12. VERIFICATION GREPS
```bash
grep -c "CREATE TABLE IF NOT EXISTS" db/migrations/*sprint7_discovery.sql              # → 3
grep -c "DROP POLICY IF EXISTS" db/migrations/*sprint7_discovery.sql                   # → 3
# vertical CHECK with the 5 values
grep -Rc "professional_services\|real_estate" db/migrations/*sprint7_discovery.sql     # → ≥1
# CASCADE rules
grep -E "journey_id|audit_id" db/migrations/*sprint7_discovery.sql | grep -c "ON DELETE CASCADE"  # → ≥2
# JourneyTurn typed + 2..8 Zod
grep -Rc "JourneyTurn" lib/conversational/types.ts                                     # → ≥1
grep -RcE "\.min\(2\)\.max\(8\)" lib/conversational/                                   # → ≥1
# journey_score formula present
grep -Rc "early.mention\|first_mention_turn" lib/conversational/journey-scorer.ts      # → ≥1
# DUAL-EMIT (Obligation 1) — both forms in technical-audit-run
grep -Rc "'technical-audit\.complete'" inngest/functions/technical-audit-run.ts        # → ≥1
grep -Rc "'technical-audit/complete'" inngest/functions/technical-audit-run.ts         # → ≥1
# run-comparison-prompts on audit/complete; reads competitors
grep -Rc "'audit/complete'" inngest/functions/run-comparison-prompts.ts                # → ≥1
grep -Rc "competitors" inngest/functions/run-comparison-prompts.ts                     # → ≥1
# step.run per turn with stable naming + concurrency
grep -Rc "step.run(" inngest/functions/run-journey.ts                                  # → ≥1
grep -RcE "concurrency:\s*\{\s*limit:\s*3" inngest/functions/run-journey.ts inngest/functions/run-comparison-prompts.ts  # → ≥2
# isEngineEnabled provider-mapped gate
grep -Rc "isEngineEnabled" inngest/functions/run-journey.ts inngest/functions/run-comparison-prompts.ts  # → ≥2
grep -Rc "ENGINE_TO_PROVIDER\|chatgpt:.*openai" inngest/functions/run-journey.ts inngest/functions/run-comparison-prompts.ts  # → ≥1
# crawler reuse (Obligation 2 — NOT a second crawler)
grep -REc "new (PlaywrightCrawler|chromium)" lib/conversational/ inngest/functions/run-journey.ts  # → 0
# tier gates: journeys Agency+, comparisons Growth+
grep -Rc "Agency" app/api/brands/\[id\]/journeys/route.ts                              # → ≥1
grep -Rc "Growth\|growth" app/api/brands/\[id\]/comparisons/route.ts                   # → ≥1
# no hardcoded model; LLMService used
grep -RnE "'claude-3|'gpt-4|'gemini-" lib/conversational/                              # → 0
grep -Rc "LLMService" lib/conversational/                                              # → ≥1
# setRlsContext on a protected route
grep -Rc "setRlsContext" app/api/brands/\[id\]/journeys/route.ts                       # → ≥1
# 2 new functions registered (running total 25)
grep -cE "runJourney|runComparisonPrompts" app/api/webhooks/inngest/route.ts                    # → 2
# UI: no hex-alpha; RESPONSIVE
grep -REc "var\(--[a-z-]+\)[0-9a-fA-F]{2}" components/domain/discovery/                 # → 0
grep -RcE "md:grid-cols|sm:" app/\(auth\)/brands/\[brandId\]/discovery/                 # → ≥1
grep -Rc "Clerk\|@clerk" lib/conversational/ db/ app/api/brands/                       # → 0
```

## 13. COMMON PITFALLS / SPRINT 7 ANTI-PATTERNS
- **Forgetting the dual-emit (Obligation 1).** If technical-audit-run emits only the dot (or only
  the slash), three S5/S6 functions never fire — the whole entity-score / agent-readiness /
  entity-home chain stays dormant. Emit BOTH; dot in VALID_EVENTS.
- **Rebuilding technical-audit-run or the crawler.** technical-audit-run is Phase 1 — only ADD the
  emit. The crawler is one shared lib/crawler/index.ts (S6 built it) — REUSE, don't fork.
- **Running journey turns in isolation.** A journey is multi-turn — journey-runner must carry
  conversation context across turns (turn 2 sees turn 1), not fire independent prompts.
- **Dynamic/unstable step names, or persisting outside the step.** Use stable
  `turn-${i}-${engine}` names and write the turn result inside the step closure, or an Inngest
  retry restarts all 20 LLM calls (quota waste, SN-01).
- **Missing the isEngineEnabled provider mapping.** isEngineEnabled takes PROVIDER names
  (openai/anthropic/google/perplexity), not engine names — map first; keep Engine names for the
  `engine` column.
- **Mis-gating the tiers.** Journey UX + journey API = Agency+ (v8.19 regating); comparison =
  Growth+. The journey DATA MODEL + Inngest functions are built in full regardless of the UX gate.
- **journey_id / audit_id without ON DELETE CASCADE.** Both are CASCADE (journey_id is NOT NULL
  so SET NULL is impossible; audit_id CASCADE so audit-data-retention can purge without FK
  violation).
- **Treating brand_won as NOT NULL.** It's nullable — a comparison prompt can be inconclusive.
- **prompt_sequence as `any` or unbounded.** Typed JourneyTurn[], Zod min(2).max(8).
- **Forgetting S3's benchmark.** run-comparison-prompts writing comparison_prompt_results is what
  resolves S3's CPR-01 "Coming soon" card to the real comparison view — verify that path.
- **Missing setRlsContext / cross-org not 404 / hardcoded model / RLS / MI-01 guards.**

## 14. HANDOFF TO SPRINT 8
After Sprint 7: journeys + comparison run, the S3 Competitive Benchmark is complete (real
comparison data), and **all 25 Inngest functions are live** (the dual-emit lit up the last S5/S6
dependencies). **Sprint 8 (Governance Intelligence, Layer 7)** creates tables 35–38 (audit_trail,
org_members, data_residency_log, org_feature_flags) — team RBAC, audit logging, data residency,
feature flags — and builds **fanout-webhooks**, which consumes the events S5/S6/S4 already emit
(`hallucination/detected`, `agent/readiness-scored`, `report/generated`, plus
`visibility/trend-updated`) and maps them to external `*.detected`/`*.scored`/`*.generated`
webhooks. Sprint 8 requires: S1 services, the Phase 1 org/auth model, and the emitting functions
from S4/S5/S6 (all now in place). Sprint 9 (Autopilot UX) then builds the visible end-to-end loop
with no new tables.

## CHANGELOG
- v1.0 — Initial Sprint 7 prompt, generated single-pass against verified LLD v8.67
  (REVIEWED-r2). Schema/Inngest/lib/route detail cited to LLD ~7457–7720 + ~9032; UI to
  prototype DiscoveryHub (2944); conventions from master plan §7. §1 module list is the complete
  enumeration of the §4 tree (per the S3-01 lesson). Discharges the two cross-sprint obligations:
  the technical-audit-run dual-emit (lights up S5/S6's dormant listeners) and the shared-crawler
  reuse (S6 built it); completes the S3 Competitive Benchmark via run-comparison-prompts. Final
  serve() count reaches 25. Tier gating per v8.19 (journeys Agency+ UX, comparison Growth+).
  Awaiting Gate 2.
