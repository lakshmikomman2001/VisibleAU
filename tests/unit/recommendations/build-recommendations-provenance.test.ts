/**
 * ⚠️ XXX — buildRecommendations must derive sourceType from the shared
 * verified-citations module (not re-type a second classification), and
 * must strip the url for any non-research ref so the renderer can never
 * build a link out of an unverified source.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("⚠️ XXX — lib/recommendations/index.ts: evidenceRefs carry honest provenance", () => {
  const src = readFileSync("lib/recommendations/index.ts", "utf8");

  it("imports deriveSourceType from the shared verified-citations module", () => {
    expect(src).toMatch(
      /import\s*\{\s*deriveSourceType\s*\}\s*from\s*"@\/lib\/methodology\/verified-citations"/,
    );
  });

  it("derives sourceType per ref and includes it in the evidenceRef shape", () => {
    expect(src).toMatch(/const sourceType = deriveSourceType\(r\.source, r\.url\);/);
    expect(src).toMatch(/sourceType,/);
  });

  it("strips the url for any non-research ref -- never passes through an unverified url", () => {
    expect(src).toMatch(/url: sourceType === "research" \? r\.url \?\? "" : ""/);
  });
});
