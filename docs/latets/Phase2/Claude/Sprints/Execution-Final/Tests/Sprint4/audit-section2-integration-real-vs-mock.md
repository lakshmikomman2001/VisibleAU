# Claude Code — AUDIT (no changes): do 2I/2J/2K/2L exercise the REAL seam, or mock it and assert the mock?

Section 2 is green (206 tests, acceptance MET) — good. But "10 tests passed" for an integration suite only means
something if it tests the REAL boundary. A test that mocks the seam and asserts the mock is green theater — it would
pass even while the bug is live (a mocked upload passed the ENTIRE time bug 1 / "Bucket not found" was in production).
This audit reads the 4 session-bug integration files and reports, per file, whether it hits the real seam or a mock.
NO changes — just report the evidence.

For EACH file, paste the relevant lines and answer the specific question.

## 2L — fan-out-resilience.integration.test.ts  (bug 5a — the 429 path that NEVER fired in manual)
```bash
sed -n '1,120p' <path>/fan-out-resilience.integration.test.ts
grep -n "mockRejected\|throw\|429\|AI_RetryError\|RetryError\|rejects\|toThrow\|mockImplementation\|writes\|insert\|rows\|query_fan_out" <path>/fan-out-resilience.integration.test.ts
```
ANSWER:
1. Does a mock engine actually THROW a 429 / AI_RetryError (mockRejectedValue / mockImplementation that throws)? Or
   does every mocked engine return success?
2. After the throw, does the test assert the OTHER engines STILL wrote rows (query_fan_out_results rows for the
   non-failing engines exist)? Or does it only assert "didn't throw"?
→ REAL only if BOTH: an engine genuinely throws AND the other engines' rows are asserted present. If the mock never
   throws, or it only checks no-crash without asserting surviving rows, the graceful-skip is still UNPROVEN — say so.

## 2I — report-pipeline.integration.test.ts  (bug 1 upload — was a MISSING bucket)
```bash
sed -n '1,140p' <path>/report-pipeline.integration.test.ts
grep -n "storage\|upload\|bucket\|createClient\|mock\|Supabase\|from(\|pdf_url\|signed\|testcontainer\|emulator" <path>/report-pipeline.integration.test.ts
```
ANSWER:
1. Does the upload hit a REAL/emulated bucket (dev Supabase project / storage emulator / testcontainer) and read the
   object or a pdf_url back? Or is `storage.from().upload()` MOCKED to return `{ error: null }`?
2. If MOCKED: is the live-upload piece HONESTLY marked as an integration/todo (not counted as "bug 1 covered")?
→ A mocked upload does NOT catch a missing bucket (bug 1) — it would have passed while the bug was live. REAL only if it
   touches actual storage OR the mock is explicitly labeled "adapter-contract only, live-upload = todo". Report which.
   Also: does it assert coverage reads `brandAppeared` (bug 6) from real rows, not a mocked coverage number?

## 2K — tier-source.integration.test.ts  (bug 7 — DB join, divergent org/sub)
```bash
sed -n '1,120p' <path>/tier-source.integration.test.ts
grep -n "insert\|INSERT\|organizations\|subscriptions\|db\.\|mock\|divergent\|starter\|agency\|tier" <path>/tier-source.integration.test.ts
```
ANSWER:
1. Does it INSERT a real divergent row (subscriptions.tier=agency, organizations.tier=starter) into the DEV DB and read
   tier through the ACTUAL query? Or mock the DB return?
2. Does it assert BOTH directions (sub=agency/org=starter → agency; sub=starter/org=agency → fails closed)?
→ REAL only if it seeds real divergent rows and reads through the real query. A mocked DB return proves nothing about
   the join. Report which.

## 2J — engine-routing.integration.test.ts  (bug 4 — likely already real)
```bash
sed -n '1,120p' <path>/engine-routing.integration.test.ts
grep -n "spy\|mock\|toHaveBeenCalled\|getLLMService\|getRealImpl\|openai\|anthropic\|google\|perplexity\|dispatch\|loop" <path>/engine-routing.integration.test.ts
```
ANSWER:
1. Are the four per-provider spies actually INVOKED by the real audit/dispatch loop (the loop runs and calls them)? Or
   is the loop mocked and the spies asserted in isolation?
2. (Evidence already suggests REAL: STEP 3 reverting getLLMService() no-arg broke 2 tests — a purely-mocked test can't
   break from a real-code revert. Confirm this is why.)
→ Report whether the dispatch is real.

## SUMMARY TABLE (report this)
| file | seam | REAL or MOCK-ASSERTING-MOCK | if mock, honestly todo'd? | verdict |
2L / 2I / 2K / 2J — one row each, with the evidence line that proves it.

## VERDICT
- **All four REAL (or the env-limited piece honestly todo'd):** Section 2 is genuinely closed at Sprint-3 quality →
  proceed to Section 3.
- **Any MOCK-asserting-MOCK counted as coverage:** that file is green theater for its bug → it needs to hit the real
  seam (real dev DB / emulated bucket / a throwing 429 mock + surviving-rows assert), OR be honestly relabeled as a
  contract test with the real-seam piece as an explicit todo. Name which files, and I'll write the tightening prompt.

## Constraints
- NO changes — read and report only. Paste the proving lines per file.
- Be specific: "2L mocks all engines to succeed, asserts only no-throw → graceful-skip UNPROVEN" is the kind of honest
  answer needed, not "2L: 10 tests passed".
- The point isn't test count — it's whether each test would FAIL if its bug were live. A mocked-seam test would not.

## NOTE
2J is probably real (the STEP 3 revert broke it — mocks don't break from real-code reverts). The three to scrutinize:
2L (does an engine actually throw 429 AND are surviving rows asserted?), 2I (real bucket or mocked upload that can't
catch a missing bucket?), 2K (real divergent DB rows or mocked return?). "10 passed" is meaningless if the seam is
mocked — a mocked upload passed the whole time bug 1 was live. Report real-vs-mock per file with the proving line.
