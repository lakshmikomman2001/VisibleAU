/**
 * ⚠️ VVV — the /methods page rendered a bare `{m.source}` string with no
 * link for every method, implying research precision for 43 of 47 entries
 * that are actually Vunnara's own estimates (task KKK). Now renders a
 * linked real source for "research" entries (via the shared VerifiedSource
 * component, task RRR) and a plain "Vunnara estimate" label for the rest.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("⚠️ VVV — /methods page: honest provenance rendering", () => {
  const src = readFileSync("app/(auth)/methods/page.tsx", "utf8");

  it("imports the shared VerifiedSource component", () => {
    expect(src).toMatch(
      /import\s*\{\s*VerifiedSource\s*\}\s*from\s*"@\/components\/domain\/brand-entity\/verified-source"/,
    );
  });

  it("renders a linked research source only when sourceType is 'research' AND a citationUrl exists", () => {
    expect(src).toMatch(/m\.sourceType === "research" && m\.citationUrl/);
    expect(src).toMatch(/<VerifiedSource source=\{m\.source\} url=\{m\.citationUrl\}/);
  });

  it("renders a plain 'Vunnara estimate' label for everything else -- no bare unlinked source string implying research", () => {
    expect(src).toMatch(/Vunnara estimate/);
    expect(src).not.toMatch(/\{m\.source\}\s*<\/div>/);
  });

  it("the honest framing line is present", () => {
    expect(src).toMatch(/Vunnara.{0,20}own estimates/);
  });

  it("the effectSizePct sort is unchanged", () => {
    expect(src).toMatch(/\.orderBy\(desc\(citabilityMethods\.effectSizePct\)\)/);
  });
});
