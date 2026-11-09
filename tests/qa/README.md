# QA specs

The older per-sprint QA specs. Each folder has one command, and each config loads `.env.test.local` only
(never `.env.local`, which points at visibleau_prod and holds live keys), refuses any database but the local
e2e one, and starts its own dev server with `NODE_ENV=test` (`tests/e2e/helpers/e2e-config.ts`). Run one at a
time, and only with 6 GB free (CLAUDE.md, Testing scope).

| Folder | Command |
|---|---|
| sprint1 | `npx playwright test --config tests/qa/sprint1/playwright.config.ts` |
| sprint2 | `npx playwright test --config tests/qa/sprint2/playwright.config.ts` |
| sprint3 | `npx playwright test --config tests/qa/sprint3/playwright.config.ts` |
| sprint4 | `npx playwright test --config tests/qa/sprint4/playwright.config.ts` |
| sprint5 | `npx playwright test --config tests/qa/sprint5/playwright.config.ts` |
| sprint6 | `npx playwright test --config tests/qa/sprint6/playwright.config.ts` |
| sprint9 | `npx playwright test --config tests/qa/sprint9/playwright.config.ts` |
| sprint10 (Playwright) | `npx playwright test --config tests/qa/sprint10/playwright.config.ts` |
| sprint10 (vitest) | `npx vitest run --config tests/qa/sprint10/vitest.config.ts` |
| sprint11 (Playwright) | `npx playwright test --config tests/qa/sprint11/playwright.config.ts` |
| sprint11 (vitest) | `npx vitest run --config tests/qa/sprint11/vitest.config.ts` |

To keep one warm server across several runs: `pnpm e2e:server`, then each command with `E2E_REUSE_SERVER=1`.
Never reuse a server started any other way.

`_archive/` holds the specs retired on 10 Nov, with each one's reason (`_archive/README.md`). No config runs
them.
