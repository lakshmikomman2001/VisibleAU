/**
 * ⚠️ UUU — the same fabricated SE Ranking citation (dead seranking.com URL,
 * invented "4.9 vs 4.4" figure) was also live in this Playwright QA
 * fixture seeder (tests/qa/sprint6/shared/seed.ts), flagged separately
 * from the two production seed files. Stripped the same way.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("⚠️ UUU — sprint6 QA fixture: no fabricated SE Ranking citation remains", () => {
  const src = readFileSync("tests/qa/sprint6/shared/seed.ts", "utf8");

  it("no 'SE Ranking' source, dead seranking.com URL, or invented figure remain", () => {
    expect(src).not.toMatch(/SE Ranking/);
    expect(src).not.toMatch(/seranking\.com/);
    expect(src).not.toMatch(/4\.9.*4\.4/);
  });

  it("the faq-content evidenceRef still exists, honestly re-attributed", () => {
    expect(src).toMatch(/recommendationKey:\s*"faq-content"/);
    expect(src).toMatch(/source:\s*"VisibleAU Original"/);
    expect(src).toMatch(/Vunnara estimate/);
  });
});
