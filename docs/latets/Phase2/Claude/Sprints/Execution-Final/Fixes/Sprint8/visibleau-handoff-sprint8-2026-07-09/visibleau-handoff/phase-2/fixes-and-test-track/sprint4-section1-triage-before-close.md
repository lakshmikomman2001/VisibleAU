# Claude Code — Section 1 close check: triage the 13 pre-existing failures + confirm 1D/1E coverage (DIAGNOSE, don't fix yet)

Section 1 regression subset is green (37 pass) and both proofs fired (Math.ceil→'2026-W01' fail; ×100 fail) — that part
is solid. But before commit+push, two things must be resolved. DIAGNOSE only; report findings; fix after we decide.

## Q1 — The 13 "pre-existing" failures across 4 files: name them + classify each (stale vs real)
"Failing before our changes too" is NOT a pass. Sprint 3 closed at 344 GREEN — 13 red tests means either regressions
since S3, or long-ignored red the suite has normalized. Either way we look now.
```bash
# List the failing files + the actual failing test names + the assertion that fails:
<repo test cmd> run 2>&1 | grep -iE "fail|✗|×|✘" | head -60
# For each failing file, show what it asserts:
# (repeat per file)
sed -n '1,80p' <failing-file-1>
```
For EACH of the 4 files, classify into ONE bucket and report which:
- **STALE (fix-invalidated)** — the test asserts OLD behavior that THIS session's fixes deliberately changed. Prime
  suspects:
  - a test expecting `citationRate * 100` / the 7000%-era math, or a rate as 0-1 not 0-100 (bug 3 changed this)
  - a test expecting single-engine routing / getLLMService() with no arg (bug 4 changed this)
  - a test expecting week-of-month period labels (bug 2 changed this)
  - a test reading `brandMentioned` not `brandAppeared` (bug 6 renamed this)
  - a test expecting the duplicated exec/mention-source text (bug 8 changed this)
  → If STALE: the test is wrong now, not the code. It must be UPDATED to the corrected behavior. Its red state is
    actively masking whether the fix broke assumptions — flag each one.
- **KNOWN-BANKED** — the one documented stable failure from history: Sprint 1 `audit_cost_snapshots` FK-cascade
  `confdeltype` assertion. If a failure is exactly that, it's the accepted one. (But that's ONE test — 13 is far more,
  so most are not this.)
- **REAL REGRESSION** — genuinely broken, unrelated to this session, red since before we noticed → Sprint 3's 344-green
  has drifted; something regressed between S3 close and now. Report what.
Report: the 4 filenames, the count per file, and each file's bucket (STALE / KNOWN-BANKED / REAL) with the specific
assertion that fails.

## Q2 — Did the Section-1 CORE coverage get built, or only the regression subset?
The file is `sprint4-regressions.test.ts` (37 tests) — that sounds like 1A/1B/1C/1F/1G (the regression guards) but maybe
NOT the CORE Sprint-4 unit surface. Section 1 (matching Sprint 3's 80-test breadth) also needs:
```bash
grep -rn "deriveReportStatus\|derive.*status\|report.*status.*badge" tests/ lib/communication/ | head
grep -rn "ReportSection\|filter(s => s.include\|all-core\|resolveTemplate\|default.*template" tests/ | head
grep -rn "narrative.*rule\|RULES\|quality_status\|sample_quality\|key_win\|confidence" tests/ lib/communication/narrative-generator.ts | head
```
Report whether these exist as tests:
- **1D — deriveReportStatus (CM-01):** pdf_url NULL→'generating'; set+email_sent_at NULL→'ready'; email_sent_at
  set→'published'; three-branch total (verified contract, LLD 761). Built? Y/N.
- **1E — ReportSection filtering + fallback:** `.filter(s=>s.include)` preserves order; default template's 5 core
  sections include:true / other 7 false; no-template → all-core fallback (LLD 8225). Built? Y/N.
- **1H (NEW — flag if missing) — narrative honesty RULES 1–11 (LLD 8284):** these are pure-ish and testable and likely
  what some of the 13 failures touch. Especially unit-checkable:
  - RULE 3: key win requires `score_delta > 0 AND sample_quality >= 'Likely'` (assert it's EXCLUDED below the bar).
  - RULE 1: no causal language when `quality_status='insufficient'`.
  - RULE 4/5/6: section inclusion conditions (fan-out when rows exist; topical when TCG<70%; mention-source when
    archetype present).
  Report whether ANY narrative-rule tests exist. (Do NOT build yet — just report the gap.)
If 1D/1E (and rules) are NOT built, Section 1 is the regression SUBSET, not full Sprint-3-breadth Section 1 — note it.

## What to report back (no fixes yet)
1. The 4 failing files, per-file count, and each classified STALE / KNOWN-BANKED / REAL with the failing assertion.
2. Whether 1D (deriveReportStatus) and 1E (ReportSection filter/fallback) tests exist.
3. Whether any narrative-rule (RULES 1–11) tests exist.
Then we decide: STALE tests → update-to-corrected-behavior prompt; REAL regressions → fix prompt; missing 1D/1E/rules →
extend Section 1 to full breadth. NO commit until the 13 are classified — committing a suite with 13 unexplained reds
normalizes exactly the "green-but-broken / ignore-the-red" failure this whole track exists to prevent.

## Constraints
- Diagnose only — classify, don't change tests or code yet.
- Dev DB `visibleau`, never prod.
- Be specific: filenames + failing assertions, not "13 pre-existing." "Pre-existing" is a classification to justify, not
  a reason to skip.

## NOTE
Two gates before Section 1 closes: (1) the 13 reds are each explained — stale (fix-invalidated, must update), the one
known-banked FK-cascade, or a real regression that drifted from S3's 344-green; (2) the CORE Sprint-4 units
(deriveReportStatus CM-01, ReportSection filter+fallback, ideally narrative RULES 1–11) are covered, not just the
regression subset. A suite committed with unexplained reds is a suite people stop trusting — the opposite of what this
track is for.
