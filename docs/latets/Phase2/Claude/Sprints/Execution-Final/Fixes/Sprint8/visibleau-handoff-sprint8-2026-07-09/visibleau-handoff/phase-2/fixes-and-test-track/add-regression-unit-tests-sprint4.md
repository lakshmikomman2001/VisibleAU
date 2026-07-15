# Claude Code — ADD regression UNIT tests for the Sprint 4 fixes (the bugs that slipped past 78 green tests)

## Why + the honest scope
Sprint 4's 9 bugs passed the existing suite (78 green, 0 TS errors). Add UNIT tests that would have FAILED before each
fix and pass after. BUT: only 6 of the 9 are genuinely unit-testable. Writing mock-heavy unit tests for the other 3
would recreate the exact "green but broken" illusion — so those are flagged for integration/E2E instead, NOT faked.

**Unit-testable (write these — real assertions against pure functions):**
- Bug 2  — `formatPeriodLabel` (ISO week vs naive week-of-month)
- Bug 3  — rate coercion+format (Drizzle NUMERIC-string → Number() → no ×100 → no 7000%, no .toFixed crash)
- Bug 5b — `cleanSubQueries` (strip LLM preamble / numbering / markdown)
- Bug 8  — archetype→quadrant summary builder (distinct from exec summary; correct action)
- Bug 3-sibling — `mention_source_ratio` NULL→'N/A' (no crash when mention=0)
- Bug 4  — `getLLMService(engine)` factory returns the RIGHT impl per engine (PARTIAL — see limit)

**NOT unit-testable — add a `test.todo` / skip with a comment pointing to the right layer, do NOT mock-fake them:**
- Bug 1 (missing 'reports' bucket) → integration test vs Supabase
- Bug 7 (tier-source subscriptions.tier) → integration (DB join) / already behaviorally verified
- Bug 9 (auto-refresh poll race) → E2E (React + timing)

Env: Windows repo `C:\startup\VisibleAU\src\`. Use the repo's existing test runner + conventions (Vitest/Jest — match
what the 78 tests use). Co-locate or mirror the existing test dir structure.

## STEP 0 — Read the ACTUAL signatures first (do not assume)
```bash
# Locate each function + its real signature/exports before writing asserts:
grep -rn "export function formatPeriodLabel\|export const formatPeriodLabel" lib/
grep -rn "cleanSubQueries" lib/ inngest/
grep -rn "getLLMService\|export.*LLMService" lib/llm/
grep -rn "classifyArchetype\|mentionSourceSummary\|QUADRANT\|deriveReportStatus" lib/communication/ lib/visibility/
# Find where rate formatting lives (the ×100/Number() fix — bug 3):
grep -rn "toFixed\|mentionRate\|citationRate\|Number(" lib/communication/narrative-generator.ts
# Confirm the test runner + a sample existing test for style:
cat vitest.config.* jest.config.* 2>/dev/null | head; find . -name "*.test.ts" -not -path "*/node_modules/*" | head -3
```
Report the exact exported signature of each function under test. If a "function" is actually inline (e.g. the rate
formatting is embedded in narrative-generator, not a standalone export), note it — those may need a tiny refactor to
extract a pure helper so it's unit-testable (see STEP 6).

## STEP 1 — Bug 2: formatPeriodLabel (ISO week)  [strong]
`lib/visibility/visibility-trend-aggregator.ts` (or wherever it lives).
```ts
describe('formatPeriodLabel (regression: bug 2 — was naive week-of-month)', () => {
  it('returns ISO week for a July date, NOT week-of-month', () => {
    // 2026-07-04 is ISO week 27; the OLD Math.ceil(getDate()/7) gave "2026-W01" (Jan)
    expect(formatPeriodLabel(new Date('2026-07-04T00:00:00Z'), 'weekly')).toBe('2026-W27');
  });
  it('zero-pads single-digit ISO weeks', () => {
    expect(formatPeriodLabel(new Date('2026-01-05T00:00:00Z'), 'weekly')).toMatch(/^2026-W0\d$/);
  });
  it('monthly format is yyyy-MM', () => {
    expect(formatPeriodLabel(new Date('2026-07-04T00:00:00Z'), 'monthly')).toBe('2026-07');
  });
  it('the same date always yields the same label (aggregator/report agree)', () => {
    const d = new Date('2026-07-04T00:00:00Z');
    expect(formatPeriodLabel(d, 'weekly')).toBe(formatPeriodLabel(d, 'weekly'));
  });
});
```
Adjust the expected ISO week if date-fns startOfISOWeek + the repo's tz handling yields a boundary difference — VERIFY
the actual output for 2026-07-04 and lock the test to it. The key assertion: it is NOT 'W01' for a July date.

## STEP 2 — Bug 3: rate coercion + format (Drizzle string + no ×100)  [strong — this was the 7000% + crash]
Test the pure formatter. If it's currently inline in narrative-generator, extract `formatRate(value)` (STEP 6) and test it.
```ts
describe('rate formatting (regression: bug 3 — 7000% + Drizzle-string .toFixed crash)', () => {
  it('formats an already-0-100 numeric as a sane percent (NO ×100)', () => {
    expect(formatRate(70)).toBe('70.0%');       // NOT '7000.0%'
  });
  it('handles Drizzle NUMERIC returned as a STRING without crashing', () => {
    // the as-number cast lied; value arrives as "70.00" → old code .toFixed threw
    expect(() => formatRate('70.00' as unknown as number)).not.toThrow();
    expect(formatRate('70.00' as unknown as number)).toBe('70.0%');
  });
  it('zero renders 0.0%, not NaN', () => {
    expect(formatRate('0.00' as unknown as number)).toBe('0.0%');
  });
  it('never exceeds 100% for a valid rate', () => {
    const out = formatRate('100.00' as unknown as number);
    expect(parseFloat(out)).toBeLessThanOrEqual(100);
  });
});
```
Also assert mention_source_ratio NULL handling:
```ts
describe('mention_source_ratio NULL guard (regression: bug 3-sibling / U-12)', () => {
  it('renders N/A when ratio is null (mention_rate=0), not a crash or 0', () => {
    expect(formatRatio(null)).toMatch(/N\/A/i);   // adapt to the builder's actual N/A string
  });
  it('formats a real ratio to 2dp', () => {
    expect(formatRatio(1)).toBe('1.00');
  });
});
```

## STEP 3 — Bug 5b: cleanSubQueries  [strongest unit case]
Feed it the ACTUAL garbage shapes seen in the real-LLM run.
```ts
describe('cleanSubQueries (regression: bug 10b — LLM preamble/numbering/markdown leaked as rows)', () => {
  it('drops the preamble line', () => {
    const raw = 'Certainly! Here are 12 search sub-queries:\nbest plumbers Melbourne\nemergency plumber Melbourne';
    const out = cleanSubQueries(raw, 12);
    expect(out).not.toContain('Certainly! Here are 12 search sub-queries:');
    expect(out[0]).toBe('best plumbers Melbourne');
  });
  it('strips leading numbering "1. " / "2) "', () => {
    const out = cleanSubQueries('1. best plumbers Melbourne\n2) emergency plumber Melbourne', 12);
    expect(out).toEqual(['best plumbers Melbourne', 'emergency plumber Melbourne']);
  });
  it('drops markdown headers and horizontal rules', () => {
    const out = cleanSubQueries('### Reputation & Reviews\n---\nbest plumbers Melbourne', 12);
    expect(out).toEqual(['best plumbers Melbourne']);
  });
  it('strips ** bold markers and wrapping quotes', () => {
    const out = cleanSubQueries('**best plumbers Melbourne**\n"emergency plumber Melbourne"', 12);
    expect(out).toEqual(['best plumbers Melbourne', 'emergency plumber Melbourne']);
  });
  it('caps at subQueryCount and never pads with junk', () => {
    const raw = Array.from({length: 20}, (_, i) => `query ${i}`).join('\n');
    expect(cleanSubQueries(raw, 12)).toHaveLength(12);
  });
  it('returns [] on empty/failed input (graceful, matches the try/catch default)', () => {
    expect(cleanSubQueries('', 12)).toEqual([]);
  });
});
```
Match the exact function name/signature + the real regexes from STEP 0. Add any other artifact shapes the real run
showed (bullets "- "/"• ", trailing-colon section labels).

## STEP 4 — Bug 8: archetype quadrant summary builder  [distinct-section regression]
```ts
describe('mention-source quadrant summary (regression: bug 8 — was duplicating exec summary)', () => {
  it('niche_authority yields the quadrant + "expand prompt coverage" action', () => {
    const s = buildMentionSourceSummary({ archetype: 'niche_authority', mentionSourceRatio: 1, brandName: 'X' });
    expect(s).toMatch(/niche authority quadrant/i);
    expect(s).toMatch(/expand prompt coverage/i);
  });
  it('is DISTINCT from the executive summary string (no verbatim duplication)', () => {
    const exec = buildExecutiveSummary({ archetype: 'niche_authority', mentionRate: 10, citationRate: 10, brandName: 'X' });
    const src  = buildMentionSourceSummary({ archetype: 'niche_authority', mentionSourceRatio: 1, brandName: 'X' });
    expect(src).not.toBe(exec);
  });
  it('unknown archetype falls back to the invisible quadrant, no crash', () => {
    expect(() => buildMentionSourceSummary({ archetype: 'bogus' as any, mentionSourceRatio: null, brandName: 'X' })).not.toThrow();
  });
  it('each archetype maps to its correct action (recognised/known_but_untrusted/niche/invisible)', () => {
    // assert the 4 quadrant→action mappings per LLD 6129-6134
  });
});
```
Adapt builder names/arg shapes to STEP 0's real signatures.

## STEP 5 — Bug 4: getLLMService factory (PARTIAL — state the limit)
```ts
describe('getLLMService (regression: bug 4 — was always OpenAI for all engines)', () => {
  it('returns a DIFFERENT impl per engine (not OpenAI for all)', () => {
    const openai = getLLMService('openai');
    const anthropic = getLLMService('anthropic');
    const google = getLLMService('google');
    const perplexity = getLLMService('perplexity');
    // Assert distinct instances/types — the OLD bug returned the SAME OpenAI impl for every engine:
    expect(anthropic).not.toBe(openai);
    expect(google).not.toBe(openai);
    expect(perplexity).not.toBe(openai);
    // If impls carry an identifier (name/provider), assert it maps correctly:
    // expect(anthropic.provider).toBe('anthropic');
  });
  it('throws on an unknown engine (fail loud, not silently OpenAI)', () => {
    expect(() => getLLMService('bogus' as any)).toThrow();
  });
});
// LIMIT (comment in the file): this proves the FACTORY routes correctly. It does NOT prove each impl actually calls its
// provider's API — that requires an integration test (see integration TODO). A unit test cannot catch a mis-wired SDK
// inside an impl.
```

## STEP 6 — Extract pure helpers ONLY if needed for testability
If STEP 0 shows rate formatting / ratio formatting / quadrant text are INLINE (not exported), extract minimal pure
functions (`formatRate`, `formatRatio`, `buildMentionSourceSummary`) and have the caller use them — no behavior change,
just testability. Keep the extraction tiny and mechanical; the render/narrative code calls the new helper. Report any
extraction you did.

## STEP 7 — The 3 NOT-unit-testable bugs: todo stubs, NOT fake coverage
Add clearly-labeled placeholders so they're tracked but not falsely "covered":
```ts
// bug 1 — missing 'reports' Supabase bucket: needs an INTEGRATION test against storage (create+upload+signed-url).
it.todo('integration: report PDF upload succeeds against a real/emulated reports bucket');
// bug 7 — tier from subscriptions.tier: needs INTEGRATION (DB join) with divergent org/sub tiers. Behaviorally verified.
it.todo('integration: gating reads subscriptions.tier when org.tier diverges (both directions)');
// bug 9 — reports list auto-refresh: needs E2E (render + fake timers) — generate → poll → badge flips → poll stops.
it.todo('e2e: reports list badge auto-flips Generating→Ready and polling stops when ready');
```
Do NOT satisfy these by mocking the DB/storage/React and asserting the mock — that reproduces the "green but broken"
failure. A todo that fails loudly-as-pending is more honest than a passing fake.

## STEP 8 — Run + confirm they'd have caught the bugs
```bash
# Run the new tests:
<repo test cmd, e.g.> pnpm vitest run --dir <new test dir>
```
Sanity: temporarily re-introduce ONE old bug (e.g. change formatRate to `value*100` or formatPeriodLabel to the
Math.ceil formula) and confirm the corresponding test FAILS — proving the test actually guards the regression. Revert.
Report: all new unit tests green; the re-introduce-bug check failed as expected for at least formatPeriodLabel + formatRate.

## Constraints
- Match the repo's existing runner/conventions (don't add a second test framework).
- Assert against REAL signatures (STEP 0) — no invented function names; adapt the sketches above.
- Do NOT mock-fake the 3 non-unit bugs into green; use it.todo pointing at the right layer.
- Extractions (STEP 6) must be behavior-preserving; the app calls the extracted helper.
- Lock formatPeriodLabel's expected week to the ACTUAL date-fns output (verify 2026-07-04), not my assumed 'W27' if tz shifts it.

## NOTE
The point of these tests is to catch THIS session's bug classes: ISO-week period, Drizzle-NUMERIC-string + double-scale,
LLM-formatting-in-sub-queries, section duplication, engine-factory routing. Those are genuinely unit-testable and the
tests above assert the exact failing→passing behavior. The bucket / tier-join / poll-race bugs are NOT unit-testable —
faking them green would recreate the illusion this whole session fought. Track them as integration/E2E todos. Prove the
guards work by re-introducing one bug and watching the test fail.
