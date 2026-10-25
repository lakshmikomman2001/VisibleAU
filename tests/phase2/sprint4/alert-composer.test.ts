import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

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

  // Task 15: lib/email/client.ts (an SMTP shim that "succeeded" without
  // sending) is gone; every alert goes through lib/email/send.ts (Resend).
  it("sends through lib/email/send, never a client of its own", () => {
    expect(src).toMatch(/from\s+["']@\/lib\/email\/send["']/);
    expect(src).not.toContain("lib/email/client");
    expect(src).not.toMatch(/new Resend\(/);
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
