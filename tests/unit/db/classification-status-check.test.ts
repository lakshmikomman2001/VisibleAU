/**
 * 14 Nov: a database built from the migrations rejected classification_status 'needs_confirmation'.
 * 0008_add_brand_classification.sql's CHECK allowed four values; 0047 added the fifth to the app's enum
 * (db/schema/brands.ts) and said no DDL was needed. Migration 0147 lists all five. This keeps them in step: the
 * last migration that sets brands.classification_status's CHECK allows exactly the schema's enum.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { brands } from "@/db/schema";

const DIR = join(__dirname, "../../../db/migrations");

/** The values of the last CHECK (classification_status IN (...)) in migration filename order. */
function lastCheckValues(): { file: string; values: string[] } | null {
  let found: { file: string; values: string[] } | null = null;
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const text = readFileSync(join(DIR, file), "utf8").replace(/--.*$/gm, "");
    for (const m of text.matchAll(/CHECK\s*\(\s*classification_status\s+IN\s*\(([^)]*)\)/gi)) {
      found = { file, values: [...m[1].matchAll(/'([^']+)'/g)].map((v) => v[1]) };
    }
  }
  return found;
}

describe("brands.classification_status's CHECK allows exactly what the app writes", () => {
  it("the last migration's CHECK lists the schema's enum", () => {
    const check = lastCheckValues();
    expect(check?.file).toBe("0147_brands_classification_status_values.sql");
    expect([...(check?.values ?? [])].sort()).toEqual([...brands.classificationStatus.enumValues].sort());
    expect(check?.values).toContain("needs_confirmation");
  });
});
