/**
 * tests/e2e/backend/sprint4/07-get-audits-export-pdf.test.ts
 *
 * GET /api/audits/[auditId]/export?format=pdf — BB2 fix.
 *
 * Sprint 4 spec:
 *   - Content-Type: application/pdf
 *   - Content-Disposition: attachment; filename="visibleau-audit-{auditNumber}.pdf"
 *   - Body: binary PDF (not empty)
 *   - Server-side render via @react-pdf/renderer renderToBuffer
 *   - Cache-Control: no-store
 *
 * NOTE: This test verifies the HTTP contract (headers, status, non-empty body).
 * It does NOT parse the PDF content — that is Sprint 9 territory (white-label templates).
 *
 * TC-S4-56  format=pdf → 200
 * TC-S4-57  Content-Type: application/pdf
 * TC-S4-58  Content-Disposition: attachment; filename="visibleau-audit-{N}.pdf"
 * TC-S4-59  filename uses auditNumber not auditId UUID
 * TC-S4-60  Response body is non-empty (actual PDF bytes)
 * TC-S4-61  Response body begins with PDF magic bytes (%PDF)
 * TC-S4-62  Cross-org → 404
 * TC-S4-63  Unauthenticated → 401
 * TC-S4-64  Non-existent auditId → 404
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  seedOrganization,
  seedUser,
  seedBrand,
  seedAudit,
  seedCitationsForAudit,
  deleteAllTestDataForOrg,
} from './helpers/db';
import {
  TEST_USER_1,
  TEST_USER_2,
  getClerkToken,
  exportAudit,
  rawGet,
  BASE_URL,
} from './helpers/http';

let org1Id      = '';
let org2Id      = '';
let auditId     = '';
let auditNumber = 0;
let token1      = '';
let token2      = '';

beforeAll(async () => {
  const org1 = await seedOrganization({
    clerkOrgId: TEST_USER_1.clerkOrgId,
    name:       'S4 PDF Export Org 1 (agency)',
    tier:       'agency',
  });
  org1Id = org1.id;

  const org2 = await seedOrganization({
    clerkOrgId: TEST_USER_2.clerkOrgId,
    name:       'S4 PDF Export Org 2 (free)',
    tier:       'free',
  });
  org2Id = org2.id;

  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
  await seedUser({ clerkUserId: TEST_USER_2.clerkUserId, organizationId: org2Id, email: TEST_USER_2.email });

  await deleteAllTestDataForOrg(org1Id);
  await deleteAllTestDataForOrg(org2Id);

  const brand = await seedBrand({
    organizationId: org1Id,
    name:           'PDF Export Plumbing',
    domain:         'pdfexport.e2e-s4.test',
  });

  auditNumber = 12;
  const audit = await seedAudit({
    organizationId: org1Id,
    brandId:        brand.id,
    auditNumber,
    scoreComposite: 77.1,
    engines:        ['chatgpt', 'claude', 'gemini', 'perplexity'],
  });
  auditId = audit.id;
  await seedCitationsForAudit(audit, { mentionedCount: 4 });

  token1 = await getClerkToken(TEST_USER_1);
  token2 = await getClerkToken(TEST_USER_2);
});

afterAll(async () => {
  if (org1Id) await deleteAllTestDataForOrg(org1Id);
  if (org2Id) await deleteAllTestDataForOrg(org2Id);
});

describe('TC-S4-56 to TC-S4-64: GET /api/audits/[id]/export?format=pdf', () => {

  it('TC-S4-56: format=pdf → 200', async () => {
    const { status } = await exportAudit(token1, auditId, 'pdf');
    expect(status).toBe(200);
  });

  it('TC-S4-57: Content-Type: application/pdf', async () => {
    const { headers } = await exportAudit(token1, auditId, 'pdf');
    const ct = headers.get('content-type') ?? '';
    expect(ct).toContain('application/pdf');
  });

  it('TC-S4-58: Content-Disposition is attachment', async () => {
    const { headers } = await exportAudit(token1, auditId, 'pdf');
    const cd = headers.get('content-disposition') ?? '';
    expect(cd.toLowerCase()).toContain('attachment');
    expect(cd.toLowerCase()).toContain('.pdf');
  });

  it('TC-S4-59: filename uses auditNumber (not UUID)', async () => {
    const { headers } = await exportAudit(token1, auditId, 'pdf');
    const cd = headers.get('content-disposition') ?? '';
    // Expected: attachment; filename="visibleau-audit-12.pdf"
    expect(cd).toContain(`visibleau-audit-${auditNumber}`);
    expect(cd).not.toContain(auditId);  // UUID must not be in filename
  });

  it('TC-S4-60: response body is non-empty', async () => {
    const { text } = await exportAudit(token1, auditId, 'pdf');
    expect(text.length).toBeGreaterThan(100);
  });

  it('TC-S4-61: response body begins with PDF magic bytes (%PDF)', async () => {
    // rawGet returns text — for PDF we check the first chars
    const token = await getClerkToken(TEST_USER_1);
    const res = await fetch(`${BASE_URL}/api/audits/${auditId}/export?format=pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Read first 8 bytes as text
    const buf   = await res.arrayBuffer();
    const bytes = new Uint8Array(buf).slice(0, 8);
    const magic = String.fromCharCode(...bytes);
    expect(magic).toMatch(/^%PDF/);
  });

  it('TC-S4-62: User 2 exporting User 1 audit → 404 (cross-org)', async () => {
    const { status } = await exportAudit(token2, auditId, 'pdf');
    expect(status).toBe(404);
  });

  it('TC-S4-63: unauthenticated → 401', async () => {
    const { status } = await rawGet(`/api/audits/${auditId}/export?format=pdf`);
    expect(status).toBe(401);
  });

  it('TC-S4-64: non-existent auditId → 404', async () => {
    const { status } = await exportAudit(token1, '00000000-0000-0000-0000-000000000000', 'pdf');
    expect(status).toBe(404);
  });
});
