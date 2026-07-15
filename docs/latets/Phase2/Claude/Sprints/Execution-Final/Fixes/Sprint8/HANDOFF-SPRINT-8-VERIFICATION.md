# VisibleAU — HANDOFF for the new Claude chat: VERIFYING the completed Sprint 8 (Governance)

You are the **reviewer/spec chat** in a TWO-CHAT RELAY. **Sprint 8 (Governance, Layer 7) has been BUILT and
its §12 verification greps pass (28/28).** Your job this session is to **VERIFY that build** — walk the
screens against canon, run a real audit to test the webhook + audit-trail event chains, find the bugs the
greps can't catch, and write ready-to-paste Claude Code fix prompts for each. Read this whole document first.

> **The one sentence that matters most:** In this project, "the build report says complete + N checks pass"
> has meant "the real bugs are still hiding" **three sprints running** (S5 found 8, S6 ~10, S7 found 7
> including 2 HIGH). **28/28 §12 greps passing is the FLOOR, not the ceiling** — greps prove code strings
> exist and are wired; they do NOT prove the webhook delivers, the audit row writes, the screen renders, or
> the permission gate enforces. Those are the four things S8 is most likely to have gotten wrong, and they're
> exactly what the greps cannot see.

---

## 0. THE RELAY (how you operate)

- **Sri** = Sydney solo founder, VisibleAU (AU-first GEO/AEO AI-visibility auditing SaaS). Weekend pace,
  full-time job. Direct, no-padding; values honest correctness over reassurance.
- **You (this chat)** read canon + write ready-to-paste Claude Code `.md` fix prompts to
  `/mnt/user-data/outputs/`. A **separate Claude Code chat** applies them to `C:\startup\VisibleAU\src\`. **Sri
  pastes results back INLINE** (uploads from that chat arrive blank).
- **Your deliverable for every issue = a ready-to-paste Claude Code fix prompt** (including minor/LOW). Scope
  each precisely: affected files, exact change, verification greps/checks, constraints. Group related issues.

---

## 1. THE TWO DATABASES (this has bitten 5+ times)

- `visibleau` (dev — tests) and `visibleau_prod` (LOCAL prod — **Sri runs the app against this one**).
- **Migrations AND seeds must be applied to BOTH**, and **build reports have been WRONG about applying them.**
  Any fix prompt touching a migration/seed must **VERIFY the DB directly** (psql count / `\d table`), never
  trust "applied." For S8 specifically: confirm the **MI-01 migration** (4 tables) is on **both** DBs, and the
  **DR-01 residency writer** actually UPSERTed its rows (else the residency page is permanently empty).

---

## 2. CANON (read before verifying — in the zip under `phase-2/`)

- **Sprint 8 prompt:** `phase-2/sprint-prompts/visibleau-p2-sprint-8-prompt.md` — read §0 (context), §5 (tables),
  §6U.2/§6U.4 (the screens), **§8.1 (the WH-01 webhook extension — the #1 risk)**, §11 (tests), §12 (the greps
  that passed), **§13 (anti-patterns — the checklist of what the build most likely got wrong)**.
- **LLD:** `phase-2/lld/visibleau-phase2-LLD-v8.70.md` — v8.70 is latest. **When the prompt and the LLD
  disagree, the LLD WINS** (the prompt says so itself; this bit us in S6 and S7). Governance region ~8493;
  tables audit_trail 8507, org_members 8545, data_residency_log 8599, org_feature_flags 8647; WH-01 ~3850;
  RBAC matrix ~8533; DR-01 ~8620.
- **Prototype:** `phase-2/prototype/visibleau-phase2-prototype-FIX17.jsx` — the UI reference. Governance
  screens: **TeamManagement ~line 2800, DataResidency ~line 3034.** The built screens must match; deviations
  are findings.
- **Templates for your fix prompts:** `phase-2/fixes-and-test-track/` — 85 prompts from S4–S7. Study the
  `fix-s7-*` and `sprint7-testtrack-*` files; they show the exact structure that worked.

**Validation brand:** Metropolitan Plumbing, id `418f321f-2489-4560-aaa9-895728580465`, org
`da1071de-6dbd-4e08-8f43-29f76c123be9`, Agency tier, tradies, 4 competitors (fallonsolutions, hipages,
jimsplumbing, mremergency).

---

## 3. WHAT WAS BUILT (the S8 build inventory — so you know what to verify)

Per the Claude Code build report (all §12 greps passed — treat as the *starting point* of verification):

- **DB (4 tables + MI-01 migration, RLS):** `audit_trail`(#35), `org_members`(#36), `data_residency_log`(#37),
  `org_feature_flags`(#38).
- **6 lib/governance modules:** `audit-trail.ts` (`recordAction`), `access-control.ts` (RBAC matrix +
  `assertBrandAccess` S8b-01 + owner-ceiling S8b-02), `feature-flags.ts`, `data-residency.ts` +
  `record-data-residency.ts` (DR-01 UPSERT), and an edit to Phase 1's `lib/feature-flags/index.ts` (DB > env >
  defaults).
- **WH-01 fanout-webhooks extension:** 5 new triggers + 5 EVENT_NAME_MAP entries (slash→dot), **2 newly-added
  producer emits** (`visibility/trend-updated`, `hallucination/acknowledged`), 5 new VALID_EVENTS,
  per-endpoint `step.run` + `webhook_deliveries` dedup.
- **Backward edits:** `assertBrandAccess` retrofitted on **all 44 brand routes** (S1–S7); `recordAction` wired
  on **5 upstream routes** (draft approve/dismiss, journey trigger, hallucination ack, benchmark view).
- **7 API routes:** audit-trail, members (list/invite/PATCH/DELETE/accept), data-residency, feature-flags.
- **UI: 3 pages** (settings/team, settings/audit-trail, settings/data-residency) **+ 5 components**
  (member-row, role-badge, invite-form, audit-log-row, residency-table).

---

## 4. WHY §12 GREPS AREN'T ENOUGH (what they prove vs what they miss)

The 28 §12 greps assert **code strings exist and are wired**: 4 tables created, the 5 slash + 5 dot event
strings present in fanout-webhooks.ts, the 2 producer emits present at their source, `recordAction` referenced
at 7 sites, `assertBrandAccess` present in brand routes, RLS/no-Clerk/responsive hygiene. Real, worth having —
it proves no whole piece was skipped.

**But greps counting string occurrences CANNOT verify the four things that actually break:**

1. **That the webhook chain DELIVERS.** `grep -c "report.generated" → ≥5` proves the string is in the file. It
   does NOT prove that generating a report fires the event, fanout picks it up, slash→dot maps correctly, and a
   row lands in `webhook_deliveries` with a real POST. **This is the mirror of S7's dual-emit bug**, where
   `run-comparison-prompts` never fired due to a dot-vs-slash mismatch while its unit tests passed. A grep
   counting both forms present would have passed in S7 too.
2. **That `recordAction` WRITES a row.** `grep -Rc "recordAction" <route> → ≥1` proves the call is in the file.
   It does NOT prove it's reached (not behind a wrong branch), passes the right **`orgId`** (S7's HIGH bug was
   exactly `organizationId` vs `orgId` → NULL → 23502 crash), or that a row lands in `audit_trail`.
3. **That the RBAC matrix ENFORCES.** `grep -RcE "owner.*only" → ≥1` proves the phrase appears. It does NOT
   prove an *analyst* is actually blocked from assigning `owner` (S8b-02), or a *viewer* can't delete a brand.
4. **That anything RENDERS.** Zero §12 checks assert the 3 screens + 5 components display correctly. S7 shipped
   3 components with zero render tests, a nav-orphan, and a wrong-colored token — all invisible to greps.

---

## 5. THE FOUR VERIFICATION PRIORITIES (risk-ordered — do them in this order)

### PRIORITY 1 — THE WH-01 WEBHOOK CHAIN (the #1 risk; mirror of S7's dual-emit)
This is S8's whole cross-sprint payoff and the single most likely place for a silent event-chain bug.

The 5 events (internal **slash** → delivered **dot**):
- `report/generated` → `report.generated` (S4 generate-narrative-report — emit pre-exists, verify)
- `hallucination/detected` → `hallucination.detected` (S5 detect-hallucinations — pre-exists, verify)
- `agent/readiness-scored` → `agent.readiness.scored` (S6 score-agent-readiness — pre-exists, verify)
- `visibility/trend-updated` → `visibility.trend.updated` (S3 aggregate-visibility-trend — **NEWLY ADDED emit**)
- `hallucination/acknowledged` → `hallucination.acknowledged` (S5 PATCH ack route — **NEWLY ADDED emit**)

**How to verify (have Sri do this — it's the check greps can't substitute):**
1. **Run a real audit** on Metropolitan + trigger the acknowledge path, then **READ THE SERVER TERMINAL.** Do
   the 5 events fire? Does fanout-webhooks pick each up? Watch for a **slash-vs-dot mismatch** in
   EVENT_NAME_MAP — if the trigger listens on the wrong form or the map is keyed wrong, it silently never
   delivers (exactly S7).
2. **Check `webhook_deliveries`** in BOTH DBs for actual delivery rows after the audit.
3. **The 2 newly-added emits are highest-risk** (`visibility/trend-updated` in aggregate-visibility-trend.ts,
   `hallucination/acknowledged` in the PATCH route) — brand-new emit sites; confirm they fire on the REAL path
   with `{ organizationId }` in the payload, not just that the string is in the file. (Anti-pattern §13: "two
   dead webhooks" if these are half-done.)
4. **Retry idempotency:** Inngest is at-least-once — confirm a retry is a no-op (dedup via webhook_deliveries +
   step.run per endpoint), not a double-POST.

### PRIORITY 2 — DOES `recordAction` ACTUALLY WRITE? (the audit trail)
Only 2 of the 7 audited actions live in S8's own routes; the other 5 are **backward edits** to upstream routes
(S4 draft approve/dismiss, S7 journey-run, S5 acknowledge, S3 benchmark). audit_trail didn't exist until S8, so
those sprints couldn't have wired it — if a backward edit was missed, the audit log is **silently incomplete.**

**How to verify:** Run each audited action (approve a draft, trigger a journey, acknowledge a hallucination,
view the competitive benchmark, view data-residency), then **check `audit_trail` gets a row** with the correct
`orgId`, `action`, `resource_type`. **Watch the terminal for a 23502/NULL-org crash** — the S7 signature
(`organizationId` vs `orgId`). Then walk the **settings/audit-trail** screen and confirm those actions show.

### PRIORITY 3 — WALK THE 3 SETTINGS SCREENS (render correctness)
Against prototype TeamManagement (~2800) + DataResidency (~3034), and the recurring patterns:
- **NAV-ORPHAN (shipped 3×: S5 Trust, S6 Retrieval, S7 Discovery):** is `settings/` **reachable** — is there a
  nav entry/tile/link, or are the pages built-but-stranded? Check first.
- **settings/team:** member-row + role-badge + invite-form render; roles shown (owner/admin/analyst/viewer);
  the invite lifecycle (pending vs accepted) displays; RBAC actions gated on screen (a viewer shouldn't see
  destructive controls).
- **settings/audit-trail:** audit-log-row renders the recorded actions (ties to Priority 2).
- **settings/data-residency:** residency-table renders the DR-01 rows (empty = the writer didn't run — Priority
  1/§1).
- **Layer color/token** correct (S7's was defined with the wrong hex); **empty-state copy** matches the
  prompt's exact strings; responsive; loading/error states.

### PRIORITY 4 — RBAC ENFORCEMENT (S8b-01 + S8b-02 — actually attempt the forbidden action)
- **S8b-01 (brand-access):** RLS is org-scoped, so `assertBrandAccess` is the ONLY brand-isolation layer. A
  member restricted to brand A must NOT reach brand B. Don't just confirm the string is on 44 routes —
  **actually attempt** a cross-brand access as a restricted member and confirm it's blocked (404).
- **S8b-02 (owner-ceiling):** only an owner may assign/revoke `owner`; no actor elevates above their own role.
  **Actually attempt** an analyst/admin assigning `owner` and confirm it's blocked — not just that "owner only"
  appears in the code. (Anti-pattern §13: "an admin can mint an owner who deletes the org.")

---

## 6. RECURRING BUG PATTERNS (shipped every sprint — check each on S8)

- **Nav-orphan** (3×) → is settings reachable? (Priority 3)
- **Wrong layer color/token** (S7 orange-not-cyan) → check on screen, both themes.
- **Mandatory seed/writer not showing** (S7 §5.5 seed) → the DR-01 residency writer + MI-01 migration on BOTH
  DBs (verify psql count).
- **Non-canonical empty-state copy** (S7) → match the prompt's exact strings.
- **Event-chain bugs** (S7's 2 HIGH — most relevant here): dot-vs-slash mismatch + null-org crash. **The
  dot-vs-slash CONVENTION guard from S7 exists — verify it covers the 5 new WH-01 events, and EXTEND it if
  not.**
- **`recordAction` present-but-not-writing / backward edit missed** (Priority 2).
- **Stub/inert code** — S8b-01 shipped inert (stored but not enforced) is the §13 warning; Priority 4.

---

## 7. INVARIANTS (assert/respect)

- `subscriptions.tier` is the SOLE tier source — never `organizations.tier`.
- **The 3 auth layers must NOT be conflated** (LLD 8533): Better Auth `auth_members` (never write directly) →
  Phase 1 `users.role` (org-level) → Phase 2 `org_members` (brand-level, this sprint, FK'd to the internal
  users mirror NOT auth_members). Permission order: session → users.role → org_members.
- RLS: `organization_id` direct-org_id policies; cross-org → **404 not 401**; `setRlsContext(db, orgId)` before
  queries.
- `org_feature_flags` is **operator-set only** — the API is read-only (no user-facing write path, §13).
- Feature-flag priority: **DB > env > defaults** (the Phase 1 lib edit — without it, per-org overrides do
  nothing).
- Invitation cancel (IC-01): DELETE only WHERE `accepted_at IS NULL`; accepted members → is_active=false /
  role-change (never delete accepted via cancel).
- `serve()` path = `app/api/webhooks/inngest/route.ts`. No hardcoded models (LLMService); no hex-alpha on CSS
  vars; no Clerk (Better Auth).

---

## 8. THE OPEN QUESTION (OQ-1 — needs Sri's decision, does NOT block)

`local_seo_results` has **no canon DDL** — S8 correctly did NOT build it (verify: `test ! -e
db/schema/local-seo-results.ts`). S6's `local_ai_trust_score` stays **NULL** until Sri resolves whether/how to
add that table. If Sri wants to close the S6 dependency, that's a separate design decision — flag it, don't
invent a schema.

---

## 9. WORKING STYLE with Sri

- English only (Telugu OFF unless asked in-conversation).
- Flag a genuine correctness risk ONCE, clearly, then execute Sri's decision — don't re-litigate.
- Performance, Security, Scalability, UX are non-negotiable first-class concerns.
- Respect mock-data-only for automated tests — but the **real LLM audit + terminal read is the highest-value
  check** and is MANDATORY for S8 (it's the only thing that catches the webhook event-chain bugs).
- Don't rubber-stamp. "Looks complete" on an unverified build is as useless as "44 tests pass" was in S7.

---

## 10. YOUR FIRST MOVE

1. **Read** the S8 prompt (§8.1 WH-01, §6U screens, §12 greps, §13 anti-patterns) + the LLD Governance region +
   the prototype Governance screens.
2. **Start with PRIORITY 1** — ask Sri to **run a real audit + trigger the acknowledge path, then paste the
   server terminal + the `webhook_deliveries` rows.** That's the single highest-value check and the one the 28
   greps fundamentally cannot substitute for. (If the 5 events fire and deliveries land → the #1 risk clears.
   If a slash-vs-dot mismatch or a dead newly-added emit shows → that's the biggest finding, mirror of S7.)
3. Then Priorities 2 → 3 → 4. Write a ready-to-paste fix prompt for every finding, verify each on the rendered
   screen / in the DB / in the terminal.
4. When the visible walk + real audit are clean, build the **5-phase test track section by section + QA** (see
   the S7 test-track prompts in `fixes-and-test-track/` as templates) — with the webhook chain and the audit
   writes guarded at integration + E2E + grep levels (the 3-level pattern that closed S7's CPR-01).

Expect the drill: the build is §12-green → the walk + real audit find what the greps missed (esp. the webhook
chain + the audit-trail writes + RBAC enforcement) → fix + verify → then the test track. This is how S5, S6,
S7 all closed. Same for S8.

Good luck.
