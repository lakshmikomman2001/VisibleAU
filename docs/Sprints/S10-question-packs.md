# S10 — Question packs (Stripe add-on) and full entitlement enforcement

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report-back to `docs/Sprints/reports/S10-report.md` and commit it as the last commit.

Start with `git fetch origin` and build on `origin/main` (S09 pushed); say which hash. Read LLD **section 0** (v1.8 decisions and amendments) first, then sections 2.2–2.3 (market pricing), 7.6, 8.3.5, 8.7, 11, 20 (D8) and `docs/lld/design/Vunnara-client-improvements-design.pdf` section 5 (pack pricing; reasoning only); contract screens P14, P01 (packs link), P05 (packs shown per brand).

**UI contract:** build every screen named above from `docs/prototypes/vunnara-ui-config.ts` (its `screens` entries; canonical for layout, tokens, exact copy, states, accessibility, responsive rules and acceptance), following `docs/prototypes/PROTOTYPE-GUIDE.md` and mapping every token and component through `docs/prototypes/token-map.md`. `client-enhancements-v2.html` and `docs/prototypes/screens/*.png` are the visual reference. Interactive and tested nodes get `data-testid` from `testIdOf(node id)`. A screen part isn't done until all of its listed states exist.

**Rules (every part):**
- One commit per numbered part; don't amend; commit only in a separate step after tests finish, never chained with `;`. **Never push.**
- Targeted tests only: related tests, new tests RED on the parent then GREEN, typecheck, lint, compared by name with `tests/known-failures.txt` (0 entries; keep 0), named guards (plan-claim, cost-visibility, GST). Full suites only if Sri asks. Playwright only in parts that change a screen or a shared UI component: run the specs `scripts/qa/e2e-specs-for.ts` maps to the files that part changed, one at a time, only with ≥ 6 GB free (otherwise "not run: memory" and list the specs). Parts that change only data, jobs, scoring, APIs or PDF rendering don't run Playwright; say "Playwright: not needed (no UI change)".
- ⛔ No mock data in production; **no invented prices anywhere**: prices come from Stripe objects Sri creates. No GST shown or charged (Vunnara isn't registered for GST). Stripe stays in test mode. No `any`; FORCE RLS; no new `serviceDb`; no production writes.
- Non-regression: LLD section 4 (N1–N15) must hold after every part; list the guards you ran for each part.
- Behind `question_packs` (off).
- If the LLD contradicts the code, the code wins: report with file:line; continue only with independent parts.

## 1. Cost table for Sri (no product change) — then wait for prices
From `/admin/costs` data (real spend per answer by engine and model, and Google AI per question), compute per plan the monthly cost of 10 extra everyday questions per brand at that plan's audit frequency (engines × questions × audits per month, plus Google where the plan has it), and the price needed at 60%, 70% and 80% gross margin. Write `docs/lld/question-pack-cost-table.md` (operator-only figures; never shipped to customers). Also list the Stripe objects Sri must create (one recurring price per plan for "10 extra questions per brand", quantity-based) and the env var names to hold their ids. **Stop after this part** until Sri confirms the prices and creates the Stripe prices.

## 2. Stripe and webhook
Add-on price ids per plan from env; subscription item quantity = packs; prorated changes through the existing Checkout/Customer Portal flow; webhook updates `organizations.question_packs` idempotently (existing event-id hardening); downgrades that remove the add-on set packs to 0 and trigger the pack-removal flow. Tests with Stripe test fixtures: purchase, increase, decrease, cancel, duplicate events.

## 3. Assignment and enforcement (LLD 7.6, 8.7)
`brand_question_packs` assignment API with `select … for update` on the organization and the sum check; limits = included + 10 × packs per brand in `getQuestionLimits`; enforced at apply and audit start; Google per-audit cost ceiling scales with questions. Removing packs from a brand opens the P02 draft to choose; otherwise lowest-ranked everyday questions are removed from the next audit through the apply flow with notice. Tests: concurrency, over-assignment refusal, removal flow, audit-start enforcement.

## 4. Billing UI and public claims (P14)
Billing card per P14 (owned, assigned, available, per-brand steppers, "Buy packs"); P05 and P01 show packs; public pricing page and comparison table add "Extra questions: 10 per pack" via `tiers.ts` only for plans that offer it and only while the flag is on (setting-aware pattern). Price shown is read from Stripe. Tests: component, e2e in Stripe test mode, plan-claim guard.

## Report-back
- Part 1: the cost table path and the Stripe objects list; stop.
- Later parts: file:line, changes, tests (RED/GREEN, by name), guards, Playwright run, "not run: memory" (with the specs) or "not needed (no UI change)".
- UI: for each screen touched, the guide's per-screen block (nodes built of specified, states, acceptance pass/fail, screenshots in `.qa/screens/S10/` at 1240 and 390, deviations with the contract change you propose).
- Commit hashes and `git log origin/main..main --oneline`.
- Push notes: migration (none expected beyond 0156); Stripe env vars to set in Vercel before the push; Inngest resync (yes if the webhook function changed); safe while an audit runs; flag `question_packs` off.

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
