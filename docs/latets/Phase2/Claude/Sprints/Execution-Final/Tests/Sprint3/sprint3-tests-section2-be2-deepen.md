# Claude Code — Sprint 3 Section 2 · BE-2: DEEPEN + FILL GAPS (report-first)

BE-1 wrote 72 E2E tests (152 total across the Sprint 3 suite), all green, **no source failures**. BUT on review,
many BE-1 tests are **source-pattern checks** (assert the code CONTAINS a pattern) rather than **behavioral**
(assert what the code DOES at runtime). BE-2 deepens these into real assertions AND adds edge cases.

> **Report-first (unchanged):** write + run tests, **REPORT failures for review — do NOT auto-edit source** to make
> them pass. A failure may be a real code bug OR a wrong test. Only BE-4 may change source, post-review.
> **Dev DB only** (seeds + tears down). RLS tests under **`rls_test_role` (non-superuser)**.

## The problem BE-2 fixes
Green source-pattern tests re-encode this session's core blind spot: **code present ≠ code works.** E.g. "route
FILE contains `getCurrentUser`" stays green even if auth returns the wrong code or the ownership check is buggy.
The manual pass found 8 bugs precisely because presence ≠ behaviour. So the priority is making the ROUTE CONTRACTS
and the {location} substitution **behavioural**.

---

## TRACK 1 — Convert source-pattern tests → real request/response behaviour (PRIORITY)

### 1a. The 6 routes — assert what they DO when called (not that the file contains auth)
For each route (`visibility`, `fan-out`, `topical-gaps`, `citation-failure`, `competitive-benchmark`, `wins`),
replace/augment the "uses getCurrentUser / validates with Zod / checks organizationId" source checks with **real
request → real response** assertions (invoke the route handler with seeded dev-DB data + a real/mocked auth
session):
- **Unauthenticated** request → actually returns **401** (no session).
- **Cross-org** request (authed as a user in org A, brand belongs to org B) → actually returns **404** (NOT 401,
  NOT the data). This is the `assertBrandAccess` / ownership behaviour — prove it returns 404 by CALLING it, not by
  grepping for the check.
- **Valid, authorised** request → **200** with the expected response shape (the documented fields present).
- **Invalid brandId** (non-UUID) → the **Zod 400** validation error actually fires (call with a bad param, assert
  400 — don't just assert `z.string().uuid()` is in the file).
- Where a route has a **tier gate** (competitive-benchmark: Growth 1 competitor / Agency 3 / Starter locked): call
  as each tier and assert the **actual gated response** (Starter → locked/teaser; Growth → 1; Agency → 3), reading
  `subscriptions.tier`. Prove the gate by calling at the boundary, not by grepping.

### 1b. {location} substitution — assert the OUTPUT, not the import
BE-1 has "imports formatLocation" + "regex replaces {location}" (pattern) + one real "NSW:Bondi → 'Bondi, NSW'"
(behavioural — keep it). Add: run the fan-out/expand path for a brand WITH a region and assert the **stored/produced
prompt contains the real suburb and NO literal `{location}` token** (assert the actual output string, not the
import).

### 1c. CPR-01 route behaviour — call the route, assert the response
BE-1 has "null stub / no generateText / diagnose import." Strengthen to a real call: invoke competitive-benchmark
with `comparison_prompt_results` EMPTY → assert the actual response body has `comparisonData: null` +
`dataAvailableFrom: 'Sprint 7'` + **status 200** (call it, read the body), and that generateText was NOT invoked
(spy/mock the LLM client, assert 0 calls). Same for citation-failure: call it with S5/S7 empty → assert a real
**200** + a valid diagnosis body (not just "diagnose is imported").

> Note: migration "source-pattern" tests (grep the .sql for `CREATE TABLE IF NOT EXISTS` etc.) are acceptable as-is
> — they assert migration *file* properties, and the real table existence is already proven behaviourally (RLS +
> UPSERT tests run against the actual tables). No need to convert those.

## TRACK 2 — Edge cases (fill the gaps BE-1's happy-path missed)

### 2a. Empty audit (no mentions) — end-to-end
Seed an audit where the brand has **zero mentions**. Assert end-to-end: `mention_rate = 0` → `mention_source_ratio`
stored **NULL** (not 0) → archetype **'invisible'**; SoV handles the no-mentions case without error; the trend row
is written with the honest empty values (not fabricated).

### 2b. Brand WITHOUT a region — the {location} fallback (untested path)
Seed a brand with **no `primaryRegions`** (empty/null). Run the fan-out/expand path. Assert the **fallback
behaviour**: does `{location}` degrade gracefully (e.g. dropped, or a sensible default), or does it leave a literal
`{location}`? **A literal `{location}` in the output is a bug — REPORT it.** (BE-1 only tested the has-region path;
this is the gap.)

### 2c. Tier boundaries — exactly at the limits
competitive-benchmark competitor count: assert **exactly** Growth = 1, Agency = 3, Agency Pro = unlimited, Starter =
locked — call at each boundary and assert the count returned, plus the boundary just-inside/just-outside.

### 2d. UPSERT conflict paths — concurrency / re-run
For the UNIQUE-keyed tables (visibility_trends `(brand_id, period_label, period_type)`; topical_coverage_gaps
`(brand_id, vertical, topic_cluster)`; SoV): write, then write again with the SAME key and CHANGED values → assert
the row is **updated (not duplicated)** and `updated_at` advances (J-01). Assert row counts stay stable across
re-runs (MI-01 at the data level, beyond the constraint-existence check).

### 2e. Volatility trigger — the boundary
Seed citation_rate history that yields volatility **exactly at / just above 15.0** → assert the trigger fires at
`> 15.0` and NOT at `= 15.0` (or whatever the exact boundary is per §6.7). Prove the threshold, not just that a
volatility number is computed.

## BE-2 ALSO (from the checklist): deepen generally
Beyond the above, analyse the Sprint 3 backend for any other gaps in the E2E coverage and add tests (real dev-DB
data). REPORT failures — don't fix source.

## INVARIANTS
- Behavioural over source-pattern: routes assert real 401/404/400/200 + gated responses by CALLING them;
  {location} + CPR-01 assert real OUTPUT/response bodies.
- Report-first: REPORT failures (esp. the 2b {location} fallback and any tier-boundary or UPSERT surprise) — do NOT
  auto-fix source. Only BE-4 changes source, post-review.
- Dev DB; `LLM_MODE=mock`; RLS under `rls_test_role` (non-superuser); tear down seeded data; never prod.
- `subscriptions.tier` (never `organizations.tier`); `selectModel`; TS strict, no `any`.

## VERIFY / REPORT
- Which BE-1 tests were **converted** source-pattern → behavioural (the 18 route tests, the {location} import, the
  CPR-01 imports), and are the new behavioural versions green?
- **Did any route, when actually CALLED (not grepped), behave differently than the source-pattern test assumed?**
  (e.g. cross-org returning 401 instead of 404, a tier gate off-by-one, a Zod error not firing.) This is the key
  question — REPORT any such finding as a real bug (don't fix in BE-2).
- Edge-case results: empty-audit ratio-NULL end-to-end; **2b {location} fallback — literal `{location}` leaked?
  (REPORT if so)**; tier boundaries exact; UPSERT updates-not-duplicates; volatility boundary.
- Full pass/fail counts; RLS role confirmed non-superuser; any genuine regression flagged (for BE-4, not fixed
  here).

## NEXT
BE-3 (cross-sprint gaps S1→S3) then BE-4 (run-all + fix — the only pass that may change source, post-review). Then
Section 3 (Frontend Unit) — components with mock data, **including updating any donut-specific assertions to the
new ranked-bars sov-donut.tsx**.
