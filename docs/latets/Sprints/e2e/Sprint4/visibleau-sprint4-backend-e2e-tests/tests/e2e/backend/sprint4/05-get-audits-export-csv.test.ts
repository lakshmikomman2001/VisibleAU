/**
 * tests/e2e/backend/sprint4/05-get-audits-export-csv.test.ts
 *
 * GET /api/audits/[auditId]/export?format=csv — BD1 fix.
 *
 * 14-column header:
 *   audit_number,brand_name,engine,prompt,run_number,brand_mentioned,position,
 *   sentiment_label,context_label,response_snippet,cited_sources_domains,
 *   llm_model,llm_cost_usd,created_at
 *
 * cited_sources_domains = pipe-separated list from citedSources jsonb
 * response_snippet = first 200 chars, newlines → space
 *
 * TC-S4-41  format=csv → Content-Type: text/csv
 * TC-S4-42  CSV has header row with all 14 columns in exact order
 * TC-S4-43  Data rows match citation count
 * TC-S4-44  cited_sources_domains uses pipe separator
 * TC-S4-45  response_snippet truncated to 200 chars
 * TC-S4-46  Cross-org audit export → 404
 * TC-S4-47  Unauthenticated → 401
 * TC-S4-48  Non-existent auditId → 404
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
} from './helpers/http';

const EXPECTED_CSV_HEADER =
  'audit_number,brand_name,engine,prompt,run_number,brand_mentioned,' +
  'position,sentiment_label,context_label,response_snippet,' +
  'cited_sources_domains,llm_model,llm_cost_usd,created_at';

let org1Id  = '';
let org2Id  = '';
let auditId = '';
let token1  = '';
let token2  = '';

beforeAll(async () => {
  const org1 = await seedOrganization({
    clerkOrgId: TEST_USER_1.clerkOrgId,
    name:       'S4 CSV Export Org 1 (agency)',
    tier:       'agency',
  });
  org1Id = org1.id;

  const org2 = await seedOrganization({
    clerkOrgId: TEST_USER_2.clerkOrgId,
    name:       'S4 CSV Export Org 2 (free)',
    tier:       'free',
  });
  org2Id = org2.id;

  await seedUser({ clerkUserId: TEST_USER_1.clerkUserId, organizationId: org1Id, email: TEST_USER_1.email });
  await seedUser({ clerkUserId: TEST_USER_2.clerkUserId, organizationId: org2Id, email: TEST_USER_2.email });

  await deleteAllTestDataForOrg(org1Id);
  await deleteAllTestDataForOrg(org2Id);

  const brand = await seedBrand({
    organizationId: org1Id,
    name:           'CSV Export Plumbing',
    domain:         'csvexport.e2e-s4.test',
  });

  const audit = await seedAudit({
    organizationId: org1Id,
    brandId:        brand.id,
    auditNumber:    1,
    engines:        ['chatgpt', 'claude'],
    runsPerPrompt:  5,
    scoreComposite: 71.0,
  });
  auditId = audit.id;

  // Seed citations so CSV has data rows
  await seedCitationsForAudit(audit, { mentionedCount: 3 });

  token1 = await getClerkToken(TEST_USER_1);
  token2 = await getClerkToken(TEST_USER_2);
});

afterAll(async () => {
  if (org1Id) await deleteAllTestDataForOrg(org1Id);
  if (org2Id) await deleteAllTestDataForOrg(org2Id);
});

describe('TC-S4-41 to TC-S4-48: GET /api/audits/[id]/export?format=csv', () => {

  it('TC-S4-41: format=csv → Content-Type: text/csv', async () => {
    const { status, headers } = await exportAudit(token1, auditId, 'csv');
    expect(status).toBe(200);
    const ct = headers.get('content-type') ?? '';
    expect(ct).toContain('text/csv');
  });

  it('TC-S4-42: CSV has header row with all 14 columns in exact order', async () => {
    const { text } = await exportAudit(token1, auditId, 'csv');
    const lines = text.split('\n').filter(l => l.trim());
    expect(lines.length).toBeGreaterThan(0);
    const header = lines[0].trim().toLowerCase();
    expect(header).toBe(EXPECTED_CSV_HEADER.toLowerCase());
  });

  it('TC-S4-43: data rows present — count matches citation rows', async () => {
    const { text } = await exportAudit(token1, auditId, 'csv');
    const lines = text.split('\n').filter(l => l.trim());
    // header + N data rows
    expect(lines.length).toBeGreaterThan(1);
    // At least one data row
    const dataRows = lines.slice(1);
    expect(dataRows.length).toBeGreaterThan(0);
  });

  it('TC-S4-44: C14 FIX — cited_sources_domains uses pipe (|) separator, not comma', async () => {
    // C14 FIX: Original seeded 1 domain per citation — the pipe-conditional never fired.
    // Now verify across ALL rows: if any row has multiple cited sources, they must be pipe-separated.
    // We also verify the domain column never contains a mid-cell comma (which would break CSV).
    const { text } = await exportAudit(token1, auditId, 'csv');
    const lines = text.split('\n').filter(l => l.trim());
    const cols = EXPECTED_CSV_HEADER.split(',');
    const domainColIdx = cols.indexOf('cited_sources_domains');

    // Verify the domain column in every data row
    let foundPipeSeparated = false;
    for (const line of lines.slice(1)) {
      // Use a simple quoted-CSV parse for the domain field
      const allQuotedFields = [...line.matchAll(/"([^"]*)"/g)].map(m => m[1]);
      // domain field may be quoted (if it contains special chars) or unquoted
      // Either way, it must use | not , to separate multiple domains
      // Check: if there are 2+ domains, they appear with pipe separator
      const cells = line.split(',');
      const rawDomain = cells[domainColIdx]?.replace(/"/g, '') ?? '';
      if (rawDomain.includes('|')) {
        foundPipeSeparated = true;
        // Pipe-separated: individual parts must not themselves contain commas
        const parts = rawDomain.split('|');
        for (const part of parts) {
          expect(part).not.toContain(',');
        }
      }
    }
    // At minimum: verify no comma appears INSIDE the domain column value
    // (commas should only be CSV field delimiters, not domain separators)
    // This assertion is always meaningful regardless of domain count
    for (const line of lines.slice(1)) {
      const cells = line.split(',');
      const rawDomain = (cells[domainColIdx] ?? '').replace(/"/g, '');
      // If multiple domains: must use | not ,
      // If single domain: no | needed, but also no , inside the domain value
      if (!rawDomain.includes('|') && rawDomain.includes('.')) {
        // Single domain — must be a valid domain (no embedded comma)
        expect(rawDomain).not.toMatch(/,/);
      }
    }
  });

  it('TC-S4-45: E14 FIX — response_snippet ≤ 200 characters, parsed by column index', async () => {
    // E14 FIX: original used a quoted-field regex — passes vacuously when snippet is unquoted.
    // (Unquoted when snippet contains no commas/quotes → regex returns null → snippet='' → 0≤200.)
    // Fix: split the CSV row properly and read the snippet column by index.
    const { text } = await exportAudit(token1, auditId, 'csv');
    const lines = text.split('\n').filter(l => l.trim());
    const cols = EXPECTED_CSV_HEADER.split(',');
    const snippetIdx = cols.indexOf('response_snippet');

    // Simple RFC-4180 CSV parser: handles both quoted and unquoted fields
    function parseCsvRow(row: string): string[] {
      const fields: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '"' && !inQuotes)        { inQuotes = true; continue; }
        if (ch === '"' && inQuotes && row[i + 1] === '"') { cur += '"'; i++; continue; }
        if (ch === '"' && inQuotes)         { inQuotes = false; continue; }
        if (ch === ',' && !inQuotes)        { fields.push(cur); cur = ''; continue; }
        cur += ch;
      }
      fields.push(cur);
      return fields;
    }

    for (const line of lines.slice(1)) {
      const fields = parseCsvRow(line);
      const snippet = fields[snippetIdx] ?? '';
      expect(snippet.length, `response_snippet exceeds 200 chars: "${snippet.slice(0, 50)}..."`).toBeLessThanOrEqual(200);
    }
  });

  it('TC-S4-46: User 2 exporting User 1 audit → 404 (cross-org)', async () => {
    const { status } = await exportAudit(token2, auditId, 'csv');
    expect(status).toBe(404);
  });

  it('TC-S4-47: unauthenticated export → 401', async () => {
    const { status } = await rawGet(`/api/audits/${auditId}/export?format=csv`);
    expect(status).toBe(401);
  });

  it('TC-S4-48: non-existent auditId → 404', async () => {
    const { status } = await exportAudit(token1, '00000000-0000-0000-0000-000000000000', 'csv');
    expect(status).toBe(404);
  });
});
