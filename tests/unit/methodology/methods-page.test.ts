/**
 * ⚠️ VVV — the /methods page rendered a bare `{m.source}` string with no
 * link for every method, implying research precision for 43 of 47 entries
 * that are actually Vunnara's own estimates (task KKK). Now renders a
 * linked real source for "research" entries (via the shared VerifiedSource
 * component, task RRR) and a plain "Vunnara estimate" label for the rest.
 *
 * Post-ZZZ: effectSizePct (e.g. "+48%") was invented precision inherited
 * from the fabricated SE Ranking / AutoGEO data (Sri's decision). Replaced
 * with a qualitative impactTier badge (High/Medium/Low) and tier-based
 * sort, sorted secondarily by title.
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

  it("the honest framing line is present (qualitative assessment, not a measured estimate)", () => {
    expect(src).toMatch(/Vunnara.{0,20}qualitative assessment/);
  });

  it("sorts by impactTier (high -> medium -> low), then by title -- not by effectSizePct", () => {
    expect(src).toMatch(/CASE impact_tier WHEN 'high' THEN 1 WHEN 'medium' THEN 2/);
    expect(src).toMatch(/citabilityMethods\.title/);
    expect(src).not.toMatch(/effectSizePct/);
  });

  it("renders a High/Medium/Low impact badge, never a '+N%' effect-size figure", () => {
    expect(src).toMatch(/IMPACT_LABEL\[m\.impactTier/);
    expect(src).not.toMatch(/\+\{.*%/);
    expect(src).not.toMatch(/effect.?size/i);
  });
});
