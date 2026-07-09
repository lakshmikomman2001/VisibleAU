# Claude Code — Section 2 TIGHTEN: rewrite 2I/2J/2K/2L as REAL behavioral tests (they're currently source-greps)

Your own audit found all four session-bug integration tests are SOURCE-GREPS (readFileSync → toContain) — they assert
the code CONTAINS strings, they do NOT exercise the seam. They would NOT have caught bug 1 (missing bucket), bug 5a
(catch that never fires), or bug 7 (wrong table in a query never run). Rewrite them to hit the REAL seam so each test
would FAIL if its bug were live. This is the highest-value tightening in the whole test track.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau` (NEVER prod — assert the DB name in setup). Match
Sprint 3's integration harness if one exists.

## STEP 0 — Establish what real harness is AVAILABLE (before rewriting — don't assume)
```bash
# Is there a test DB setup / fixtures helper the S3 integration tests use?
find . -path "*sprint3*" -name "*integration*" | head; grep -rln "beforeAll\|db.insert\|truncate\|test.*db\|DATABASE_URL" tests/ | head
# Storage: is there a LOCAL/filesystem driver for tests (not just Supabase)?
grep -rn "STORAGE_DRIVER\|getStorage\|LocalStorage\|FileStorage\|filesystem\|memory.*storage" lib/storage/
cat lib/storage/index.ts 2>/dev/null | head -60
# Can an Inngest step function be invoked directly in a test (not via HTTP)? Check how S3 tested Inngest fns:
grep -rln "createStepTools\|invoke\|\.handler\|step.run\|InngestTestEngine\|@inngest/test" tests/ inngest/
# The real tier-read + fan-out fns:
grep -rn "checkQuota\|subscriptions.tier" lib/quota/check.ts
grep -rn "for.*engine\|concurrency\|try {" inngest/functions/simulate-query-fan-out.ts | head
```
Report what's available: (a) a test-DB fixture pattern, (b) a local/memory storage driver, (c) a way to invoke Inngest
step logic directly. The rewrites below adapt to what exists. If any is genuinely missing (e.g. no local storage
driver at all), say so — that specific piece becomes an honest `it.todo` with a note, NOT a source-grep pretending to
cover it. But prefer real: most of this is standard (insert rows into dev DB, call the extracted function, assert DB
state).

## 2K — tier-source.integration.test.ts  [DB join — do this FIRST, it's the clearest real seam]
The bug lived in the SQL that reads tier. Test the real query against real divergent rows.
```ts
// setup: insert a real org + subscription with DIVERGENT tiers into the dev DB
beforeEach(async () => { /* truncate/seed test org */ });
it('resolves tier from subscriptions.tier when org.tier diverges (upgrade lag)', async () => {
  const orgId = await seedOrg({ orgTier: 'starter', subTier: 'agency' });   // real INSERTs
  const tier = await getTierForOrg(orgId);          // the REAL query (lib/quota/check.ts path)
  expect(tier).toBe('agency');                       // follows subscriptions.tier, NOT org.tier
  expect(enginesForTier(tier)).toHaveLength(4);
});
it('fails closed when subscription lapsed (org.tier stale agency, sub starter)', async () => {
  const orgId = await seedOrg({ orgTier: 'agency', subTier: 'starter' });
  expect(await getTierForOrg(orgId)).toBe('starter'); // does NOT over-grant from stale org.tier
});
it('defaults to free when no subscription row', async () => {
  const orgId = await seedOrg({ orgTier: 'starter', subTier: null });
  expect(await getTierForOrg(orgId)).toBe('free');
});
```
- Use the ACTUAL tier-resolution function (whatever lib/quota/check.ts exports — `checkQuota`/`getTier`); if tier
  resolution is inline in a page/route, call the shared helper it uses. Insert REAL rows; read through the REAL Drizzle
  query. NO source-grep, NO enginesForTier-only unit call.
- Assert BOTH divergence directions. This is the seam bug 7 actually lived in.

## 2L — fan-out-resilience.integration.test.ts  [the 429 graceful-skip that NEVER fired]
The current test throws at the pure function and asserts it PROPAGATES — that's backwards. The point is the CALLER
SWALLOWS the per-engine error and OTHER engines still write.
```ts
it('skips a 429-failing engine and STILL writes rows for the others', async () => {
  // mock the 4 engine LLM calls: gemini throws AI_RetryError/429, the other 3 succeed with parseable sub-queries
  mockEngine('gemini', () => { throw new AI_RetryError('429 high demand'); });
  mockEngine('openai',  okSubQueries); mockEngine('claude', okSubQueries); mockEngine('perplexity', okSubQueries);

  await runFanOutStep({ brandId, auditId });          // invoke the REAL step logic (per STEP 0's invocation method)

  const rows = await db.select().from(queryFanOutResults).where(eq(queryFanOutResults.auditId, auditId));
  const engines = new Set(rows.map(r => r.engine));
  expect(engines).toContain('openai');                // survivors wrote rows
  expect(engines).toContain('claude');
  expect(engines).toContain('perplexity');
  expect(engines).not.toContain('gemini');            // failed engine skipped, not crashed
  // and the step itself did NOT throw:
});
```
- The KEY assertions: (1) the step does NOT throw despite gemini's 429, (2) rows exist for the 3 survivors, (3) NO rows
  for gemini. A `toContain("} catch")` grep passes even if the catch re-throws — THIS fails if it does.
- Invoke the real step (or the extracted `fanOutAndStore` core it calls) so the try/catch actually runs. If the step
  can't be invoked directly in tests, extract the per-engine loop into a testable function and call THAT (behavior-
  preserving extraction).

## 2I — report-pipeline.integration.test.ts  [missing-bucket bug — hit real/local storage]
```ts
it('uploads the PDF to storage and returns a pdf_url path (would fail if bucket missing)', async () => {
  // use the LOCAL/memory storage driver (STEP 0) — NOT Supabase, NOT prod
  const buf = Buffer.from('%PDF-1.4 test');
  const path = await getStorage().upload(`reports/${orgId}/${reportId}.pdf`, buf, 'application/pdf'); // REAL adapter call
  const exists = await getStorage().exists(path);     // or read it back
  expect(exists).toBe(true);
  expect(path).toMatch(/reports\/.*\.pdf/);
});
it('report coverage reads brandAppeared from real fan-out rows (bug 6)', async () => {
  await seedFanOutRows(auditId, [{ engine:'openai', brandAppeared:true }, { engine:'claude', brandAppeared:false }]);
  const coverage = await computeFanOutCoverage(brandId, period);  // the REAL coverage fn
  expect(coverage.appeared).toBe(1);                  // reads brandAppeared, not a silent 0 from wrong property
});
```
- Use the local/filesystem storage driver against a temp dir (STEP 0). A real upload+read would FAIL if the bucket/dir
  path handling is wrong — which is what bug 1 was. If NO local driver exists, that's the one honest `it.todo`
  (label: "live-upload needs storage emulator") — but the brandAppeared coverage test (real DB rows → real coverage fn)
  MUST be real regardless; it needs no storage.
- Do NOT assert `toContain("getStorage()")` — call getStorage().upload for real.

## 2J — engine-routing.integration.test.ts  [make it exercise the DISPATCH, not just the factory]
The getRealImpl() call is already real (instantiates 4 classes). Add the missing piece: the loop actually dispatching.
```ts
it('the audit dispatch calls a DIFFERENT provider impl per engine', async () => {
  const spies = { openai: spyOn(openaiImpl,'complete'), anthropic: spyOn(anthropicImpl,'complete'),
                  google: spyOn(googleImpl,'complete'), perplexity: spyOn(perplexityImpl,'complete') };
  Object.values(spies).forEach(s => s.mockResolvedValue(okCompletion));
  await runAuditDispatch({ brandId, tier:'agency', prompt:'test' });   // REAL loop over TIER_ENGINES
  expect(spies.openai).toHaveBeenCalled();
  expect(spies.anthropic).toHaveBeenCalled();          // the OLD bug: only openai was ever called
  expect(spies.google).toHaveBeenCalled();
  expect(spies.perplexity).toHaveBeenCalled();
});
```
- Spy per provider impl; run the REAL dispatch loop; assert all 4 were invoked. Keep the getRealImpl factory test too
  (it's fine). This proves the LOOP dispatches, not just that the factory can return 4 impls.

## STEP 2 — Run + prove each catches its bug BEHAVIORALLY (not source-grep)
```bash
<repo test cmd> run <section2 dir>
```
Re-introduce each bug at the SEAM (not the source string) and confirm the behavioral test fails, then revert:
- 2K: point the tier query at organizations.tier → the divergence test fails (returns starter/agency wrong).
- 2L: add `throw err` inside the fan-out catch → 2L fails (survivors get no rows / step throws). ← THIS is the one the
  source-grep couldn't catch.
- 2I: break the upload path (wrong bucket/dir) → the upload test fails (exists=false).
- 2J: revert to getLLMService() no-arg → only openai spy called → 3 assertions fail.
Report each re-introduce result. The 2L one especially — that's the proof the graceful-skip is REALLY verified now.

## STEP 3 — Report
- Per file: now REAL (hits DB/storage/dispatch) or honest todo (with reason) — the same table, updated.
- The re-introduce-at-seam results (esp. 2L's `throw err` → fail).
- Final suite count; confirm the §11 files (2A-2H) + Section 1 (85) still green; all 7 session fixes still present.
- Any behavior-preserving extraction done to make a step testable (e.g. fanOutAndStore, runAuditDispatch).

## Constraints
- REAL seams: dev DB inserts, local/memory storage driver, actual dispatch loop, a 429 that's SWALLOWED (not
  propagated). NO readFileSync→toContain as the bug's coverage.
- Where a seam genuinely can't run in this env, ONE honest `it.todo` with a reason — never a source-grep pretending to
  be integration. (brandAppeared coverage + tier-DB + dispatch + 429-skip all CAN run against dev DB + mocks — only
  live-Supabase-upload might need the local driver.)
- Dev DB `visibleau`, never prod — assert DB name in setup.
- Behavior-preserving extractions only (caller uses the extracted fn).
- The LLD WINS over the sprint prompt on any conflict.

## NOTE
The audit was right: these were structural contract tests counted as behavioral coverage. The rewrite makes each FAIL if
its bug were live — the only test that's worth anything. 2K seeds real divergent org/sub rows and reads the real query;
2L makes an engine actually 429 and asserts the OTHER engines' rows survive (the catch that never fired); 2I calls the
real storage adapter (local driver) + real coverage fn; 2J spies the 4 provider impls through the real dispatch loop.
The decisive proof is 2L's `throw err`-in-catch re-introduce failing — a source-grep couldn't catch that, a real
behavioral test does. Keep the source-grep/factory assertions as a bonus layer, but the bug coverage must be behavioral.
