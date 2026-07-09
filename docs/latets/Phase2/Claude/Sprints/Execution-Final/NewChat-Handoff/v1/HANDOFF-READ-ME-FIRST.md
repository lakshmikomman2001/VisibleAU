# VisibleAU — Handoff to a New Claude Chat (2026-07-04)

**Read this whole document first.** It gives a new Claude everything needed to continue helping Sri test, review,
and fix VisibleAU. The prior chat hit the ~100-screenshot limit; this is the continuation package.

---

## 0. WHO / WHAT / HOW (the essentials)

**Sri** — Sydney-based solo full-stack dev (16+ yrs), building **VisibleAU**: an Australian-first **GEO/AEO
visibility-auditing micro-SaaS** that measures brand visibility across AI search engines (ChatGPT, Claude, Gemini,
Perplexity) for AU SMBs and agencies. Weekend pace alongside full-time work.

**Stack:** Next.js 16 + Turbopack, **local PostgreSQL** (NOT Supabase for the DB — see §4), Drizzle ORM, Better
Auth, Inngest (event/cron), Vercel AI SDK, Stripe (sandbox), Resend (email), **Supabase Storage** (for report PDFs
only — see §4). Repo: `C:\startup\VisibleAU\src\`.

**THE TWO-CHAT RELAY WORKFLOW (critical — this is how we work):**
- **THIS chat (the reviewer/spec chat)** = reads the canon documents (LLD, sprint prompts, prototype), and writes
  **ready-to-paste Claude Code `.md` prompts** saved to `/mnt/user-data/outputs/`.
- **A SEPARATE Claude Code session** = applies those prompts to the Windows repo.
- Sri pastes Claude Code's results **back into this chat as inline text** (see §5 — file uploads arrive EMPTY, a
  known bug; Sri must paste as text).
- So: **you (new Claude) write prompts; you do not edit the repo directly.** Every fix/diagnosis = a `.md` prompt.

---

## 1. SRI'S LOCKED PREFERENCES (follow these always)

1. **Direct, no-padding communication.** No flattery, no "great question." Get to the point.
2. **Verify-before-claim.** Never say something works without evidence. "Tests pass ≠ works on the rendered screen"
   is the #1 lesson of this whole project (see §3).
3. **A ready-to-paste Claude Code fix prompt for EVERY issue found** — even minor/LOW severity. Group related
   issues sensibly; scope each precisely (affected files, exact change, verification greps, constraints).
4. **Three-source discipline (NON-NEGOTIABLE):** Before writing ANY fix or diagnosis, read all three —
   **(1) the LLD (authority — LLD WINS on any conflict), (2) the sprint prompt, (3) the prototype** — and document
   what each says. This has caught real errors in first-draft fixes repeatedly.
5. **Performance, Security, Scalability, UX are first-class** — optimised queries, indexing, RLS, no N+1s, secure
   auth, accessible/mobile-responsive UI, loading states, error boundaries. Never cut these corners.
6. **English only** (Telugu translation is OFF unless Sri explicitly asks in-conversation).
7. **Always give a Claude Code prompt — never hand Sri manual SQL/CLI commands to run.** Wrap it in a prompt.
8. **Do it right the first time; don't defer/stall.** When Sri asks for a design/fix, do it completely.

---

## 2. KEY INVARIANTS (enforce these in every fix)

- **`subscriptions.tier` is the SOLE source of truth for tier. NEVER read `organizations.tier` for gating.** They
  CAN and DO diverge (proven this session — see §6). Sprint 4 prompt line 46 explicitly mandates this. A Sprint 3
  §12 grep gate checks `organizations.tier → expect 0`.
- **Status-enum spellings are NOT unified — do not "fix" them to match:** `remediation_tasks.status='complete'`,
  `workflow_runs.status='completed'`, `audits.status='complete'`. LLD wins on these.
- **Audit event name = `audit.complete`** (dot, not slash; not `audit/completed`).
- **`selectModel(tier, engine, task)`** — never hardcode model names. Budget via `BudgetPolicyService`.
- **RLS:** all tenant tables have RLS (USING + WITH CHECK on `organization_id`); test isolation with a
  **non-superuser role** (`rls_test_role`), because superusers bypass RLS.
- **`assertBrandAccess(user, brandId)`** is the canonical brand-isolation gate.
- **Verify with a FULL `tsc --noEmit` (whole project), NEVER per-file.** "0 errors" per-file has hidden 17 real
  project errors including 2 generation-blocking bugs this session.
- **LLM_MODE=mock** in tests → assert structure, not specific numbers (mock values are canned).

---

## 3. THE HARD-WON LESSONS (why the manual pass exists)

These recurred so often they're laws now:
- **"file exists ≠ applied"** — migrations/seeds get written but never run against the DB. Happened **5+ times**
  (Sprint 3 dev/prod/test DBs, Sprint 4 migration 0015, the subscription seed). Always verify the migration/seed
  actually ran against the target DB.
- **"reading code ≠ running the page"** — Claude Code reports "verified, looks correct" by reading the diff, then
  the page crashes on load. A UI fix is only verified by LOADING the page / running the flow.
- **"per-file tsc ≠ project tsc"** — always full `tsc --noEmit`.
- **"builder reports done ≠ correct on rendered screen"** — "78 tests green, 0 TS errors" hid ~11 real bugs in
  Sprint 4 alone.
- **"tests pass ≠ works on real data."**
- **Environment gotchas:** multiple Inngest dev servers from port conflicts (kill duplicates), stale `.next` cache,
  zombie servers. When a bug seems impossible, suspect the environment first. PostHog `/e /array /flags` 404s and
  Fast Refresh logs are **harmless console noise** — ignore them.

---

## 4. ARCHITECTURE NUANCE — Sri's two-database + storage setup (IMPORTANT)

Sri runs **two local PostgreSQL databases**, one codebase (same API + frontend), switched by config:
- **"dev" / local DB** → everything MOCKED (mock LLM via `LLM_MODE=mock`, canned data). For building/unit tests.
- **"prod" / real DB (local, but real integrations)** → real LLM calls, real Stripe sandbox, real ABN lookup (GUID).
  This is Sri's **real-integration environment, running locally** — a staging environment, NOT a live deploy.

**Storage (report PDFs):** controlled by an explicit env var **`STORAGE_DRIVER`** (independent of the DB):
- dev/mock env (`.env.dev`) → `STORAGE_DRIVER=local` → PDFs to `./storage/reports/{orgId}/{reportId}.pdf`
- prod/real env (`.env.prod`) → `STORAGE_DRIVER=supabase` → PDFs to a Supabase Storage **private bucket `reports`**
  (pre-signed URLs, 7-day expiry). Supabase is used ONLY for file storage — the DB is local Postgres.
- Storage adapter: `lib/storage/` (`types.ts`, `local-adapter.ts`, `supabase-adapter.ts`, `index.ts` factory);
  Supabase client in `lib/supabase.ts`. The factory defaults to `local` if `STORAGE_DRIVER` unset.
- **`pdf_url` stores the stable PATH (not an expiring URL); a fresh signed URL is generated on download.**
- Supabase project URL: `https://urnauxnijjxvppexknar.supabase.co`. The `service_role` SECRET key goes ONLY in
  `.env.prod` (gitignored — Sri commits daily; never commit the key).

**Planned deploy:** ~2 weeks out, online, in real production mode. The storage adapter is deliberately swappable so
deploy = just set env vars on the host.

---

## 5. THE FILE-UPLOAD BUG (how Sri communicates results)

**File/document uploads to this chat arrive EMPTY** (a persistent bug — ~10 blank uploads last chat). Sri must paste
Claude Code's results, error logs, and reports **as inline text in the chat message**, NOT as attachments. Image
(screenshot) uploads DO work. If Sri attaches a `.txt`/`.md` and you see nothing, ask them to paste it as text.

---

## 6. WHERE THINGS STAND RIGHT NOW (the live state — start here)

### Phase 1 (Sprints 1–12): COMPLETE + validated. All 12 sprints built, tested, screenshot-reviewed.

### Phase 2 (Sprints 1–10, "7-layer" intelligence platform):
- **Canonical versions:** **LLD v8.70**, **prototype FIX17**, all 9 Phase-2 sprint prompts complete + Gate-3
  audited. (Note: the LLD in this package is v8.70; the prototype is FIX17. If Sri has newer, use those.)
- **Sprint 3 (Visibility Intelligence): DONE.** Enhanced (SoV donut→ranked bars), validated at every layer — full
  5-section automated test track (344 tests green: 328 unit + 16 E2E) + on-screen real-data validation. 11 real
  bugs were found & fixed during validation (8 manual + 2 cross-sprint + 1 E2E), 2 copy drifts corrected.
- **Sprint 4 (Communication Intelligence / Reports): IN PROGRESS — manual testing, ~11 real bugs found & mostly
  fixed.** This is the ACTIVE work. Details below.

### Sprint 4 — what's been found & fixed this session (all invisible to "78 tests green, 0 TS errors"):
1. **Orphaned Reports nav** (brand-scoped) — Reports card added to BrandIntelTabs (Growth+ gate). FIXED.
2. **`tier is not defined` crash** — the card fix added `tier={tier}` but didn't derive it; added to destructuring.
   FIXED. (Reads `organizations.tier` justified as "webhook syncs it" — see the banked tier-source concern below.)
3. **Two more orphaned screens (org-scoped):** Template Editor (`/organizations/[orgId]/report-templates`) +
   Delivery Schedules (`/organizations/[orgId]/delivery-schedules`) had NO nav entry (spec is silent on placement).
   **STILL OPEN — needs a nav-placement decision from Sri** (Agency Dashboard? links from Reports page?). Reachable
   by URL for now.
4. **Unapplied migration 0015** — all 3 Sprint 4 tables (report_templates, generated_reports,
   report_delivery_schedules) didn't exist ("file exists ≠ applied"). Migration + seed applied. FIXED (confirmed:
   Template Editor shows the seeded "Default Report" template — 5 of 12 sections, professional, is_default badge).
5. **17 TS errors (not 0), 3 real bugs, 2 blocking Generate Report** — full `tsc` found: (a) Inngest 3-arg→2-arg in
   generate-narrative-report.ts (dead function), (b) `.createdAt`→`.runAt` wrong column, (c) BudgetPolicy.estimate
   missing brandId+engineCount (introduced by our own earlier fan-out fix), (d) a benign DbClient type. All FIXED
   (17→14, remaining 14 are benign test-file noise; ZERO core errors).
6. **Generate Report silent no-op** — the button emits `trend/aggregated` which the function gates on an active
   delivery schedule (LLD 418, correct for the AUTOMATIC path) → with zero schedules it early-returned. Fix: route
   emits `manual:true`; function wraps the schedule gate in `if(!manual)` → manual (button) bypasses, automatic
   keeps the gate. FIXED. (Design gap: §9 implies on-demand button, LLD 418 gates on schedule — reconciled.)
7. **PDF step was NEVER IMPLEMENTED** — `generate-narrative-report` inserted the row + emitted `report/generated`
   into the void; `buildReportPdf()` existed but had zero callers; no listener on `report/generated`. Built the
   storage adapter (local + Supabase) + a NEW Inngest function `render-report-pdf` (listens on `report/generated` →
   render → upload → set pdf_url). FIXED.
8. **Storage adapter broke the report routes (404/500)** — the factory defaulted to Supabase for any non-'local'
   value (incl. unset) → threw on missing keys even in local mode. Fix: default to `local`, `.trim().toLowerCase()`,
   throw loudly on unknown. FIXED.
9. **Local PDF download 404** — a STORAGE_DRIVER check in the download route was stricter than the factory. FIXED.
10. **Report content bugs (found by opening the actual PDF):**
    - (a) **JSON dumped in section bodies** — `summary.summary as string ?? JSON.stringify(summary)` (no `.summary`
      prop → dumped raw JSON). FIXED: sections now render readable prose. **Confirmed by reading the PDF.**
    - (b) **Nested/malformed sub-queries** ("What are the best options for Who are the best plumbers in Bondi,
      NSW??") — this is STALE legacy data from removed code + a separate issue that mock MockLLM has no sub-query
      fixture (returns brand-mention paragraphs). **VERDICT: not worth fixing in mock; verify clean in PROD mode
      (real LLM generates proper sub-queries). STILL TO VERIFY in prod mode.**
11. **Reports "Growth plan required" lock for an Agency user** — VERDICT: **test-data issue, gate code is CORRECT**
    (it reads `subscriptions.tier`). `subscriptions` had no rows for 12/13 test orgs (START-PROD.bat seeded
    `organizations.tier` but not the subscription). Fix: seed subscription rows matching each org's tier, idempotent,
    wired into both START scripts. FIXED (all 13 orgs now aligned; Agency org → subscriptions.tier='agency').

### ⏳ IMMEDIATE NEXT STEPS (where the new chat picks up):
1. **Sri to paste the `service_role` key** into `.env.prod` (was still a placeholder) + restart prod server.
2. **Verify Reports UNLOCKS** for the Agency org after the subscription seed (reload — should show list + Generate
   CTA, no "Growth plan required"; a Starter org should STILL be locked).
3. **Generate a report in PROD mode** — the convergence test. Confirm ALL of:
   - Report generates (tier access ✓)
   - PDF lands in the **Supabase `reports` bucket** (dashboard → Storage) + downloads via signed URL
   - **Sub-queries are CLEAN** (real LLM, no nesting) — this verifies bug 10(b)
   - Sections read as prose (bug 10(a) — already confirmed in local mode)
4. Then: **the two org-scoped orphaned screens** (Template Editor + Delivery Schedules) still need nav entries —
   Sri to decide placement.

### 🔖 BANKED ITEMS (real, not yet done):
- **REAL tier-source rule violations** (separate from the Reports gate, which is correct):
  `app/(auth)/action-center/page.tsx:60` and `app/(auth)/agency/page.tsx:14` read `currentUser.organization.tier`
  (= organizations.tier) — VIOLATES the subscriptions.tier rule. Fix them (read subscriptions.tier like the correct
  gates). Also re-verify the reports-card gate (finding #2) reads subscriptions.tier, not organizations.tier.
- **Auto-refresh UX:** the reports list doesn't auto-update after clicking Generate (async — needs manual refresh).
  Add poll-until-ready. Minor.
- **Sprint 5 bank:** `trust_improved` win type uses `MAX(checkedAt)` → will need `new Date()` coercion (same class
  as the wins-feed `sql<Date>`→`sql<string>` fix from Sprint 3).
- **go-live #12:** SoV domain-variant normalization (a customer's own TLD-variant domain shows as a competitor) —
  still a `test.todo`, real pre-launch fix.
- **No p2sprint3/p2sprint4 QA batch scripts** exist (Section-5 QA gap; documented, fallback used).
- **Inngest for production:** local uses `inngest-cli dev`; prod needs Inngest Cloud keys + deployed serve endpoint.
- **OQ-1 local_seo_results** — deliberate deferral, no DDL until a dedicated local-SEO pass.
- **Parked visual polish:** the 0%-share SoV bar sliver.

### After Sprint 4 is fully validated → the full 5-section automated test track for Sprint 4 (same as Sprints 2 & 3:
Backend Unit → Backend E2E [BE-1..BE-4, incl. the cross-sprint pass] → Frontend Unit → Frontend E2E [Playwright,
dev-DB-not-prod] → QA). The Sprint 4↔Sprint 3 seam (report reading S3 data) is the high-risk area.

---

## 7. WHAT'S IN THIS PACKAGE

- **`phase-1/`** — Phase 1 LLD (`02-lld/`), prototype (`03-prototype/`), all 12 sprint prompts (`04-sprint-prompts/`,
  Sprints 1–12), and all Phase 1 fixes (`06-fixes-ui-validation/`, `07-fixes-billing-agency/`).
- **`phase-2/`** — **`visibleau-phase2-LLD-v8.70.md`** (the authority), `sprint-prompts/` (Phase 2 Sprints 1–9 +
  the latest Sprint 3 prompt), `prototype/visibleau-phase2-prototype-FIX17.jsx`, and `handover-phase2-original/`
  (the original Phase 2 handover folder for anything else).
- **`session-prompts-2026-07/`** — **all 82 Claude Code prompts** written across the recent sessions (every fix,
  diagnosis, and the Sprint 2/3 test-track prompts). Named descriptively. The most recent Sprint 4 ones:
  `fix-reports-orphaned-nav`, `fix-brand-detail-tier-undefined-crash`, `fix-apply-sprint4-migration-and-seed`,
  `fix-sprint4-core-typescript-bugs`, `fix-generate-report-on-demand-bypass-schedule-gate`,
  `configure-supabase-storage-adapter`, `configure-prod-env-supabase-storage`, `fix-storage-driver-default-and-env`,
  `diagnose-local-pdf-download-404`, `fix-report-section-json-dump`, `diagnose-fanout-nested-subquery`,
  `diagnose-reports-tier-gate-mismatch`, `fix-seed-subscription-rows-for-test-orgs`.

### ⚠️ CAVEATS ON THE PACKAGE (be honest with Sri):
- The **Phase 2 prototype is FIX17** and the **LLD is v8.70** — these are the latest I (prior chat) had. If Sri has
  advanced them further, use Sri's versions.
- The Phase 2 sprint prompts are from the handover ZIP; the **Sprint 3 prompt** has a known-latest copy
  (`...-LATEST.md`). If any other Phase 2 sprint prompt has been revised since, Sri should provide the newer one.
- **The repo source code itself is NOT in this package** (it's on Sri's Windows machine at
  `C:\startup\VisibleAU\src\`). This package is the CANON DOCS + the prompt history, which is what the reviewer
  chat needs. Claude Code has the actual code.

---

## 8. HOW TO START THE NEW CHAT (suggested first message to give the new Claude)

> "You're my VisibleAU reviewer/spec chat. Read HANDOFF-READ-ME-FIRST.md fully. We use a two-chat relay: you read
> the canon (Phase 2 LLD v8.70 + sprint prompts + prototype FIX17) and write ready-to-paste Claude Code .md prompts
> to /mnt/user-data/outputs/; a separate Claude Code session applies them. I paste results back as TEXT (file
> uploads arrive empty). Always three-source-check (LLD wins) before any fix, and give a fix prompt for every issue.
> We're mid-Sprint-4 manual testing. Current step: I've pasted the Supabase service_role key and seeded subscription
> rows — help me verify Reports unlocks for the Agency org, then generate a report in prod mode and confirm the PDF
> lands in the Supabase bucket + the sub-queries are clean (real LLM). [then paste the LLD, Sprint 4 prompt, and
> prototype, or upload this package]."

Then upload this ZIP (or the individual LLD + Sprint 4 prompt + prototype files) so the new chat has the canon.
