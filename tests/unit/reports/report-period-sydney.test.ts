/**
 * DEMO-BLOCKER (1 Nov), part 5 point 6 -- a report's week is the ISO week
 * of the audit's completion in Sydney time, whatever the server's own time
 * zone. Vercel runs in UTC: an audit finished at 7 am AEDT on Monday 2 Nov
 * (20:00 UTC Sunday) belongs to Week 45, not Week 44.
 */
process.env.TZ = "UTC";

import { describe, expect, it } from "vitest";
import { reportPeriodLabel } from "@/lib/reports/report-period";

describe("reportPeriodLabel on a UTC server", () => {
  it("Monday 7 am in Sydney is the new week", () => {
    expect(new Date("2026-11-01T20:00:00Z").getHours()).toBe(20); // this process is in UTC
    expect(reportPeriodLabel(new Date("2026-11-01T20:00:00Z"), "weekly")).toBe("2026-W45");
  });

  it("Sunday 6:30 pm in Sydney is still the old week", () => {
    expect(reportPeriodLabel(new Date("2026-11-01T07:30:00Z"), "weekly")).toBe("2026-W44");
  });

  it("uses the ISO week-numbering year: Monday 29 Dec 2025 is 2026-W01", () => {
    expect(reportPeriodLabel(new Date("2025-12-29T02:00:00Z"), "weekly")).toBe("2026-W01");
  });

  it("months too: 1 am on 1 Nov in Sydney is November", () => {
    expect(reportPeriodLabel(new Date("2026-10-31T14:00:00Z"), "monthly")).toBe("2026-11");
  });
});
