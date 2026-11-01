/**
 * DEMO-BLOCKER (1 Nov), part 4 -- the render check, from the database: a
 * report based on a #37-shaped audit (Claude failed, directories cited, no
 * competitors) and one on a #39-shaped audit (every engine answered),
 * gathered by buildReportData (the audit page's resolvers) and drawn by the
 * real renderer. Each PDF has seven A4 pages and embeds Fraunces, Inter and
 * JetBrains Mono. With REPORT_PDF_OUT_DIR set, the PDFs are written there
 * for `pdftoppm -r 70` and a side-by-side look against the prototype.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AUDIT_37,
  AUDIT_38,
  AUDIT_39,
  type ReportFixture,
  seedReportFixture,
} from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

let sql: ReturnType<typeof postgres>;
let fx: ReportFixture;

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  fx = await seedReportFixture(sql, {
    agencyName: "Splice Marketing",
    audits: [AUDIT_37, AUDIT_38, AUDIT_39],
  });
}, 180_000);

afterAll(async () => {
  await fx?.cleanup();
  await sql?.end();
});

describe("the report PDF, rendered from the database", () => {
  for (const n of [37, 39]) {
    it(`a report based on #${n}: seven A4 pages, the three typefaces embedded`, async () => {
      const { serviceDb } = await import("@/db/client");
      const { buildReportData } = await import("@/lib/reports/report-data");
      const { buildReportPdf } = await import("@/lib/communication/pdf-builder");
      const data = await buildReportData(serviceDb, {
        organizationId: fx.orgId,
        brandId: fx.brandId,
        periodType: "weekly",
        periodLabel: "2026-W44",
        auditId: fx.audits[n],
        now: new Date("2026-11-01T07:59:00Z"),
      });
      if (!data) throw new Error("no report data");
      const pdf = await buildReportPdf(data);
      const out = process.env.REPORT_PDF_OUT_DIR;
      if (out) {
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, `report-based-on-${n}.pdf`), pdf);
      }
      const raw = pdf.toString("latin1");
      expect(raw.match(/\/Type \/Page\b(?!s)/g)?.length).toBe(7);
      expect(raw.match(/\/MediaBox \[0 0 595\.28\d* 841\.89\d*\]/g)?.length).toBe(7);
      for (const font of ["Inter-Regular", "Fraunces-Bold", "JetBrainsMono-Regular"]) {
        expect(raw).toMatch(new RegExp(`/BaseFont /[A-Z]{6}\\+${font}\\b`));
      }
    }, 120_000);
  }
});
