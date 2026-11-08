/**
 * 2 Nov, part 3 -- the data-residency page said PDF reports are kept for
 * "12 months", but nothing ever deletes them: audit-data-retention doesn't
 * touch storage, and the storage adapter can't delete. The claim now says
 * what's true today, and the page shows the current configuration -- so a
 * workspace whose stored row still says "12 months" (every production
 * workspace until the weekly refresh) doesn't show it either.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ResidencyTable } from "@/components/domain/governance/residency-table";
import { RESIDENCY_CONFIG } from "@/lib/governance/residency-config";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const USER_ID = randomUUID();
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: USER_ID, organizationId: ORG_ID }),
}));
// The route logs the page view without awaiting it; not what's tested here.
vi.mock("@/lib/governance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/governance")>()),
  recordAction: vi.fn(),
}));

const HONEST = "Kept until you ask us to delete them (not deleted automatically)";

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`ret-${ORG_ID}`}, 'Retention Claim Agency', ${`ret-${ORG_ID}`})
  `;
  const { recordDataResidency } = await import("@/lib/governance/record-data-residency");
  await recordDataResidency(ORG_ID);
  // What every production workspace's row says until it's refreshed.
  await client`
    UPDATE data_residency_log SET retention_period = '12 months'
    WHERE organization_id = ${ORG_ID} AND data_type = 'pdf_reports'
  `;
  // 9 Nov: the other stored claims nothing enforced -- what production's rows say until the weekly refresh.
  await client`
    UPDATE data_residency_log SET retention_period = CASE data_type
      WHEN 'evidence_snapshots' THEN '12 months'
      WHEN 'llm_cache' THEN '30 days'
      WHEN 'database' THEN 'duration of account'
      ELSE retention_period END
    WHERE organization_id = ${ORG_ID}
  `;
});

afterAll(async () => {
  await client`DELETE FROM data_residency_log WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function pageEntries() {
  const { GET } = await import("@/app/api/organizations/[orgId]/data-residency/route");
  const res = await GET(
    new Request(`http://localhost/api/organizations/${ORG_ID}/data-residency`),
    {
      params: Promise.resolve({ orgId: ORG_ID }),
    },
  );
  expect(res.status).toBe(200);
  return (await res.json()) as Array<{
    dataType: string;
    storageRegion: string;
    provider: string;
    retentionPeriod: string;
    encryptionStatus: string;
  }>;
}

describe("PDF reports' retention says what's true (2 Nov)", () => {
  it("the configuration names no retention period, because nothing deletes the PDFs", () => {
    const pdf = RESIDENCY_CONFIG.find((e) => e.dataType === "pdf_reports");
    expect(pdf?.retentionPeriod).toBe(HONEST);
    expect(pdf?.retentionPeriod).not.toMatch(/\d+\s*(day|month|year)/i);
  });

  it("the page's PDF Reports row shows it, even where the stored row still says 12 months", async () => {
    const html = renderToStaticMarkup(<ResidencyTable entries={await pageEntries()} />);
    const pdfRow = html.split("<tr").find((row) => row.includes(">PDF Reports<"));
    expect(pdfRow).toContain(HONEST);
    expect(pdfRow).not.toContain("12 months");
  });

  it("9 Nov: no row states a period nothing enforces -- 12 months only for audit data, which the weekly job deletes", async () => {
    const html = renderToStaticMarkup(<ResidencyTable entries={await pageEntries()} />);
    const rows = html.split("<tr").slice(1);
    const row = (label: string) => rows.find((r) => r.includes(`>${label}<`)) ?? "";
    expect(rows.filter((r) => r.includes("12 months"))).toEqual([row("Audit Data")]);
    expect(row("Audit Data")).toContain("Deleted 12 months after the audit");
    expect(row("Evidence Snapshots")).toContain(HONEST);
    expect(row("Primary Database")).toContain("Kept until you ask us to delete it");
    expect(row("LLM Cache")).toContain(
      "Reused for at most 48 hours, then deleted by the weekly clean-up",
    );
    expect(html).not.toContain("30 days");
    expect(html).not.toContain("duration of account");
  });

  it("every row the page shows matches the configuration", async () => {
    const entries = await pageEntries();
    expect(entries).toHaveLength(RESIDENCY_CONFIG.length);
    for (const e of entries) {
      expect(e.retentionPeriod, e.dataType).toBe(
        RESIDENCY_CONFIG.find((c) => c.dataType === e.dataType)?.retentionPeriod,
      );
    }
  });
});
