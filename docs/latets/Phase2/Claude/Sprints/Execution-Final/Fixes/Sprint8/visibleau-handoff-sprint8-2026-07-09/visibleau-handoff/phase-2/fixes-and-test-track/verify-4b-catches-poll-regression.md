# Claude Code — VERIFY 4B actually catches the bug 9 regression (does breaking the poll fail the PLAYWRIGHT test?)

The one loose thread on the Sprint 4 test track: bug 9 (auto-refresh) is live-confirmed + unit-guarded (Section 3's
shouldPollReports), but we have NOT confirmed that breaking the poll condition fails **4B (the Playwright E2E)** — only
that it fails the Section 3 UNIT tests. For a regression suite, a test that can't FAIL when the behavior breaks isn't
guarding anything. This 4-step check settles whether 4B genuinely exercises the poll end-to-end or passes regardless
(because mock-fast generation reaches Ready whether or not the poll drove it).

This is a temporary break-and-restore. Change nothing permanently.

## STEP 1 — Break the poll condition (drop the awaitingReport term)
In `lib/communication/should-poll-reports.ts`, temporarily change the return so it drops the awaitingReport bridge —
i.e. reintroduce the ORIGINAL bug 9 (poll only when an existing row is generating; do NOT poll for a just-triggered
report whose row doesn't exist yet):
```ts
// TEMPORARY BREAK — original bug 9:
export function shouldPollReports(reports, awaitingReport) {
  return reports.some(r => !r.pdfUrl);   // drop "|| awaitingReport"
}
```
Confirm the dev server (that Playwright targets) picks up the change — restart it if the poll logic doesn't hot-reload
into the running server. Keep it on the DEV DB + LLM_MODE=mock + STORAGE_DRIVER=local (the Section 4 footgun — never
prod).

## STEP 2 — Run ONLY the Playwright suite (not vitest)
```bash
npx playwright test --project=chromium 2>&1 | tail -30
# If 4B is a named spec, target it directly too:
npx playwright test auto-refresh --project=chromium 2>&1 | tail -20
```
The point is whether **4B itself** turns red — not the vitest unit tests (those already fail on this break; that's
Section 3, already proven).

## STEP 3 — Report the DECISIVE result
Answer exactly:
- Did **4B fail**? YES / NO.
- If YES — which assertion failed?
  - the "badge flips Generating→Ready WITHOUT reload" assertion, OR
  - the "polling STOPS after Ready" assertion, OR
  - both.
- If NO (4B stayed GREEN with the poll broken) — that's the finding: 4B passes whether or not the poll works (mock-fast
  generation reaches Ready regardless), so 4B is NOT actually exercising the poll behavior end-to-end. Report this
  honestly.

## STEP 4 — RESTORE and re-confirm green
```bash
# Revert should-poll-reports.ts to the correct version:
#   return reports.some(r => !r.pdfUrl) || awaitingReport;
```
Restart the dev server if needed, re-run Playwright, confirm 4B is GREEN again. Also confirm the full vitest suite is
back to 121/1848 (Section 3's shouldPollReports tests green again).

## VERDICT
- **AIRTIGHT:** 4B FAILED on the break (flips-without-reload and/or polling-stops) and passes on restore → bug 9 is
  genuinely guarded END-TO-END; convergence item #7 is airtight. Track fully closed.
- **NEEDS TIGHTENING:** 4B stayed GREEN with the poll broken → 4B's assertions don't actually depend on the poll
  driving the flip (mock generation reaches Ready on its own). Report which assertion should be tightened — most likely
  the "polling stops" check needs to assert NO further GET /reports after Ready (count-based), and/or the flip needs to
  be observed BEFORE generation would complete on its own (e.g. slow the mock/render so the poll is provably the thing
  that updates the row). Do NOT "fix" by asserting less — report the gap and propose the tighter assertion for approval.

## Constraints
- Temporary break-and-restore ONLY — leave should-poll-reports.ts in its CORRECT state at the end (STEP 4). Confirm the
  restore.
- Playwright on DEV DB, LLM_MODE=mock, STORAGE_DRIVER=local — never prod (Section 4 footgun).
- The decisive question is 4B (Playwright), not the vitest unit tests — do not report the unit-test failures as the
  answer; those are Section 3, already proven.
- If 4B stays green, do NOT weaken/skip to force a pass and do NOT silently rewrite it — report the honest finding +
  proposed tighter assertion.

## NOTE
This is the source-grep-vs-behavioral distinction on the one bug that took the most rounds this session. Section 3
proved the CONDITION logic; this proves whether 4B tests the BEHAVIOR — i.e. can 4B FAIL when the poll breaks? If yes,
#7 is airtight and the track is fully closed. If 4B stays green, its "polling stops" / "flips without reload"
assertions aren't wired to the poll actually driving the update, and need tightening (assert no GET /reports after
Ready; observe the flip before self-completion) — report the gap, don't paper over it. Restore the file when done.
