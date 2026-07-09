# Claude Code — S6 §11 test track — SECTION 2 of 4: Backend Integration (public route, write patterns, wiring, RLS)

Section-by-section: SECTION 1 (Backend Unit, 48 tests) is DONE. This is SECTION 2 — Backend Integration. Do NOT jump to
Sections 3-4. INVENTORY what exists (89-total build) against the §11 integration list, VERIFY each is real + fires on
re-break, FILL gaps. The 5 files here are the meatier ones (public API, DB write patterns, the S4 wiring, RLS).

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`. LLM_MODE=mock. Never prod. tests/phase2/sprint6/.

## SECTION 2 — the 5 §11 Backend Integration tests, with exact canon:

### 1. visit-route.integration.test.ts (the PUBLIC route — §9.1, MW-01/BT-01/SEC-A/SEC-B)
The ONLY public, non-session route (brandToken auth, NOT Better Auth). Assert:
- **valid brandToken → 202** + **emits `visit/ingested`** (the Inngest event; assert the emit, mocked).
- **invalid/absent brandToken → 401** (BT-01: SELECT brand by brand_token FIRST → 401 if absent).
- **rate-limit triggers** (uses the existing rate-limit utility; over-limit → 429/blocked).
- **`/api/visit` is in the middleware isPublic matcher** (MW-01 — else session middleware 401s every visitor; assert via
  a request that reaches the route without a session, OR assert the matcher includes it).
Re-break: (a) remove the brandToken check → invalid-token test stops returning 401 → FAIL; (b) drop the emit → the
visit/ingested assertion FAILS; (c) remove /api/visit from isPublic → the no-session request 401s → FAIL.

### 2. llmstxt-refresh.test.ts (one-current transaction — LLD 5380)
- The refresh sets all existing rows is_current=false in a transaction, THEN inserts the new row is_current=true — so
  **exactly ONE is_current=true row per brand remains** (the partial unique index
  `llmstxt_one_current_per_brand ON (brand_id) WHERE is_current=true` enforces it).
- Assert: after two refreshes, `SELECT count(*) WHERE brand_id=X AND is_current=true` = **1** (not 2).
Re-break: skip the "set others false" step (insert new current without demoting old) → the count becomes 2 (or the
partial-unique throws) → FAIL.

### 3. agent-readiness.append-only.test.ts (APPEND-ONLY — U-13, LLD 5475)
- A new scoring run **INSERTs a new row** (no UPSERT, no ON CONFLICT) — history is preserved.
- Latest is fetched via **`ORDER BY scored_at DESC LIMIT 1`**.
- Assert: after two runs, there are **2 rows** for the brand (not 1 overwritten), and the "latest" read returns the newer
  scored_at.
Re-break: change the insert to an UPSERT on brand_id (overwrite) → the 2-rows assertion FAILS (only 1 row) → confirms
append-only.

### 4. s4-wiring.integration.test.ts (the last 2 slots — §0.2; connects to the Bug A + Bug B fixes)
Once an S6 row exists, the S4 narrative-generator renders **entity_home_status** + **agent_readiness** (the last 2 of the
12 slots). Assert, with re-break:
- seed content_structure_audits (entity-home cols populated — is_entity_home_candidate/org_schema/@id/sameAs) +
  agent_readiness_scores → generate a report on the **DEFAULT template** (no hand-inserted template — the Bug A guard) →
  BOTH sections render.
- **entity_home_status renders the REAL entity-home fields** (@id/sameAs/org-schema), NOT a URL heuristic / citation
  probability (the Bug B guard — the display half we fixed).
- **agent_readiness** section renders the score + dimensions.
- Both slots are **include:true in the default template** (the Bug A fix — flip to include:false → they don't render →
  the test FAILS).
Re-break: (a) set a slot include:false → its section stops rendering → FAIL; (b) point entity_home_status back at the URL
heuristic → the @id/sameAs assertion FAILS. (This test is what would have caught Bug A + Bug B's display half.)

### 5. retrieval-rls.test.ts (cross-org isolation — LLD 5620, §5.6)
- All 4 new tables (crawler_visit_logs, content_structure_audits, llmstxt_versions, agent_readiness_scores) carry
  **organization_id → DIRECT-org_id RLS** (USING + WITH CHECK on organization_id — NOTE: this is DIFFERENT from S5's
  brands-join posture; S6 tables have organization_id directly).
- Cross-org reads are **BLOCKED** — and per CLAUDE.md §8, cross-org returns **404, not 401** (don't leak org membership).
- Protected routes call **setRlsContext** (without it, RLS is silently bypassed — LLD 5620).
- **The Visit route is the DOCUMENTED public exception** (no session/RLS — secured by brandToken instead).
Assert (via rls_test_role NOSUPERUSER/NOBYPASSRLS + setRlsContext, the S5 pattern): org A cannot read org B's rows on all
4 tables; re-break BOTH ways (drop the policy → cross-org read succeeds → FAIL; omit setRlsContext → silent bypass → the
isolation test FAILS).

## STEP 1 — Inventory: which of the 5 exist + are they real?
```bash
for f in visit-route llmstxt-refresh agent-readiness.append-only s4-wiring retrieval-rls; do
  echo "=== $f ==="; find tests -iname "*$f*" 2>/dev/null; done
grep -rln "readFileSync\|toContain.*import" tests/phase2/sprint6/*{visit-route,llmstxt-refresh,append-only,s4-wiring,retrieval-rls}* 2>/dev/null
```
Report which exist + flag any source-grep (not behavioral). NOTE: s4-wiring may exist from the Bug A/B fixes (an
s6-wiring or s4-wiring test was added) — confirm it covers the DEFAULT-path + real-entity-home-fields assertions above.

## STEP 2 — Verify each behavioral + fires on re-break (ONE AT A TIME)
For each of the 5, confirm the assertions above, then prove re-break (break the thing → test fails → restore). These are
integration tests — they hit the real dev DB / real route handlers / real Inngest emit (mocked transport), NOT source
greps. Report per test: real + re-break fires. Priority: visit-route (401/202/emit/isPublic), append-only (2-rows),
one-current (exactly-1), s4-wiring (default-path + real entity-home fields — the Bug A/B guard), RLS (both re-break
directions).

## STEP 3 — Fill gaps
Any missing → write the real integration test per spec above. Each fails on re-break.

## STEP 4 — Run Section 2 + report, then STOP
```bash
<repo test cmd> run tests/phase2/sprint6/   # the integration files
```
- The 5: existed real / rewritten / built new. Re-break fired for each (esp. visit-route, append-only, s4-wiring, RLS).
- Section 2 green; total count (Section 1 was 48; full suite was 89).
STOP — do NOT start Section 3. Report, and we do Section 3 (the walk's regression guards) next.

## Constraints
- SECTION 2 ONLY (the 5 integration tests). Not Sections 3-4.
- Integration = real DB / real route / real emit (mocked transport) — NOT source greps. Inventory first; don't duplicate.
- Visit route: 202 + emit + 401-on-bad-token + isPublic (MW-01). append-only: 2 rows (not overwritten). one-current:
  exactly 1 is_current. s4-wiring: DEFAULT-path renders BOTH slots with REAL entity-home fields (the Bug A + Bug B
  display guard). RLS: cross-org blocked on all 4 tables, 404-not-401, setRlsContext required, Visit route = public
  exception; re-break both ways.
- S6 RLS is DIRECT organization_id (not S5's brands-join) — assert on organization_id.
- LLM_MODE=mock. Dev DB `visibleau`, never prod. LLD v8.70 / §9.1 / §5.6 / §0.2 / §11 win.

## NOTE
Section 2 of 4 — Backend Integration (the meatier files): the PUBLIC Visit route (202 + emit visit/ingested + 401-on-
bad-brandToken + /api/visit in isPublic per MW-01), the DB write patterns (agent_readiness APPEND-ONLY → 2 rows not
overwritten, latest via scored_at DESC; llms.txt one-current-transaction → exactly 1 is_current), the S4 wiring
(entity_home_status + agent_readiness render on the DEFAULT template with REAL entity-home fields — the test that would
have caught Bug A + Bug B's display half), and RLS (cross-org blocked on all 4 tables via DIRECT organization_id, 404-not-
401, setRlsContext required, Visit route = the documented public exception; re-break both ways). Inventory vs §11, verify
behavioral + re-break, fill gaps. STOP after Section 2 and report; Sections 3 (walk regression guards) + 4 (QA greps) follow.
