// @vitest-environment jsdom
/**
 * Live invite test follow-ups (8 Nov), part 3 -- the billing page's plan card shows the renewal line the one
 * rule gives it (lib/pricing/renewal.ts): Splice's "Next renewal 24 Sep 2026" on 8 Nov becomes "Renewal:
 * Not confirmed ...", a hand-set plan says it doesn't renew, and an active plan is unchanged.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RoleProvider } from "@/components/domain/role-context";
import type { OrgRole } from "@/lib/governance/permissions";
import type { RenewalLine } from "@/lib/pricing/renewal";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

let BillingView: typeof import("@/app/(auth)/settings/billing/billing-view").default;

// A first render can take seconds under load: load the view once first.
beforeAll(async () => {
  BillingView = (await import("@/app/(auth)/settings/billing/billing-view")).default;
}, 30_000);
afterEach(cleanup);

/** Sri saw it as the Analyst in Splice. */
const VIEWER_ROLE: OrgRole = "analyst";

function billing(renewal: RenewalLine, cancelAtPeriodEnd = false) {
  return render(
    <RoleProvider role={VIEWER_ROLE}>
      <BillingView
        tier="agency_pro"
        tierName="Agency Pro"
        monthlyPrice="A$999"
        billingInterval="monthly"
        cancelAtPeriodEnd={cancelAtPeriodEnd}
        renewal={renewal}
        hasSubscription
        stripeCustomerId="cus_test"
        maxScheduled={50}
        frequency="daily"
        success={false}
        reason={null}
      />
    </RoleProvider>,
  );
}

describe("the plan card's renewal line", () => {
  it("a period that ended on 24 Sep isn't the next renewal", () => {
    billing({
      kind: "not_confirmed",
      label: "Renewal",
      value: "Not confirmed: the last period ended 24 Sep 2026",
    });
    expect(screen.queryByText("Next renewal")).toBeNull();
    expect(screen.getByText("Renewal")).toBeVisible();
    expect(screen.getByText("Not confirmed: the last period ended 24 Sep 2026")).toBeVisible();
  });

  it("a plan set by hand says it doesn't renew", () => {
    billing({
      kind: "manual",
      label: "Renewal",
      value: "Plan set by Vunnara, no automatic renewal",
    });
    expect(screen.getByText("Plan set by Vunnara, no automatic renewal")).toBeVisible();
    expect(screen.queryByText("Next renewal")).toBeNull();
  });

  it("an active plan with its period ahead is unchanged", () => {
    billing({ kind: "renews", label: "Next renewal", value: "24 Dec 2026" });
    expect(screen.getByText("Next renewal")).toBeVisible();
    expect(screen.getByText("24 Dec 2026")).toBeVisible();
    expect(screen.queryByText(/will downgrade to Free/)).toBeNull();
  });

  it("a scheduled cancellation says when it ends, once", () => {
    billing({ kind: "ends", label: "Plan ends", value: "24 Dec 2026" }, true);
    expect(screen.getByText("Your plan will downgrade to Free on 24 Dec 2026.")).toBeVisible();
    expect(screen.getByText("Plan ends")).toBeVisible();
  });
});
