/**
 * Vunnara Build 1, Part C.4/C.5 -- real-DB proof that classifyAndStoreBrand:
 * (a) persists the real error and re-throws on failure (so Inngest's
 *     retries: 3 can actually fire -- the old version swallowed it);
 * (b) routes a low-confidence or "general" classification to
 *     needs_confirmation instead of a silent "complete".
 *
 * ⚠️ DEV/TEST DB ONLY -- never run against visibleau_prod.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const classifyBrandMock = vi.fn();
vi.mock("@/lib/brands/classify-brand", () => ({ classifyBrand: classifyBrandMock }));

const ORG_ID = randomUUID();
const BRAND_FAIL_ID = randomUUID();
const BRAND_RETRY_ID = randomUUID();
const BRAND_LOWCONF_ID = randomUUID();
const BRAND_GENERAL_ID = randomUUID();
const BRAND_CONFIDENT_ID = randomUUID();

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`c-classify-${ORG_ID}`}, 'Classify And Store Test Org', ${`c-classify-org-${ORG_ID}`})
  `;

  for (const [id, suffix] of [
    [BRAND_FAIL_ID, "fail"],
    [BRAND_RETRY_ID, "retry"],
    [BRAND_LOWCONF_ID, "lowconf"],
    [BRAND_GENERAL_ID, "general"],
    [BRAND_CONFIDENT_ID, "confident"],
  ] as const) {
    await client`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
      VALUES (${id}, ${ORG_ID}, ${`Test Brand ${suffix}`}, ${`${suffix}.example.com.au`}, 'tradies', 'au', ARRAY[]::text[], ARRAY[]::text[])
    `;
  }
});

afterAll(async () => {
  const brandIds = [BRAND_FAIL_ID, BRAND_RETRY_ID, BRAND_LOWCONF_ID, BRAND_GENERAL_ID, BRAND_CONFIDENT_ID];
  await client`DELETE FROM brands WHERE id = ANY(${brandIds})`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

beforeEach(() => {
  classifyBrandMock.mockReset();
});

async function getBrandRow(id: string) {
  const [row] = await client`SELECT * FROM brands WHERE id = ${id}`;
  return row;
}

describe("classifyAndStoreBrand — reliability (Part C.5)", () => {
  it("persists the real error and re-throws on failure", async () => {
    const { classifyAndStoreBrand } = await import("@/lib/brands/classify-and-store");
    classifyBrandMock.mockRejectedValue(new Error("LLM timeout: upstream took too long"));

    await expect(classifyAndStoreBrand(BRAND_FAIL_ID)).rejects.toThrow("LLM timeout");

    const row = await getBrandRow(BRAND_FAIL_ID);
    expect(row.classification_status).toBe("failed");
    expect(row.classification_error).toBe("LLM timeout: upstream took too long");
  });

  it("clears a previous error on a subsequent successful classification", async () => {
    const { classifyAndStoreBrand } = await import("@/lib/brands/classify-and-store");
    classifyBrandMock.mockRejectedValueOnce(new Error("first attempt failed"));
    await expect(classifyAndStoreBrand(BRAND_RETRY_ID)).rejects.toThrow("first attempt failed");

    classifyBrandMock.mockResolvedValueOnce({
      category: "trades_plumbing",
      buyerType: "consumer",
      audience: "households",
      intentSignals: ["plumber Sydney"],
      competitors: [],
      auRelevance: "au_present",
      confidence: 0.9,
    });
    await classifyAndStoreBrand(BRAND_RETRY_ID);

    const row = await getBrandRow(BRAND_RETRY_ID);
    expect(row.classification_status).toBe("complete");
    expect(row.classification_error).toBeNull();
  });
});

describe("classifyAndStoreBrand — confirmation gating (Part C.4)", () => {
  it("routes a low-confidence classification to needs_confirmation, not complete", async () => {
    const { classifyAndStoreBrand } = await import("@/lib/brands/classify-and-store");
    classifyBrandMock.mockResolvedValue({
      category: "trades_general",
      buyerType: "smb",
      audience: "both",
      intentSignals: ["24 hour plumber Sydney"],
      competitors: [],
      auRelevance: "au_present",
      confidence: 0.62, // < 0.7
    });

    await classifyAndStoreBrand(BRAND_LOWCONF_ID);

    const row = await getBrandRow(BRAND_LOWCONF_ID);
    expect(row.classification_status).toBe("needs_confirmation");
  });

  it("routes a category='general' classification to needs_confirmation even at high confidence", async () => {
    const { classifyAndStoreBrand } = await import("@/lib/brands/classify-and-store");
    classifyBrandMock.mockResolvedValue({
      category: "general",
      buyerType: "smb",
      audience: "both",
      intentSignals: ["widget services"],
      competitors: [],
      auRelevance: "au_present",
      confidence: 0.95,
    });

    await classifyAndStoreBrand(BRAND_GENERAL_ID);

    const row = await getBrandRow(BRAND_GENERAL_ID);
    expect(row.classification_status).toBe("needs_confirmation");
  });

  it("a confident, specific classification completes without needing confirmation", async () => {
    const { classifyAndStoreBrand } = await import("@/lib/brands/classify-and-store");
    classifyBrandMock.mockResolvedValue({
      category: "trades_plumbing",
      buyerType: "consumer",
      audience: "households",
      intentSignals: ["plumber Sydney"],
      competitors: [],
      auRelevance: "au_present",
      confidence: 0.9,
    });

    await classifyAndStoreBrand(BRAND_CONFIDENT_ID);

    const row = await getBrandRow(BRAND_CONFIDENT_ID);
    expect(row.classification_status).toBe("complete");
  });
});
