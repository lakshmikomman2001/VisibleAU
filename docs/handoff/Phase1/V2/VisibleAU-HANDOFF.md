# VisibleAU — Project Handoff (for a new chat)
**Last updated: 25 June 2026.** Paste this at the start of a new conversation so the assistant has full
context. Read top-to-bottom; the CRITICAL FACTS and WORKING METHOD sections prevent the most common
mistakes.

---

## 1. WHO + WHAT

**Operator:** Sri — Sydney-based solo full-stack dev (16+ yrs), full-time job + family, building a
micro-SaaS portfolio on weekends (~8 hrs/week). Strong OSS preference, sharp technical judgment,
verify-before-claim discipline.

**Project: VisibleAU** — an Australian-first **GEO/AEO visibility-auditing SaaS**. It measures how
visible a brand is across AI answer engines (ChatGPT, Claude, Gemini, Perplexity) — i.e. "when someone
asks an AI about products/services in your category, does your brand show up, and how favourably?"
Targets Australian SMBs and agencies. Per-brand flat-rate pricing in AUD (no per-prompt surprises).

**Environment:** Windows (Lenovo Intel Evo, **NO WSL**), VS Code + Claude Code extension (runs natively
on Windows). PostgreSQL 18 local. Package manager: pnpm.

---

## 2. THE TWO-CHAT WORKFLOW (important — this is how Sri works)

Sri uses a **two-chat relay**:
- **THIS chat (reviewer/spec chat)** = reads canon, verifies built features against canon + screenshots,
  and **writes ready-to-paste Claude Code prompts**. It has NO direct repo access.
- **A separate Claude Code session** (VS Code extension, on Sri's Windows machine) = applies those
  prompts to the actual repo.

So the assistant's main *output* is **precise, ready-to-paste Claude Code prompts** — not direct edits.
Every prompt should be self-contained: a Step 0 investigation section, exact changes, constraints, and
explicit verification greps/checks.

**Container note:** this chat's environment resets between sessions. Canon (the design docs) must be
re-uploaded each session or referenced from a bundle. (Sri has a Phase 1 bundle zip:
`visibleau-phase1-complete-bundle-2026-06-25.zip`.)

---

## 3. WORKING METHOD / DISCIPLINES (follow these)

- **Verify before claiming.** Grep canon before asserting a fact. Never trust self-reports — "typecheck
  passes" ≠ "works on real data"; "builder reports done" ≠ "correct on the rendered screen." Sri's
  screenshot discipline has caught many "Claude Code said done but the screen disagreed" cases.
- **Canon > memory. LLD/sprint-prompt > prototype** on conflicts. Flag when canon is silent rather than
  inventing.
- **A ready-to-paste fix prompt for EVERY issue found** — including minor/LOW. Group related issues
  sensibly; scope each precisely (files, exact change, verification greps, constraints).
- **No-fabricated-data** anywhere in client-facing paths.
- **Performance, Security, Scalability, UX are first-class** — optimised queries, proper indexing, RLS,
  no N+1s, secure auth, accessible + mobile-responsive UI, loading states, error boundaries.
- **Investigate-then-build prompts:** when behaviour depends on the actual repo (auth, env chain, exact
  paths), the prompt should make Claude Code investigate first and report, then act — don't hardcode
  guesses. (We were repeatedly burned by assuming paths — e.g. the Inngest endpoint was
  `/api/webhooks/inngest`, not the assumed `/api/inngest`.)
- **Communication:** direct, no padding, push back on weak proposals, mobile-readable markdown,
  plan-then-execute with approval gates. **English only** (Telugu translation OFF unless explicitly
  requested in-chat).

---

## 4. STACK (locked)

Next.js 15 (App Router) · Supabase/Postgres + RLS · Drizzle ORM · **Better Auth** (Clerk fully retired —
any residual "Clerk" string is documented drift) · Inngest (background jobs/cron) · Vercel AI SDK
(central model-selector) · Stripe (billing) · Resend (email) · Sentry · PostHog.
**Tiers:** Free / Starter / Growth / Agency / Agency Pro (+ Enterprise custom), all **AUD**.

**AUD prices (GST-inclusive — these are what's in Stripe):** Starter A$99/mo (A$990/yr) · Growth
A$299/mo (A$2,990/yr) · Agency A$499/mo (A$4,990/yr) · Agency Pro A$1,499/mo (A$14,990/yr) · One-off
audit A$299. Annual = 10× monthly (intentional "2 months free"). Free/Enterprise = no Stripe product.

---

## 5. ⚠️ CRITICAL LOCKED FACTS (these prevent real bugs)

- **`audits.status` = `'complete'`** (NO trailing -d). THREE different "complete" values exist and must
  NEVER be unified: (1) audit status `'complete'`; (2) `workflow_runs.status` = `'completed'`;
  (3) webhook/analytics EVENT names like `checkout.session.completed`, `audit.completed`,
  `signup_completed` (these are correctly `-ed`). A blind find-replace of "completed" WILL break Stripe
  + PostHog. This typo has caused multiple Phase 1 bugs.
- **Route params:** PAGE routes use `[brandId]`, API routes use `[id]`.
- **`regionEnum`** is lowercase COUNTRY: `'au'|'nz'|'uk'|'us'|'eu'|'ca'`, default `'au'`. NOT a state.
- **`primaryRegions`** is `text[]` in `STATE:Suburb` format (e.g. `NSW:Sydney CBD`), regex
  `/^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$/`. The 8 AU states: NSW/VIC/QLD/WA/SA/TAS/ACT/NT. (A real bug
  fixed this session: suburbs were hardcoded `NSW:` regardless of the brand's state.)
- **runs-per-prompt:** env-configurable via `lib/llm/tier-engines.ts` `runsForTier()` (reads
  `TIER_RUNS_*`, clamp 1–5). **Free = 3 runs** (decision; paid = 5). Set in `.env.dev`;
  **`TIER_RUNS_FREE=3` still needs setting in PROD Vercel.**
- **DIMENSION_WEIGHTS** 25/25/20/15/15 (Freq/Pos/Sentiment/Context/Accuracy). Context default = 50.
- **Inngest local endpoint: `/api/webhooks/inngest`** (NOT `/api/inngest`). **Stripe webhook:
  `/api/webhooks/stripe`.**
- **Better Auth users** must be created via the auth layer (not raw INSERT) or they can't log in.
- **Env chain on Windows:** `START-DEV.bat` copies `.env.dev` → `.env.local` (Next.js reads
  `.env.local`). So env changes require re-running `START-DEV.bat`, and putting a secret only in
  `.env.dev` without restarting does nothing.
- **LLM_MODE=mock in dev** (deterministic ~92.0 mock scores — a known artifact, not real).

---

## 6. WHERE THE PROJECT STANDS (25 Jun 2026)

**Phase 1:** Sprints **1–10 built & validated**. Sprints **11–12 build-pending** (12 = launch/prod prep,
covers Inngest Cloud + Stripe live-mode setup, legal, SOC2, beta cohort).

**This session's headline: Sprint 10 Stripe billing built, tested END-TO-END, and hardened.** Verified
on the rendered screen + at the DB level:
- Upgrade Free→Growth (and Free→Starter) works.
- Cancellation (downgrade-at-period-end) works.
- Stripe Customer Portal ("Manage subscription") works.
- **Atomicity PROVEN by fault injection** (forced a mid-handler throw → webhook 500 → tier stayed Free →
  subscription insert rolled back → 0 rows. Then the throw was removed and checkout restored.)

**Three real bugs caught & fixed during the Stripe test (would have shipped):**
1. `STRIPE_WEBHOOK_SECRET` was never set → every webhook returned 400 → tier never updated.
2. **Connection-pool deadlock:** `db/client.ts` had `max:1`, and webhook handlers used the global `db`
   inside a `db.transaction()` → the handler waited forever for a 2nd connection → 30s timeouts → tier
   never updated. Fixed: `max:10`, and handlers refactored to use `tx` exclusively.
3. Success-page copy showed the wrong plan name ("Welcome to Free!" after buying Growth) — was a
   downstream symptom of #1/#2; correct once tier updates.

**Webhook handlers hardened to production-grade:** all multi-write handlers now run their writes in ONE
transaction using `tx` (never global `db`), idempotency check + processed-event marker are INSIDE the
tx, pool stays `max:10`, and outbound/slow work (Stripe API retrieve, email) is moved BEFORE/AFTER the
tx so the transaction is short and DB-only. Verified PASS by grep AND by the rollback fault-injection
test.

**Data-integrity footgun ELIMINATED:** a no-WHERE `UPDATE organizations SET tier='agency'` existed in
BOTH `scripts/e2e-real-audit-test.ts` AND `START-PROD.bat` — it blasted EVERY org to Agency on each run
(a prod landmine: would hand every real customer free Agency). Fixed (scoped to the one "VisibleAU Dev"
org + a prod guard + row-count assert), and a codebase scan confirmed NO sibling unscoped updates/deletes.

**Test infrastructure ready:** Stripe CLI installed on Windows (after a saga — see notes), 9 Stripe test
products created, `.env.dev` fully configured, and **per-tier test users seeded** (2 per tier,
login-able, password `TestPass123!`): `free1/free2@test.visibleau.dev`, `starter1/2`, `growth1/2`,
`agency1/2`, `agencypro1/2`. Reusable for all future testing.

---

## 7. OPEN / PARKED ITEMS (with resume steps)

**Apply-before-building:**
- **Sprint 12 `'completed'`→`'complete'` fix** — the Sprint 12 PROMPT FILE has 3 audit-status bugs
  (badge endpoint, demo seed, retention cron). Apply `visibleau-sprint12-completed-status-fix.md` to the
  S12 prompt BEFORE building S12 (preserves Stripe/PostHog `*_completed` names). Bump S12 index from v1.1.

**Production TODO:**
- Set **`TIER_RUNS_FREE=3` in Vercel prod env** (only `.env.dev` done — this one saves real $).
- Sprint 12 covers Inngest Cloud registration + Stripe live-mode — the JF2 app-URL registration step is
  flagged as critical ("without it, jobs queue but never execute").

**Parked verifications (optional, edge-case confidence):**
- Webhook idempotency replay (`stripe events resend <evt_id>` → no-op).
- e2e-footgun-fix verification (read files / fake-prod-URL guard test / before-after tier snapshot).
- Cancellation date eyeball — confirm "downgrade on <date>" pulls real Stripe `current_period_end`.

**Parked technical:**
- **Inngest local dev sync 500:** the local Inngest dev server runs (dashboard at localhost:8288) but
  syncing the app returns `internal_server_error` (0 functions discovered) → can't manually invoke the
  cron locally. Endpoint is `/api/webhooks/inngest`. NOT urgent (local-only; prod uses Inngest Cloud).
  Resume: read the `pnpm dev` stack trace when sync fires; check `INNGEST_SIGNING_KEY`/`INNGEST_EVENT_KEY`
  in `.env.dev`.
- **Cron-fires runtime verification** (does a due schedule actually fire an audit?) — never observed;
  runbook ready (`visibleau-cron-fires-schedule-runbook.md`). Blocked on the Inngest local sync above;
  fold into Sprint 12 / launch prep.

**Secondary billing flows to test:** one-off audit purchase (NOTE: `payment-completed.ts` exists but
isn't wired to a route case — a known handler gap for one-off audits), other tier upgrades.

**Deferred features:** per-schedule time-of-day picker (deferred to post-Sprint-12;
`visibleau-schedule-time-of-day-enhancement-RECONCILED.md` — re-verify canon before running).

---

## 8. CANON LOCATIONS

Phase 1 bundle: `visibleau-phase1-complete-bundle-2026-06-25.zip`. Key contents:
- `01-foundational/` — **PRD v1.15, Foundations v1.12, Architecture v1.6, CLAUDE.md** (the real Phase 1
  spec; note Phase 1 has NO dedicated LLD — the 7-layer LLD in `02-lld-7layer/` is SHARED with Phase 2).
- `03-prototype/visibleau-prototype.jsx`
- `04-sprint-prompts/` — all 12 sprint prompts + index.
- `05/06/07-fixes-*` — all fix prompts across three eras (original build, prior review session, this
  session); folder 07 has a sprint-by-sprint mapping in the bundle README.

**Phase 2** (separate, design-complete, build-pending): LLD v8.68, prototype FIX 16, 9 sprint prompts
Gate-3 audited. Bundle: `visibleau-phase2-v8.68-complete-REVIEWED.zip`. (Not the subject of the 25 Jun
session, which was Phase 1 Sprint 10.)

---

## 9. NOTES / GOTCHAS LEARNED

- **Stripe CLI on Windows-no-WSL is hostile:** Scoop couldn't find the manifest; Windows Defender blocked
  the download; SmartScreen blocked running; a corrupted exe resulted from the AV cycle. What worked:
  direct-download the `windows_x86_64` zip to a Defender-excluded folder, verify SHA-256 with
  `certutil -hashfile <zip> SHA256`, run from a NORMAL (not admin) prompt. `stripe login` is interactive
  (browser) — can't be automated. `stripe listen --forward-to localhost:3000/api/webhooks/stripe` prints
  the `whsec_` for `STRIPE_WEBHOOK_SECRET`; leave it running during tests.
- **Stripe test cards:** `4242 4242 4242 4242` (success), `4000 0000 0000 0002` (decline),
  `4000 0027 6000 3184` (3DS). Any future expiry (12/34), any CVC (123), any postcode (2000). Test mode =
  no real money, ever. (Sri asked about this repeatedly — worth reassuring: the A$99/A$299 prices are
  CUSTOMER prices, not charges to Sri; Stripe fees only apply in live mode.)
- **Three terminals needed for Stripe testing:** `pnpm dev` (or START-DEV.bat), `stripe listen`, and the
  browser. If `pnpm dev` is down when paying, the webhook fires into a dead endpoint and the tier won't
  update — and the success redirect 404s.
- **Browser cache gremlin:** Better Auth sessions/pages can cache hard — a "logged-out" view may still
  show a deleted account's stale data. Use an incognito window to see ground truth.
- **One latent follow-up:** the deadlock fix removed `db.transaction()` and then the hardening re-added it
  correctly (handlers use `tx`). Atomicity is now proven. (No action needed — noted for completeness.)
