import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { NOTIFICATION_PREFERENCES } from "@/lib/email/recipients";

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

  // Task 15: the per-alert gate (each preference column and its default
  // when NULL or never saved) lives in one table, lib/email/recipients.ts;
  // each alert names its type and lets resolveNotificationRecipients decide.
  it("hallucination alert defaults to true (COALESCE emailOnHallucination true)", () => {
    expect(NOTIFICATION_PREFERENCES.hallucination).toEqual({
      column: "emailOnHallucination",
      defaultOn: true,
    });
    expect(src).toContain('sendAlert("hallucination"');
  });

  it("drift alert follows emailOnDrift, on by default like its schema column", () => {
    expect(NOTIFICATION_PREFERENCES.drift).toEqual({ column: "emailOnDrift", defaultOn: true });
    expect(src).toContain('sendAlert("drift"');
  });

  it("consensus alert defaults to false (COALESCE emailOnConsensus false)", () => {
    expect(NOTIFICATION_PREFERENCES.consensus).toEqual({
      column: "emailOnConsensus",
      defaultOn: false,
    });
    expect(src).toContain('sendAlert("consensus"');
  });

  it("volatility alert defaults to false (COALESCE emailOnVolatility false)", () => {
    expect(NOTIFICATION_PREFERENCES.volatility).toEqual({
      column: "emailOnVolatility",
      defaultOn: false,
    });
    expect(src).toContain('sendAlert("volatility"');
  });

  it("gates through lib/email/recipients, never a preference query of its own", () => {
    expect(src).toMatch(/from\s+["']@\/lib\/email\/recipients["']/);
    expect(src).not.toMatch(/from\s+["']@\/db\/schema["']/);
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

  // Task 15: alerts go to the org's owner and admins (resolveNotificationRecipients),
  // not to the digest address.
  it("each alert sends to the resolved recipients, never the digest address", () => {
    expect(src).toContain("resolveNotificationRecipients(");
    expect(src).not.toContain("digestEmail");
  });
});
