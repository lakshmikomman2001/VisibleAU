# VisibleAU Phase 2 — SPRINT 8 PROMPT: Governance Intelligence
# Version: 1.3 | Built against: LLD v8.67 (REVIEWED-r2) | Sprint: 8 of 9 | 3 weeks
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
  competitive_benchmark. **Plus the privilege-change actions (S8b-03 — these were missing from
  every action set):** `member_role_changed` + `member_removed` (resource_type `org_member`) —
  the two most security-sensitive governance actions, previously unaudited. [LLD escalation: add
  both to the action enum at LLD 8512.] user_id is **nullable** (system actions). Index
  `audit_trail_org_idx (organization_id, created_at DESC)`.
- **org_members.role** = owner | admin | analyst | viewer — the **RBAC matrix is authoritative
  (LLD 8556):** Run audit (owner/admin/analyst); Approve drafts (owner/admin); Generate reports
  (owner/admin/analyst); Invite members (owner/admin); Delete brand (owner only); View reports
  (all). **Assign/revoke `owner` role: owner only** (S8b-02 — no actor elevates a member above
  their own role; admin cannot mint an owner). [LLD escalation: the matrix should gain an explicit
  "Assign owner role | owner only" row.] `brand_access` JSONB: **null = all brands; or [brandId,…]** for restricted. The
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
> **RULING (Gate 2 reviewer + builder agree — pending Sri's final confirmation): DEFER.** Do not
> invent a schema in S8 (it would violate the grounded/anti-drift method and risk locking a wrong
> design into a table that feeds a trust score). Build only the four governance tables; S6's
> local_ai_trust_score stays NULL by design (consistent with S6b-02) until a dedicated local-SEO
> pass defines local_seo_results (columns + writer + tier gate + retention) and adds its DDL to
> the LLD.

---

## 1. WHAT SHIPS THIS SPRINT
- 4 new tables (§5): audit_trail (#35), org_members (#36), data_residency_log (#37),
  org_feature_flags (#38) + their indexes. (NOT local_seo_results — see §0.6 OQ-1.)
- The **fanout-webhooks extension** (§8.1) — the trigger-array + deliveryEventName-map additions
  for the 5 Phase 2 webhook events, plus ensuring each source function emits its internal
  slash-event with `{ organizationId }` (the producers were built in S3–S6; verify the emits).
- 1 declarative seed/writer (§5.5): `record-data-residency.ts` UPSERTing the static RESIDENCY
  map (the DR-01 writer).
- 4 lib/governance modules (§6: audit-trail, access-control, feature-flags, data-residency) +
  the **record-data-residency.ts** DR-01 writer (§5.5/§6.4) + the `lib/feature-flags/index.ts`
  extension.
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

# BACKWARD EDITS to upstream-sprint code (S8 must edit these existing files — §8.1 + §6.1):
inngest/functions/aggregate-visibility-trend.ts   // §8.1 ADD emit 'visibility/trend-updated' (S3 fn)
app/api/brands/[id]/hallucinations/[hid]/route.ts  // §8.1 ADD emit 'hallucination/acknowledged' + §6.1 recordAction (S5 route)
app/api/brands/[id]/content-drafts/[draftId]/route.ts  // §6.1 recordAction draft_approved/draft_dismissed (S4 route)
app/api/brands/[id]/journeys/[journeyId]/run/route.ts  // §6.1 recordAction journey_triggered (S7 route)
app/api/brands/[id]/competitive-benchmark/route.ts // §6.1 recordAction competitive_benchmark_viewed (S3 route)
# brand-access enforcement (S8b-01): every existing /api/brands/[id]/... route adopts assertBrandAccess
app/api/brands/[id]/**/route.ts   // §6.2 ADD assertBrandAccess(user, brandId) to the S1–S7 brand-scoped routes

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
userAgent })` → INSERT audit_trail. action + resource_type from the §0.5 enums. **Only 2 of the
7 audited Phase 2 actions live in S8's own code — the other 5 require S8 to EDIT upstream routes**
(audit_trail doesn't exist until this sprint, so those sprints could not have wired it; these are
backward edits, listed in §4 as edits):
- **S8's own:** `data_residency_accessed` (the S8 data-residency GET, §9); `feature_flag_changed`
  (the operator flag path); **`member_role_changed` (the PATCH …/members/[memberId] role/
  brand_access change) + `member_removed` (the DELETE/deactivate path)** — S8b-03, the
  privilege-change audits, both in S8's own member routes (so 9 audited actions total: the
  original 7 + these 2).
- **Upstream routes S8 must edit to call recordAction:**
  1. `draft_approved` + `draft_dismissed` — the S4 content-draft approve/dismiss route.
  2. `journey_triggered` — the S7 `POST …/journeys/[journeyId]/run` route.
  3. `hallucination_acknowledged` — the S5 `PATCH …/hallucinations/[hid]` acknowledge route (the
     SAME route that gains the `hallucination/acknowledged` emit in §8.1 — edit both there).
  4. `competitive_benchmark_viewed` — the S3 `GET …/competitive-benchmark` route.
A build that wires only S8's 2 own actions yields an audit log silently missing journey triggers,
acknowledgements, draft approvals, and benchmark views — so these 5 edits are required, not optional.

### 6.2 access-control.ts — the 3-layer RBAC (LLD 8533)
`canPerform(user, org, brandId, action)`: check **Better Auth session → users.role (org-level)
→ org_members (brand-level)** in that order; enforce the §0.5 RBAC matrix; honour brand_access
(null = all brands; array = restricted). This is the gate every protected route + the UI uses.

**BRAND-ACCESS ENFORCEMENT (S8b-01 — tenant isolation; do NOT ship brand_access inert):** RLS is
scoped to `organization_id` (§5.6), so the RLS context permits EVERY brand in a member's org —
which means **`brand_access` is the ONLY thing isolating brands within an org**, and it only takes
effect if a route actually checks it. The existing S1–S7 `/api/brands/[id]/…` routes were built
before org_members existed and do NOT check it. So this sprint must add a single brand-scoping
gate and retrofit those routes:
- Add `assertBrandAccess(user, brandId)` to access-control.ts: throws/404 if the member's
  org_members.brand_access is a non-null array that excludes brandId (null = all brands → allow);
  owner/admin org-level roles with null brand_access pass. Call it AFTER setRlsContext + the
  session/org check.
- **Retrofit every brand-scoped route to call it** — the S1–S7 `/api/brands/[id]/…` reads and
  actions (see §4 BACKWARD EDITS). Without this, a member restricted to brand A can still
  read/act on brand B via the un-retrofitted routes — brand_access stored but unenforced (a
  silent tenant-isolation gap on the very feature whose purpose is access restriction).
- [LLD escalation: the LLD specifies brand-scoped permission checks but NOT the enforcement point;
  it should formalize `assertBrandAccess` (or brand-level RLS) as the canonical brand-isolation
  mechanism so future brand routes inherit it.]
The §11 brand-access test must assert the ROUTES invoke the gate (a restricted member gets 404 on
an out-of-scope brand), not merely that canPerform's logic is correct.

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
- **The producer emits — TWO MUST BE ADDED, three only verified (the #1 risk):** an event is
  delivered only if its source actually emits the internal slash-event. Checking the producing
  sprints: three already emit and need only verification — `report/generated`
  (S4 generate-narrative-report), `hallucination/detected` (S5 detect-hallucinations, per incident),
  `agent/readiness-scored` (S6 score-agent-readiness). But **two were NOT built upstream and S8
  MUST ADD them** (the LLD specs them only in the webhook spec, not in the source spec, so S3/S5
  didn't build them):
  1. **`visibility/trend-updated`** — ADD to `inngest/functions/aggregate-visibility-trend.ts`,
     emitted after each `visibility_trends` UPSERT (LLD WH-01c; the S3 spec documents only the
     separate `trend/aggregated` internal emit, never this webhook emit). `data: { organizationId,
     brandId, periodLabel }`.
  2. **`hallucination/acknowledged`** — ADD to the `PATCH …/hallucinations/[hid]` acknowledge route,
     emitted when `is_acknowledged` is set true (LLD 3804/960 — explicitly "emitted by the PATCH
     route, not a function"; it lives ONLY in the webhook spec, never in the S5 acknowledge-route
     spec). `data: { organizationId, brandId, incidentId }`.
  Both are backward edits to upstream code (listed in §4 as edits). Each emit (added or existing)
  carries `{ organizationId }` in event.data (fanout reads it to scope endpoints + RLS). Internal
  events keep the slash delimiter; external keep dots. All 5 are already in VALID_EVENTS (so
  subscription works); without the source emits, the two added ones would be
  configurable-but-undeliverable (dead webhooks — the exact WH-01 failure mode).
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
- `PATCH …/members/[memberId]` — update role / brand_access (owner/admin). **ROLE-ASSIGNMENT
  CEILING (S8b-02 — privilege-escalation guard):** **only an owner may assign or revoke the
  `owner` role**, and no actor may elevate a member to a role above their own. So an admin can set
  analyst/viewer/admin but NOT owner (else an admin could mint a peer who deletes brands/the org).
  Enforce in access-control (§6.2) + the route. (Audit the change — S8b-03.)
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
>    org_members) and the RBAC matrix — PLUS (S8b-01) an `assertBrandAccess(user, brandId)` gate
>    and a backward retrofit adding it to every existing S1–S7 /api/brands/[id]/… route (RLS is
>    org-scoped, so brand_access is inert until routes enforce it), and (S8b-02) a role-assignment
>    ceiling (only an owner assigns/revokes owner; no elevation above self); feature-flags with
>    priority org_feature_flags > env > defaults (and EDIT Phase 1 lib/feature-flags/index.ts to
>    check the DB first — don't break S7's engine-gate or the tier teasers); record-data-residency.ts
>    UPSERTing the static RESIDENCY map (DR-01 — without it the residency page is empty).
> 3. **THE fanout-webhooks EXTENSION (§8.1 — the #1 deliverable):** EDIT the Phase 1
>    fanout-webhooks.ts to add the 5 Phase 2 events to BOTH the trigger array AND the
>    deliveryEventName map (report/generated→report.generated, hallucination/detected→
>    hallucination.detected, hallucination/acknowledged→hallucination.acknowledged,
>    visibility/trend-updated→visibility.trend.updated, agent/readiness-scored→
>    agent.readiness.scored). CRITICAL — the source emits: THREE already exist (verify only):
>    report/generated (S4 generate-narrative-report), hallucination/detected (S5
>    detect-hallucinations), agent/readiness-scored (S6 score-agent-readiness). TWO were NOT built
>    upstream and you MUST ADD them: (a) `visibility/trend-updated` in
>    inngest/functions/aggregate-visibility-trend.ts after the visibility_trends UPSERT; (b)
>    `hallucination/acknowledged` in the PATCH …/hallucinations/[hid] acknowledge route on
>    is_acknowledged=true. Each emit carries { organizationId }. Add retry-idempotency: dedup via
>    webhook_deliveries so a retried delivery doesn't double-POST, and step.run() per endpoint POST.
> 4. The 3 settings screens (§6U) + 5 components: Team management (member rows, role badges,
>    invite form, pending invites — owner/admin gated), Audit trail (paginated log, "system" for
>    null user_id), Data residency (the GV-2 transparency table; viewing records
>    data_residency_accessed). Both themes; STATES + RESPONSIVE per screen; ARIA per FIX 13.
> 5. The API routes (§9): [id] params, Better Auth + setRlsContext + access-control + the RBAC
>    matrix, the invitation accept/cancel rules (IC-01), Zod, cross-org → 404. For audit_trail:
>    only 2 of the 7 actions are in S8's own routes — EDIT 5 upstream routes to call recordAction
>    (S4 content-draft approve/dismiss → draft_approved/dismissed; S7 journey-run →
>    journey_triggered; S5 acknowledge → hallucination_acknowledged [same route as the §8.1 emit];
>    S3 competitive-benchmark → competitive_benchmark_viewed), plus S8's own data_residency_accessed
>    + feature_flag_changed. A build wiring only S8's 2 own actions leaves the audit log incomplete.
>
> Constraints: TS strict, no `any`. LLM_MODE=mock in tests. subscriptions.tier (never
> organizations.tier). Run §12 greps + §11 tests and report. Surface OQ-1 (local_seo_results)
> to Sri rather than guessing.

---

## 11. TESTS REQUIRED (LLM_MODE=mock)
- `access-control.test.ts` — the 3-layer order (session → users.role → org_members); the RBAC
  matrix per role (analyst can run audits but not approve drafts; viewer read-only; only owner
  deletes a brand); brand_access null = all, array = restricted. **S8b-01: assert a brand route
  INVOKES assertBrandAccess — a member with brand_access=[A] gets 404 on brand B (not just that
  canPerform's logic is right).** **S8b-02: an admin assigning role=owner is rejected; only an
  owner can; no elevation above self.**
- `privilege-audit.test.ts` — S8b-03: a role change emits `member_role_changed` and a member
  removal/deactivation emits `member_removed` (resource_type org_member) to audit_trail.
- `audit-trail.test.ts` — recordAction writes the right action/resource_type; system actions
  (null user_id) allowed; the 7 Phase 2 actions covered. **Integration-level: assert recordAction
  is INVOKED at each of the 7 sites** (the 5 upstream-route edits + S8's 2 own) — not merely that
  the function handles the 7 action values, so a missing call site is caught.
- `webhook-emit-sources.test.ts` — the two ADDED emits fire at their source: triggering an
  is_acknowledged=true on the acknowledge route emits `hallucination/acknowledged`; a
  visibility_trends UPSERT in aggregate-visibility-trend emits `visibility/trend-updated` (each
  with { organizationId }). Guards S8-01 (these were not built upstream).
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
# S8-01: the TWO added producer emits exist at their SOURCE (not just mapped in fanout)
grep -Rc "'visibility/trend-updated'" inngest/functions/aggregate-visibility-trend.ts # → ≥1
grep -Rc "'hallucination/acknowledged'" app/api/brands/\[id\]/hallucinations/\[hid\]/route.ts  # → ≥1
grep -Rc "step.run(" inngest/functions/fanout-webhooks.ts                             # → ≥1
# the 3-layer RBAC + matrix
grep -Rc "users.role\|org_members" lib/governance/access-control.ts                   # → ≥1
# S8b-01: brand-access gate defined + adopted by brand routes (retrofit)
grep -Rc "assertBrandAccess" lib/governance/access-control.ts                         # → ≥1
grep -Rlc "assertBrandAccess" app/api/brands/ | wc -l                                 # → ≥1 (the S1–S7 routes adopt it)
# S8b-02/03: owner-assignment ceiling + privilege-change audit actions
grep -Rc "member_role_changed\|member_removed" db/schema/audit-trail.ts lib/governance/  # → ≥1
grep -RcE "owner.*only|cannot assign owner|role > |above their own" app/api/organizations/\[id\]/members/\[memberId\]/route.ts lib/governance/access-control.ts  # → ≥1
# feature-flag priority: Phase 1 lib edited to check the DB first
grep -Rc "org_feature_flags\|orgFeatureFlags" lib/feature-flags/index.ts              # → ≥1
# the DR-01 residency writer (UPSERT)
grep -Rc "ON CONFLICT (organization_id, data_type)\|onConflict" lib/governance/record-data-residency.ts  # → ≥1
# invitation token single-use + IC-01 cancel
grep -Rc "nanoid(21)\|invitation_token" lib/governance/ app/api/organizations/\[id\]/members/  # → ≥1
# audit-trail.recordAction wired on an audited action (spot-check the acknowledge or benchmark route)
# S8-02: recordAction wired at each of the 7 audited sites (not just ≥1 somewhere)
grep -Rc "recordAction" app/api/brands/\[id\]/content-drafts/\[draftId\]/route.ts        # → ≥1 (draft_approved/dismissed, S4 route)
grep -Rc "recordAction" app/api/brands/\[id\]/journeys/\[journeyId\]/run/route.ts        # → ≥1 (journey_triggered, S7 route)
grep -Rc "recordAction" app/api/brands/\[id\]/hallucinations/\[hid\]/route.ts            # → ≥1 (hallucination_acknowledged, S5 route)
grep -Rc "recordAction" app/api/brands/\[id\]/competitive-benchmark/route.ts             # → ≥1 (competitive_benchmark_viewed, S3 route)
grep -Rc "recordAction" app/api/organizations/\[id\]/data-residency/route.ts             # → ≥1 (data_residency_accessed, S8 route)
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
  deliveryEventName map (5 each) AND ensure each producer emits its slash event with
  { organizationId } — declaring in VALID_EVENTS alone makes events configurable-but-undeliverable.
- **Assuming all 5 producer emits already exist.** THREE do (S4 report/generated, S5
  hallucination/detected, S6 agent/readiness-scored — verify only); TWO do NOT and S8 must ADD
  them (visibility/trend-updated in aggregate-visibility-trend.ts; hallucination/acknowledged in
  the PATCH acknowledge route — both LLD-specified only in the webhook spec, so the producing
  sprints didn't build them). Skipping these leaves two dead webhooks.
- **Wiring recordAction only in S8's own routes.** Only 2 of the 7 audited actions live in S8's
  code; the other 5 require editing upstream routes (S4 draft, S7 journey-run, S5 acknowledge, S3
  benchmark). audit_trail didn't exist until S8, so those sprints couldn't have wired it — these
  are required backward edits, or the audit log is silently incomplete.
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
- **Shipping brand_access inert (S8b-01).** RLS is org-scoped, so brand_access is the ONLY
  brand-isolation layer — it must be ENFORCED via assertBrandAccess on every S1–S7 `/api/brands/
  [id]/…` route (a backward retrofit), not just stored on the row. Otherwise a member restricted
  to brand A can still reach brand B.
- **Unbounded role assignment (S8b-02).** Only an owner may assign/revoke `owner`; no actor
  elevates above their own role — or an admin can mint an owner who deletes the org.
- **Unaudited privilege changes (S8b-03).** Role changes + member removals must call recordAction
  (member_role_changed / member_removed) — these are the most security-sensitive governance
  actions and were previously unlogged.

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
the build phase. **Forward note (S8b-01):** if S9's Autopilot "Execute" step performs
brand-scoped actions, route them through the same `assertBrandAccess` gate so the Autopilot
cannot act outside a member's permitted brands — S9 must not re-introduce the un-enforced path.

## CHANGELOG
- v1.3 — Gate 2 pass-2 findings applied (authorization-enforcement / privilege-boundary angle),
  all validated against canon first. S8b-01 [MODERATE]: RLS is org-scoped (verified — policies key
  on organization_id), so brand_access is the ONLY brand-isolation layer, but it lived only in
  canPerform (§6.2) and the existing S1–S7 /api/brands/[id]/… routes (built before org_members)
  never call it — brand_access stored but unenforced (a member restricted to brand A could reach
  brand B). The LLD specifies brand-scoped checks but NOT the enforcement point. Fixed: defined an
  assertBrandAccess(user, brandId) gate in §6.2 + required the S1–S7 brand routes to adopt it as a
  backward retrofit (§4 tree), with a route-level §11 test (restricted member → 404 on out-of-scope
  brand, not just canPerform logic), a §12 grep, a §13 pitfall, the §10 step, and an S9 forward note
  (Autopilot Execute runs through the same gate); flagged to Sri that the LLD should formalize the
  enforcement mechanism. S8b-02 [LOW-MOD, escalated]: the PATCH role route was "owner/admin" with no
  ceiling and the RBAC matrix has no role-assignment row — an admin could mint an owner. Fixed: only
  an owner may assign/revoke owner, no elevation above self (§0.5/§9 + access-control + §11 test);
  recommended the matrix gain an "Assign owner role | owner only" row. S8b-03 [LOW-MOD, escalated]:
  member_role_changed/member_removed were in NO action set (grep=0) — the two most security-sensitive
  governance actions went unlogged. Fixed: added both (resource_type org_member) to the §0.5 enum +
  recordAction on the PATCH/DELETE member routes (now 9 audited actions) + a §11 privilege-audit test
  + §12 grep; recommended the LLD add them to the action enum. No structural/feature change; the
  fixes ADD enforcement + auditing (nothing existing touched). Pass-2 confirmed the v1.2 fixes
  (S8-01/S8-02/OQ-1/§1) all correct and surgical, and org-level isolation sound — these gaps were the
  brand + role sub-layers on top of org isolation. Invitation no-expiry noted as a deliberate LLD
  choice (future TTL hardening), not flagged.
- v1.2 — Gate 2 findings applied (reviewer chat), both validated against canon AND the upstream
  sprint prompts on disk first. Shared root cause: S8's backward edits to upstream sprints' code
  were under-specified. S8-01 [MODERATE — the #1-risk fanout area]: §8.1 over-asserted "S3–S6
  functions were built to emit these" — FALSE for two of the five. Verified: the S3 prompt has 0
  refs to visibility/trend-updated and the S5 prompt has 0 refs to hallucination/acknowledged
  (the LLD specs both ONLY in the webhook spec, not in the aggregate-visibility-trend / acknowledge-
  route specs — LLD documents the separate trend/aggregated emit and notes hallucination/acknowledged
  is "emitted by the PATCH route, not a function"), so the producing sprints didn't build them; the
  other three (report/generated S4, hallucination/detected S5, agent/readiness-scored S6) verify
  present. Without the source emits, those two webhooks would be dead (subscribed + mapped but
  never fired). Fixed: §8.1/§10 now instruct S8 to ADD the two emits at source (visibility/
  trend-updated in aggregate-visibility-trend.ts after the UPSERT; hallucination/acknowledged in
  the PATCH acknowledge route on is_acknowledged=true), verify-only the other three; added both as
  §4-tree backward edits + source-level §12 greps + a webhook-emit-sources test. S8-02 [LOW-MOD]:
  only 2 of the 7 audited actions are in S8's own code; the other 5 fire in upstream routes (S4
  draft, S7 journey-run, S5 acknowledge, S3 benchmark) that — correctly — don't call recordAction
  (audit_trail doesn't exist until S8). Fixed: §6.1/§9/§10 now name the 5 upstream routes S8 must
  edit, listed as §4-tree edits, with per-site §12 greps (replacing the blanket recordAction ≥1)
  and an integration-level audit-trail test asserting each of the 7 sites invokes recordAction.
  OQ-1 RULING [reviewer + builder agree]: DEFER local_seo_results — no canon DDL (grep=0 confirmed
  independently), don't invent; S6's local_ai_trust_score stays NULL by design (S6b-02); an LLD
  addition + a dedicated local-SEO sprint when Sri is ready. Recorded the ruling in §0.6. No
  structural/feature change; the fixes ADD missing cross-sprint wiring (nothing existing touched).
  Reviewer confirmed CLEAN: the 4 table schemas verbatim, the 3-layer auth + RBAC matrix, the
  fanout *spec* (trigger array + map + retry-idempotency — the S7-pass-2 forward note correctly
  applied), RLS + barrel + the DR-01 writer, and serve()=25/25.
- v1.1 — Builder self-review pass (Sri requested a direct review rather than a reviewer-chat
  findings file), audited against v8.67 canon. One LOW finding fixed: §1 said "4 lib modules"
  but the §4 tree lists 5 files — added record-data-residency.ts (the DR-01 writer) to the §1
  enumeration so it matches the tree (same class as the recurring §1-vs-tree count drift; no
  build risk — record-data-residency is fully specified in §5.5/§6.4). Everything else verified
  CLEAN against canon: the 4 table schemas (audit_trail.user_id nullable, the UNIQUE constraints
  org+user / org+data_type / org+flag_key, indexes); the fanout-webhooks WH-01 map (all 5
  internal slash → external dot entries match LLD 3863 verbatim, incl visibility.trend.updated);
  the org_members 4-value role enum + nanoid(21) single-use token; all 8 canonical flag_keys;
  the DR-02 residency retention values (12mo/30d/90d); the FK-ON-DELETE audit (FIX-2) touches no
  S8 table (governance FKs to orgs/users correctly omit ON DELETE per Phase 1 soft-delete). OQ-1
  triple-confirmed: zero CREATE TABLE local_seo_results in canon, master plan lists exactly the
  4 governance tables for S8 — flagging-not-inventing is correct.
- v1.0 — Initial Sprint 8 prompt, generated single-pass against verified LLD v8.67
  (REVIEWED-r2). Schema/route/lib detail cited to LLD ~8493–8700 + ~9038; the fanout-webhooks
  extension to LLD ~3850; UI to prototype TeamManagement (2800) + DataResidency (3034);
  conventions from master plan §7. §1 module list is the complete enumeration of the §4 tree
  (per the S3-01 lesson). Builds the 4 governance tables (35–38) + the WH-01 fanout-webhooks
  extension (the #1 cross-sprint payoff — delivers the 5 Phase 2 webhook events) with
  retry-idempotency per the S7-pass-2 theme. Raises OQ-1: local_seo_results has no canon DDL
  but S6's local_ai_trust_score depends on it — flagged for Sri, NOT invented. Awaiting Gate 2.
