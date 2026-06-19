# VisibleAU Phase 2 — SPRINT 8 PROMPT: Governance Intelligence
# Version: 1.0 | Built against: LLD v8.67 (REVIEWED-r2) | Sprint: 8 of 9 | 3 weeks
# Source anchors (r2/v8.67): Sprint 8 plan (~9038), Layer 7 §"GOVERNANCE INTELLIGENCE" (~8493),
# tables audit_trail 8507, org_members 8545, data_residency_log 8599, org_feature_flags 8647;
# the fanout-webhooks WH-01 extension (~3850); audit_trail Phase 2 actions (AT-01, ~8512);
# the 3-layer auth model + RBAC matrix (~8533); the residency UPSERT (DR-01/DR-02, ~8620);
# MI-01 (~8700), RLS (~8684); prototype TeamManagement 2800, DataResidency 3034. NOTE: line
# numbers are navigational — open the region; the LLD wins.

> HOW TO USE: read §0, then paste §10 into a fresh Claude Code session on the VisibleAU
> repo. §1–§9 are the spec; §11–§14 are tests/acceptance/pitfalls/handoff. When this prompt
> and the LLD disagree, THE LLD WINS and this prompt is the bug.
>
> ⚠️ READ §0.6 OPEN QUESTIONS FIRST — one item (local_seo_results) needs Sri's decision before
> the local_ai_trust_score dependency from Sprint 6 can be closed. It does NOT block the
> governance build.

---

## 0. READ FIRST — CONTEXT & CONVENTIONS

### 0.1 What Sprint 8 is
**Governance Intelligence (Layer 7)** — the org-admin layer: full audit trail of user actions,
team RBAC with brand-scoped access + an invitation lifecycle, data-residency disclosure, and
per-org feature flags. It also discharges **the #1 cross-sprint payoff: the fanout-webhooks
extension** — wiring the five Phase 2 internal slash-events (already emitted by S3–S6 + the S5
acknowledge API) into the outbound webhook delivery so customers who subscribed to them
actually receive deliveries (today they're "configurable-but-undeliverable"). (LLD 9038–9042.)

### 0.2 Prerequisites & the cross-sprint contracts (required this sprint)
Sprints 1–7 merged. S8 reads Phase 1's Better Auth org sessions + `users.role` + the existing
`fanout-webhooks.ts` + `webhook_deliveries` + `VALID_EVENTS`. Two contracts to honour:
- **THE fanout-webhooks EXTENSION (the #1 risk — WH-01, LLD 3850):** `fanout-webhooks.ts` is a
  **Phase 1 Sprint 8** function that currently triggers on only 3 internal events
  (`audit/complete`, `drift/detected`, `recommendation/created`) and maps 3 external events. The
  five Phase 2 events are already in the `VALID_EVENTS` Zod enum (so customers can subscribe),
  but fanout never fires for them. S8 must **extend BOTH the trigger array AND the
  deliveryEventName map** (§8.1) so they deliver. This is the mirror of S7's dual-emit: the
  producers (S3–S6) emit; S8 is the consumer that completes the chain.
- **`local_seo_results` (the S6 dependency — see §0.6 OPEN QUESTION):** S6's
  local_ai_trust_score was set to NULL until this table exists (S6b-02). The master plan + Layer
  7 scope this sprint as governance-only and the canon has **no CREATE TABLE for
  local_seo_results** — so its schema + writer are an OPEN QUESTION for Sri, not a silent build
  decision (§0.6).

### 0.3 Verify you are on the right LLD before starting
```bash
grep -m1 "^# Version:" visibleau-7layer-lld.md          # → # Version: 8.67 (or 8.66/8.65 — all valid) | Date: June 2026
grep -cE "ATTRIBUTION CORRECT(ED IN CROSS-REVIEW|ION)" visibleau-7layer-lld.md   # → ≥1
```
Canon is `visibleau-phase2-v8.67-complete-REVIEWED` (v8.66 / v8.65 r2 also valid). If the
version is below 8.65 or the marker count is 0, STOP — stale LLD.

### 0.4 SHARED CONVENTIONS (binding; from master plan §7)
- **Better Auth** canonical; **zero Clerk**. Page routes `[brandId]`; API routes `[id]`.
- **`subscriptions.tier`**, never `organizations.tier`.
- **MI-01 migration idempotency (v8.29):** whole migration re-runnable — `CREATE TABLE IF NOT
  EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS "<name>" ON <table>;` before
  each `CREATE POLICY`.
- **RLS** USING + WITH CHECK on every tenant table (all 4 new tables carry organization_id →
  all get RLS), MI-01 DROP POLICY guard. setRlsContext on every protected route; cross-org → 404.
- `LLM_MODE=mock` in all tests (no LLM calls this sprint, but keep the harness flag).
- **THREE auth/membership layers (DESIGN NOTE, LLD 8533) — do NOT conflate:** (1) Better Auth
  `auth_members` (org membership, library-managed — never write directly); (2) Phase 1
  `users.role` ('owner'|'admin'|'member', org-level, synced from Better Auth — unchanged); (3)
  Phase 2 `org_members` (this sprint — brand-scoped access ON TOP, FKs to our internal `users`
  mirror, NOT auth_members). **Permission check order: Better Auth session → users.role
  (org-level) → org_members (brand-level).**
- **UI** token-driven (dark + `[data-theme="light"]`; `color-mix` for faint fills, RT-01;
  `--focus-ring`/`--elevation`; `tabular-nums`; ARIA per FIX 13; reduced-motion reset from S2).

### 0.5 The structural rules + enums Sprint 8 introduces (copy EXACTLY)
- **audit_trail.action** = the Phase 1 set + the **Phase 2 additions (AT-01, LLD 8512):**
  draft_approved, draft_dismissed, journey_triggered, hallucination_acknowledged,
  feature_flag_changed, data_residency_accessed, competitive_benchmark_viewed. `resource_type`
  Phase 2 set: content_draft | journey | hallucination_incident | feature_flag |
  competitive_benchmark. user_id is **nullable** (system actions). Index
  `audit_trail_org_idx (organization_id, created_at DESC)`.
- **org_members.role** = owner | admin | analyst | viewer — the **RBAC matrix is authoritative
  (LLD 8556):** Run audit (owner/admin/analyst); Approve drafts (owner/admin); Generate reports
  (owner/admin/analyst); Invite members (owner/admin); Delete brand (owner only); View reports
  (all). `brand_access` JSONB: **null = all brands; or [brandId,…]** for restricted. The
  invitation lifecycle (IT-01/IC-01, LLD 8576): `invitation_token` nanoid(21), single-use
  (cleared to NULL on accept); cancel = `DELETE … WHERE id=$memberId AND accepted_at IS NULL`
  (never delete accepted members via cancel — use role-change / is_active=false). `UNIQUE(
  organization_id, user_id)`.
- **data_residency_log is a DECLARATIVE UPSERT, not an event log (DR-01, LLD 8620).**
  `UNIQUE(organization_id, data_type)`; one row per data_class per org, written by
  `lib/governance/record-data-residency.ts` (called on org provisioning + idempotent on the
  nightly governance cron) UPSERTing a **static RESIDENCY config map** (the data_type →
  storage_region/provider/retention_period/encryption_status rows in LLD 8625). Without the
  writer the residency page returns empty (the DR-01 bug). retention_period values must mirror
  the audit-data-retention windows (audit_data/evidence/pdf = 12mo, llm_cache = 30d,
  crawler_logs = 90d — DR-02).
- **org_feature_flags** = `UNIQUE(organization_id, flag_key)`; the **canonical flag_key set
  (LLD 8660):** free_tier_enabled, growth_tier_early_access, agency_tier_early_access,
  fan_out_enabled, linkedin_audit_enabled, youtube_audit_enabled, evidence_archive_enabled,
  google_ai_mode_enabled. **Operator-set only** (set_by = 'ops'|'sri'; NEVER a user-facing API).
  **Priority order: org_feature_flags (DB) > env vars > hardcoded defaults** — extend Phase 1's
  `lib/feature-flags/index.ts` to check org_feature_flags FIRST.

### 0.6 OPEN QUESTIONS (resolve with Sri before building the affected part)
**OQ-1 — `local_seo_results` has no schema in canon, but S6's local_ai_trust_score depends on
it.** The Sprint 6 prompt set `local_ai_trust_score = NULL` until `local_seo_results` exists
(finding S6b-02), and the local_ai_trust_score formula (LLD 5488) reads
`local_seo_results.gmb_completeness_score` (×0.25) + `local_seo_results.nap_consistency_score`
(×0.20). But: (a) the canon has **no `CREATE TABLE local_seo_results`** anywhere; (b) the master
plan + Layer 7 + the Sprint 8 plan entry scope this sprint as **governance-only (tables 35–38)**
— no local-SEO mention; (c) the only artifacts are a prose "Sprint 8" tag (LLD 3822), two
referenced columns, and two lib filenames (`lib/local-seo/gmb-check.ts`,
`lib/local-seo/directory-check.ts`). **This is under-specified — do NOT invent a schema.** Ask
Sri to decide: (i) define `local_seo_results` (columns incl gmb_completeness_score 0–100,
nap_consistency_score 0–100, directory/suburb JSONB; a writer — likely a `run-local-seo` Inngest
function or an audit-pipeline pass; tier gate; retention) and build it in this sprint as a 5th
table; OR (ii) defer it to a later/dedicated local-SEO sprint, in which case S6's
local_ai_trust_score stays NULL as designed. Until resolved, this prompt builds **only the four
governance tables**; the local-SEO piece is flagged, not assumed. (An LLD addition is needed
either way to give local_seo_results a real DDL.)

---

## 1. WHAT SHIPS THIS SPRINT
- 4 new tables (§5): audit_trail (#35), org_members (#36), data_residency_log (#37),
  org_feature_flags (#38) + their indexes. (NOT local_seo_results — see §0.6 OQ-1.)
- The **fanout-webhooks extension** (§8.1) — the trigger-array + deliveryEventName-map additions
  for the 5 Phase 2 webhook events, plus ensuring each source function emits its internal
  slash-event with `{ organizationId }` (the producers were built in S3–S6; verify the emits).
- 1 declarative seed/writer (§5.5): `record-data-residency.ts` UPSERTing the static RESIDENCY
  map (the DR-01 writer).
- 4 lib modules (§6) under `lib/governance/` + the `lib/feature-flags/index.ts` extension.
- 3 settings screens (§6U) + the audit-trail viewer.
- API routes (§9): audit-trail, members (list/invite/update/delete + accept), data-residency,
  feature-flags.
- **GAP coverage:** none new; this is the governance + webhook-delivery completion layer.

---

## 2. DEPENDENCIES TO INSTALL
`nanoid` (invitation tokens — confirm Phase 1 already has it; reuse). No other new runtime
packages.

## 3. ENVIRONMENT VARIABLES (additions)
None new. Feature flags read the existing Phase 1 `FREE_TIER_ENABLED_*` env vars (now
overridden by org_feature_flags per §0.5). Invitation emails use the existing Resend singleton.

---

## 4. PROJECT STRUCTURE ADDITIONS
Every file below is specified in §5–§9 / §6U. No file appears without a spec.
```
db/
├── schema/
│   ├── audit-trail.ts · org-members.ts · data-residency-log.ts · org-feature-flags.ts
│   └── (phase2-governance.ts barrel group)        // + add to db/schema/index.ts
├── migrations/
│   └── 00NN_phase2_sprint8_governance.sql         // 4 CREATEs (IF NOT EXISTS) + indexes + RLS
└── seed/  (none — residency is a runtime UPSERT, §5.5, not a seed file)

lib/governance/
├── audit-trail.ts        // §6.1 record significant user actions
├── access-control.ts     // §6.2 RBAC + brand-scoped permission checks (the 3-layer model)
├── feature-flags.ts      // §6.3 per-org flag resolution
├── data-residency.ts · record-data-residency.ts   // §6.4 declarations + the DR-01 UPSERT writer
└── index.ts
lib/feature-flags/index.ts   // EDIT Phase 1: check org_feature_flags FIRST (§0.5 priority order)

inngest/functions/fanout-webhooks.ts   // §8.1 EDIT Phase 1: extend trigger array + deliveryEventName map

app/(auth)/settings/
├── team/page.tsx             // Member management (§6U.2)
├── audit-trail/page.tsx      // Action history (§6U.3)
└── data-residency/page.tsx   // Storage transparency (§6U.4)
components/domain/governance/
├── member-row.tsx · role-badge.tsx · invite-form.tsx · audit-log-row.tsx · residency-table.tsx

app/api/organizations/[id]/audit-trail/route.ts
app/api/organizations/[id]/members/route.ts · members/invite/route.ts
app/api/organizations/[id]/members/[memberId]/route.ts · members/accept/route.ts
app/api/organizations/[id]/data-residency/route.ts · feature-flags/route.ts

tests/phase2/sprint8/  (§11)
```

---

## 5. DATABASE SCHEMA ADDITIONS

Copy each definition VERBATIM from the LLD (anchors inline). Apply **MI-01** to the migration.
**Build only these four tables** — local_seo_results is OQ-1 (§0.6), not part of this build.

### 5.1 audit_trail (#35, LLD 8507)
`organization_id` NOT NULL FK; `user_id` REFERENCES users(id) **nullable** (system actions);
`action` TEXT NOT NULL (the Phase 1 + Phase 2 AT-01 set, §0.5); `resource_type` TEXT NOT NULL;
`resource_id` TEXT; `metadata` JSONB; `ip_address`/`user_agent` TEXT; `created_at`. Index
`audit_trail_org_idx (organization_id, created_at DESC)`. Append-only log (no UNIQUE).

### 5.2 org_members (#36, LLD 8545) — brand-scoped RBAC + invite lifecycle
`organization_id` + `user_id` NOT NULL FKs to **users** (our mirror, not auth_members); `role`
(4-value enum §0.5); `brand_access` JSONB (null = all brands); `invited_by` FK; `invited_at`;
`accepted_at`; `invitation_token` TEXT UNIQUE (nanoid(21), single-use → NULL on accept);
`is_active` BOOLEAN NOT NULL DEFAULT true; `updated_at`; **`UNIQUE(organization_id, user_id)`**.
Implement the invitation flow + cancellation rule exactly (§0.5 / LLD 8576).

### 5.3 data_residency_log (#37, LLD 8599) — declarative UPSERT
`organization_id` NOT NULL FK; `data_type` TEXT NOT NULL; `storage_region` TEXT NOT NULL;
`provider` TEXT NOT NULL; `retention_period` TEXT NOT NULL DEFAULT '12 months';
`encryption_status` TEXT NOT NULL DEFAULT 'AES-256 at rest, TLS 1.3 in transit'; `recorded_at`;
**`UNIQUE(organization_id, data_type)`** (enables the DR-01 UPSERT). The writer is §5.5/§6.4.

### 5.4 org_feature_flags (#38, LLD 8647)
`organization_id` NOT NULL FK; `flag_key` TEXT NOT NULL (the canonical set §0.5); `is_enabled`
BOOLEAN NOT NULL; `reason`/`set_by` TEXT; `expires_at` TIMESTAMPTZ; `created_at`/`updated_at`;
**`UNIQUE(organization_id, flag_key)`**.

### 5.5 The residency writer (MANDATORY) — lib/governance/record-data-residency.ts (DR-01, LLD 8620)
NOT a seed file — a runtime UPSERT. UPSERTs the static RESIDENCY config map (the data_type rows
in LLD 8625, each with storage_region/provider/retention_period/encryption_status) ON CONFLICT
(organization_id, data_type) DO UPDATE. Called on org provisioning + idempotently on the nightly
governance cron. Without it, GET …/data-residency returns empty.

### 5.6 RLS + barrel exports
All 4 tables carry organization_id → enable RLS with USING + WITH CHECK on organization_id,
MI-01 DROP POLICY guard. **Add the `phase2-governance` barrel exports to `db/schema/index.ts`**
(the breaking-build class — every new table must be exported or TS imports fail).

---

## 6. LIB MODULES (LLD 8693)

### 6.1 audit-trail.ts
`recordAction({ organizationId, userId, action, resourceType, resourceId, metadata, ip,
userAgent })` → INSERT audit_trail. Call it from every Phase 2 user-facing action listed in
§0.5 (draft approve/dismiss, journey trigger, hallucination acknowledge, flag change, residency
page view, competitive-benchmark view). action + resource_type from the §0.5 enums.

### 6.2 access-control.ts — the 3-layer RBAC (LLD 8533)
`canPerform(user, org, brandId, action)`: check **Better Auth session → users.role (org-level)
→ org_members (brand-level)** in that order; enforce the §0.5 RBAC matrix; honour brand_access
(null = all brands; array = restricted). This is the gate every protected route + the UI uses.

### 6.3 feature-flags.ts + the Phase 1 lib/feature-flags/index.ts edit
Per-org flag resolution with the **priority order org_feature_flags (DB) > env > defaults**
(§0.5). Extend the Phase 1 `lib/feature-flags/index.ts` so its existing env-flag checks consult
org_feature_flags FIRST (e.g. `isEngineEnabled`, `FREE_TIER_ENABLED_*`). Flags are read widely
(Sprint 7's run-journey/run-comparison engine-gate, the tier teasers) — don't break those.

### 6.4 data-residency.ts + record-data-residency.ts (§5.5)
data-residency.ts reads the per-org rows for the GET route; record-data-residency.ts is the
DR-01 UPSERT writer (§5.5).

---

## 6U. UI SPECIFICATION

GLOBAL UI RULES (per S2 §6U): tokens only; `color-mix` faint fills (RT-01); `--focus-ring` +
`--elevation`; `tabular-nums`; ARIA per FIX 13; reduced-motion reset from S2. Each screen has a
STATES matrix + a `RESPONSIVE:` line. Shared foundation exists from S2 — consume it. These are
`settings/` screens (org-level), gated by users.role/org_members (owner/admin for management;
analyst/viewer read-only per the matrix).

### 6U.2 Team — settings/team/page.tsx (prototype TeamManagement 2800)
member-row.tsx (name/email/role-badge/brand-access/joined) + role-badge.tsx (owner=governance,
admin=blue, analyst=workflow, viewer=secondary) + invite-form.tsx (email + role + brand_access
picker) + a pending-invites section. Invite/role-change/remove gated to owner/admin (the matrix);
analyst/viewer see read-only.
STATES — loading: row skeletons; empty (solo owner): just the owner row; pending invites: a
distinct section; error: boundary; permission-denied (analyst/viewer): controls hidden/disabled.
**RESPONSIVE:** member rows reflow to stacked cards on `<md`; the invite form is single-column.

### 6U.3 Audit trail — settings/audit-trail/page.tsx
audit-log-row.tsx: action + resource_type + actor (user or "system" when user_id null) +
timestamp (tabular-nums) + metadata expand. Paginated (the org_idx supports created_at DESC).
Viewing this page itself records `data_residency_accessed`? No — it records nothing special;
the competitive-benchmark + residency views are the audited ones (§0.5).
STATES — loading: row skeletons; empty (new org): EmptyState "No activity yet"; error: boundary.
**RESPONSIVE:** log rows reflow to cards on `<md`; the metadata expands inline.

### 6U.4 Data residency — settings/data-residency/page.tsx (prototype DataResidency 3034)
residency-table.tsx: data_type → storage_region + provider + retention_period + encryption_status
(the GV-2 columns, DR-02). A transparency disclosure ("where does your data live?"). Viewing
records the `data_residency_accessed` action (§0.5).
STATES — loading: skeleton; empty (writer not yet run): should not happen if record-data-residency
ran on provisioning — but show a graceful "Residency information loading" rather than blank;
error: boundary.
**RESPONSIVE:** the residency table scrolls horizontally on `<sm`; columns stack to a definition
list on the narrowest widths.

---

## 7. (No CLI changes this sprint.)

## 8. INNGEST / WEBHOOK WIRING

### 8.1 fanout-webhooks.ts (LLD 3850) — EDIT the Phase 1 function: THE WH-01 EXTENSION
This is the sprint's #1 deliverable. fanout-webhooks currently triggers on `audit/complete`,
`drift/detected`, `recommendation/created` and maps 3 external events. **Extend BOTH:**
- **Trigger array** += `{ event: 'report/generated' }`, `{ event: 'hallucination/detected' }`,
  `{ event: 'hallucination/acknowledged' }`, `{ event: 'visibility/trend-updated' }`,
  `{ event: 'agent/readiness-scored' }`.
- **deliveryEventName map** += (internal slash → external dot):
  `'report/generated'` → `'report.generated'` (emitted by generate-narrative-report, S4);
  `'hallucination/detected'` → `'hallucination.detected'` (detect-hallucinations, S5, per incident);
  `'hallucination/acknowledged'` → `'hallucination.acknowledged'` (the PATCH …/hallucinations/[id]
  acknowledge API, S5 — emit on is_acknowledged=true);
  `'visibility/trend-updated'` → `'visibility.trend.updated'` (aggregate-visibility-trend, S3, per brand row);
  `'agent/readiness-scored'` → `'agent.readiness.scored'` (score-agent-readiness, S6).
- **Verify the producers emit:** S3–S6 functions were built to emit these (S5 detect-hallucinations,
  S6 score-agent-readiness, S4 generate-narrative-report); S3's aggregate-visibility-trend emits
  `visibility/trend-updated`; the S5 acknowledge API must emit `hallucination/acknowledged`. Each
  emit carries `{ organizationId }` in event.data (fanout reads it to scope endpoints + RLS).
  Internal events keep the slash delimiter; external keep dots. All 5 are already in VALID_EVENTS
  (so subscription works); without this extension they're configurable-but-undeliverable.
- **RETRY/IDEMPOTENCY (Performance/Scalability — apply, per the S7-pass-2 theme):** Inngest
  delivers at-least-once and retries failed steps. A retried webhook delivery MUST NOT double-POST
  the customer's endpoint — dedup via `webhook_deliveries` (the existing delivery log;
  endpointId + the internal event id / an idempotency key) so a replay is a no-op, and wrap each
  endpoint POST in its own `step.run()` so a partial failure replays only the un-delivered ones.

**serve():** fanout-webhooks is already registered (Phase 1) — no new function this sprint, just
the extension. (Phase 2 Inngest total remains 25/25.)

---

## 9. API ROUTES (LLD 8678) — `[id]` params; Better Auth + setRlsContext + access-control; cross-org → 404
- `GET /api/organizations/[id]/audit-trail` — action history (paginated; owner/admin/analyst).
- `GET …/members` — team list + roles.
- `POST …/members/invite` — invite (owner/admin; nanoid(21) token; Resend email; row with
  accepted_at NULL, is_active false).
- `PATCH …/members/[memberId]` — update role / brand_access (owner/admin).
- `DELETE …/members/[memberId]` — remove (owner/admin; the IC-01 cancel rule: only delete
  unaccepted rows via the cancel path; accepted members → is_active=false).
- `GET …/members/accept?token=…` — validate the nanoid token, set accepted_at=now(),
  is_active=true, clear the token.
- `GET …/data-residency` — the per-org declarations (records `data_residency_accessed`).
- `GET …/feature-flags` — current resolved flags (read-only; flags are operator-set, never via API).
Every route: Better Auth session + setRlsContext + access-control (§6.2) + the RBAC matrix; Zod;
correct codes; cross-org → 404. **Call audit-trail.recordAction on the audited Phase 2 actions.**

---

## 10. CLAUDE CODE PROMPT (paste this to open Sprint 8)

> You are implementing **VisibleAU Phase 2 — Sprint 8: Governance Intelligence** (Layer 7:
> audit trail, team RBAC, data residency, feature flags) — and the fanout-webhooks extension
> that finally delivers the 5 Phase 2 webhook events. Sprints 1–7 are merged. Authority:
> `visibleau-7layer-lld.md` v8.67, Layer 7 "GOVERNANCE INTELLIGENCE" (~8493) and the Sprint 8
> plan (~9038). Where this prompt and the LLD differ, the LLD wins.
>
> ⚠️ FIRST: read §0.6 OQ-1. Do NOT build or invent a `local_seo_results` table — it has no
> schema in canon and is an open question for Sri. Build ONLY the four governance tables.
>
> Build, in order:
> 1. Drizzle schemas + an MI-01-idempotent migration for the 4 governance tables (§5): CREATE
>    TABLE IF NOT EXISTS ×4, the indexes, DROP POLICY IF EXISTS before each CREATE POLICY, RLS
>    on all 4. Add the phase2-governance barrel exports to db/schema/index.ts. CRITICAL:
>    audit_trail.user_id nullable (system actions) + the Phase 2 action/resource_type enums;
>    org_members FKs to our users mirror (NOT auth_members), role enum owner/admin/analyst/viewer,
>    brand_access JSONB (null=all), invitation_token nanoid(21) single-use, UNIQUE(org,user);
>    data_residency_log UNIQUE(org,data_type) for the declarative UPSERT; org_feature_flags
>    UNIQUE(org,flag_key), operator-set only.
> 2. The 4 lib/governance modules (§6) + the residency writer: audit-trail.recordAction;
>    access-control with the 3-LAYER permission model (Better Auth session → users.role →
>    org_members) and the RBAC matrix; feature-flags with priority org_feature_flags > env >
>    defaults (and EDIT Phase 1 lib/feature-flags/index.ts to check the DB first — don't break
>    S7's engine-gate or the tier teasers); record-data-residency.ts UPSERTing the static
>    RESIDENCY map (DR-01 — without it the residency page is empty).
> 3. **THE fanout-webhooks EXTENSION (§8.1 — the #1 deliverable):** EDIT the Phase 1
>    fanout-webhooks.ts to add the 5 Phase 2 events to BOTH the trigger array AND the
>    deliveryEventName map (report/generated→report.generated, hallucination/detected→
>    hallucination.detected, hallucination/acknowledged→hallucination.acknowledged,
>    visibility/trend-updated→visibility.trend.updated, agent/readiness-scored→
>    agent.readiness.scored). Verify each producer emits its slash event with { organizationId }
>    (S3 aggregate-visibility-trend, S4 generate-narrative-report, S5 detect-hallucinations + the
>    acknowledge API, S6 score-agent-readiness). Add retry-idempotency: dedup via
>    webhook_deliveries so a retried delivery doesn't double-POST, and step.run() per endpoint POST.
> 4. The 3 settings screens (§6U) + 5 components: Team management (member rows, role badges,
>    invite form, pending invites — owner/admin gated), Audit trail (paginated log, "system" for
>    null user_id), Data residency (the GV-2 transparency table; viewing records
>    data_residency_accessed). Both themes; STATES + RESPONSIVE per screen; ARIA per FIX 13.
> 5. The API routes (§9): [id] params, Better Auth + setRlsContext + access-control + the RBAC
>    matrix, the invitation accept/cancel rules (IC-01), Zod, cross-org → 404, and call
>    audit-trail.recordAction on the audited Phase 2 actions.
>
> Constraints: TS strict, no `any`. LLM_MODE=mock in tests. subscriptions.tier (never
> organizations.tier). Run §12 greps + §11 tests and report. Surface OQ-1 (local_seo_results)
> to Sri rather than guessing.

---

## 11. TESTS REQUIRED (LLM_MODE=mock)
- `access-control.test.ts` — the 3-layer order (session → users.role → org_members); the RBAC
  matrix per role (analyst can run audits but not approve drafts; viewer read-only; only owner
  deletes a brand); brand_access null = all, array = restricted.
- `audit-trail.test.ts` — recordAction writes the right action/resource_type; system actions
  (null user_id) allowed; the 7 Phase 2 actions covered.
- `org-members-invite.test.ts` — invite creates a row (accepted_at NULL, is_active false,
  nanoid(21) token); accept sets accepted_at + is_active + clears the token; cancel deletes only
  unaccepted rows (IC-01); UNIQUE(org,user) enforced.
- `feature-flags.test.ts` — priority org_feature_flags > env > default; an org override beats a
  false env flag; flags are operator-set (no user-facing write path).
- `data-residency.test.ts` — record-data-residency UPSERTs the static map; re-run is idempotent
  (no dup rows; UNIQUE(org,data_type)); retention_period values mirror the retention windows.
- `fanout-webhooks.test.ts` — the 5 Phase 2 internal events each map to the correct external
  event; a subscribed customer endpoint receives a delivery for each; a retried delivery does
  NOT double-POST (webhook_deliveries dedup); { organizationId } scopes the endpoints.
- `governance-rls.test.ts` — cross-org reads blocked on all 4 tables; protected routes call
  setRlsContext; cross-org → 404.

## 12. VERIFICATION GREPS
```bash
grep -c "CREATE TABLE IF NOT EXISTS" db/migrations/*sprint8_governance.sql            # → 4
grep -c "DROP POLICY IF EXISTS" db/migrations/*sprint8_governance.sql                 # → 4
# barrel export added
grep -Rc "phase2-governance" db/schema/index.ts                                       # → ≥1
# org_members FKs to our users mirror, NOT auth_members
grep -Rc "auth_members" db/schema/org-members.ts                                      # → 0
# UNIQUE constraints for the UPSERT/identity tables
grep -cE "UNIQUE\(organization_id, user_id\)|UNIQUE\(organization_id, data_type\)|UNIQUE\(organization_id, flag_key\)" db/migrations/*sprint8_governance.sql  # → 3
# THE fanout-webhooks extension: all 5 internal slash events + the 5 external dot maps
grep -REc "report/generated|hallucination/detected|hallucination/acknowledged|visibility/trend-updated|agent/readiness-scored" inngest/functions/fanout-webhooks.ts  # → ≥5
grep -REc "report.generated|hallucination.detected|hallucination.acknowledged|visibility.trend.updated|agent.readiness.scored" inngest/functions/fanout-webhooks.ts  # → ≥5
# fanout retry-idempotency (no double-POST) + per-endpoint step
grep -Rc "webhook_deliveries" inngest/functions/fanout-webhooks.ts                    # → ≥1
grep -Rc "step.run(" inngest/functions/fanout-webhooks.ts                             # → ≥1
# the 3-layer RBAC + matrix
grep -Rc "users.role\|org_members" lib/governance/access-control.ts                   # → ≥1
# feature-flag priority: Phase 1 lib edited to check the DB first
grep -Rc "org_feature_flags\|orgFeatureFlags" lib/feature-flags/index.ts              # → ≥1
# the DR-01 residency writer (UPSERT)
grep -Rc "ON CONFLICT (organization_id, data_type)\|onConflict" lib/governance/record-data-residency.ts  # → ≥1
# invitation token single-use + IC-01 cancel
grep -Rc "nanoid(21)\|invitation_token" lib/governance/ app/api/organizations/\[id\]/members/  # → ≥1
# audit-trail.recordAction wired on an audited action (spot-check the acknowledge or benchmark route)
grep -Rc "recordAction" app/api/                                                       # → ≥1
# NO local_seo_results table built (OQ-1)
test ! -e db/schema/local-seo-results.ts && echo "OQ-1 respected: local_seo_results not built"
# UI no hex-alpha; RESPONSIVE; setRlsContext; no Clerk
grep -REc "var\(--[a-z-]+\)[0-9a-fA-F]{2}" components/domain/governance/               # → 0
grep -RcE "md:|sm:|lg:" app/\(auth\)/settings/                                         # → ≥1
grep -Rc "setRlsContext" app/api/organizations/\[id\]/audit-trail/route.ts             # → ≥1
grep -Rc "Clerk\|@clerk" lib/governance/ db/ app/api/organizations/                    # → 0
```

## 13. COMMON PITFALLS / SPRINT 8 ANTI-PATTERNS
- **Inventing a local_seo_results schema (OQ-1).** It has no canon DDL — flag it to Sri, build
  only the 4 governance tables. S6's local_ai_trust_score stays NULL until Sri resolves it.
- **The fanout-webhooks extension half-done.** You must extend BOTH the trigger array AND the
  deliveryEventName map (5 each) AND verify each producer emits its slash event with
  { organizationId } — declaring in VALID_EVENTS alone makes events configurable-but-undeliverable.
- **fanout double-POSTing on retry.** Inngest is at-least-once — dedup via webhook_deliveries and
  step.run() per endpoint so a retry is a no-op.
- **Writing to Better Auth's auth_members.** org_members is a SEPARATE brand-scoped layer FK'd to
  our users mirror; never write auth_members directly. Permission order: session → users.role →
  org_members.
- **A user-facing feature-flag write path.** org_feature_flags are operator-set only (set_by
  ops/sri); the API is read-only.
- **Forgetting the feature-flag priority edit.** lib/feature-flags/index.ts must check
  org_feature_flags (DB) BEFORE env vars — without it the per-org overrides do nothing, and
  S7's engine-gate keeps reading env only.
- **Missing the DR-01 residency writer.** data_residency_log needs record-data-residency.ts
  UPSERTing the static map, or the residency page is permanently empty.
- **Deleting accepted members via the cancel path.** IC-01: DELETE only WHERE accepted_at IS
  NULL; accepted members → is_active=false / role-change.
- **Not recording audit_trail actions.** The 7 Phase 2 actions (draft approve/dismiss, journey
  trigger, hallucination acknowledge, flag change, residency view, benchmark view) must call
  recordAction.
- **Missing RLS / setRlsContext / cross-org 404**, or the MI-01 idempotency guards, or the
  barrel exports (TS build breaks).

## 14. HANDOFF TO SPRINT 9
After Sprint 8: governance is live (audit trail, RBAC, residency, flags) and — critically —
**every Phase 2 webhook event now delivers** (the fanout extension completed the producer→
consumer chain S3–S7 set up). The OPEN QUESTION OQ-1 (local_seo_results) is pending Sri's
decision; if deferred, S6's local_ai_trust_score remains NULL by design. **Sprint 9 (AI
Visibility Autopilot UX, Layer — the visible loop)** is the final sprint: NO new tables (it
reads everything built in S1–S8), it demonstrates ONE complete Autopilot loop end-to-end
(Audit → Prioritize the #1 gap → Explain → Execute → Measure), plus the Action Progress Tracker,
the Health Check banner, and the per-prompt trend API. Sprint 9 requires: the explainability
contract (S6), the wins-feed (S3), remediation_tasks (S2), the narrative/alert surfaces (S4/S5),
agent readiness (S6) — all already built. After S9: the final cross-prompt audit (Gate 3) and
the build phase.

## CHANGELOG
- v1.0 — Initial Sprint 8 prompt, generated single-pass against verified LLD v8.67
  (REVIEWED-r2). Schema/route/lib detail cited to LLD ~8493–8700 + ~9038; the fanout-webhooks
  extension to LLD ~3850; UI to prototype TeamManagement (2800) + DataResidency (3034);
  conventions from master plan §7. §1 module list is the complete enumeration of the §4 tree
  (per the S3-01 lesson). Builds the 4 governance tables (35–38) + the WH-01 fanout-webhooks
  extension (the #1 cross-sprint payoff — delivers the 5 Phase 2 webhook events) with
  retry-idempotency per the S7-pass-2 theme. Raises OQ-1: local_seo_results has no canon DDL
  but S6's local_ai_trust_score depends on it — flagged for Sri, NOT invented. Awaiting Gate 2.
