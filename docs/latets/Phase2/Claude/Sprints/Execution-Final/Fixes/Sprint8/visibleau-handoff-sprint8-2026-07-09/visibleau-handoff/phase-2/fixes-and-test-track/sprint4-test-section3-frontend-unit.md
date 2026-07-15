# Claude Code — Sprint 4 Automated Test Track · SECTION 3 of 5: FRONTEND UNIT

Mirror Sprint 3's Section 3 (65 frontend-unit tests, green). Same runner (vitest + @testing-library/react, match S3's
frontend-unit convention), same dir. Component-level unit tests for Sprint 4's report UI — INCLUDING a regression guard
for the auto-refresh poll logic (bug 9), which is now unit-testable since the condition is isolated.

Env: Windows repo `C:\startup\VisibleAU\src\`. jsdom/happy-dom (whatever S3 frontend uses). NO real DB/network — mock
fetch. These are COMPONENT units, not E2E (that's Section 4).

## STEP 0 — Match S3 frontend convention + read REAL component signatures
```bash
# How was S3 Section 3 structured? (react testing lib, render helpers, mocks)
find . -path "*sprint3*" -name "*.test.tsx" -not -path "*/node_modules/*" | head; ls tests/**/frontend* 2>/dev/null
grep -rn "@testing-library/react\|render\|screen\|jsdom\|happy-dom" vitest.config.* tests/ | head
# The real components + their props/exports:
sed -n '1,60p' components/domain/communication/report-status-badge.tsx
sed -n '1,60p' components/domain/communication/report-card.tsx
sed -n '1,80p' components/domain/communication/section-toggle-list.tsx
# The poll hook / logic (bug 9): where does awaitingReport/anyGenerating live?
grep -rn "awaitingReport\|anyGenerating\|shouldPoll\|useState\|setInterval\|pdfUrl\|reportCountRef" "app/(auth)/brands/[brandId]/reports/" components/domain/communication/ | head
# lucide-react mock pattern (the Eye-icon issue bit S2 — reuse the mock helper):
grep -rn "lucide-react\|mockIcon\|vi.mock.*lucide" tests/ | head
```
Report each component's props + the poll-logic location. If the poll condition is inline in the page (not an extracted
hook), extract a tiny pure helper `shouldPollReports(reports, awaitingReport)` (behavior-preserving) so bug 9's logic is
unit-testable without mounting the whole page + fake timers (fuller timer test is Section 4 E2E).

## The Section 3 test files (adapt to S3 convention + real props)

### 3A — report-status-badge.test.tsx  [Sprint 4 CORE — the derived badge, frontend CM-01]
```tsx
describe('ReportStatusBadge (derived status — CM-01 at the component)', () => {
  it('renders "Generating" when pdfUrl is null', () => {
    render(<ReportStatusBadge report={{ pdfUrl: null, emailSentAt: null }} />);
    expect(screen.getByText(/generating/i)).toBeInTheDocument();
  });
  it('renders "Ready" when pdfUrl set, emailSentAt null', () => {
    render(<ReportStatusBadge report={{ pdfUrl: 'reports/x.pdf', emailSentAt: null }} />);
    expect(screen.getByText(/ready/i)).toBeInTheDocument();
  });
  it('renders "Published" when emailSentAt set', () => {
    render(<ReportStatusBadge report={{ pdfUrl: 'reports/x.pdf', emailSentAt: '2026-07-05' }} />);
    expect(screen.getByText(/published/i)).toBeInTheDocument();
  });
  it('sets aria-busy while generating (FIX 13 a11y)', () => {
    const { container } = render(<ReportStatusBadge report={{ pdfUrl: null, emailSentAt: null }} />);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();  // adapt to actual a11y wiring
  });
});
```
Adapt prop shape to the real component (STEP 0). Assert the 3 derived states + the aria-busy/role=status a11y.

### 3B — poll-logic.test.ts / useReportsPoll.test.ts  [REGRESSION bug 9 — the auto-refresh race]
The condition that took several rounds: poll while a row is generating OR awaiting a just-created report; STOP when
neither. Test the extracted `shouldPollReports` (or the hook's condition):
```ts
describe('shouldPollReports (regression: bug 9 — awaitingReport bridges the 202-before-row race)', () => {
  it('polls when a row has null pdfUrl (generating)', () => {
    expect(shouldPollReports([{ pdfUrl: null }], false)).toBe(true);
  });
  it('polls when awaitingReport=true even if all existing rows are ready (the RACE: POST 202 before Inngest row)', () => {
    expect(shouldPollReports([{ pdfUrl: 'x.pdf' }], true)).toBe(true);   // the exact bug-9 case
  });
  it('STOPS when all rows ready and not awaiting (no endless polling)', () => {
    expect(shouldPollReports([{ pdfUrl: 'x.pdf' }, { pdfUrl: 'y.pdf' }], false)).toBe(false);
  });
  it('stops on empty list when not awaiting', () => {
    expect(shouldPollReports([], false)).toBe(false);
  });
});
```
- The KEY case is the 2nd: awaitingReport=true keeps polling even when existing rows are all ready — that's the race
  the immediate-refetch missed (row didn't exist yet at fetch time). A test asserting ONLY "polls when generating"
  would MISS bug 9 — the awaitingReport case is the regression guard.
- If there's a countRef/awaitingReport-clear on new-row-detected, assert that transition too (count increased →
  awaiting cleared → anyGenerating takes over).

### 3C — report-card.test.tsx  [Sprint 4 CORE]
```tsx
describe('ReportCard', () => {
  it('renders title, period, and generated date', () => { /* real props */ });
  it('Download action is DISABLED/absent when pdfUrl null (generating)', () => { /* download gated on pdfUrl */ });
  it('Download action is ENABLED when pdfUrl set', () => { /* clickable */ });
  it('shows the derived status badge for the row', () => { /* composes 3A */ });
});
```
Assert download gating tracks pdfUrl (ties to CM-01) — the enable-on-ready behavior.

### 3D — section-toggle-list.test.tsx  [Sprint 4 CORE — template editor surface]
```tsx
describe('SectionToggleList (12 ReportSection types)', () => {
  it('renders all 12 section types', () => { /* count = 12 */ });
  it('the 5 core sections default to include:true, the other 7 false', () => { /* default template state */ });
  it('toggling a section fires onChange with the updated include flag', () => { /* userEvent click → onChange */ });
  it('preserves order (order field) and renders drag handles', () => { /* order respected */ });
});
```
The 5 core: executive_summary, score_breakdown, mention_source_divide, fan_out_coverage, topical_gap_summary.

### 3E — reports-tab-gate.test.tsx  [Sprint 4 — Growth+ gate on Reports]
```tsx
describe('Reports tab tier gate', () => {
  it('Growth+ tier: Reports content renders (not gated)', () => { /* tier=growth → accessible */ });
  it('Starter tier: shows the upgrade teaser, not the reports list (Reports = Growth+)', () => { /* tier=starter → locked */ });
});
```
Reports = Growth+ (LLD 607/610). Use the TierGate primitive the component consumes; mock tier prop both ways.

## STEP 2 — Extraction (only if needed for 3B)
If the poll condition is inline in the reports page, extract `shouldPollReports(reports, awaitingReport): boolean`
(behavior-preserving; the page's effect calls it). This makes bug 9's logic unit-testable here; the full mount+fake-
timer "badge flips without reload AND polling stops" behavioral test is Section 4 (E2E).

## STEP 3 — Run + prove the bug-9 guard catches the race
```bash
<repo test cmd> run <section3 dir>
```
Re-introduce the bug-9 race and confirm 3B fails, then revert:
- change `shouldPollReports` to `reports.some(r => !r.pdfUrl)` ONLY (drop the awaitingReport term) → the "polls when
  awaitingReport even if rows ready" test FAILS (returns false — the exact original bug where the poll never started).
Report: Section 3 count all green; the re-introduce dropped-awaitingReport check FAILED as expected (proving 3B guards
the real race, not just "polls when generating").

## STEP 4 — Report
- Section 3 count + all green; matches S3 breadth (~65).
- STEP 3 re-introduce proof (drop awaitingReport → 3B fails).
- Full unfiltered suite still green (120 files / ~1822 + the new Section 3 files) — report the FULL total, not a scoped
  run.
- Any extraction done (shouldPollReports).
- lucide-react icon mock reused (avoid the Eye-icon crash class from S2).

## Constraints
- Match S3 frontend runner/convention (testing-library, jsdom/happy-dom). No real DB/network — mock fetch.
- These are COMPONENT units — no fake-timer full-poll behavioral test here (that's Section 4). 3B tests the CONDITION
  logic (pure), which is where bug 9 lived and is unit-testable.
- The bug-9 guard MUST assert the awaitingReport case (2nd test in 3B) — that's the regression, not "polls when
  generating."
- Run the FULL suite unfiltered to confirm total — do NOT report a scoped subset as the count.
- Extraction behavior-preserving; the page calls the extracted helper.

## NOTE
Section 3 = Sprint 4's report UI unit layer: derived status badge (3A, CM-01 at component), the poll CONDITION logic
(3B, bug 9's regression guard — the awaitingReport case is decisive), report-card download gating (3C), section-toggle
list (3D), Growth+ gate (3E). The bug-9 guard is the point: a test that only checks "polls when generating" would MISS
the race (poll never STARTED because the row didn't exist yet at fetch) — the awaitingReport term is what fixed it, so
the test must assert it, and the STEP 3 re-introduce (drop awaitingReport → 3B fails) proves it. Full mount + fake-timer
"flips without reload, polling stops" is Section 4. Report the FULL suite total, reusing the lucide mock.
