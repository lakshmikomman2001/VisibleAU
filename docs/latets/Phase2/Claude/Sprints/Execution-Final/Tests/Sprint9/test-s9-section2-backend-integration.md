# S9 TEST TRACK — SECTION 2: BACKEND INTEGRATION

## Scope
Routes + guards, against a **real DB** (`visibleau` dev). This is where Section 1's limits get lifted:
1.5 could only grep the source for `completedAt`; here it can run the **AEST/UTC boundary** for real.

**Location:** `tests/phase2/sprint9/integration/`
**Every ⚠️ test = a break-proof. Paste the RED.**

---

## 2.1 — ENVELOPE SHAPES (the sprint's dominant bug class — 4 of 19 findings)

**F11 · F15 · F16 · F17 were all one bug:** routes return **inconsistent shapes**, pages guess, a
wrong guess yields `undefined → null → Number(null)=0 → red`. **200 OK, data arrives, page silently
drops it.** No crash. No failed test.

**The route-shape inventory (from the walk — this is the contract to freeze):**
| Route | Shape |
|---|---|
| `/latest-audit` | `{ audit, actionItems, priorAudit, engineStats }` |
| `/brands/{id}` | `{ brand }` |
| `/topical-gaps` | `{ gaps }` |
| `/agent-readiness` | `{ latest }` |
| `/journeys` | `{ journeys, templates }` |
| `/site-readiness` | `{ scoreComposite }` |
| `/tasks` · `/drafts` · `/comparisons` | **bare array** |

Tests — for **every** route above:
- Assert the **exact top-level shape** (the named key(s) present; a bare array where canon says bare).
- ⚠️ **Assert `promptsCount` IS in `/latest-audit`'s SELECT** — it was missing entirely (F15's bonus),
  so step 1 read "0 prompts" even after the unwrap fix. Assert it's non-null for Metropolitan.
- **A route that returns an envelope must NEVER return a bare array, and vice versa.** This is the
  contract the pages depend on.

**BREAK-PROOF:** change `/topical-gaps` to return a bare array → its shape test goes RED.

**⚠️ THE STRUCTURAL QUESTION (report, don't fix unilaterally):**
The tolerant `Array.isArray(x) ? x : x?.key ?? []` fallbacks still exist in the pages. **That
tolerance IS the bug** — it converts a wiring error into a plausible empty state. Recommend:
standardise every route on a named envelope and **delete the fallbacks so a mis-read fails LOUDLY**.
Report the effort; Sri decides. Do not refactor 9 routes in this prompt.

---

## 2.2 — BRAND ISOLATION (`assertBrandAccess`) — security, not cosmetics

**Canon:** cross-org access → **404** (not 403 — deliberate; don't leak existence).

For **every** S9 route (`/latest-audit`, `/topical-gaps`, `/tasks`, `/drafts`, `/agent-readiness`,
`/site-readiness`, `/journeys`, `/comparisons`, `/brands/{id}`):
- Org A's user requesting Org B's `brandId` → **404**, and **zero rows leak** in the body.
- No session → 401/redirect.
- ⚠️ A **viewer** role hitting an S9 read route → allowed (reads are fine) — but assert the **audit
  trail** stays owner/admin-only (**S8-F22**: a viewer could read the audit trail — regression guard).
- Assert `withRlsContext` is actually applied — a route that forgets it may still return the right
  rows in dev while relying on app-level filtering. **Fixture: two orgs, same query, assert isolation
  holds at the DB layer.**

**BREAK-PROOF:** remove `assertBrandAccess` from one route → its cross-org test goes RED with a 200 +
leaked rows. **This is the most important break-proof in Section 2.**

---

## 2.3 — TIER GATES

**Canon:** Health Check + Autopilot are **Growth+**. Journeys = **Agency**.
**⚠️ `subscriptions.tier` is the SOLE source of truth — NEVER `organizations.tier`** (the S8 footgun).

- Free/Starter org → the gated route returns **403** → the page renders the **TierGate lock**, not a
  404 and not a 500.
- Growth org → 200.
- ⚠️ **Fixture: `organizations.tier='free'` but `subscriptions.tier='growth'` → MUST be allowed.**
  This is the test that catches a route reading the wrong column. **Break-proof it:** point the gate
  at `organizations.tier` → RED.

---

## 2.4 — THE TRACKER QUERY, AGAINST A REAL DB (Section 1's gap)

Section 1 could only **grep the source** for `completedAt`. That regex passes if the same bug is
written with different formatting, and **it cannot test the UTC boundary at all.** Do it properly:

- ⚠️ **THE AEST/UTC TEST.** Insert a task with
  `completed_at = '2026-06-30 23:00:00+00'` (= **2026-07-01 09:00 AEST**).
  Run the summary for **July** → **it must NOT count** (it's a JUNE task in UTC).
  Run under **`TZ=Australia/Sydney`** — under local-time logic this row *wrongly* counts as July.
  **Only UTC gets it right.** (F2.)
- ⚠️ `updated_at` this month + `completed_at` last month → **does NOT count** (F1).
- `status='complete'` (no `-d`) — a `'completed'` row must not count (the canon footgun).
- Measured Impact = `SUM(lift_achieved) FILTER (score_after IS NOT NULL)` — **not** the
  `visibility_trends` delta (F3). Fixture: set a `visibility_trends` change AND a differing
  `lift_achieved` → assert the tracker reports **`lift_achieved`**.
- No rows → **0**, not NULL (`COALESCE`).
- ⚠️ **Assert the route CALLS `lib/workflow/progress-summary.ts`** and does not roll its own query —
  **that was F3's root cause** (the canonical helper sat unused while the route duplicated it, wrongly).

**BREAK-PROOF:** `completed_at` → `updated_at` → the F1 fixture goes RED. Local-time month → the
**AEST fixture goes RED**. Paste both.

---

## 2.5 — HEALTH CHECK DIMENSION SOURCES (end-to-end, real rows)
- Site Readiness comes from **`technical_audits.scoreComposite`**, NOT `audits`. Seed a brand where
  the two differ → assert the API returns the `technical_audits` value. (S9 had to *create*
  `/site-readiness` because no route served this column — regression-guard it.)
- Metropolitan's real answer key through the API: Sentiment **100** · Presence **5** · Site Readiness
  **37** · Local Authority **20** · Overall **40.5**.
- Bondi: Sentiment **50** · Presence **0** · Site Readiness **21** · Local Authority **NULL** ·
  Overall **23.67** (3 dims — the NULL is excluded, **F8**).
- SaaS brand → Local Authority **absent** from the payload entirely.

---

## 2.6 — THE #1 ACTION
`remediation_tasks WHERE status='open' ORDER BY priority LIMIT 1`
- Bondi → **"Update local directory listings"** (priority 5000).
- Metropolitan → **none** (honest empty — it has no open task).
- ⚠️ The `description` is **NULL** and there is **no `explainability` column** → the rationale renders
  empty. **That's F9/F13, carried to S6.** Assert the API returns the NULL **honestly** — it must not
  fabricate text, and must not crash.

---

## CONSTRAINTS
- **Real DB** (`visibleau` dev). Seed/teardown per test; no leakage between tests.
- **Assert canon, not the code.** Code-vs-canon disagreement = a NEW finding; report it, don't bend
  the test.
- Every ⚠️ needs a **break-proof RED**.
- Do **NOT** touch §12 QA — standalone final pass after Section 5.
- If a route can't be integration-tested without heavy mocking, that's a **design finding** — report it.

## REPORT BACK (paste inline)
1. File paths + test count.
2. **The break-proof REDs** — especially **2.2** (drop `assertBrandAccess` → cross-org leak) and
   **2.4** (the AEST/UTC boundary).
3. **Any code-vs-canon failure = a NEW finding.** List them.
4. **The structural recommendation on envelope standardisation** (effort + blast radius) — Sri decides.
5. Full suite green (166 + Section 2), zero regressions.
