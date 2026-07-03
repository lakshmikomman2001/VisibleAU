# VisibleAU — Consolidated Go-Live & Hardening Checklist

**Compiled:** end of Sprint 2 close-out session (audit/start saga + full RLS/tenant-isolation remediation).
**Purpose:** a single tracked record of everything that must land before prod deploy, plus what's still open in
the codebase. Nothing here should be actioned blindly — each item links back to context. Check items off as they
land; this doc should be the source of truth until it's all closed, then retire it.

---

## 🔴 CRITICAL — must be done before real prod traffic (security-load-bearing)

### 1. Get the 3 hand-applied RLS/security migrations into the tracked migration pipeline
These were applied directly via `psql` against BOTH `visibleau` (dev) and `visibleau_prod` during this session's
security remediation. They are correct and verified, but **they exist as ad-hoc SQL, not as tracked
drizzle-kit/migration-pipeline entries.** A fresh prod deploy or environment rebuild will NOT reproduce them unless
they're formalized. This is a drift risk — if prod is ever rebuilt from the migration set alone, RLS protection
would be silently absent again.
- [x] `scripts/db/rls-missing-tables.sql` — **fresh-DB-verified**: added missing `ENABLE ROW LEVEL SECURITY` for
      `action_items` (Gap 1); normalized `::text` → `::uuid` casts to match all other policies (Gap 4)
- [x] `tier1a-app-role.sql` — **fresh-DB-verified**: idempotent as-is; see Item 1b below for prod password
- [x] `rls-with-check.sql` — **fresh-DB-verified**: added `workflow_runs` WITH CHECK (discovered during
      fresh-DB verification — same write-path hole as the original 3 tables)
- [x] `db/migrations/0012_subscriptions_table.sql` — **NEW**: `subscriptions` table was created via `db:push`
      and had no migration file (Gap 2). Fresh DB would fail on `ALTER TABLE subscriptions` without it.
- [x] `db/migrations/sprint-8-tables.sql` — **fixed**: policies used wrong setting name
      (`app.current_organization_id` → `app.current_org_id`), missing `missing_ok` parameter, missing
      `WITH CHECK` (Gap 3)
- [x] **Fresh-DB verification complete**: created `visibleau_fresh_test`, applied all migrations in order
      (0000–0009 → sprint-8 → 0010 → 0011 → 0012 → rls-missing-tables → tier1a → rls-with-check),
      confirmed 19 tables with RLS enabled+forced, all `FOR ALL` policies have both USING and WITH CHECK,
      `visibleau_app` role enforces RLS (0-row query without context), `llm_response_cache` correctly disabled.
- **Remaining action:** add these files to the deploy pipeline/runbook so they're applied automatically on
  fresh environments. The SQL is idempotent — safe to re-run on existing databases.

### 1b. Prod `visibleau_app` role password — use secrets management, not hardcoded
`tier1a-app-role.sql` hardcodes `PASSWORD 'visibleau_app_dev'` — fine for local dev, but prod must NOT use this
known password. **Do NOT patch the migration file** — it should stay dev-only. Instead:
- [ ] **Option A (recommended — Vercel/hosting secrets):** After the migration creates the role in prod, run a
      one-time `ALTER ROLE visibleau_app WITH PASSWORD :'prod_password';` using a value from your hosting
      provider's secrets store (Vercel env var, AWS Secrets Manager, etc.). Set the prod `DATABASE_URL` to use
      this password. The migration file stays generic; the real password never touches version control.
- [ ] **Option B (psql variable at apply-time):** Wrap the migration in a script that reads the password from
      an environment variable: `PGPASSWORD=$PROD_PG_PASS psql -v app_pass="'$APP_ROLE_PASS'" -f tier1a-app-role.sql`
      and change the SQL to `CREATE ROLE visibleau_app LOGIN PASSWORD :app_pass ...`. More automated but adds
      complexity to the migration runner.
- [ ] **Option C (cloud-managed IAM):** If using a managed Postgres (Supabase, Neon, RDS), use the provider's
      built-in role/IAM system instead of password auth entirely. The migration still creates the role for
      local dev; prod uses the provider's auth mechanism.
- **Recommendation:** Option A — simplest, works with any hosting provider, keeps the migration file
  unchanged. Run `ALTER ROLE` once after first prod deploy, store the password in Vercel env vars as
  `DATABASE_URL=postgresql://visibleau_app:<secret>@<host>:5432/<db>`.
- **Why this is a separate item:** the migration file is correct for dev. The prod password is a deployment
  concern, not a schema concern — it belongs in the deploy runbook, not the migration pipeline.

### 2. Deployed prod app must connect as the non-superuser role, not `postgres`
Tier 1A created `visibleau_app` (NOSUPERUSER, NOBYPASSRLS) and switched the **local** `.env.local` to use it for
the user-request path, keeping `serviceDb`/service_role for Inngest. **The deployed prod environment's
`DATABASE_URL` has NOT been changed** — this was a local-only fix, deliberately scoped that way.
- [ ] Set the deployed prod `DATABASE_URL` to use `visibleau_app` (or the prod-equivalent constrained role) for the
      API/user-request connection.
- [ ] Set a SEPARATE prod service-role connection string for Inngest (mirroring the local `serviceDb` split).
- [ ] **Verify after deploy:** repeat the Tier 1A verification against prod — connect as the prod app role,
      confirm `rolsuper=false, rolbypassrls=false`, confirm RLS enforces (no-context query → 0 rows).
- **Why critical:** without this, prod would repeat the EXACT bug this session found — the app bypassing all RLS
  via superuser, even though the policies are correctly in place. The policies are necessary but not sufficient;
  the connecting role is what makes them real.

### 3. Prod Inngest — real Cloud keys + deployed serve endpoint
The local fixes this session (`INNGEST_DEV=1`, the `isDev` client fix) make LOCAL dev work against the local
Inngest dev server. **Real production Inngest is the opposite configuration** and has not been set up.
- [ ] Obtain real `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` from the Inngest Cloud dashboard.
- [ ] Set them in the deployed prod environment (NOT `.env.local`).
- [ ] Ensure `INNGEST_DEV` is **unset/false** in the deployed prod environment (opposite of local).
- [ ] Deploy the app and register its serve endpoint (`/api/webhooks/inngest`) with Inngest Cloud so events
      actually deliver in production.
- [ ] Verify: complete a task / generate a draft / let a scheduled audit fire in a staging-prod-like environment
      and confirm the Inngest Cloud dashboard shows the runs.
- **Why critical:** without this, every event-driven feature (drafts, re-audits, scheduled audits, bulk re-audit)
  silently fails in real production — likely surfacing as the same class of bug found and fixed locally this
  session (unhandled/hardened sends), just against Cloud instead of the local dev server.

### 4. Clean up test data created in the PROD database during this session's smoke-testing
The prod DB was deliberately used for schema-migration smoke-testing and for exercising Sprint 2 flows on real
prod data. Real rows were created:
- [ ] Test audits (at least #131, #132, #133 — the scheduled-cron fix, and the bulk-reaudit fix's two audits)
- [ ] The bulk re-audit operation row from testing `bulk-reaudit-orchestrate`
- [ ] Test remediation tasks + content_drafts created while testing the Workflow loop on Sydney Plumbing / Bondi
      Plumbing / Marrickville Dental against prod
- [ ] Any test brands created solely for this testing that shouldn't be in the production dataset
- **Action:** identify test-created rows (via `triggered_by` values, creation timestamps during the testing window,
  or brand names) and remove them before real customers see the data. Confirm with a query pass before deleting —
  don't blind-delete against prod.

---

## 🟡 IMPORTANT — should be done before go-live, not blocking further dev work

### 5. Finish the Sprint 2 automated test track — Section 5 (QA) — ✅ COMPLETE WITH DOCUMENTED GAP (2026-07-01)
Sections 1-4 are complete and green (Backend Unit, Backend E2E, Frontend Unit, Frontend E2E — 1237+ tests).
- [x] **DB confirmed**: all tests ran against `visibleau` (dev DB), not `visibleau_prod`. Test data cleaned up.
- [x] **Fallback verification (QA-1 substitute)**: no Phase 2 Sprint 2 batch scripts exist (searched entire repo —
      Phase 1 sprints 1-11 have scripts in `tests/qa/sprint{N}/`, but nothing for Phase 2). Ran ALL 628 Phase 2
      Sprint 2 tests (15 files) directly — **628/628 pass** (72s). Includes the real-DB E2E integration test
      (`sprint2-workflow-integration.test.ts`, 52 tests against `visibleau`): task CRUD + status transitions,
      workflow orchestrator lifecycle, content_drafts, RLS isolation on all 3 tables via `rls_test_role`,
      cross-sprint FK cascades, MI-01 idempotency, Inngest function registration.
- **Documented gap**: QA-1 batch-script run not executed as specified — no scripts to run. The service-layer E2E
  is verified; the remaining uncovered surface is server-lifecycle cycling + Inngest event pipeline + browser UI.
  See Item 11 below for the backlog item to close this.

### 6. LLD version bump — v8.69 → v8.70 collision fix — ✅ DONE (2026-07-01)
- [x] Version header bumped: `8.69` → `8.70`
- [x] CHANGELOG entry `v8.69` (Fiftieth-pass, audit/start canon correction) → `v8.70`. The prior `v8.69`
      (Forty-eighth-pass, CONSOLIDATED HYGIENE + SECURITY) is untouched — no collision.
- [x] 3 inline `[CORRECTED ... v8.69]` / `D-05 corrected contract (v8.69)` stamps → `v8.70`
- [x] Only the Phase 2 LLD was at v8.69; Phase 1 LLD remains at v8.55 (unaffected).
- [x] Canonical version note updated: current canonical is **v8.70**.

### 7. `e2e-rls-fk-services.integration.test.ts` — fix the DB-mismatch config — ✅ DONE (2026-07-01)
- [x] `TEST_DB_URL` changed from `visibleau` → `visibleau_prod` (the active dev database)
- [x] `TEST_ORG_ID` changed to `31a7c684-...` (VisibleAU Dev) — old ID was phantom (didn't exist in either DB)
- [x] `TEST_BRAND_ID` changed to `358e8579-...` (canva.com) — old ID was phantom
- [x] `ORG_B` + inline `OTHER_ORG` changed to `21ac96a7-...` (Test Agency 2) — old ID was phantom
- [x] Seeded missing `provider_market_capabilities` (4 rows) and `metric_quality_gates` (7 rows) into
      `visibleau_prod` — these seed tables had data in `visibleau` but not `visibleau_prod`
- [x] **Result: 50/50 tests pass** (was 34 failures, all timeouts caused by FK violations from phantom IDs)

### 8. `llm_response_cache` RLS-disabled — ✅ CONFIRMED SAFE (2026-07-01)
**Verdict: SAFE — RLS-disabled is correct.** Full investigation completed, not rubber-stamped.
- [x] **Cache key** = `sha256(prompt + "\n" + model)` — no org/brand component in the key itself, BUT the prompt
      text always embeds brand-specific content (name, domain, queries, competitors), so different brands always
      produce different SHA-256 hashes → no cross-org collision for different brands.
- [x] **Cache value** = raw LLM response text — generic model output (public knowledge about the brand/topic).
      No org-private data (audit scores, user data, internal settings) is ever stored in the cache.
- [x] **Collision analysis**: the only collision case is two orgs with the exact same brand name + domain asking
      the exact same question. The cached response is legitimately identical (the LLM's answer about "Sydney
      Plumbing" is the same regardless of which org asked) — correct caching behavior, not a leak.
- [x] **All 6 callers verified**: `classifyBrand`, `run-audit-inline`, `generateAnswerCapsule`,
      `generateContentDraft`, `classifySentiment`, `classifyContext` — all embed brand-specific content in prompts.
- [x] **Documented** in `db/schema/llm-response-cache.ts` with rationale so it's not re-flagged as a false positive.

---

## 🟢 MINOR — doc hygiene, no functional risk, fix opportunistically

### 9. Doc-drift notes accumulated this session
- [ ] `lib/email/client.ts` is a **nodemailer wrapper**, not the "Phase 1 Resend singleton" canon describes —
      update the LLD/handover reference so a future rebuild doesn't go looking for a Resend client that isn't there.
- [ ] `cross_prompt_impact` column **does not exist** in the schema — LLD specifies it as the Action Center sort
      key + index; `expectedImpactScore` (HIGH/MEDIUM/LOW text) is what's actually used. Either build the column
      later or correct the canon reference.
- [ ] `organizations.tier` is read directly in at least two places (`run-audit.ts` Path A; the brand-page nav
      tier-gate) where canon says `subscriptions.tier` is sole source-of-truth. Confirmed NOT to cause zero-engine
      bugs (the resolver normalizes any input), but worth a one-time confirm: is `organizations.tier` guaranteed
      synced from `subscriptions.tier` (safe as a read-only mirror), or can it drift? If it can drift, the 2 reads
      should switch to the canonical source (small, low-risk fix either way).

### 10. SPRINT8 tracking item (already documented, just cross-referencing)
- [ ] `getOrgProgressSummary` (dashboard aggregate) and the Action Center aggregate currently scope to ALL org
      brands, not `brand_access`-restricted accessible brands (deferred — `brand_access` is stored-but-inert
      app-wide until Sprint 8 builds `assertBrandAccess`). When Sprint 8 retrofits the S1-S7 routes, add these two
      aggregates to that same retrofit checklist. (See `SPRINT8-tracking-dashboard-brand-access-scoping.md`.)

### 11. Phase 2 Sprint 2 QA batch scripts — create and run
No QA batch scripts exist for Phase 2 Sprint 1 or Sprint 2 (Phase 1 sprints 1-11 have them in `tests/qa/sprint{N}/`).
The Section 5 service-layer E2E is verified (628/628 pass), but the full QA-1 pass requires scripts that:
- [ ] Close & relaunch both the Next.js dev server and Inngest dev server
- [ ] Exercise each Sprint 2 feature (workflow loop, draft generation, task completion + re-audit, scheduled audits)
      end-to-end through the Inngest event pipeline with real dev-DB data
- [ ] Follow the existing convention (`tests/qa/p2sprint2/` or similar, `.bat` wrappers)

### 12. SoV domain-variant normalization — fix before real customers use Share of Voice
The SoV brand-vs-competitor exclusion + aggregation compare EXACT domain strings, so `example.com` and
`example.com.au` (or `www.` variants) are treated as different entities. Consequence: if a customer's stored
`brands.domain` differs from the form LLMs cite (very common for AU businesses that own both `.com` and `.com.au`,
or are cited under the `.au` form), **the customer's OWN domain appears as a competitor against themselves** in
their SoV — a credibility-destroying wrong number in the flagship metric. Fix: normalize domains (strip `www.`,
unify `.com`/`.com.au` and other TLD variants of the same root; at minimum exclude ALL variants of the brand's own
domain from competitors) in `lib/visibility/sov-calculator.ts` (and the mention-source / aggregation paths) before
the brand-vs-competitor comparison. Not urgent (doesn't block dev/testing — clean test data avoids it), but MUST be
fixed before SoV ships to real customers. Surfaced during Sprint 3 manual testing via a domain-variant test brand.

### 13. RecommendationCard — nested `<a>` hydration warning
`RecommendationCard` (Sprint 1 Action Center component) nests `<a>` inside `<a>` — React logs
"`<a> cannot be a descendant of <a>`" at render time. Not a blocker, but will cause a hydration mismatch in
production SSR. Fix: replace the inner or outer `<a>` with a non-anchor wrapper (e.g. `<div>` or `<button>`).

---

## ✅ CONFIRMED DONE this session (for reference — no action needed)

- Sprint 2 Workflow Completion Engine loop verified end-to-end on real data (lift 80→88)
- `audit/start` canon-level bug killed across 4 functions (reaudit, scheduled cron, bulk reaudit, workflow
  scheduler) + the LLD corrected at the root (D-05, now v8.70-pending-bump)
- Resend lazy-instantiation fix (prod-blocker) — can't crash the Inngest serve endpoint anymore
- Complete-route idempotency + decoupled event fix (self-heals stuck tasks, never silently drops re-audit events)
- Draft generation, view-drafts nav, brand-page Workflow nav (Finding 1 + 3), dashboard aggregate, Action Center
  aggregate — all built, verified, tested
- **Full cross-tenant security remediation** (the big one):
  - Tier 2 — `withRlsContext` transaction wrapper (fixed RLS context lost across the connection pool)
  - Tier 1A — non-superuser `visibleau_app` DB role (fixed: app was connecting as `postgres` superuser, bypassing
    ALL RLS on ALL traffic)
  - 14 tenant tables given RLS policies that had none (including `subscriptions`, which had ZERO RLS)
  - WITH CHECK added to 3 write-path-hole policies (`content_drafts`, `remediation_tasks`, `subscriptions`)
  - Tier 3 — explicit org/brand ownership checks added to 10 routes as defense-in-depth (34 routes surveyed, 22
    already had checks, 1 global correctly excluded)
- Sections 1-4 of the Sprint 2 automated test track (1237+ tests, backend + frontend, unit + E2E)

---

## Suggested order to close out the 🔴 CRITICAL section

1. **Items 1 + 2 together** (migrations → pipeline, prod role) — these are the two that, if skipped, silently
   reintroduce the exact security hole this session closed. Highest priority.
2. **Item 4** (prod test-data cleanup) — do this before any real customer traffic, independent of the others.
3. **Item 3** (prod Inngest Cloud keys) — needed for the app to function in prod at all, but not a security risk
   like 1/2, so it can follow.

The 🟡 and 🟢 sections can proceed at your normal pace alongside Sprint 3 work — none of them block moving forward.
