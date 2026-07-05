import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { generatedReports } from "@/db/schema/generated-reports";

describe("generated_reports schema (U-13: append-only)", () => {
  const config = getTableConfig(generatedReports);

  it("has no unique constraints", () => {
    expect(config.uniqueConstraints.length).toBe(0);
  });

  it("has no status column (CM-01)", () => {
    const columnNames = Object.keys(generatedReports);
    // Filter to actual column field names (exclude symbols/internals)
    const cols = columnNames.filter((k) => !k.startsWith("_") && !k.startsWith("$"));
    expect(cols).not.toContain("status");
  });

  it("has pdfUrl column for status derivation", () => {
    expect(config.columns.find((c) => c.name === "pdf_url")).toBeDefined();
  });

  it("has emailSentAt column for status derivation", () => {
    expect(config.columns.find((c) => c.name === "email_sent_at")).toBeDefined();
  });

  it("has an index on (brand_id, report_type, created_at)", () => {
    const idx = config.indexes.find((i) => i.config.name === "reports_brand_type_idx");
    expect(idx).toBeDefined();
  });

  it("auditId has ON DELETE SET NULL", () => {
    const fk = config.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "audit_id"),
    );
    expect(fk).toBeDefined();
    expect(fk!.onDelete).toBe("set null");
  });

  it("templateId has ON DELETE SET NULL", () => {
    const fk = config.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "template_id"),
    );
    expect(fk).toBeDefined();
    expect(fk!.onDelete).toBe("set null");
  });
});
