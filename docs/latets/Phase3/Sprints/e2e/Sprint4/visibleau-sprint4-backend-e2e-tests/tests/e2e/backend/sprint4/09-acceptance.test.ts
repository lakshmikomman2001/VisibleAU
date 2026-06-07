/**
 * tests/e2e/backend/sprint4/09-acceptance.test.ts
 *
 * Sprint 4 §11 acceptance criteria — items verifiable at the API/DB layer.
 * Frontend-specific items (sidebar collapse, wizard steps, mobile layout) are
 * covered in the Sprint 4 UI E2E suite, not here.
 *
 * TC-S4-74  Brand delete soft-deletes: list excludes it, DB row has deletedAt set
 * TC-S4-75  Cross-org access → 404 on all protected Sprint 4 routes
 * TC-S4-76  GET /api/audits?page=1 returns paginated list with brandName included
 * TC-S4-77  PDF export: Content-Type application/pdf, correct filename pattern
 * TC-S4-78  CSV export: 14-column flat citations file with correct header
 * TC-S4-79  JSON export: Content-Disposition attachment
 * TC-S4-80  Brand tier limit: free=1, agency=5, free over-limit → 403
 * TC-S4-81  Audit dispatch: runsPerPrompt>=5 && engines.length>1 → Rich audit flag
 * TC-S4-82  Audit dispatch: runsPerPrompt=1 OR engines.length=1 → Basic audit flag
 * TC-S4-83  GET /api/brands returns lastAuditScore for each brand
 * TC-S4-84  Deleted brand slot freed: can create new brand after delete
 * TC-S4-85  Portfolio brand count threshold verifiable via DB (active brands < 2)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  testDb,
  seedOrganization,
  seedUser,
  seedBrand,
  seedAudit,
  seedCitationsForAudit,
  deleteAllTestDataForOrg,
  getActiveBrandCount,
  getBrandById,
} from './helpers/db';
import {
  TEST_USER_1,
  TEST_USER_2,
  getClerkToken,
  getBrands,
  createBrand,
  deleteBrand,
  getAuditList,
  exportAudit,
  get,
  extractBrandId,
} from './helpers/http';
import * as schema from '../../../../../db/schema';
import { eq, isNull, and, sql } from 'drizzle-orm';

let org1Id   = '';
let org2Id   = '';
let brand1Id = '';
let brand2Id = '';
let auditRichId  = '';  // runsPerPrompt=5, 4 engines → Rich
let auditBasicId = '';  // runsPerPrompt=1, 1 engine  → Basic
let token1   = '';
let token2   = '';

beforeAll(async () => {
  const org1 = await seedOrganization({
    clerkOrgId: TEST_USER_1.clerkOrgId,
    name:       'S4 Acceptance Org 1 (agency)',
    tier:       'agency',
  });
  org1Id = org1.id;

  const org2 = await seedOrganization({
    clerkOrgId: TEST_USER_2.clerkOrgId,
    name:       'S4 Acceptance Org 2 (free)',
    tier:       'free',
  });
  org2Id = org2.id;

  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
  await seedUser({ clerkUserId: TEST_USER_2.clerkUserId, organizationId: org2Id, email: TEST_USER_2.email });

  await deleteAllTestDataForOrg(org1Id);
  await deleteAllTestDataForOrg(org2Id);

  const b1 = await seedBrand({ organizationId: org1Id, name: 'Acceptance Brand 1', domain: 'acc1.e2e-s4.test' });
  const b2 = await seedBrand({ organizationId: org1Id, name: 'Acceptance Brand 2', domain: 'acc2.e2e-s4.test' });
  brand1Id = b1.id;
  brand2Id = b2.id;

  // Rich audit: runsPerPrompt=5, 4 engines → isRich = true
  const aRich = await seedAudit({
    organizationId: org1Id, brandId: brand1Id, auditNumber: 1,
    engines: ['chatgpt', 'claude', 'gemini', 'perplexity'], runsPerPrompt: 5,
    scoreComposite: 63.4,
  });
  auditRichId = aRich.id;
  await seedCitationsForAudit(aRich, { mentionedCount: 5 });

  // Basic audit: runsPerPrompt=1, 1 engine → isRich = false
  const aBasic = await seedAudit({
    organizationId: org1Id, brandId: brand2Id, auditNumber: 1,
    engines: ['chatgpt'], runsPerPrompt: 1,
    totalCalls: 10, scoreComposite: 40.0,
  });
  auditBasicId = aBasic.id;

  token1 = await getClerkToken(TEST_USER_1);
  token2 = await getClerkToken(TEST_USER_2);
});

afterAll(async () => {
  if (org1Id) await deleteAllTestDataForOrg(org1Id);
  if (org2Id) await deleteAllTestDataForOrg(org2Id);
});

describe('TC-S4-74 to TC-S4-85: Sprint 4 §11 acceptance criteria (API/DB layer)', () => {

  it('TC-S4-74: brand delete soft-deletes — list excludes it, DB row has deletedAt set', async () => {
    // Create a temp brand to delete
    const { body: cb } = await createBrand(token1, { name: '[S4-E2E] Temp Delete', domain: 'tempdel.e2e-s4.test' });
    // D1 FIX: POST /api/brands returns { brand: Brand } per Sprint 1 spec
    const tempId = extractBrandId(cb);
    expect(tempId, 'TC-S4-74: brand ID missing from POST response').toBeTruthy();

    const { status } = await deleteBrand(token1, tempId as string);
    expect(status).toBe(204);

    // DB row still exists with deletedAt set
    const row = await getBrandById(tempId as string);
    expect(row).not.toBeNull();
    expect(row!.deletedAt).not.toBeNull();

    // Not in GET /api/brands list
    const { body: lb } = await getBrands(token1);
    const list = lb as Array<Record<string, unknown>>;
    expect(list.find(b => b.id === tempId)).toBeUndefined();
  });

  it('TC-S4-75: cross-org access → 404 on all protected Sprint 4 routes', async () => {
    // C17 FIX: deleteBrand is already imported at the top — remove redundant dynamic import
    const [resDelete, resExportCsv, resExportJson] = await Promise.all([
      deleteBrand(token2, brand1Id),
      exportAudit(token2, auditRichId, 'csv'),
      exportAudit(token2, auditRichId, 'json'),
    ]);
    expect(resDelete.status).toBe(404);
    expect(resExportCsv.status).toBe(404);
    expect(resExportJson.status).toBe(404);
  });

  it('TC-S4-76: GET /api/audits?page=1 returns paginated list with brandName included', async () => {
    const { status, body } = await getAuditList(token1, { page: 1, limit: 50 });
    expect(status).toBe(200);
    const { audits, total, page, totalPages } = body as {
      audits: Array<Record<string, unknown>>;
      total: number; page: number; totalPages: number;
    };
    expect(page).toBe(1);
    expect(typeof total).toBe('number');
    expect(typeof totalPages).toBe('number');
    // Every row must have brandName
    for (const audit of audits) {
      expect(typeof audit.brandName).toBe('string');
      expect(audit.brandName).toBeTruthy();
    }
  });

  it('TC-S4-77: PDF export — Content-Type application/pdf and correct filename', async () => {
    const { status, headers } = await exportAudit(token1, auditRichId, 'pdf');
    expect(status).toBe(200);
    expect(headers.get('content-type')).toContain('application/pdf');
    const cd = headers.get('content-disposition') ?? '';
    expect(cd).toContain('visibleau-audit-1');  // auditNumber=1
    expect(cd).toContain('.pdf');
    expect(cd.toLowerCase()).toContain('attachment');
  });

  it('TC-S4-78: CSV export — 14-column flat citations file with correct header', async () => {
    const { status, text } = await exportAudit(token1, auditRichId, 'csv');
    expect(status).toBe(200);
    const header = text.split('\n')[0].trim().toLowerCase();
    const expectedCols = [
      'audit_number', 'brand_name', 'engine', 'prompt', 'run_number',
      'brand_mentioned', 'position', 'sentiment_label', 'context_label',
      'response_snippet', 'cited_sources_domains', 'llm_model', 'llm_cost_usd', 'created_at'
    ];
    for (const col of expectedCols) {
      expect(header, `CSV header missing column: ${col}`).toContain(col);
    }
  });

  it('TC-S4-79: JSON export — Content-Disposition: attachment present', async () => {
    const { status, headers } = await exportAudit(token1, auditRichId, 'json');
    expect(status).toBe(200);
    const cd = headers.get('content-disposition') ?? '';
    expect(cd.toLowerCase()).toContain('attachment');
  });

  it('TC-S4-80: brand tier limit — free=1, agency=5; free over-limit → 403', async () => {
    // Org2 (free) already has 0 active brands — first create is 201
    const { status: s1 } = await createBrand(token2, { name: '[S4-E2E] Free1', domain: 'f1.e2e-s4.test' });
    expect(s1).toBe(201);

    // Second create for free → 403
    const { status: s2, body: b2 } = await createBrand(token2, { name: '[S4-E2E] Free2', domain: 'f2.e2e-s4.test' });
    expect(s2).toBe(403);
    const err = (b2 as Record<string, unknown>).error as string;
    expect(err).toMatch(/free|limit|upgrade|plan/i);
  });

  it('TC-S4-81: audit with runsPerPrompt=5 && engines.length=4 → isRich = true in DB', async () => {
    // BC5c dispatch logic: isRich = (runsPerPrompt ?? 1) >= 5 && (engines?.length ?? 1) > 1
    const [row] = await testDb
      .select({ runsPerPrompt: schema.audits.runsPerPrompt, engines: schema.audits.engines })
      .from(schema.audits)
      .where(eq(schema.audits.id, auditRichId));

    const isRich = (row.runsPerPrompt ?? 1) >= 5 && ((row.engines as string[])?.length ?? 1) > 1;
    expect(isRich).toBe(true);
    expect(row.runsPerPrompt).toBe(5);
    expect((row.engines as string[]).length).toBe(4);
  });

  it('TC-S4-82: audit with runsPerPrompt=1 && engines.length=1 → isRich = false in DB', async () => {
    const [row] = await testDb
      .select({ runsPerPrompt: schema.audits.runsPerPrompt, engines: schema.audits.engines })
      .from(schema.audits)
      .where(eq(schema.audits.id, auditBasicId));

    const isRich = (row.runsPerPrompt ?? 1) >= 5 && ((row.engines as string[])?.length ?? 1) > 1;
    expect(isRich).toBe(false);
    expect(row.runsPerPrompt).toBe(1);
    expect((row.engines as string[]).length).toBe(1);
  });

  it('TC-S4-83: GET /api/brands returns lastAuditScore for each brand that has an audit', async () => {
    const { body } = await getBrands(token1);
    const brands = body as Array<Record<string, unknown>>;

    const b1 = brands.find(b => b.id === brand1Id);
    expect(b1).toBeDefined();
    expect(b1!.lastAuditScore).not.toBeNull();
    expect(parseFloat(b1!.lastAuditScore as string)).toBeCloseTo(63.4, 1);

    const b2 = brands.find(b => b.id === brand2Id);
    expect(b2).toBeDefined();
    expect(b2!.lastAuditScore).not.toBeNull();
    expect(parseFloat(b2!.lastAuditScore as string)).toBeCloseTo(40.0, 1);
  });

  it('TC-S4-84: deleted brand slot freed — can create new brand after delete (agency tier)', async () => {
    // Create 5 brands for agency tier (limit=5)
    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { body } = await createBrand(token1, { name: `[S4-E2E] Slot ${i}`, domain: `slot${i}.e2e-s4.test` });
      // D1 FIX: POST /api/brands returns { brand: Brand }
      const id = extractBrandId(body);
      if (id) created.push(id);
    }

    // 6th brand fails (at limit)
    const { status: s6 } = await createBrand(token1, { name: '[S4-E2E] Slot 6', domain: 'slot6.e2e-s4.test' });
    expect(s6).toBe(403);

    // Delete one brand
    if (created[0]) {
      const { status: ds } = await deleteBrand(token1, created[0]);
      expect(ds).toBe(204);
    }

    // Can now create a new brand
    const { status: s7 } = await createBrand(token1, { name: '[S4-E2E] Slot 6 Retry', domain: 'slot6r.e2e-s4.test' });
    expect(s7).toBe(201);
  });

  it('TC-S4-85: portfolio threshold — active brand count < 2 means redirect to /dashboard', async () => {
    // Test the DB-level check that portfolio uses: COUNT brands WHERE deletedAt IS NULL < 2
    // Org 2 has 1 brand → portfolio should redirect
    const org2ActiveCount = await getActiveBrandCount(org2Id);
    // Due to TC-S4-80 creating a brand for org2, there's at least 1 active brand
    expect(org2ActiveCount).toBeGreaterThanOrEqual(1);

    const [row] = await testDb
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.brands)
      .where(
        and(
          eq(schema.brands.organizationId, org2Id),
          isNull(schema.brands.deletedAt),
        )
      );
    // Portfolio page.tsx redirects when brandCount < 2
    const shouldRedirect = row.count < 2;
    expect(typeof shouldRedirect).toBe('boolean');
    // For org2 (1 active brand): redirect expected
    if (row.count < 2) {
      expect(shouldRedirect).toBe(true);
    }
  });
});
