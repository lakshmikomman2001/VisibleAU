/**
 * Vunnara Build 1 addendum, item 1 -- real-DB proof that the audit
 * page's own "Recommended actions" block (a separate inline rendering
 * from components/domain/action-center/recommendation-card.tsx) also
 * applies the legacy "Check: " title and muted "<Impact> · unverified"
 * badge, matching Bondi Audit #8's live shape: a legacy row (no
 * confidence_basis) with expected_impact_score = 'high'.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const LEGACY_AUDIT_ID = randomUUID();
const EVIDENCE_AUDIT_ID = randomUUID();

const LEGACY_TITLE = "Your AU local directory listings are incomplete";
const EVIDENCE_TITLE = "You are not listed on Hipages";

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`legacyrec-${ORG_ID}`}, 'Legacy Rec Test Org', ${`legacyrec-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Bondi Plumbing', 'bondiplumbing2.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'])
  `;
  for (const [id, n] of [
    [LEGACY_AUDIT_ID, 8],
    [EVIDENCE_AUDIT_ID, 9],
  ] as const) {
    await client`
      INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at)
      VALUES (${id}, ${BRAND_ID}, ${ORG_ID}, ${n}, 'complete', ${["chatgpt"]}, 1, 1, now())
    `;
  }

  // Legacy row: no confidence_basis -- Bondi Audit #8's exact shape.
  await client`
    INSERT INTO action_items (organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, expected_impact_score, status)
    VALUES (${ORG_ID}, ${BRAND_ID}, ${LEGACY_AUDIT_ID}, 'au-local-citations', 'frequency', ${LEGACY_TITLE}, 'Submit your business to directories.', 'confirmed', 'high', 'open')
  `;

  // Evidence-backed row: a real confidence_basis -- must render unchanged.
  await client`
    INSERT INTO action_items (organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, confidence_basis, expected_impact_score, status)
    VALUES (${ORG_ID}, ${BRAND_ID}, ${EVIDENCE_AUDIT_ID}, 'au-local-citations', 'frequency', ${EVIDENCE_TITLE}, 'Add your listing.', 'confirmed', 'verified', 'high', 'open')
  `;
});

afterAll(async () => {
  await client`DELETE FROM action_items WHERE audit_id IN (${LEGACY_AUDIT_ID}, ${EVIDENCE_AUDIT_ID})`;
  await client`DELETE FROM audits WHERE id IN (${LEGACY_AUDIT_ID}, ${EVIDENCE_AUDIT_ID})`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function renderAnalysisTab(auditId: string): Promise<string> {
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  const element = await AuditPage({
    params: Promise.resolve({ auditId }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(element);
}

describe("Audit page -- Recommended actions block, legacy rows (Build 1 addendum, item 1)", () => {
  it("a legacy row (no confidence_basis) shows the Check: title and a muted 'High · unverified' badge, never the bare claim", async () => {
    const html = await renderAnalysisTab(LEGACY_AUDIT_ID);
    expect(html).toContain(`Check: ${LEGACY_TITLE}`);
    expect(html).not.toContain(`>${LEGACY_TITLE}<`);
    expect(html).toContain("High · unverified");
    // Muted token, not the real high-impact danger color.
    expect(html).toContain("color-mix(in srgb, var(--text-tertiary) 15%, transparent)");
    expect(html).not.toContain("color-mix(in srgb, var(--danger) 15%, transparent)");
  });

  it("an evidence-backed row shows its title unchanged, a plain 'High' badge, and the real high-impact color", async () => {
    const html = await renderAnalysisTab(EVIDENCE_AUDIT_ID);
    expect(html).toContain(`>${EVIDENCE_TITLE}<`);
    expect(html).not.toContain(`Check: ${EVIDENCE_TITLE}`);
    expect(html).not.toContain("· unverified");
    expect(html).toContain("color-mix(in srgb, var(--danger) 15%, transparent)");
  });
});
