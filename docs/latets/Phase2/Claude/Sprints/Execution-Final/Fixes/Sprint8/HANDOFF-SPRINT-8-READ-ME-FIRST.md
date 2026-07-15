# VisibleAU — HANDOFF for the new Claude reviewer chat (Sprint 8)

You are the **reviewer/spec chat** in a TWO-CHAT RELAY. Read this whole document first. Your job for this
session: help the user (Sri) review **Sprint 8 (Governance, Layer 7)** — walk the built screens against canon,
find bugs manual-testing surfaces, write ready-to-paste fix prompts, then build the 5-phase automated test
track section by section (+ QA). This document tells you exactly how, using the disciplines proven across
Sprints 5, 6, and 7.

---

## 0. WHO / WHAT / HOW (the relay)

- **Sri** = Sydney-based solo founder building **VisibleAU** — an AU-first GEO/AEO AI-visibility auditing
  micro-SaaS (audits how AI engines — ChatGPT/Claude/Gemini/Perplexity — see/cite a brand). Weekend pace,
  full-time job alongside. Direct, no-padding communication. Values honest correctness over reassurance.
- **The relay:** YOU (this chat) read canon and **write ready-to-paste Claude Code `.md` prompts** to
  `/mnt/user-data/outputs/`. A **separate Claude Code chat** applies them to the Windows repo at
  `C:\startup\VisibleAU\src\`. **Sri pastes the Claude Code results back to you INLINE** (file uploads from
  that chat arrive blank — always inline). You never edit the repo directly.
- **Your deliverable for every issue found = a ready-to-paste Claude Code fix prompt** — including minor/LOW
  ones. Group related issues into one prompt where sensible. Scope each precisely: affected files/components,
  the exact change, verification greps/checks, and constraints. (This is a standing user preference.)

---

## 1. THE STACK + THE TWO DATABASES (critical)

- Next.js 16 Turbopack · local Postgres · Drizzle · Better Auth · Inngest · Vercel AI SDK · Stripe sandbox ·
  Resend · Supabase Storage. Tests: **vitest** (unit/integration) + **Playwright** (E2E). LLM_MODE=mock for
  automated tests; Sri can run a **real LLM audit** for manual verification.
- **TWO local DBs — this has bitten 5+ times:**
  - `visibleau` (dev — tests run here)
  - `visibleau_prod` (LOCAL prod — **Sri runs the app against this one**)
  - **MIGRATIONS AND SEEDS MUST BE APPLIED TO BOTH.** And **build reports have been WRONG about applying
    them** — so a fix prompt that adds a migration/seed must **VERIFY the DB directly** (`\d table` / a psql
    count), never trust "seed ran." A `db:migrate:all` / `seed:all` convenience is recommended if you can
    prompt for it.

---

## 2. CANON (what to read, and version rules)

In this zip under `phase-2/`:
- **LLD: `phase-2/lld/visibleau-phase2-LLD-v8.70.md`** — v8.70 is the LATEST. (Sprint prompts were written
  against v8.68/v8.69; **when the prompt and the LLD disagree, the LLD v8.70 WINS** — this happened in S6 and
  S7.)
- **Prototype: `phase-2/prototype/visibleau-phase2-prototype-FIX17.jsx`** — the Figma-style UI reference
  (exact colors, layer tokens, component shapes). The build must match this; deviations are findings.
- **Sprint prompts: `phase-2/sprint-prompts/`** — the S8 prompt is `visibleau-p2-sprint-8-prompt.md`. Each
  has a **§11 (named test files)**, a **§12 (verification greps)**, and a **§13 (anti-patterns)** — read all
  three for S8.
- **This session's S1–S7 fix + test-track prompts: `phase-2/fixes-and-test-track/`** — 85 files. These are
  your **templates** for how to scope prompts. Especially study the S7 ones (prefix `fix-s7-*` and
  `sprint7-testtrack-*`) — they show the exact structure that worked.
- Phase 1 (`phase-1/`) is background: the earlier 12-sprint build (LLD + prototype + 13 sprint prompts + 52
  fix prompts). You rarely need it, but it's here for reference.

**Phase 2 "Sprint N" = BUILD ORDER, distinct from LAYER:**
S1=Platform Foundation · S2=Layer5 Workflow · S3=Layer2 Visibility · S4=Layer6 Reports · S5=Layer3 Trust ·
S6=Layer1 Retrieval · **S7=Layer4 Discovery** · **S8=Layer7 Governance (tables 35–38 + WH-01 webhooks)** ·
S9=Autopilot UX.

**Validation brand:** Metropolitan Plumbing — `metropolitanplumbing.com.au`, brand id
`418f321f-2489-4560-aaa9-895728580465`, org `da1071de-6dbd-4e08-8f43-29f76c123be9`, Agency tier, vertical
`tradies`, 4 configured competitors (fallonsolutions, hipages, jimsplumbing, mremergency).

---

## 3. BUILD STATUS (where the project is)

- **Phase 1** (12 sprints) — DONE.
- **Phase-2 Sprints 1–7** — DONE.
  - **S5 (Trust)** — manually verified on all 8 screens + backend/integration tests (134 files/1988 green);
    **Frontend-E2E/Playwright NOT built for S5** (retrofittable — the harness exists).
  - **S6 (Retrieval + Agent Readiness + CDN Shield)** — COMPLETE, 6 screens walked, full 5-phase track (193
    tests + 43 QA greps).
  - **S7 (Discovery)** — COMPLETE + full 5-phase track + §12 QA, **committed `a8f20ed`** (~104 vitest + 15
    Playwright E2E + 74 QA invariants). 7 findings all fixed + verified on screen; both cross-sprint
    obligations (dual-emit + CPR-01) verified end-to-end via a **real LLM audit**.
- **S8 (Governance) — NOT STARTED. This is the session's work.**

---

## 4. THE CORE METHOD (bedrock — this is why the relay exists)

Every sprint the Claude Code build reports **"N tests pass, complete, ready to commit."** Every sprint, the
manual walk + a real audit finds **real bugs the tests missed** (S5: 8, S6: ~10, S7: 7 including 2 HIGH + a
broken acceptance criterion). The tests are green because they test units in isolation; the bugs live in
rendered screens, seed application, event chains, and config. So:

1. **greps/tests passing ≠ works on the rendered screen.** Never accept "N green, ship it." **Walk every
   screen** against the LLD + prototype + sprint prompt.
2. **A real LLM AUDIT RUN + reading the SERVER TERMINAL is the ONLY thing that catches cross-sprint
   EVENT-CHAIN bugs** (dual-emit, dot-vs-slash event mismatch, null-org crashes). Unit tests invoke functions
   directly, bypassing the event name/context. **For S8 this is MANDATORY** — WH-01 means webhooks, so
   webhook event-chain bugs are LIKELY. After the build, have Sri **run a real audit and paste the terminal**.
3. **HOLLOW ACCEPTANCE TESTS:** a passing test that exercises a route/shape but not the RENDER can coexist
   with a live stub (S7's CPR-01 "Coming soon" passed its test while stubbed). Guard acceptance criteria at
   **3 levels**: integration assertion + E2E render-proof + grep.
4. **"Build claims X" is repeatedly FALSE on screen** — nav tile forgotten, tokens wrong-valued, seed not on
   prod, stub not removed, wrong data source. VERIFY on the rendered screen, and **reconcile two views that
   read the same table** (S7: the Discovery comparisons screen and the S3 benchmark both showed 8W/6L/2D →
   that agreement was the proof).
5. **audit-the-audit** — a careful audit can rationalize a bug into a design choice. Cite the canon line,
   don't infer intent.
6. **Verify migrations/seeds in the DB directly** (psql), and **read the ACTUAL output** (regenerate the
   artifact, read it — S6's llms.txt shipped tracking-pixel garbage that every metric scored 17/18).

---

## 5. RECURRING BUG PATTERNS TO CHECK ON S8 (they've shipped every sprint)

- **NAV-ORPHAN (shipped 3×: S5 Trust, S6 Retrieval, S7 Discovery):** the layer's hub PAGE gets built but the
  **tile on the brand page** (`components/domain/brand/brand-detail-client.tsx`) is forgotten → the whole
  feature is unreachable except by URL. **S8 will have a Governance hub — check the tile exists.** A repo-wide
  grep guard now asserts the brand-page nav references each layer route (extend it for Governance).
- **WRONG LAYER COLOR / TOKEN:** S7's `--layer-discovery` was defined with the wrong hex (orange not cyan).
  Check S8's layer token renders the canonical color on screen (both light + dark themes).
- **MANDATORY SEED NOT SHOWING:** S7's §5.5 prebuilt-journeys seed (an acceptance criterion) didn't reach the
  screen — either not applied to prod, or the query excluded global templates. If S8 has a seed, verify the
  DB count AND that it renders.
- **NON-CANONICAL EMPTY-STATE COPY:** S7 invented "Create via the API" instead of the canonical copy. Check
  S8's empty states match the prompt's exact strings.
- **EVENT-CHAIN BUGS (the S7 HIGH bugs — most relevant to S8's WH-01 webhooks):**
  - **null-org crash:** a function woken by an event destructured the wrong key (`organizationId` while the
    emit sends `orgId`) → NULL → 23502 NOT-NULL violation → 400. Only a real audit surfaced it.
  - **DOT-vs-SLASH event mismatch:** `run-audit` emits `audit.complete` (DOT) but 4 functions listened on
    `audit/complete` (SLASH) → they never fired. **A dot-vs-slash CONVENTION guard now exists — EXTEND it for
    S8's WH-01 webhook events.** Verify webhook event producers and consumers agree on the exact event name.
- **STUB NOT ACTUALLY REMOVED / WRONG DATA SOURCE:** S7's CPR-01 benchmark (a) shipped still stubbed
  (`data={null}` past a working route), then (b) read the wrong competitor source (a SOV domain, not the
  configured competitors). If S8 completes any cross-sprint "Coming soon," verify the RENDER shows the right
  data, reconciled with another view.
- **SEED SHAPE ARTIFACTS:** hand-seeded data that doesn't match the real writer's output shape produces screen
  glitches that look like bugs but aren't — check the seed shape first before assuming a code bug.

---

## 6. THE 5-PHASE TEST TRACK (build it SECTION BY SECTION after the manual walk)

Sri's standard, built **one section at a time — re-break proof each, confirm, then the next** (do NOT jump
ahead). **INVENTORY-FIRST every section** (the build + the fixes already grew a test suite; verify each test
is behavioral + fires on re-break, don't duplicate; rewrite any source-grep/typeof-smoke to behavioral):

1. **Backend Unit** — pure scorers/derivers (no DB, no events). Pin assertions to EXACT canon formula values.
2. **Backend Integration** — DB writes, event chains, RLS (direct org_id, cross-org → **404 not 401**,
   `setRlsContext` required), cascade (retention), CHECK constraints, tier gates (`subscriptions.tier` — never
   `organizations.tier`). **For S8: the WH-01 webhook event chain + the dual-emit/event-name consistency go
   here.**
3. **Walk regression guards** — one guard for EVERY finding the manual walk caught (many get added during the
   fixes — inventory them). **page-module-export smokes MUST be RUNTIME `import()`** (regex/existsSync is
   HOLLOW — S6 proved: they pass while the module is broken; a runtime import executes it and fails on a
   syntax/export error).
4. **Frontend Unit** — component render tests (testing-library/jsdom), all STATES (loading/empty/data/error),
   and correct data. (S7's build shipped ZERO frontend tests — expect the same gap.)
5. **Frontend E2E** — Playwright browser specs mirroring the manual walk. **Harness EXISTS:** `tests/e2e/`,
   `@playwright/test`, `helpers/auth.ts` (`signInAsTestUser` auto-signin), `helpers/db.ts` (`serviceDb` seed),
   `.env.test.local` (dev DB), and `sprint6/` + `sprint7/` specs to copy. Seed via `serviceDb`, auto-signin,
   assert, clean up in `afterAll`. Include a **render-proof** for any acceptance criterion. NOTE: the `@/`
   alias error under standalone `tsc --strict` is a **tooling artifact** — specs resolve fine at Playwright
   runtime (S6/S7 pattern works).
6. **QA (§12 greps)** — assemble the sprint's §12 checks into a re-runnable `scripts/qa/sprint8-invariants.sh`
   (PASS/FAIL per check, non-zero exit on any fail), matching the S4–S7 pattern. **Assert the sprint's N
   functions are PRESENT in `serve()`** (path `app/api/webhooks/inngest/route.ts`), **NOT a running total**
   (totals drift → false fail). **Fix grep paths to the real repo; NEVER weaken an assertion to pass** — a
   failing check is either a real violation or a path mismatch; distinguish which. Correct any §12 check the
   walk proved wrong (e.g. S7's §12 said `audit/complete` slash, but the emit is `audit.complete` dot — the
   script asserts the corrected dot form + slash→0 for consumers).

Section-by-section counts for S7 (as a reference for scale): Backend Unit ~44 · Backend Integration ~29 ·
Walk guards 74 invariants + runtime-import smokes · Frontend Unit 17 · Frontend E2E 15 · §12 QA 74 checks.

---

## 7. INVARIANTS carried across all sprints (assert/respect these)

- `subscriptions.tier` is the SOLE tier source-of-truth — **never `organizations.tier`**.
- RLS: new tables carry `organization_id` → **direct-org_id** policies (USING + WITH CHECK); cross-org reads
  → **404 not 401**; `setRlsContext(db, orgId)` MUST be called before queries (silent bypass without it).
- `assertBrandAccess()` is the canonical brand-isolation gate.
- Explainability contract: `{ rationale, confidence_label, confidence_note, top_action }`.
- No hardcoded model strings in lib code (use `LLMService`); no hex-alpha on CSS vars; no Clerk (Better Auth
  only); responsive (`md:grid-cols`, `sm:`); loading states + error boundaries.
- `serve()` path is `app/api/webhooks/inngest/route.ts` (NOT `app/api/inngest`).

---

## 8. OPEN / CARRIED items (non-blocking — mention if relevant, don't chase unless asked)

- **S6 tier gate:** dead code labelled "Growth" should be Starter+ per LLD 3170 — currently **ungated → Free
  users can see crawler-logs/CDN alert** (a packaging leak). S8/later cleanup.
- **3 §6U.5 components spec'd-but-NOT-built** (agent-readiness-gauge spider, mcp-status-card, local-ai-trust
  standalone card) — a deliberate design-simplification, Sri's call.
- **CdnBlockAlert browser-render not E2E-verified** (needs a real blocked domain; honest-block LOGIC verified
  on data: Cloudflare+200 → not blocked).
- **`depth_score` is structural-only, not quality-aware** (a poor llms.txt scores high — future rubric
  decision).
- **`local_ai_trust_score` is NULL until S8** (canon-binding decision — NOT a partial score; it needs the
  `local_seo_results` table). **S8 IS the Governance sprint — if it adds `local_seo_results`, the
  local-ai-trust scorer will start computing; watch for that.**
- **content-structure/entity-home now score on cleaner extraction** (S6 crawler fix) — watch for score shifts
  on re-crawl.
- **S5 Frontend-E2E/Playwright retrofit** available now the harness exists.
- **TIER_ENGINES starter-vs-agency count** may contradict canon (an S7 test asserts starter→4 engines; canon
  §11 says Growth 4 / Starter 2 — reconcile).
- **The DOT-vs-SLASH event-name split** is a repo footgun now guarded by a convention check — **extend it for
  S8's WH-01 webhooks.**

---

## 9. WORKING STYLE with Sri

- Respond in English only (Telugu OFF unless Sri asks in-conversation).
- Flag a genuine correctness risk ONCE, clearly, then execute Sri's decision — don't re-litigate settled
  matters. Keep process-opinions separate/skippable.
- When Sri asks to design sprint prompts/prototypes, do it properly and completely on the first attempt —
  don't stall or defer ("do it first and get it right the first time").
- Performance, Security, Scalability, UX are non-negotiable first-class concerns — optimized queries, proper
  indexing, RLS, no N+1s, secure auth, accessible + mobile-responsive UI, loading states, error boundaries,
  production-grade code.
- Respect the **mock-data-only** constraint for automated testing (no live LLMs / prod DB there) — but Sri
  WILL run a **real LLM audit** for manual cross-sprint verification, which is the highest-value check.

---

## 10. YOUR FIRST MOVE THIS SESSION

Sri will point you at Sprint 8. Then:
1. **Read** `phase-2/sprint-prompts/visibleau-p2-sprint-8-prompt.md` (§11 tests, §12 greps, §13 anti-patterns)
   + the relevant **LLD v8.70** Layer-7/Governance region + the **prototype FIX17** Governance screens.
2. Produce the **build plan / what to verify** — the Governance screens, the WH-01 webhook event chain, any
   cross-sprint seam, the tier gates, and the recurring patterns from §5 above.
3. When the build report comes back "N green, ship it" — **it won't be done.** Walk the screens, have Sri run
   a **real audit + paste the terminal** (mandatory for WH-01 webhooks), write a fix prompt for every finding,
   verify each on the rendered screen.
4. Then build the **5-phase test track section by section + QA** per §6.

Expect the drill: build says complete → the walk + real audit find what green missed (esp. webhook event
chains + any acceptance criteria) → fix + verify on screen → then the test track.

Good luck. The method has closed S5, S6, S7 cleanly — same drill for S8.
