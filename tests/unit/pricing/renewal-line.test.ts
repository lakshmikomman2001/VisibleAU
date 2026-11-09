/**
 * Live invite test follow-ups (8 Nov), part 3 -- Splice's billing page said "Next renewal 24 Sep 2026" on
 * 8 Nov. The renewal line now comes from one rule (lib/pricing/renewal.ts): a past date is never the next
 * renewal, a plan Stripe doesn't renew says so, and past due or unpaid say that. And nothing else in the app
 * prints a renewal date of its own.
 */
import { describe, expect, it } from "vitest";
import { isStripeSubscriptionId, type RenewalSource, renewalLine } from "@/lib/pricing/renewal";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

const NOW = new Date("2026-11-08T03:00:00.000Z");
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const fmt = (date: Date) => date.toISOString().slice(0, 10);

const stripe = (over: Partial<RenewalSource> = {}): RenewalSource => ({
  status: "active",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: day("2026-12-24"),
  stripeSubscriptionId: "sub_1QabcdEFGHijklMNop",
  ...over,
});

describe("the renewal line", () => {
  it("an active Stripe plan with its period ahead: 'Next renewal' and the date, as before", () => {
    expect(renewalLine(stripe(), fmt, NOW)).toEqual({
      kind: "renews",
      label: "Next renewal",
      value: "2026-12-24",
    });
  });

  it("a period end already passed is never 'Next renewal'", () => {
    const line = renewalLine(stripe({ currentPeriodEnd: day("2026-09-24") }), fmt, NOW);
    expect(line).toEqual({
      kind: "not_confirmed",
      label: "Renewal",
      value: "Not confirmed: the last period ended 2026-09-24",
    });
    expect(line.label).not.toBe("Next renewal");
  });

  it("a plan with no Stripe subscription says so, whatever date it holds", () => {
    for (const id of [
      "sub_test_visibleau_dev",
      "sub_test_1a2b3c4d",
      "manual-agency-pro",
      "sub_short1",
    ]) {
      expect(renewalLine(stripe({ stripeSubscriptionId: id }), fmt, NOW)).toEqual({
        kind: "manual",
        label: "Renewal",
        value: "Plan set by Vunnara, no automatic renewal",
      });
    }
  });

  it("past due and unpaid say so, with no date", () => {
    expect(renewalLine(stripe({ status: "past_due" }), fmt, NOW)).toMatchObject({
      kind: "past_due",
      value: "Past due: the last payment didn't go through",
    });
    expect(renewalLine(stripe({ status: "unpaid" }), fmt, NOW)).toMatchObject({
      kind: "unpaid",
      value: "Unpaid: the last invoice hasn't been paid",
    });
  });

  it("a scheduled cancellation: 'Plan ends', then 'Plan ended' once the date has passed", () => {
    expect(renewalLine(stripe({ cancelAtPeriodEnd: true }), fmt, NOW)).toEqual({
      kind: "ends",
      label: "Plan ends",
      value: "2026-12-24",
    });
    expect(
      renewalLine(
        stripe({ cancelAtPeriodEnd: true, currentPeriodEnd: day("2026-11-01") }),
        fmt,
        NOW,
      ),
    ).toEqual({ kind: "ended", label: "Plan ended", value: "2026-11-01" });
  });

  it("no paid plan, or no period at all: nothing to show", () => {
    expect(renewalLine(null, fmt, NOW)).toEqual({
      kind: "none",
      label: "Next renewal",
      value: "—",
    });
    expect(renewalLine(stripe({ currentPeriodEnd: null }), fmt, NOW).value).toBe("—");
  });

  it("Stripe's own ids look like sub_ and 14 or more letters and digits", () => {
    expect(isStripeSubscriptionId("sub_1QabcdEFGHijklMNop")).toBe(true);
    expect(isStripeSubscriptionId("sub_test_visibleau_dev")).toBe(false);
    expect(isStripeSubscriptionId("sub_9f3e2a10-1b2c-4d5e")).toBe(false);
  });
});

describe("nothing else prints a renewal date", () => {
  const SCANNED = ["app", "components", "lib", "inngest"];
  // One walk per file, cached (tests/helpers/source-files.ts); each test reads the cache.
  readSourcesBeforeAll(SCANNED);
  const code = (file: string) =>
    sourceText(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

  it("'Next renewal' is written in the rule alone", () => {
    const files = sourcePaths(SCANNED);
    expect(files.length).toBeGreaterThan(500);
    expect(files.filter((f) => /Next renewal/.test(code(f)))).toEqual(["lib/pricing/renewal.ts"]);
  });

  it("the billing page passes its subscription through the rule, and its view shows what comes back", () => {
    expect(code("app/(auth)/settings/billing/page.tsx")).toMatch(/renewalLine\(liveSub \?\? null,/);
    const view = code("app/(auth)/settings/billing/billing-view.tsx");
    expect(view).toMatch(/\{renewal\.label\}/);
    expect(view).toMatch(/\{renewal\.value\}/);
    expect(view).not.toMatch(/periodEnd|formatInOrgTimezone/);
  });
});
