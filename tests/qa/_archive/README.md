# Archived QA specs

Moved here on 10 Nov 2026 (Playwright-run follow-ups, part 5, Sri's decisions of 9 Nov). They are kept for
their history, **not run**: no Playwright or vitest config includes this folder, and
`tests/unit/qa/qa-archive.test.ts` fails if one does, or if a live config's folder still holds one of these
files. Don't move a spec back without rewriting it against today's app first: several of these delete shared
rows.

The reasons come from the first full Playwright run (`nightly-reports/2026-11-09-playwright-b90bfb6.md`,
section 5), checked against the code on 10 Nov.

## Obsolete (23)

| Spec | Why it's archived |
|---|---|
| `sprint1/f03-auth-signup` | **Destructive shared seeding.** `seedOrg`/`seedUser` upsert on the E2E_TEST_USER_1/2 clerk ids, moving those users' profiles into the spec's org with no `org_members` row (sign-in then lands on /no-workspace), and `cleanupOrg` (`sprint1/shared/cleanup.ts`) hard-deletes the org's brands, users and the org itself. Either the spec fails or the shared e2e fixtures are left changed. |
| `sprint1/f04-auth-signin` | The same destructive seeding. |
| `sprint1/f05-brand-crud` | The same seeding. F05-06 expects 404 where the API answered 403 then (404 since bb69f3d). It seeds `organizations.tier = "agency"`, but plans come from `subscriptions`, so the brand POST gets 403 at the limit where 201 is expected. |
| `sprint1/f06-brand-limit` | Needs a ready-made `better-auth.session_token` cookie from `E2E_TEST_USER_1_SESSION_ID` that no script creates; the same seeding. |
| `sprint1/f07-cross-org` | Cross-org expectations from before the 404 policy; the same seeding. Covered today by `tests/e2e/05-cross-org-isolation.spec.ts` and `tests/integration/brand-not-found.integration.test.ts`. |
| `sprint1/f08-soft-delete` | The same seeding. Soft delete is covered by `tests/integration/brand-not-found.integration.test.ts` and `tests/e2e/04-brand-detail.spec.ts`. |
| `sprint1/f11-clerk-webhook` | Posts svix-signed Clerk payloads to `/api/webhooks/clerk`, which no longer exists (Clerk was replaced by better-auth). |
| `sprint1/f12-rls-policies` | The same destructive seeding, and its own client on `DATABASE_URL` with no check of which database it is. Its RLS checks still match migration 0029; RLS is covered by `tests/e2e/backend/07-rls-isolation.test.ts` and the integration suite. |
| `sprint2/f01-audit-create` | Inserts a brand into "whatever org comes back first". POST /api/audits now answers 409 `brand_needs_confirmation` for an unconfirmed brand where 201 is expected. |
| `sprint2/f03-mock-llm` | E2E user 1 is at the Free limit, so the brand POST gets 403 and the spec passes without testing anything; otherwise the audit POST would get 409. It never removes the brand it makes. |
| `sprint3/f01-model-selector` | Expects `gpt-4o-mini` / `gpt-4o`; the selector returns `gpt-4.1-mini` / `gpt-4.1` (`lib/llm/model-selector.ts`). |
| `sprint3/f03-scoring-math` | Imports `lib/scoring/composite.ts` (deleted) and `DIMENSION_WEIGHTS` (no longer exported). |
| `sprint3/f05-brand-metrics` | F05-02 expects 404 where the route answered 403; written against E2E user 1's workspace. |
| `sprint4/f02-brand-wizard` | E2E user 1 has no subscription and already has its brand, so `/brands/wizard` shows the limit card, never "Step 1 of 4". |
| `sprint6/f02-research-seed` | Expects the retired `au-local-citations` rule (now `directory-visibility`). |
| `sprint6/f04-confidence` | Expects rules that read context or sentiment, which no longer fire. |
| `sprint6/f05-triggers` | The same retired rules. |
| `sprint6/f06-build-recs` | The same retired rules. |
| `sprint6/f07-action-center-ui` | The destructive sprint1-style seeding, and `organizations.tier` as the plan. |
| `sprint6/f08-action-detail` | The same. |
| `sprint6/f09-tier-gate` | The same. Plan gates are covered by `tests/integration/cancelled-plan-gates*` and the brand-feature-lock tests. |
| `sprint6/f10-sidebar-nav` | The same. The sidebar is covered by `tests/e2e/responsive/responsive-shell.spec.ts`. |
| `sprint10/f10-sample-audit-api` | POST now requires `location` (400 where 200/201 is expected). **Its `afterAll` deletes every audit and brand in the shared `__sample__` org**, not just its own: never run it as it is. |

## Calls Stripe directly (1)

| Spec | Why it's archived |
|---|---|
| `sprint1/f10-stripe-products` | Calls the Stripe API from the test with `STRIPE_SECRET_KEY` (`products.list`). Tests never call Stripe directly: nothing in the spec stops a live key set in a shell. |

## Passed without testing what its name says (4)

| Spec | Why it's archived |
|---|---|
| `sprint9/f12-portal-verify-e2e` | Its three checks call `/api/client-portal/verify/<token>`, which isn't a public route: the middleware answers with the sign-in redirect, and "status < 500" passed on that. Nothing in the app calls the route; the portal page (`app/client-portal/[token]/page.tsx`) checks its token on the server. |
| `sprint10/f12-webhook-tier-sync` | Its signing helper strips `whsec_` from the secret, so every event got 400 and the spec accepted 400. F12-04 and F12-05 write a row and read it back; F12-06 reads `organizations.tier`, which no longer decides the plan. The webhook is tested for real by `tests/integration/stripe-*.integration.test.ts` and `tests/unit/api/webhook-stripe.test.ts`. |
| `sprint2/f04-brand-detection` | Named for brand mention detection, it only reads the mock LLM's fixture files. Detection is tested by `tests/unit/audit/detect-mention*.test.ts`. |
| `sprint3/f02-multi-engine` | Named for multi-engine support, it only counts the mock LLM's fixture files. The four engines' answer handling is tested by `tests/unit/llm/answer-text-adapters.test.ts`. |

The fourth of the run's "passes without testing" list, sprint1 `f09-feature-flags` F09-02, stays in place
with that test removed (and F09-03, the `/au/` region route): see the comment in that spec. Part 8 (the same
day) brought F09-02 back, for a UK visitor on `/pricing`, once the region reached the page.

## sprint9's vitest files (9 archived, 4 moved)

They import vitest, and sprint9's Playwright config matched only `*-e2e.spec.ts`, so nothing ran them.

| File | Where it went |
|---|---|
| `f02-calculate-next-run` | `tests/unit/scheduling/calculate-next-run.test.ts` (lib/scheduling/calculate-next-run.ts) |
| `f03-tier-limits` | `tests/unit/scheduling/tier-limits.test.ts` (lib/scheduling/tier-limits.ts; its `as any` casts removed) |
| `f05-digest-html` | `tests/unit/digest/compose.test.ts` (lib/digest/compose.ts) |
| `f04-check-quota` | `tests/integration/check-quota.integration.test.ts`, rewritten: it set `organizations.tier`; the plan comes from `subscriptions`, and Free has no scheduled audits at all (e0dbb8e) |
| `f01-schema` | **Archived.** Checks that six Sprint 9 tables exist: the schema itself, which `pnpm db:drift` and every integration test that uses those tables already prove. |
| `f06-db-brand-assets`, `f07-db-portal-invites`, `f08-db-audit-schedules`, `f09-db-notif-prefs` | **Archived.** Each inserts rows through drizzle and reads them back: no app code runs, so they test Postgres and drizzle, not the app. |
| `f10-api-branding`, `f11-api-schedules`, `f12-api-portal-verify`, `f13-api-bulk-notif` | **Archived.** Named for API routes, they're "DB-level": the same insert-and-read-back, never a route. |

`sprint9/vitest.config.ts` went with them (it also matched the Playwright `*-e2e.spec.ts` files).

## Helpers that went with them

`sprint1/shared/` (`db.ts`, `seed.ts`, `cleanup.ts`, the destructive seeding above): only archived specs used it.

## The wrappers

Every `.bat`/`.sh` in `tests/qa` (91) was deleted, not archived: 68 started `pnpm dev` in the main tree, where
Next fills every variable `.env.test.local` lacks from `.env.local` (visibleau_prod, live keys), and
`sprint9/RUN-ALL-S9QA.bat` also killed whatever listened on :3000. Each config now loads `.env.test.local` and
starts its own server: see `tests/qa/README.md`.
