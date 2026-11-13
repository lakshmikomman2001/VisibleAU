/**
 * 13 Nov, part 1 -- Sri's live check: /admin/costs said "Agency Pro plan · A$1499.00 a month incl. GST". Vunnara
 * isn't registered for GST (lib/product.ts GST_REGISTERED = false), and a plan price is whole dollars with a
 * thousands separator (lib/pricing/gst.ts formatAud). The line now comes from monthlyPlanPrice, through the switch:
 * "A$1,499 a month", and "A$1,499 a month inc. GST" once registered. The page's heading and its breadcrumb are
 * one title (lib/navigation/breadcrumbs.ts ADMIN_PAGE_TITLES): "Provider costs", not "Operator settings".
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { OperatorCosts, OperatorWorkspaceCost } from "@/lib/admin/costs";
import { breadcrumbsForPath } from "@/lib/navigation/breadcrumbs";
import { monthlyPlanPrice } from "@/lib/pricing/gst";

function workspace(plan: string, planPriceAudCents: number | null): OperatorWorkspaceCost {
  return {
    organizationId: `org-${plan}`,
    name: `${plan} workspace`,
    plan,
    planPriceAudCents,
    audits: [],
    byEngine: [],
    enginesUsd: 0,
    googleUsd: 0,
    totalUsd: 0,
    followUpAudCents: 0,
    incomplete: false,
  };
}

const COSTS: OperatorCosts = {
  asOf: "2026-11-13T03:00:00.000Z",
  workspaces: [
    workspace("Agency Pro", 149_900),
    workspace("Starter", 9_900),
    workspace("Free", 0),
    workspace("Enterprise", null),
  ],
  byEngine: [],
  enginesUsd: 0,
  googleUsd: 0,
  totalUsd: 0,
  followUpAudCents: 0,
  incomplete: false,
};

async function renderCosts(): Promise<string> {
  const { OperatorCostsView } = await import("@/components/domain/admin/operator-costs");
  return renderToStaticMarkup(<OperatorCostsView costs={COSTS} />).replace(/<!-- -->/g, "");
}

/** The view's first import can take 9 s here (the unit limit is 5 s): warm it up once. */
const RENDER_MS = 30_000;
beforeAll(async () => {
  await import("@/components/domain/admin/operator-costs");
}, 60_000);

afterEach(() => {
  vi.doUnmock("@/lib/product");
});

describe("monthlyPlanPrice: the shared formatter, through the GST switch", () => {
  it("not registered: the list price, a thousands separator, no cents, no GST", () => {
    expect(monthlyPlanPrice(149_900, false)).toBe("A$1,499 a month");
    expect(monthlyPlanPrice(9_900, false)).toBe("A$99 a month");
    expect(monthlyPlanPrice(0, false)).toBe("A$0 a month");
    // The default is the switch, which is off.
    expect(monthlyPlanPrice(149_900)).toBe("A$1,499 a month");
  });

  it("registered: the same price, said to include GST", () => {
    expect(monthlyPlanPrice(149_900, true)).toBe("A$1,499 a month inc. GST");
    expect(monthlyPlanPrice(9_900, true)).toBe("A$99 a month inc. GST");
  });
});

describe("/admin/costs: each workspace's plan line", () => {
  it(
    "not registered (today): 'Agency Pro plan · A$1,499 a month', and no GST or .00 anywhere",
    async () => {
      const html = await renderCosts();
      expect(html).toContain("Agency Pro plan · A$1,499 a month</p>");
      expect(html).toContain("Starter plan · A$99 a month</p>");
      expect(html).toContain("Free plan · A$0 a month</p>");
      expect(html).toContain("Enterprise plan · price agreed per deal</p>");
      expect(html).not.toMatch(/GST/);
      expect(html).not.toContain("1499.00");
      expect(html).not.toMatch(/A\$1499\b/);
    },
    RENDER_MS,
  );

  it(
    "registered: the page says 'inc. GST' through the switch, nothing else changes",
    async () => {
      vi.resetModules();
      vi.doMock("@/lib/product", async (importOriginal) => ({
        ...(await importOriginal<typeof import("@/lib/product")>()),
        GST_REGISTERED: true,
      }));
      const html = await renderCosts();
      expect(html).toContain("Agency Pro plan · A$1,499 a month inc. GST</p>");
      expect(html).toContain("Starter plan · A$99 a month inc. GST</p>");
      expect(html).not.toContain("incl. GST");
      vi.resetModules();
    },
    RENDER_MS,
  );

  it(
    "its heading and its breadcrumb's last part are both 'Provider costs'",
    async () => {
      const html = await renderCosts();
      expect(html).toMatch(/<h1[^>]*>Provider costs<\/h1>/);
      expect(breadcrumbsForPath("/admin/costs").at(-1)?.label).toBe("Provider costs");
    },
    RENDER_MS,
  );
});
