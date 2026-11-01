/**
 * DEMO-BLOCKER (1 Nov), part 2 / part 5 point 1 -- a report is based on one
 * audit: the latest complete audit in the period in which every engine
 * answered; else the latest complete one in the period; else the latest
 * before it. Production's W44 had #37 (Claude failed), #38 and #39: the
 * report must be based on #39. And the period reads as a week with dates.
 */
import { describe, expect, it } from "vitest";
import { pickBasisAudit } from "@/lib/reports/report-data";
import { reportPeriodDisplay } from "@/lib/reports/report-period";

const full = {
  engines: ["chatgpt", "claude", "gemini", "perplexity"],
  promptsCount: 13,
  metadata: {},
};
const claudeFailed = { ...full, metadata: { engineFailures: { claude: 13 } } };

const a37 = { id: "a37", completedAt: new Date("2026-10-30T23:00:00Z"), ...claudeFailed };
const a38 = { id: "a38", completedAt: new Date("2026-10-31T22:00:00Z"), ...full };
const a39 = { id: "a39", completedAt: new Date("2026-11-01T07:30:00Z"), ...full };
const a36 = { id: "a36", completedAt: new Date("2026-10-20T01:00:00Z"), ...full };

const inW44 = (a: { completedAt: Date }) =>
  a.completedAt >= new Date("2026-10-25T13:00:00Z") &&
  a.completedAt < new Date("2026-11-01T13:00:00Z");
const beforeW44 = (a: { completedAt: Date }) => a.completedAt < new Date("2026-10-25T13:00:00Z");

describe("pickBasisAudit", () => {
  it("picks #39 from a week with #37 (partial), #38 and #39", () => {
    expect(pickBasisAudit([a37, a38, a39, a36], inW44, beforeW44)).toEqual({
      audit: a39,
      reason: "latest_full_in_period",
    });
  });

  it("skips a newer partial audit for an older full one in the same period", () => {
    const a40partial = { ...a37, id: "a40", completedAt: new Date("2026-11-01T09:00:00Z") };
    expect(pickBasisAudit([a39, a40partial], inW44, beforeW44)?.audit.id).toBe("a39");
  });

  it("uses the latest partial audit when no audit in the period had every engine", () => {
    expect(pickBasisAudit([a37, a36], inW44, beforeW44)).toEqual({
      audit: a37,
      reason: "latest_partial_in_period",
    });
  });

  it("uses the latest audit before the period when none finished in it, and null with no audit", () => {
    expect(pickBasisAudit([a36], inW44, beforeW44)).toEqual({
      audit: a36,
      reason: "latest_before_period",
    });
    expect(pickBasisAudit([], inW44, beforeW44)).toBeNull();
  });
});

describe("reportPeriodDisplay", () => {
  it("reads a week as its number, year and Monday-to-Sunday dates", () => {
    expect(reportPeriodDisplay("2026-W44")).toEqual({
      title: "Week 44, 2026",
      range: "26 Oct – 1 Nov",
      full: "Week 44, 2026 (26 Oct – 1 Nov)",
    });
    expect(reportPeriodDisplay("2026-W45").full).toBe("Week 45, 2026 (2 – 8 Nov)");
    expect(reportPeriodDisplay("2026-W01").full).toBe("Week 1, 2026 (29 Dec – 4 Jan)");
  });

  it("reads a month as its name, and leaves an unknown label as it is", () => {
    expect(reportPeriodDisplay("2026-10").full).toBe("October 2026");
    expect(reportPeriodDisplay("custom").full).toBe("custom");
  });
});
