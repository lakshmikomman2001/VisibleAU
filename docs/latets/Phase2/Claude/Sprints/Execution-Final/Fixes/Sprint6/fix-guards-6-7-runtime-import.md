# Claude Code — Rewrite Section 3 guards 6+7 as ONE runtime-import test (the REAL compile-break catcher)

Guards 6 (`existsSync` on the 6 pages) and 7 (`export default function` REGEX on the 6 pages) are SOURCE-CHECKS, not
behavioral — they'd pass in the exact scenario that broke (the /retrieval 404 case: the file EXISTED and HAD a default
export, `tsc` was clean, yet the route 404'd). A regex/existsSync can't catch a broken export or a compile error inside
the module because it never EXECUTES the module. Replace both with ONE runtime `import()` test per retrieval page that
actually loads the module and asserts its default export is a function — this catches a broken export / compile error
for real, without a running server.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`. LLM_MODE=mock. Never prod.
tests/phase2/sprint6/walk-regression-guards.test.ts.

## STEP 1 — Remove the source-check versions (guards 6 & 7)
In `walk-regression-guards.test.ts`, delete:
- Guard 6: the `existsSync` checks on the 6 retrieval pages (checking a file the build obviously ships exists = near-zero
  value; it passes when the route is broken).
- Guard 7: the `export default function` REGEX checks (a text match passes even with a syntax error elsewhere in the file;
  it passes when the module won't actually load).

## STEP 2 — Add ONE runtime-import test per retrieval page (the real catcher)
For each of the 6 retrieval pages, DYNAMICALLY IMPORT the module (which EXECUTES it — catching a broken export or a
compile/parse error) and assert the default export is a function:
```ts
import { describe, it, expect } from 'vitest';

// the 6 retrieval page modules (adjust paths to the real ones):
const RETRIEVAL_PAGES = [
  'app/(auth)/brands/[brandId]/retrieval/page',
  'app/(auth)/brands/[brandId]/retrieval/entity-home/page',
  'app/(auth)/brands/[brandId]/retrieval/agent-readiness/page',
  'app/(auth)/brands/[brandId]/retrieval/crawler-logs/page',
  'app/(auth)/brands/[brandId]/retrieval/content-structure/page',
  // + the 6th (llms.txt or whichever) — use the actual page.tsx list
];

describe('retrieval page modules load + export a default component (compile-break catcher)', () => {
  for (const p of RETRIEVAL_PAGES) {
    it(`imports ${p} and its default export is a function`, async () => {
      // dynamic import EXECUTES the module — a broken export or compile error THROWS here
      const mod = await import(`@/${p}`);   // use the repo's path alias / resolver
      expect(typeof mod.default).toBe('function');
    });
  }
});
```
Notes for making the import work in vitest:
- Use the repo's module resolver / path alias (the same `@/` or tsconfig-paths the app uses) so the import resolves.
- These are **Server Components** (`page.tsx`) — importing them should still load the module and expose `default`. If a
  page has server-only imports that break under vitest's environment, either (a) run this test file under the node
  environment, or (b) if a specific page genuinely can't be imported in the test env, fall back for THAT page to a real
  `await import()` wrapped to assert it doesn't throw — but prefer the full `typeof default === 'function'` assertion.
  Report any page that needs special handling and why.
- The point is the module is EXECUTED (import), not text-matched (regex). That's what catches a broken export / parse
  error.

## STEP 3 — RE-BREAK PROOF (this is the whole point — prove it catches what the regex missed)
Prove the new test FAILS on a real break that the OLD regex/existsSync would have PASSED:
1. **Break a default export** — in one retrieval page, change `export default function XPage()` → `export function
   XPage()` (remove `default`). Run the test → the import test for that page must FAIL (`mod.default` is undefined →
   typeof !== 'function'). Restore.
2. **Break the module with a compile/parse error** — in one retrieval page, introduce a syntax error (e.g. an unclosed
   brace or a bad import). Run the test → the `await import()` THROWS → the test FAILS. Restore.
   ⟶ Contrast: the OLD regex would still MATCH `export default function` text even with a syntax error elsewhere → it
   would have PASSED. The runtime import FAILS. That's the difference — demonstrate BOTH re-breaks.
Report: both re-breaks make the runtime-import test fail (the regex would have passed #2 — that's the proof it's now real).

## STEP 4 — Run + report
```bash
<repo test cmd> run tests/phase2/sprint6/walk-regression-guards.test.ts
```
- Guards 6+7 replaced by ONE runtime-import test (6 pages, `typeof default === 'function'`); existsSync + regex removed.
- Re-break proof: broken-export → fail; syntax-error → fail (the regex would have passed the syntax-error case).
- Any page needing special test-env handling (server-only imports) reported with the reason.
- Section 3 still green; updated test count.

## Constraints
- REPLACE the source-checks (existsSync + regex) with a RUNTIME `import()` per page — the module must be EXECUTED, not
  text-matched. That's what catches a broken export / compile error (the class the /retrieval 404 was feared to be).
- The re-break MUST demonstrate the syntax-error case failing — because that's exactly what the old regex would have
  passed. If you can't make the syntax-error re-break fail, the test isn't executing the module — fix the import.
- Honest scope: this catches a broken EXPORT / COMPILE error, NOT a stale-.next-cache 404 (that one was environmental,
  fixed by a dev-server restart — no code test catches a cache blip, and it's not a code defect). The value is guarding
  the real broken-export/compile class on future edits.
- LLM_MODE=mock. Dev DB `visibleau`, never prod.

## NOTE
Guards 6 (existsSync) + 7 (export-default REGEX) are source-checks that PASS when the route is actually broken (the
/retrieval 404 had the file + the default export + clean tsc, yet 404'd) — the exact "green but doesn't catch its bug"
gap this whole track exists to avoid. Replace both with ONE runtime `import()` test per retrieval page: dynamically
import the module (EXECUTING it) and assert `typeof mod.default === 'function'`. Re-break proof is the point — a broken
export fails it, AND a syntax error fails it (the old regex would have PASSED the syntax error; the runtime import
FAILS). Demonstrate both. This catches a broken export / compile error on future edits (not the cache-blip 404, which
was environmental and no code test catches).
