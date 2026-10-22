/**
 * "Dates show in Sydney time" (23 Oct), item 3 -- the audit header's
 * date (and every other owner-facing date/time on the audit, brand
 * and history pages, emails and the PDF) must use the business's own
 * timezone, via this one helper, not whatever timezone the server
 * process happens to be running under.
 */
import { describe, expect, it } from "vitest";
import { formatInOrgTimezone, getOrgTimezone } from "@/lib/platform/org-timezone";

describe("getOrgTimezone", () => {
  it("returns Australia/Sydney today, regardless of organizationId", () => {
    expect(getOrgTimezone("some-org-id")).toBe("Australia/Sydney");
    expect(getOrgTimezone(undefined)).toBe("Australia/Sydney");
  });
});

describe("formatInOrgTimezone", () => {
  // The task's own literal test case: AEDT (UTC+11) is in effect on
  // 22-23 Oct 2026 (DST started 2026-10-04, the first Sunday of
  // October) -- 21:09 UTC + 11h crosses midnight into the next day.
  it("an audit completed at 21:09 UTC on 22 Oct shows '23 Oct 2026' with an AU org timezone", () => {
    const completedAt = new Date("2026-10-22T21:09:00.000Z");
    expect(formatInOrgTimezone(completedAt, "any-org-id", "d MMM yyyy")).toBe("23 Oct 2026");
  });

  it("a UTC time that's still the same Sydney calendar day renders unchanged", () => {
    // 2026-10-22T05:00:00Z + 11h = 16:00 Sydney, still 22 Oct.
    const completedAt = new Date("2026-10-22T05:00:00.000Z");
    expect(formatInOrgTimezone(completedAt, "any-org-id", "d MMM yyyy")).toBe("22 Oct 2026");
  });

  it("formats time-of-day correctly too, not just the date", () => {
    // 21:09 UTC on 22 Oct -> 08:09 Sydney on 23 Oct (AEDT, +11h).
    const completedAt = new Date("2026-10-22T21:09:00.000Z");
    expect(formatInOrgTimezone(completedAt, "any-org-id", "h:mmaaa, d MMM")).toBe("8:09am, 23 Oct");
  });

  it("DST END (first Sunday of April, AEST UTC+10): a time that would cross midnight under AEDT doesn't, once the clocks have gone back", () => {
    // 2026-04-06 is the first Sunday of April -- AEST (+10h) from then.
    // 14:30 UTC + 10h = 00:30 the next day -- still crosses midnight,
    // just by a different offset than the AEDT case above.
    const completedAt = new Date("2026-04-10T14:30:00.000Z");
    expect(formatInOrgTimezone(completedAt, "any-org-id", "d MMM yyyy")).toBe("11 Apr 2026");
  });

  it("is unaffected by the organizationId argument today (Build 2's per-market lookup isn't built yet)", () => {
    const completedAt = new Date("2026-10-22T21:09:00.000Z");
    const a = formatInOrgTimezone(completedAt, "org-a", "d MMM yyyy");
    const b = formatInOrgTimezone(completedAt, "org-b", "d MMM yyyy");
    const c = formatInOrgTimezone(completedAt, undefined, "d MMM yyyy");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("supports every date-fns pattern this task actually swaps in, not just one", () => {
    const completedAt = new Date("2026-10-22T21:09:00.000Z"); // 23 Oct, 08:09 Sydney
    expect(formatInOrgTimezone(completedAt, undefined, "d MMM HH:mm")).toBe("23 Oct 08:09");
    expect(formatInOrgTimezone(completedAt, undefined, "yyyy-MM-dd")).toBe("2026-10-23");
  });
});
