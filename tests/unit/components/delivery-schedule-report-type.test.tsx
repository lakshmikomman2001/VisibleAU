// @vitest-environment jsdom
/**
 * S01 part 8 (LLD 8.1.7 "Scheduled reports", amendment 14): the delivery-schedule form's "Report type".
 * - report_v2 on (GET /api/report-tiers): a select with the workspace's report names (default Basic) and the help
 *   "Scheduled reports use this report type."; the chosen type is sent as reportTier and shown on the schedule.
 * - report_v2 off: the form is today's (no select, nothing sent).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TIER_DESCRIPTIONS } from "@/lib/reports/report-tiers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ orgId: "org-1" }),
  usePathname: () => "/organizations/org-1/delivery-schedules",
}));

import DeliverySchedulesPage from "@/app/(auth)/organizations/[orgId]/delivery-schedules/page";

const TIERS = [
  { tier: "basic", name: "Essentials", description: TIER_DESCRIPTIONS.basic, lockedPlan: null },
  {
    tier: "standard",
    name: "Growth Plan",
    description: TIER_DESCRIPTIONS.standard,
    lockedPlan: null,
  },
  {
    tier: "enhanced",
    name: "Premium Audit",
    description: TIER_DESCRIPTIONS.enhanced,
    lockedPlan: null,
  },
];

function serve(enabled: boolean) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === "/api/report-tiers")
        return Response.json(
          enabled ? { enabled: true, maxTier: "enhanced", tiers: TIERS } : { enabled: false },
        );
      if (init?.method === "POST")
        return Response.json(
          {
            id: "s1",
            brandId: null,
            frequency: "weekly",
            dayOfWeek: 1,
            dayOfMonth: null,
            timeOfDay: "09:00",
            recipientEmails: ["client@example.com.au"],
            isActive: true,
            lastSentAt: null,
            createdAt: "2026-11-23T00:00:00Z",
            reportTier: JSON.parse(String(init.body)).reportTier ?? "basic",
          },
          { status: 201 },
        );
      return Response.json([]);
    }),
  );
  return calls;
}

async function openForm() {
  render(<DeliverySchedulesPage />);
  fireEvent.click(await screen.findByRole("button", { name: "New schedule" }, { timeout: 30_000 }));
  fireEvent.change(screen.getByPlaceholderText("name@company.com"), {
    target: { value: "client@example.com.au" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
}

beforeAll(async () => {
  serve(false);
  render(<DeliverySchedulesPage />).unmount();
}, 60_000);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the delivery-schedule form's report type", () => {
  it("report_v2 on: the names, Basic first and chosen, the help line; the choice is sent and shown", async () => {
    const calls = serve(true);
    await openForm();
    const select = await screen.findByRole("combobox", { name: "Report type" });
    expect(select).toHaveValue("basic");
    expect([...(select as HTMLSelectElement).options].map((o) => o.text)).toEqual([
      "Essentials",
      "Growth Plan",
      "Premium Audit",
    ]);
    expect(screen.getByText("Scheduled reports use this report type.")).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "enhanced" } });
    fireEvent.click(screen.getByRole("button", { name: "Create schedule" }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "POST")).toBe(true));
    const post = calls.find((c) => c.init?.method === "POST");
    expect(JSON.parse(String(post?.init?.body)).reportTier).toBe("enhanced");
    expect(await screen.findByText(/Premium Audit report/)).toBeInTheDocument();
  });

  it("report_v2 off: no select and nothing sent about it", async () => {
    const calls = serve(false);
    await openForm();
    await waitFor(() => expect(calls.some((c) => c.url === "/api/report-tiers")).toBe(true));
    expect(screen.queryByRole("combobox", { name: "Report type" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create schedule" }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "POST")).toBe(true));
    const post = calls.find((c) => c.init?.method === "POST");
    expect(JSON.parse(String(post?.init?.body))).not.toHaveProperty("reportTier");
  });
});
