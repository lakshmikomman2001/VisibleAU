import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("alert-composer (NP-01: per-alert preference gate)", () => {
  const srcPath = resolve(__dirname, "../../../lib/communication/alert-composer.ts");
  const src = readFileSync(srcPath, "utf-8");

  it("exports exactly 4 alert functions", () => {
    const exports = [
      "sendHallucinationAlert",
      "sendDriftAlert",
      "sendConsensusAlert",
      "sendVolatilityAlert",
    ];
    for (const fn of exports) {
      expect(src).toContain(`export async function ${fn}`);
    }
  });

  it("hallucination alert defaults to true (COALESCE emailOnHallucination true)", () => {
    expect(src).toContain("emailOnHallucination === false");
  });

  it("drift alert requires explicit opt-in (emailOnDrift)", () => {
    expect(src).toContain("emailOnDrift !== true");
  });

  it("consensus alert defaults to false (COALESCE emailOnConsensus false)", () => {
    expect(src).toContain("emailOnConsensus !== true");
  });

  it("volatility alert defaults to false (COALESCE emailOnVolatility false)", () => {
    expect(src).toContain("emailOnVolatility !== true");
  });

  it("imports notificationPreferences from db/schema", () => {
    expect(src).toContain("notificationPreferences");
    expect(src).toMatch(/from\s+["']@\/db\/schema["']/);
  });

  it("uses resend singleton from lib/email/client", () => {
    expect(src).toContain("resend");
    expect(src).toMatch(/from\s+["']@\/lib\/email\/client["']/);
  });

  it("does not use Clerk", () => {
    expect(src).not.toContain("clerk");
    expect(src).not.toContain("Clerk");
  });

  it("does not reference organizations.tier", () => {
    expect(src).not.toContain("organizations.tier");
  });

  it("each alert checks digestEmail before sending", () => {
    const digestEmailChecks = (src.match(/digestEmail/g) || []).length;
    expect(digestEmailChecks).toBeGreaterThanOrEqual(4);
  });
});
