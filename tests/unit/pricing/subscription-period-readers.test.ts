/**
 * Brand-feature locks and pricing claims (8 Nov), part 6 -- everything that reads a subscription's stored
 * period, with Splice's stuck one: 24 Sep 2026 as both ends, still there on 8 Nov after a 24 Oct renewal.
 *
 * - The plan rule (lib/pricing/effective-tier.ts; every gate, the seat checks, the weekly crons) reads the
 *   period only for a scheduled cancellation. Splice has none: Agency Pro throughout.
 * - The billing page's renewal line (lib/pricing/renewal.ts) never calls a past end the next renewal.
 * - Nothing else reads it: the audit quota counts from the start of the calendar month
 *   (lib/scheduling/quota-check.ts), so no limit counted from 24 Sep. The scan below keeps that list whole.
 */
import { describe, expect, it } from "vitest";
import { type SubscriptionPlan, tierOfSubscription } from "@/lib/pricing/effective-tier";
import { renewalLine } from "@/lib/pricing/renewal";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

const NOW = new Date("2026-11-08T01:00:00Z");
const SEP_24 = new Date("2026-09-24T03:12:00Z");
const OCT_24 = new Date("2026-10-24T03:12:00Z");
const NOV_24 = new Date("2026-11-24T03:12:00Z");
const day = (date: Date) => date.toISOString().slice(0, 10);

const plan = (overrides: Partial<SubscriptionPlan>): SubscriptionPlan => ({
  tier: "agency_pro",
  status: "active",
  cancelAtPeriodEnd: false,
  currentPeriodStart: SEP_24,
  currentPeriodEnd: SEP_24,
  ...overrides,
});

const renewal = (overrides: Partial<SubscriptionPlan>) => {
  const sub = plan(overrides);
  return renewalLine(
    {
      status: sub.status,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      currentPeriodEnd: sub.currentPeriodEnd,
      stripeSubscriptionId: "sub_1SpliceShapeTest0001",
    },
    day,
    NOW,
  );
};

describe("the plan rule with a past period", () => {
  it("Splice's window, no cancellation scheduled: the plan, whatever the stored dates", () => {
    expect(tierOfSubscription(plan({}), NOW)).toBe("agency_pro");
  });

  it("a renewal that wasn't stored (a real period, ended): still the plan -- Stripe ends a plan, not a date", () => {
    expect(
      tierOfSubscription(plan({ currentPeriodStart: SEP_24, currentPeriodEnd: OCT_24 }), NOW),
    ).toBe("agency_pro");
  });

  it("Splice's window with a cancellation scheduled: under a day isn't a real period, so it waits for Stripe", () => {
    expect(tierOfSubscription(plan({ cancelAtPeriodEnd: true }), NOW)).toBe("agency_pro");
  });

  it("a real period with a cancellation scheduled: the plan until its end, free after", () => {
    const scheduled = plan({
      cancelAtPeriodEnd: true,
      currentPeriodStart: OCT_24,
      currentPeriodEnd: NOV_24,
    });
    expect(tierOfSubscription(scheduled, NOW)).toBe("agency_pro");
    expect(tierOfSubscription(scheduled, new Date("2026-11-25T00:00:00Z"))).toBe("free");
  });
});

describe("the billing page's renewal line with a past period", () => {
  it("Splice's window: not confirmed, never the next renewal", () => {
    expect(renewal({})).toEqual({
      kind: "not_confirmed",
      label: "Renewal",
      value: "Not confirmed: the last period ended 2026-09-24",
    });
  });

  it("once the renewal is stored: the next renewal", () => {
    expect(renewal({ currentPeriodStart: OCT_24, currentPeriodEnd: NOV_24 })).toEqual({
      kind: "renews",
      label: "Next renewal",
      value: "2026-11-24",
    });
  });
});

/** Every file in the shipped code that names the stored period, and what it does with it. */
const PERIOD_FILES: Record<string, string> = {
  "db/schema/subscriptions.ts": "the columns",
  "lib/stripe/webhook-handlers/subscription-period.ts":
    "the one rule its writers use: both ends, the end after the start, or neither",
  "lib/pricing/effective-tier.ts":
    "the plan rule: a scheduled cancellation's plan lasts to the period end (tested above)",
  "lib/pricing/renewal.ts": "the billing page's renewal line (tested above)",
};

const SCANNED = [
  "app",
  "components",
  "db/schema",
  "emails",
  "inngest",
  "lib",
  "middleware.ts",
  "instrumentation.ts",
];
const PERIOD = /currentPeriod(Start|End)|current_period_(start|end)/;

// One walk per file, cached (tests/helpers/source-files.ts); each test reads the cache.
readSourcesBeforeAll(SCANNED);

function sourceFiles(): string[] {
  return sourcePaths(SCANNED)
    .filter((path) => !/\.test\.tsx?$/.test(path))
    .sort();
}

const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("who reads the stored period", () => {
  it("only the files above: a new reader is added there, with a test of what a past period does to it", () => {
    const naming = sourceFiles().filter((file) => PERIOD.test(stripComments(sourceText(file))));
    expect(naming).toEqual(Object.keys(PERIOD_FILES).sort());
  });
});
