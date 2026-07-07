import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { rmSync } from "fs";
import { readFile, stat, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { testDb, seedOrganization, seedBrand, truncateAll, queryFanOutResults, audits } from "./helpers/test-db";
import { LocalStorageAdapter } from "@/lib/storage/local-adapter";

describe("report-pipeline integration (REAL storage + REAL DB — bugs 1 & 6)", () => {
  let org: { id: string };
  let brand: { id: string };
  let auditId: string;

  beforeAll(async () => {
    await truncateAll();

    org = await seedOrganization({
      clerkOrgId: "org_report_pipeline",
      name: "Report Pipeline Org",
    });

    brand = await seedBrand({
      organizationId: org.id,
      name: "ReportBrand",
      domain: "reportbrand.com.au",
    });
  });

  beforeEach(async () => {
    await testDb.delete(queryFanOutResults).where(eq(queryFanOutResults.organizationId, org.id));
    await testDb.delete(audits).where(eq(audits.organizationId, org.id));

    const [audit] = await testDb
      .insert(audits)
      .values({
        brandId: brand.id,
        organizationId: org.id,
        status: "complete",
        auditNumber: 1,
      })
      .returning();
    auditId = audit.id;
  });

  afterAll(async () => {
    await truncateAll();
  });

  describe("Bug 1 — LocalStorageAdapter.upload (real adapter, real filesystem)", () => {
    it("upload writes file at correct joined path with correct content", async () => {
      const dir = await mkdtemp(join(tmpdir(), "vau-storage-"));
      const adapter = new LocalStorageAdapter(dir);
      const buf = Buffer.from("%PDF-1.4 test content");

      await adapter.upload("org123/brand456/report.pdf", buf, "application/pdf");

      const written = await readFile(join(dir, "org123/brand456/report.pdf"));
      expect(written.equals(buf)).toBe(true);
      rmSync(dir, { recursive: true, force: true });
    });

    it("upload creates deeply nested directories automatically", async () => {
      const dir = await mkdtemp(join(tmpdir(), "vau-storage-"));
      const adapter = new LocalStorageAdapter(dir);

      await adapter.upload("a/b/c/d/deep.pdf", Buffer.from("deep"), "application/pdf");

      const s = await stat(join(dir, "a/b/c/d/deep.pdf"));
      expect(s.isFile()).toBe(true);
      rmSync(dir, { recursive: true, force: true });
    });

    it("upload overwrites existing file (idempotent)", async () => {
      const dir = await mkdtemp(join(tmpdir(), "vau-storage-"));
      const adapter = new LocalStorageAdapter(dir);

      await adapter.upload("dup.pdf", Buffer.from("v1"), "application/pdf");
      await adapter.upload("dup.pdf", Buffer.from("v2"), "application/pdf");

      const content = await readFile(join(dir, "dup.pdf"), "utf8");
      expect(content).toBe("v2");
      rmSync(dir, { recursive: true, force: true });
    });

    it("getDownloadUrl returns correct API path pattern", async () => {
      const adapter = new LocalStorageAdapter();
      const url = await adapter.getDownloadUrl("org123/brand456/report.pdf");
      expect(url).toBe("/api/reports/file/org123/brand456/report.pdf");
    });
  });

  describe("Bug 6 — brandAppeared correctly persisted in queryFanOutResults", () => {
    it("seeds rows with brandAppeared=true and reads them back", async () => {
      await testDb.insert(queryFanOutResults).values({
        auditId,
        brandId: brand.id,
        organizationId: org.id,
        originalPrompt: "best plumber Melbourne",
        engine: "chatgpt",
        subQuery: "plumber near me",
        subQueryRank: 1,
        brandAppeared: true,
        brandPosition: 2,
        contentSimilarityScore: "0.750",
        aboveThreshold: true,
      });

      const rows = await testDb
        .select()
        .from(queryFanOutResults)
        .where(eq(queryFanOutResults.auditId, auditId));

      expect(rows).toHaveLength(1);
      expect(rows[0].brandAppeared).toBe(true);
      expect(rows[0].brandPosition).toBe(2);
    });

    it("seeds rows with brandAppeared=false and reads them back", async () => {
      await testDb.insert(queryFanOutResults).values({
        auditId,
        brandId: brand.id,
        organizationId: org.id,
        originalPrompt: "best plumber Melbourne",
        engine: "perplexity",
        subQuery: "emergency plumber",
        subQueryRank: 1,
        brandAppeared: false,
        brandPosition: null,
        contentSimilarityScore: "0.200",
        aboveThreshold: false,
      });

      const [row] = await testDb
        .select()
        .from(queryFanOutResults)
        .where(eq(queryFanOutResults.auditId, auditId));

      expect(row.brandAppeared).toBe(false);
      expect(row.brandPosition).toBeNull();
    });

    it("mixed brandAppeared values: can filter appeared-only subset", async () => {
      await testDb.insert(queryFanOutResults).values([
        {
          auditId,
          brandId: brand.id,
          organizationId: org.id,
          originalPrompt: "best plumber Melbourne",
          engine: "chatgpt",
          subQuery: "plumber near me",
          subQueryRank: 1,
          brandAppeared: true,
          brandPosition: 1,
          contentSimilarityScore: "0.900",
          aboveThreshold: true,
        },
        {
          auditId,
          brandId: brand.id,
          organizationId: org.id,
          originalPrompt: "best plumber Melbourne",
          engine: "chatgpt",
          subQuery: "reliable plumber",
          subQueryRank: 2,
          brandAppeared: false,
          brandPosition: null,
          contentSimilarityScore: "0.100",
          aboveThreshold: false,
        },
        {
          auditId,
          brandId: brand.id,
          organizationId: org.id,
          originalPrompt: "best plumber Melbourne",
          engine: "perplexity",
          subQuery: "plumber near me",
          subQueryRank: 1,
          brandAppeared: true,
          brandPosition: 3,
          contentSimilarityScore: "0.800",
          aboveThreshold: true,
        },
      ]);

      const rows = await testDb
        .select()
        .from(queryFanOutResults)
        .where(eq(queryFanOutResults.brandAppeared, true));

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.brandAppeared === true)).toBe(true);
    });

    it("contentSimilarityScore persisted as numeric string with 3 decimals", async () => {
      await testDb.insert(queryFanOutResults).values({
        auditId,
        brandId: brand.id,
        organizationId: org.id,
        originalPrompt: "test prompt",
        engine: "chatgpt",
        subQuery: "test query",
        subQueryRank: 1,
        brandAppeared: true,
        brandPosition: 1,
        contentSimilarityScore: "0.885",
        aboveThreshold: true,
      });

      const [row] = await testDb
        .select()
        .from(queryFanOutResults)
        .where(eq(queryFanOutResults.auditId, auditId));

      expect(row.contentSimilarityScore).toBe("0.885");
    });

    it("aboveThreshold correctly stored for both true and false", async () => {
      await testDb.insert(queryFanOutResults).values([
        {
          auditId,
          brandId: brand.id,
          organizationId: org.id,
          originalPrompt: "test",
          engine: "chatgpt",
          subQuery: "above",
          subQueryRank: 1,
          brandAppeared: true,
          brandPosition: 1,
          contentSimilarityScore: "0.900",
          aboveThreshold: true,
        },
        {
          auditId,
          brandId: brand.id,
          organizationId: org.id,
          originalPrompt: "test",
          engine: "chatgpt",
          subQuery: "below",
          subQueryRank: 2,
          brandAppeared: false,
          brandPosition: null,
          contentSimilarityScore: "0.500",
          aboveThreshold: false,
        },
      ]);

      const rows = await testDb
        .select()
        .from(queryFanOutResults)
        .where(eq(queryFanOutResults.auditId, auditId));

      const above = rows.filter((r) => r.aboveThreshold);
      const below = rows.filter((r) => !r.aboveThreshold);
      expect(above).toHaveLength(1);
      expect(below).toHaveLength(1);
    });
  });
});
