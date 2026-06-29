# Handoff — VisibleAU Phase 2 Sprint 2: Generate Remaining Test Prompts (Sections 2–5)

**For a new Claude chat.** Your job: generate ready-to-paste **Claude Code test prompts** for the remaining
Sprint 2 test sections (**2, 3, 4, 5**). Sections 1 + structural + manual on-screen testing are DONE. Read this,
then produce one scoped test prompt per section (Sri runs each in a separate Claude Code session and reports back).

---

## 1. WHO + WORKFLOW (read first)

**Operator:** Sri — Sydney solo full-stack dev, weekend pace, building VisibleAU (Australian-first GEO/AEO
visibility-auditing micro-SaaS — measures brand visibility across ChatGPT/Claude/Gemini/Perplexity for AU SMBs +
agencies).

**Stack:** Next.js (running on 16.2.6 + Turbopack), Supabase/Postgres + RLS, Drizzle, Better Auth (NOT Clerk),
Inngest, Vercel AI SDK, Stripe, Resend. Windows, `C:\startup\VisibleAU\src\`, `localhost:3000`, local prod-grade
Postgres, real LLM keys.

**Two-chat relay — how Sri works:**
- **YOU = the reviewer/spec chat.** You read canon (LLD, prototype, sprint prompts), and write ready-to-paste
  **Claude Code prompts.** You do NOT have repo access.
- **A separate Claude Code session = the executor.** It runs your prompts against the real repo + DB and reports
  back. You interpret the reports and iterate.

**Standing disciplines (follow these):**
- **A ready-to-paste prompt for everything** — scope each precisely (files/tests touched, exact checks,
  verification greps, constraints). Group related items sensibly.
- **Verify-before-claiming** — grep the canon; never trust summaries. LLD is source of truth; **LLD wins** over
  the sprint prompt and over the implementation when they conflict.
- **"Tests pass ≠ works on the rendered screen."** (Manual testing this session found 6 real bugs that 345 green
  backend tests missed.) For frontend sections especially, prefer behavioural assertions over shallow render
  checks.
- **Report-first / investigate-first** — for ambiguous results or verified-correct code, have Claude Code
  diagnose + REPORT before auto-fixing. Don't silently patch. **Escalate genuine LLD-level gaps** (annotate the
  LLD/prototype, then a build prompt) rather than inventing behavior.
- **Engineering standards are first-class:** performance, security (RLS, auth), scalability (no N+1s, indexing),
  accessibility (WCAG), mobile-responsive, loading/error states. Tests should check these where relevant.
- **Language:** English only (Telugu OFF unless Sri explicitly asks).

---

## 2. WHAT SPRINT 2 IS

**"Workflow Completion Engine."** Canonical loop: **Recommendation → Task → Draft → Approve → Mark complete →
Re-audit measures the lift.**
- 3 tables: `remediation_tasks` (#29), `workflow_runs` (#30), `content_drafts` (#31)
- 3 Inngest functions: `generate-content-draft`, `trigger-validation-reaudit` (has `step.sleep('14 days')`),
  `schedule-workflow-runs`
- UI: Workflow hub, Tasks kanban (Open/In Progress/Review/Done), content draft editor, dashboard "Work Completed"
  card
- 9 component shared foundation in `components/phase2/`; 7 API routes

---

## 3. LOCKED INVARIANTS — tests MUST respect/verify these (do NOT let a test "fix" them)

- **Status enums are 3-way and DELIBERATE (never unify):**
  - `audits.status='complete'` (no -d)
  - `remediation_tasks.status='complete'` (no -d) — enum: open | in_progress | ready_for_review | complete |
    wont_fix; default 'open'; **NEVER 'done'.** (CONFIRMED this session: build correctly uses `'complete'`; the
    Sprint 2 prompt's `'completed'` was an error — LLD wins.)
  - `workflow_runs.status='completed'` (-ed)
- **Kanban column→status:** Open→open, In Progress→in_progress, Review→ready_for_review, **Done→complete.**
  Moving a card to **Done MUST route through `POST /tasks/[id]/complete`** (emits `task/completed` → triggers
  `trigger-validation-reaudit`), NOT a plain PATCH. In Progress/Review use PATCH. **Tests must assert this
  routing** (Done = POST /complete, not PATCH).
- `subscriptions.tier` = tier source-of-truth (NOT organizations.tier).
- `assertBrandAccess()` = canonical brand-isolation gate (tests must verify cross-brand isolation).
- `record()` takes USD dollars (converts to AUD cents internally).
- **RLS tests MUST run under non-superuser `rls_test_role`** — superuser bypasses RLS = false pass. Critical for
  Section 2.
- Impact badge derives band from `scoreBefore` (≥70 High / ≥40 Med / <40 Low) — NOT from the integer `priority`
  rank. Integer priority is for ORDERING only. (This was a bug fixed this session — Section 3 should guard it.)
- Explainability contract `{rationale, confidence_label, confidence_note, top_action}` on scored sprints.

---

## 4. WHERE SPRINT 2 TESTING STANDS

**DONE:**
- ✅ Structural verification (18/18 §12 grep checks)
- ✅ **Section 1 (Backend Unit)** — 345 Sprint 2 tests green (200 baseline + the fix-tests added during manual
  testing). Zero source bugs in the unit layer.
- ✅ **Manual on-screen testing** (this session) — found + fixed 6 real bugs the green tests missed:
  - TC-01: no task-creation UI → built `createTaskFromRecommendation` + create-task-modal
  - Impact badge inverted (integer-rank-as-band) → fixed (derive from scoreBefore)
  - TC-03: no status-change interaction → built drag-and-drop + click/keyboard "Move to" buttons (native HTML5
    drag, no new package)
  - 3 drag bugs (complete cards draggable / same-column drop errored / no in-flight guard → double-fire 400s) →
    fixed (draggable only when allowed moves exist; same-status no-op; `movingTaskIds` Set + pending state)
  - Banked (design decisions, not bugs): Finding 1 (Workflow surfaces orphaned from nav), Finding 3 (Action
    Center scoping — built workspace-level but behaves single-brand, no brand selector; canon prototype is
    per-brand)
  - **The full loop now runs end-to-end:** drag to Done → `POST /complete` 200 → emits `task/completed` →
    `trigger-validation-reaudit` triggers (then sleeps 14 days). Verified live on the Inngest dev dashboard.

**REMAINING (what you generate test prompts for):**
- ⏳ **Section 2 — Backend E2E** (real DB)
- ⏳ **Section 3 — Frontend Unit** (the 9 phase2 components + workflow/kanban/draft)
- ⏳ **Section 4 — Frontend E2E** (interactions, full flow)
- ⏳ **Section 5 — QA / integration** (the end-to-end loop with measured lift)

---

## 5. SCOPE OF EACH REMAINING SECTION (target your prompts at these)

### Section 2 — Backend E2E (real Postgres)
- Real-DB lifecycle of all 3 tables (remediation_tasks, workflow_runs, content_drafts): create/read/update/
  delete, status transitions, FK integrity (CASCADE / SET NULL behaviour), constraints.
- **RLS under `rls_test_role` (non-superuser)** — cross-brand + cross-org isolation; `assertBrandAccess()`
  enforcement. (Superuser = false pass — the prompt must make this explicit.)
- The status-transition machine end-to-end (open→in_progress→ready_for_review→complete; wont_fix path).
- The `/complete` route's full effect: status→complete AND `task/completed` emitted (the re-audit trigger).
- **DIAGNOSE the known pre-existing failure here** (its proper home): `e2e-platform-tables.integration.test.ts`
  — `audit_cost_snapshots.audit_id ON DELETE CASCADE confdeltype` assertion (a Sprint 1 FK test, red since
  build; strong test-strictness candidate like the S1 index-name one). Report-first: is it a real FK defect or
  catalog-level test-strictness?
- Idempotency/atomicity where relevant (Phase 1 pattern: single `db.transaction`, idempotency inside the txn).

### Section 3 — Frontend Unit (the 9 `components/phase2/` + workflow/kanban/draft)
- Each of the 9 shared phase2 components renders + behaves per spec (props, states, a11y names).
- **task-card.tsx:** impact badge derives from `scoreBefore` (≥70/≥40/<40), NOT integer priority (guard the
  fixed bug); confidence badge correct; status badge.
- **task-kanban.tsx:** VALID_COLUMN_MOVES state machine; complete/wont_fix cards non-draggable; same-column
  no-op; in-flight guard (`movingTaskIds`) + pending state; Done→POST /complete vs others→PATCH; optimistic
  update + revert-on-failure; mobile list fallback.
- create-task-modal, workflow hub stats (stat=list invariant), content draft editor.
- Accessibility: cards are "buttons" + keyboard-navigable; ARIA; focus management.

### Section 4 — Frontend E2E (interactions + full flow, real or close-to-real)
- The interactions that manual testing exercised, now automated: create task from recommendation (Path 1) +
  modal (Path 2); duplicate guard; drag a card through every column; click/keyboard "Move to"; Done fires
  /complete; failure reverts; counts stay in sync.
- Draft generation → editor → approve/reject.
- Brand attribution survives (task created from a recommendation lands under the correct brand — Finding 3
  context: Action Center is workspace-level but must still attribute correctly).
- Empty states, loading states, error banners (role="alert").

### Section 5 — QA / integration (the whole loop with lift)
- End-to-end: Recommendation → create Task → generate Draft → Approve → Mark complete (Done) → `task/completed`
  → `trigger-validation-reaudit` → (fast-forward / shorten the 14-day sleep for testing) → re-audit runs →
  **measured lift** (the `scoreBefore → scoreAfter`, e.g. 80→actual) → dashboard "Work Completed" populates.
- Reconcile the dashboard vs Action-Center "Done this month" count (a discrepancy noted during manual testing).
- Cross-cutting: performance (no N+1 on kanban/hub queries), the Inngest functions actually firing in sequence.

---

## 6. ENVIRONMENT NOTES (so test prompts assume the right setup)

- Two terminals: Next.js app (`npm run dev`, `:3000`) + Inngest dev server (`START-INNGEST.bat`, `:8288`).
- Local env stubs in `.env.local`/`.env.dev`: `INNGEST_EVENT_KEY=local-stub`, `INNGEST_SIGNING_KEY=local-stub`,
  **`INNGEST_DEV=1`** (forces v4 dev mode — v4 defaults to Cloud mode), `RESEND_API_KEY=re_local_stub_for_dev`
  (a real-ish stub; the actual key is needed only when sending email). Stripe = test-mode `sk_test_...`.
- **Known latent issue Section-3/4 prompts should be aware of:** `lib/digest/send.ts` instantiates Resend at
  **module load** — if any test imports the Inngest serve route without `RESEND_API_KEY` set, it crashes the
  whole endpoint. (Proper fix = lazy instantiation, still PENDING. Tests should ensure the stub is present, or
  flag if they trip this.)
- Benign noise to ignore in logs: PostHog 404s (`/array/local-disabled/config`, `/flags`, `/e?...`) — analytics
  disabled locally. Next 16 "middleware→proxy" + `metadataBase` warnings are benign.
- Test brand: **Bondi Plumbing `8f59b2a2-6aa0-4318-9848-b33ed520ca36`** (VisibleAU Dev org). Also Asset Plumbing
  Solutions, Marrickville Dental Studio.

---

## 7. WHAT TO PRODUCE

Generate **one ready-to-paste Claude Code test prompt per section (2, 3, 4, 5)**. Each should:
- State the section's scope + the invariants it must verify (from §3/§5).
- Be **investigate-first / report-first** where the result could be ambiguous (esp. the Section 2 pre-existing
  `confdeltype` failure — diagnose, don't blindly "fix").
- Specify the test files to add/extend, the exact assertions, and the verification (run command + expected
  green count; RLS under `rls_test_role`; behavioural checks for FE).
- Respect "no source changes unless a real bug is found + reported first" — these are TEST-writing prompts, not
  refactors.
- For Section 5, include the practical note on shortening/fast-forwarding the `step.sleep('14 days')` to observe
  the re-audit + lift.

**Suggested order:** Section 2 first (backend foundation + clears the pre-existing failure), then 3, then 4,
then 5 (the capstone end-to-end). Confirm scope/order with Sri, then produce the prompts.

---

## 8. CANON TO READ (verify-before-claiming)
- **Phase 2 LLD v8.69** (latest) — `phase-2/01-lld/visibleau-phase2-7layer-lld-v8.69.md`
- **Phase 2 prototype FIX 17** (latest) — `phase-2/02-prototype/visibleau-phase2-prototype-FIX17.jsx`
- **Sprint 2 prompt** — `phase-2/03-sprint-prompts/visibleau-p2-sprint-2-prompt.md` (note its `'completed'`
  error — LLD's `'complete'` wins)
- This session's fixes/diagnostics — `phase-2/04-fixes-this-session/`
- ⚠️ The LLD + prototype are reviewer working copies — Sri should diff against the real repo before relying on
  them for exact line numbers.
