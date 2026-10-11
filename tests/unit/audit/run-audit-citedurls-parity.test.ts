/**
 * Task #43: "thread it through BOTH audit runners" -- lib/audit/run-audit-inline.ts
 * and inngest/functions/run-audit.ts have drifted from each other before
 * (ORGANIC_ONLY, task SS). Both must merge a response's structured
 * citedUrls with its text-extracted sources the same way, via the one
 * shared mergeCitedSources() helper -- not two separate reimplementations.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("both audit runners merge citedUrls via the shared mergeCitedSources()", () => {
  for (const file of ["lib/audit/run-audit-inline.ts", "inngest/functions/run-audit.ts"]) {
    it(`${file} imports mergeCitedSources and passes result.citedUrls into it`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/import\s*\{[^}]*\bmergeCitedSources\b[^}]*\}\s*from\s*"@\/lib\/audit\/extract-citations"/);
      expect(src).toMatch(/mergeCitedSources\(\s*extractCitations\(result\.response\),\s*result\.citedUrls\s*\)/);
    });

    it(`${file} stores the merged result in citedSources (not raw extractCitations output alone)`, () => {
      const src = readFileSync(file, "utf8");
      const sourcesIdx = src.indexOf("const sources = mergeCitedSources(");
      const citedSourcesIdx = src.indexOf("citedSources: sources");
      expect(sourcesIdx).toBeGreaterThan(-1);
      expect(citedSourcesIdx).toBeGreaterThan(sourcesIdx);
    });
  }
});
