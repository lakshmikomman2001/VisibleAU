# Claude Code — WRITE trust-rls.test.ts: verify cross-org isolation on the 6 S5 trust tables (the untested security boundary)

The S5 audit flagged NO RLS test — a security boundary running unverified. 6 new trust tables carry org data; nothing
proves org A can't read org B's hallucination incidents / evidence / consensus. "The RLS policy is written" ≠ "it
blocks cross-org reads." Write `trust-rls.test.ts` (spec §514) matching the existing per-sprint RLS tests
(workflow-rls S2, visibility-rls S3, communication-rls S4). REAL behavioral — seed two orgs, prove isolation.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau` (RLS tests run on dev, never prod). Match the S4
communication-rls harness exactly.

## ⚠️ TWO things a naive test gets WRONG — get these right:
1. **RLS is SILENTLY BYPASSED without the context var (LLD 3499).** Policies read `current_setting('app.current_org_id')`
   via `setRlsContext(db, orgId)` (LLD 5718/8825/8835). If the test doesn't set it, queries run UNFILTERED and the test
   passes while proving NOTHING. The test MUST set the RLS context per-org and MUST NOT run as a BYPASSRLS/superuser
   role. Confirm the test DB connection is a non-superuser role that RLS applies to (the existing RLS tests already
   solve this — copy their setup).
2. **brand_entity_scores uses a DIFFERENT posture (§5.9).** The 5 new tables (hallucination_incidents,
   evidence_snapshots, brand_consensus_checks, citation_source_intelligence, linkedin_presence_audits,
   youtube_presence_audits) use DIRECT organization_id RLS. But **brand_entity_scores follows the Phase 1 JOIN-to-brands
   posture (LLD ~8629)** — its backfilled organization_id column does NOT by itself change the policy. So test its
   isolation via the brands-join path, not by assuming a direct org_id policy. (It's the 6th "table" but a different
   mechanism — assert isolation holds, matching its actual policy.)

## STEP 1 — Copy the existing RLS test harness + confirm the context mechanism
```bash
# The pattern to match (S4) + how it sets RLS context / seeds two orgs:
cat tests/**/communication-rls.test.ts 2>/dev/null || find . -name "communication-rls.test.ts"
grep -rn "setRlsContext\|app.current_org_id\|set_config\|current_setting\|withOrgContext\|two.*org\|orgA\|orgB\|beforeEach" tests/**/communication-rls.test.ts tests/**/*rls*.ts | head
# Confirm setRlsContext exists + its signature:
grep -rn "setRlsContext\|app.current_org_id\|set_config" lib/ db/ | head
# Confirm the 6 tables' actual policies (5 direct org_id + brand_entity_scores join):
grep -n "organization_id\|current_setting\|USING\|WITH CHECK\|CREATE POLICY" db/migrations/0016*.sql db/migrations/0017*.sql | head -30
```
Report: the S4 RLS test structure, the setRlsContext mechanism, and confirm the 5 tables have direct org_id policies +
brand_entity_scores' posture.

## STEP 2 — Write trust-rls.test.ts (seed 2 orgs, prove isolation on all 6)
Mirror communication-rls.test.ts. Structure:
```ts
// setup: two orgs (orgA, orgB), each with a brand + trust rows in each of the 6 tables.
beforeEach(async () => {
  // seed orgA + orgB, each with rows in: hallucination_incidents, evidence_snapshots,
  // brand_consensus_checks, citation_source_intelligence, linkedin_presence_audits,
  // youtube_presence_audits, brand_entity_scores.
});

// For EACH of the 5 direct-org_id tables:
it('<table>: orgA context cannot read orgB rows', async () => {
  await setRlsContext(db, orgA.id);                       // REQUIRED — else silently bypassed
  const rows = await db.select().from(<table>);           // RLS-filtered
  // every returned row belongs to orgA; NONE belong to orgB:
  expect(rows.every(r => r.organizationId === orgA.id)).toBe(true);
  expect(rows.some(r => r.organizationId === orgB.id)).toBe(false);
});
it('<table>: WITH CHECK blocks inserting a row for another org', async () => {
  await setRlsContext(db, orgA.id);
  await expect(db.insert(<table>).values({ organizationId: orgB.id, /*...*/ })).rejects.toThrow(); // WITH CHECK
});

// brand_entity_scores (JOIN-to-brands posture): orgA cannot read orgB's entity score
it('brand_entity_scores: orgA cannot read orgB entity rows (via brands-join policy)', async () => {
  await setRlsContext(db, orgA.id);
  const rows = await db.select().from(brandEntityScores);
  // isolation holds through the brands-join policy — no orgB brand's entity row visible:
  expect(rows.some(r => /* row belongs to orgB's brand */)).toBe(false);
});
```
- Cover ALL 6 tables. For the 5 direct-org_id tables: assert both READ isolation (USING) and INSERT block (WITH CHECK).
- For brand_entity_scores: assert isolation via its actual (brands-join) policy — don't assert a direct org_id policy it
  doesn't have.
- Use the real column names/required fields per table (grep db/schema).

## STEP 3 — PROVE the test actually engages RLS (the anti-"silently bypassed" check)
The test is worthless if RLS is bypassed. Prove it's real:
```bash
<repo test cmd> run tests/**/trust-rls.test.ts
```
- All isolation assertions pass WITH setRlsContext.
- **Re-break proof:** temporarily DROP one table's RLS policy (or comment the setRlsContext call for one test) → that
  test should FAIL (orgA now sees orgB rows). If it still PASSES with the policy dropped, the test isn't engaging RLS
  (superuser/BYPASSRLS connection, or context not set) — FIX the harness (non-superuser role, context set) before
  trusting it. Revert.
This re-break is essential: an RLS test that passes with the policy removed is proving nothing — the exact green-theater
trap. Confirm it FAILS when RLS is off.

## STEP 4 — Report
- trust-rls.test.ts covers all 6 tables (5 direct org_id: read-isolation + WITH-CHECK-insert-block; brand_entity_scores:
  brands-join isolation).
- All pass WITH setRlsContext.
- **Re-break confirmed:** dropping a policy / unsetting context makes the test FAIL (proving it engages real RLS, not a
  bypassed connection).
- Test count + green; full suite still green.

## Constraints
- MUST set app.current_org_id via setRlsContext per-org — else RLS silently bypassed (LLD 3499) and the test is fake.
- MUST run on a non-superuser role RLS applies to (BYPASSRLS/superuser defeats the test) — match the existing RLS tests'
  connection.
- brand_entity_scores: test its ACTUAL policy (Phase 1 brands-join, §5.9/LLD 8629), not an assumed direct org_id policy.
- The re-break proof (STEP 3) is mandatory — an RLS test that passes with RLS off is green theater.
- Dev DB `visibleau`, never prod. Match the S4 communication-rls harness.
- LLD v8.70 / §5.9 / §514 win.

## NOTE
This closes the one deferred item with security stakes: cross-org isolation on the 6 trust tables was unverified. Write
trust-rls.test.ts (spec §514) like the prior per-sprint RLS tests. Two traps: (1) RLS is SILENTLY BYPASSED without
setRlsContext (LLD 3499) and on a superuser role — the test must set the org context and run as a role RLS applies to,
or it passes while proving nothing; (2) brand_entity_scores uses the Phase 1 brands-JOIN posture, not direct org_id
(§5.9) — test its real policy. The re-break proof — drop a policy, watch the test FAIL — is what proves the test engages
real RLS rather than a bypassed connection. Cover all 6: read-isolation (USING) + insert-block (WITH CHECK) for the 5
direct tables, brands-join isolation for entity scores.
