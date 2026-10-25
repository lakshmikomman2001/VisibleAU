/**
 * The audit-complete email (lib/email/templates/audit-complete.ts).
 * Task 15: it shows the audit page's own headline -- "Visibility N% ·
 * mentioned in k of n answers" -- never the retired 0-100 composite it
 * used to ("70.5/100", "Calculating..."), plus the finish time in Sydney
 * time and a link, in both HTML and text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditCompleteEmail } from "@/lib/email/templates/audit-complete";

const INPUT = {
  brandName: "Bondi Plumbing",
  auditNumber: 36,
  mentionRate: 7.5,
  mentionedCount: 3,
  sampleCount: 40,
  // 04:42 UTC is 3:42 PM in Sydney (AEDT, UTC+11) on 25 Oct 2026.
  completedAt: new Date("2026-10-25T04:42:00Z"),
  auditUrl: "https://app.vunnara.com.au/audits/abc",
};

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.vunnara.com.au"));
afterEach(() => vi.unstubAllEnvs());

describe("auditCompleteEmail", () => {
  it("leads with the page's headline, in HTML and text", () => {
    const email = auditCompleteEmail(INPUT);
    const headline = "Visibility 8% · mentioned in 3 of 40 answers";
    expect(email.html).toContain(headline);
    expect(email.text).toContain(headline);
    expect(email.subject).toBe("Audit #36 complete: Bondi Plumbing — Visibility 8%");
  });

  it("shows the finish time in Sydney time, and links to the audit", () => {
    const email = auditCompleteEmail(INPUT);
    expect(email.text).toContain("Finished 25 Oct 2026, 3:42 PM (Sydney time).");
    expect(email.html).toContain('href="https://app.vunnara.com.au/audits/abc"');
    expect(email.text).toContain("View the audit: https://app.vunnara.com.au/audits/abc");
  });

  it("no successful answers: says so -- never a 0% and never a 0-100 score", () => {
    const email = auditCompleteEmail({
      ...INPUT,
      mentionRate: null,
      mentionedCount: 0,
      sampleCount: 0,
    });
    expect(email.text).toContain("Visibility — · no successful answers were collected");
    expect(email.subject).toContain("no answers collected");
    expect(email.text).not.toMatch(/\b0%/);
    expect(email.html).not.toContain("/100");
    expect(email.html).not.toContain("Calculating");
  });

  it("without a finish time, leaves the line out rather than guessing one", () => {
    const email = auditCompleteEmail({ ...INPUT, completedAt: null });
    expect(email.text).not.toContain("Finished");
  });
});
