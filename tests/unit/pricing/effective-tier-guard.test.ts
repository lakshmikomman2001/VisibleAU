/**
 * 3 Nov -- no gate can forget. A source scan of everything that ships: only
 * lib/pricing/effective-tier.ts reads the plan off a subscription row, and
 * every gate found is on the lists in tests/helpers/plan-gates.ts, the same
 * lists tests/integration/cancelled-plan-gates.integration.test.tsx walks.
 */
import { describe, expect, it } from "vitest";
import { ASSERT_TIER_GATES, DIRECT_GATES, PLAN_FEATURE_GATES } from "@/tests/helpers/plan-gates";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

const SCANNED = ["app", "components", "inngest", "lib", "middleware.ts", "instrumentation.ts"];
const HELPER = "lib/pricing/effective-tier.ts";
const BILLING_PAGE = "app/(auth)/settings/billing/page.tsx";

// One walk per file, cached (tests/helpers/source-files.ts); each test reads the cache.
readSourcesBeforeAll(SCANNED);

function sourceFiles(): string[] {
  return sourcePaths(SCANNED)
    .filter((path) => !/\.test\.tsx?$/.test(path))
    .sort();
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const files = () => sourceFiles();
const code = (file: string) => stripComments(sourceText(file));
const filesMatching = (pattern: RegExp) => files().filter((file) => pattern.test(code(file)));

/** Every other file that may touch the subscriptions table, and why it isn't reading a plan. */
const OTHER_SUBSCRIPTION_READERS: Record<string, string> = {
  [HELPER]: "the one reader of the plan",
  [BILLING_PAGE]: "the whole row for the billing page: its plan through tierOfSubscription",
  "app/api/billing/downgrade/route.ts": "the Stripe subscription id, to schedule a cancellation",
  "app/api/billing/portal/route.ts": "the Stripe customer id, to open the portal",
  "inngest/functions/content-structure-audit.ts": "selects subscriptionPlanColumns for hasPaidPlan",
  "inngest/functions/llmstxt-refresh.ts": "selects subscriptionPlanColumns for hasPaidPlan",
  "lib/stripe/webhook-handlers/checkout-completed.ts": "writes the row",
  "lib/stripe/webhook-handlers/invoice-paid.ts": "writes the row",
  "lib/stripe/webhook-handlers/invoice-payment-failed.ts": "writes the row",
  "lib/stripe/webhook-handlers/subscription-deleted.ts": "writes the row",
  "lib/stripe/webhook-handlers/subscription-updated.ts": "writes the row",
};

const TOUCHES_TABLE = /\b(?:from|innerJoin|leftJoin|rightJoin|update|insert)\(\s*subscriptions\b/;

describe("the plan is read in one place", () => {
  it("found the code it's meant to scan", () => {
    expect(files().length).toBeGreaterThan(500);
    expect(files()).toContain(HELPER);
    expect(files()).toContain("lib/governance/access-control.ts");
  });

  it("nothing but the helper reads subscriptions.tier", () => {
    expect(filesMatching(/\bsubscriptions\.tier\b/).filter((f) => f !== HELPER)).toEqual([]);
  });

  it("the two weekly crons read the same rule, not the status on its own", () => {
    for (const file of [
      "inngest/functions/content-structure-audit.ts",
      "inngest/functions/llmstxt-refresh.ts",
    ]) {
      expect(code(file)).toMatch(/hasPaidPlan\(/);
      expect(code(file)).not.toMatch(/subscriptions\.status/);
    }
  });

  it("nothing else filters on the status alone, which would drift from the rule", () => {
    expect(
      filesMatching(/\bsubscriptions\.status\b/).filter((f) => !OTHER_SUBSCRIPTION_READERS[f]),
    ).toEqual([]);
    expect(filesMatching(/eq\(\s*subscriptions\.status\b/).filter((f) => f !== HELPER)).toEqual([]);
  });

  it("nothing uses the relational query on subscriptions, which this scan couldn't see", () => {
    expect(filesMatching(/\.query\.subscriptions\b/)).toEqual([]);
  });

  it("every file touching the subscriptions table is known, and says why", () => {
    expect(filesMatching(TOUCHES_TABLE).filter((f) => !OTHER_SUBSCRIPTION_READERS[f])).toEqual([]);
  });

  it("nothing reads a tier off organizations: it isn't what the gates use", () => {
    expect(filesMatching(/\borganizations\.tier\b/)).toEqual([]);
    expect(filesMatching(/\.organization\.tier\b/)).toEqual([]);
  });

  it("the billing page takes its plan from the same rule", () => {
    expect(code(BILLING_PAGE)).toMatch(/tierOfSubscription\(/);
    expect(code(BILLING_PAGE)).not.toMatch(/\bsub\??\.tier\b/);
  });
});

describe("the list of plan gates", () => {
  it("every effectiveTier() caller is listed, and every listed gate calls it", () => {
    const found = filesMatching(/\beffectiveTier\(/).filter((f) => f !== HELPER);
    expect(found).toEqual([...DIRECT_GATES].sort());
  });

  it("every plan-feature check is listed, and every listed gate calls one", () => {
    const found = filesMatching(/\b(?:planFeatureRefusal|workspaceHasFeature)\(/).filter(
      (f) => f !== "lib/pricing/plan-features.ts",
    );
    expect(found).toEqual([...PLAN_FEATURE_GATES].sort());
  });

  it("every assertTier() caller is listed, and every listed gate calls it", () => {
    const found = filesMatching(/\bassertTier\(/).filter(
      (f) => f !== "lib/governance/access-control.ts",
    );
    expect(found).toEqual([...ASSERT_TIER_GATES].sort());
  });
});
