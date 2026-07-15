# Claude Code — FIX 2 confirmed S6 bugs: (B) entity-home not persisting [HIGH] + (A) report slots include:false [Bug-A]

Both confirmed against canon with citations. **Order matters — B GATES A:** entity_home_status reads the
content_structure_audits entity-home cols, which auditEntityHomeFn never writes; so flip include:true (A) AFTER B, or the
section renders a URL-heuristic guess. Fix B first, then A, then verify both render REAL data on the default path.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev `visibleau` + local prod `visibleau_prod` (migrations 0018/0019 now on
BOTH). Never real prod. LLD v8.70 WINS.

## FIX B (do FIRST) — auditEntityHomeFn must PERSIST the entity-home cols [HIGH — spec violation, wrong data on screen]
Canon (S6 prompt 263, 448-449; LLD 5837-5838): auditEntityHomeFn "updates the content_structure_audits entity-home cols
on the confirmed row." Currently it computes the data, emits an event with no consumer, and DISCARDS the result — the 5
cols are NULL in every row, so the page + report section fall back to a URL heuristic showing avgCitationProbability.

### B1 — Persist the 5 entity-home cols on the confirmed row (UPSERT on brand_id + page_url)
In `inngest/functions/audit-entity-home.ts`, after `auditEntityHome()` returns its result, WRITE the 5 cols to the
confirmed entity-home page's content_structure_audits row:
```ts
// the 5 cols (schema content-structure-audits.ts:22-26; UNIQUE(brand_id, page_url) → UPSERT per §5.2):
//   is_entity_home_candidate, entity_home_has_org_schema, entity_home_has_id_field,
//   entity_home_same_as_count, entity_home_page_url
await serviceDb.insert(contentStructureAudits)
  .values({ brandId, pageUrl: result.entityHomePageUrl, /* the content cols for that page +
             the 5 entity-home cols from result */ })
  .onConflictDoUpdate({
    target: [contentStructureAudits.brandId, contentStructureAudits.pageUrl],
    set: {
      isEntityHomeCandidate: result.isEntityHomeCandidate,
      entityHomeHasOrgSchema: result.entityHomeHasOrgSchema,
      entityHomeHasIdField: result.entityHomeHasIdField,
      entityHomeSameAsCount: result.entityHomeSameAsCount,
      entityHomePageUrl: result.entityHomePageUrl,
    },
  });
```
- UPSERT on (brandId, pageUrl) — the confirmed entity-home page likely already has a content_structure_audits row from
  the crawl; UPDATE its entity-home cols (don't create a duplicate). Match the exact column names in schema
  content-structure-audits.ts.
- Keep the Action Center recommendation when sameAs < 3 OR @id missing (LLD 5740 — confirm it still fires).
- The `entity-home/audited` event can stay emitted (forward-slot for S7, F-1) — but persistence must NOT depend on a
  consumer; write the row directly here.

### B2 — Read the REAL cols, not the URL heuristic (2 call sites)
```bash
grep -n "includes(\"/about\")\|isEntityHomeCandidate\|entity_home\|avgCitationProbability\|pageUrl" app/api/brands/**/entity-home*/route.ts lib/communication/narrative-generator.ts
```
- **entity-home/route.ts (~line 39-41):** replace the `pageUrl.includes("/about")` heuristic with the real
  `isEntityHomeCandidate` column + surface `entityHomeHasOrgSchema / entityHomeHasIdField (@id) / entityHomeSameAsCount`.
- **narrative-generator.ts entity_home_status case (~line 304-305):** replace the `includes("/about") || endsWith("/")`
  heuristic + `avgCitationProbability` with the real cols — per §6U.6 the section shows **@id present / sameAs count
  (target ≥3) / org-schema present / gaps**, NOT citation probability.

### B3 — Verify B on real data
```bash
# After running audit-entity-home for a brand, the cols are POPULATED (not NULL):
psql "$PROD_URL" -c "SELECT page_url, is_entity_home_candidate, entity_home_has_org_schema, entity_home_has_id_field, entity_home_same_as_count FROM content_structure_audits WHERE brand_id='418f321f-2489-4560-aaa9-895728580465' AND is_entity_home_candidate IS NOT NULL;"
```
- Trigger audit-entity-home for Metropolitan (emit technical-audit/complete or run the fn) → the confirmed row's 5 cols
  are populated (not NULL).
- Entity Home PAGE → shows real @id / sameAs / org-schema (per §6U.6), not the URL-heuristic guess.
Report: cols persisted (not NULL), page shows real entity-home data.

## FIX A (do AFTER B) — flip the 2 report slots include:false → true (Bug-A, same as S5)
Canon (S6 prompt 47, 655, 660): "all 12 S4 sections wired / this sprint LIGHTS THEM UP." S5 flipped its 5 sections
false→true; S6 left its 2 at false → dormant on the default path (narrative-generator.ts:75 filters s.include). Flip them.
```bash
grep -n "agent_readiness\|entity_home_status\|include" db/seed/default-report-template.ts
```
- In `db/seed/default-report-template.ts` (lines 13, 17): `agent_readiness` and `entity_home_status` → `include: true`.
- Re-seed existing orgs (the seed's UPDATE path, lines 53-56) so existing orgs' default templates get the 2 sections.

### A-verify (on the DEFAULT path, after B is fixed so entity_home has real data)
Seed agent_readiness_scores + (now-persisted) content_structure_audits entity-home cols for Metropolitan → generate a
report on the DEFAULT template (no hand-inserted template):
- **agent_readiness** section renders (reads agent_readiness_scores — already populated). ✓
- **entity_home_status** section renders with REAL @id/sameAs/org-schema data (because B now persists the cols) — NOT a
  heuristic guess.
Report: both sections render on the default path; entity_home_status shows real audited data (proving B+A together).

## STEP — Report
- FIX B: auditEntityHomeFn now UPSERTs the 5 cols on the confirmed row; both read-sites (entity-home route +
  narrative-generator) use the real cols not the heuristic; cols populated (not NULL) on real data; page shows real data.
- FIX A: the 2 slots flipped to include:true; existing orgs re-seeded; both render on the default path.
- Confirm entity_home_status renders REAL entity-home data (B+A linked) — not the URL heuristic.
- Add/adjust tests: extend s4-wiring.integration to assert BOTH sections render on the default path (include:true) AND
  that entity_home_status reads the persisted cols (seed the cols, assert the section surfaces @id/sameAs — re-break:
  revert B's persistence → section shows heuristic/empty → fail). Full suite green.

## Constraints
- B BEFORE A — entity_home_status reads the entity-home cols; flipping include:true before B persists them renders a
  heuristic guess. Fix B, then A.
- B: UPSERT on (brand_id, page_url) — update the confirmed entity-home row's cols, no duplicate. Match schema col names.
- B read-sites: entity_home_status surfaces @id/sameAs/org-schema per §6U.6, not avgCitationProbability.
- A: subscriptions.tier unaffected; re-seed existing orgs (the S5 Bug-A fix pattern).
- Migrations already on both DBs. Verify on the DEFAULT path, real data. LLD v8.70 / §5.2 / §6U.6 / §8.5 win.

## NOTE
Two confirmed bugs the audit missed by assuming intent. B [HIGH]: auditEntityHomeFn computes the entity-home data then
DISCARDS it (zero persistence) — canon (263/448-449, LLD 5837) says it must UPSERT the 5 cols on the confirmed row; the
NULL cols force the page + report section onto a URL heuristic showing citation-probability instead of @id/sameAs/
org-schema. A [Bug-A]: the 2 report slots are include:false (dormant on the default path) — S5 flipped its 5 false→true,
S6 forgot its 2; the prompt says 4× they should be "lit up." B GATES A: fix B first (persist the cols) so that when A
flips include:true, entity_home_status renders REAL audited data, not a heuristic guess. Verify both on the default path.
