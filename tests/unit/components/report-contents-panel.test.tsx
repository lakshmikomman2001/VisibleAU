// @vitest-environment jsdom
/**
 * S01 part 5 (LLD 8.1.3, contract P08): the report contents panel.
 * - Agency and up: include toggles, move up/down (announced), a note per included action, agency actions (add,
 *   edit, archive), the two sections; Save sends the choices in their order; Generate sends them with the request.
 * - Growth: read-only with the Agency lock and an Upgrade link to /pricing; Generate still works and sends no
 *   choices.
 * - Saved feedback inline (role="status"); a failure inline (role="alert"); Escape closes; the empty state's words.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ReportContentsPanel,
  type ReportContentsPanelProps,
} from "@/components/domain/reports/report-contents-panel";
import type { WhatToDoNext } from "@/lib/reports/report-contents";
import { TIER_DESCRIPTIONS } from "@/lib/reports/report-tiers";

const ITEM_A = "11111111-1111-4111-8111-111111111111";
const ITEM_B = "22222222-2222-4222-8222-222222222222";

const NEXT: WhatToDoNext = {
  measured: [
    {
      key: ITEM_A,
      actionItemId: ITEM_A,
      title: "Link your Yellow Pages profile",
      evidence: "Yellow Pages cited in 17 of 40 answers · audit #54",
      priority: "high",
      status: "open",
      included: true,
      note: null,
    },
    {
      key: ITEM_B,
      actionItemId: ITEM_B,
      title: "Get mentioned in relevant Reddit threads",
      evidence: "Reddit was cited in 3 of 40 answers · audit #54",
      priority: "medium",
      status: "in_progress",
      included: true,
      note: null,
    },
  ],
  agencyActions: [
    {
      id: "a1",
      title: "Ask five clients for reviews",
      detail: null,
      priority: "high",
      status: "open",
      position: 0,
    },
  ],
  doneSinceLast: [{ title: "Claim your Google Business Profile", doneAt: "2026-11-18" }],
  generalAdvice: [],
  includeGeneralAdvice: true,
  includeDoneSinceLast: true,
  curated: true,
};

function props(over: Partial<ReportContentsPanelProps> = {}): ReportContentsPanelProps {
  return {
    brandId: "b1",
    brandName: "Hero Home Services",
    basisAuditNumber: 54,
    periodLabel: "2026-W47",
    agencyName: "Splice Marketing",
    curated: true,
    whatToDoNext: NEXT,
    // S01 part 8 (P08.tier): the panel opens with its report type; Enhanced here, as every v2 report was in part 5.
    tierOptions: (["basic", "standard", "enhanced"] as const).map((tier) => ({
      tier,
      name: tier[0].toUpperCase() + tier.slice(1),
      description: TIER_DESCRIPTIONS[tier],
      lockedPlan: null,
    })),
    initialTier: "enhanced",
    onClose: vi.fn(),
    onGenerated: vi.fn(),
    ...over,
  };
}

beforeAll(() => {
  render(<ReportContentsPanel {...props()} />).unmount();
}, 60_000);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Agency and up", () => {
  it("shows the header, the measured actions with their evidence and priority, and the outline", () => {
    render(<ReportContentsPanel {...props()} />);
    expect(screen.getByRole("heading", { name: "Report contents" })).toBeInTheDocument();
    expect(screen.getByTestId("p08-header")).toHaveTextContent(
      "Hero Home Services · based on audit #54 · Week 47",
    );
    const items = screen.getAllByTestId("p08-measured-item");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByTestId("p08-evidence")).toHaveTextContent(
      "Yellow Pages cited in 17 of 40 answers · audit #54",
    );
    expect(within(items[0]).getByText("High")).toBeInTheDocument();
    expect(screen.getByTestId("p08-outline")).toHaveTextContent(
      "Why, and what to do next · 3 actions",
    );
    expect(screen.queryByTestId("p08-lock")).toBeNull();
  });

  it("move down reorders and announces; a hidden action drops out of the outline count", () => {
    render(<ReportContentsPanel {...props()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Move down: Link your Yellow Pages profile" }),
    );
    expect(screen.getAllByTestId("p08-measured-item")[0]).toHaveTextContent(
      "Get mentioned in relevant Reddit threads",
    );
    expect(screen.getByText("Link your Yellow Pages profile: position 2 of 2")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("switch", { name: "Include: Link your Yellow Pages profile" }),
    );
    expect(screen.getByTestId("p08-outline")).toHaveTextContent(
      "Why, and what to do next · 2 actions",
    );
  });

  it("Save sends the choices in their order with notes; the saved feedback is inline", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ preferences: {} }));
    vi.stubGlobal("fetch", fetchImpl);
    render(<ReportContentsPanel {...props()} />);
    fireEvent.change(
      screen.getByRole("textbox", { name: "Note for your client: Link your Yellow Pages profile" }),
      {
        target: { value: "We claimed it on 18 Nov" },
      },
    );
    fireEvent.click(screen.getByTestId("p08-save"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Report contents saved."),
    );
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/brands/b1/report-preferences");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({
      includeGeneralAdvice: true,
      includeDoneSinceLast: true,
      choices: [
        { actionItemId: ITEM_A, included: true, position: 0, note: "We claimed it on 18 Nov" },
        { actionItemId: ITEM_B, included: true, position: 1, note: null },
      ],
      // S01 part 8, contract P08.footer: "Save without generating ... (with default_tier)".
      defaultTier: "enhanced",
    });
  });

  it("a failed save says so inline, in the server's words", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "choices.0.note: A note is 400 characters or fewer." },
          { status: 400 },
        ),
      ),
    );
    render(<ReportContentsPanel {...props()} />);
    fireEvent.click(screen.getByTestId("p08-save"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "choices.0.note: A note is 400 characters or fewer.",
      ),
    );
  });

  it("Generate sends the contents with the existing route's body, then closes", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ message: "Report generation started" }, { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const p = props();
    render(<ReportContentsPanel {...p} />);
    fireEvent.click(screen.getByTestId("p08-generate"));
    await waitFor(() => expect(p.onGenerated).toHaveBeenCalled());
    expect(p.onClose).toHaveBeenCalled();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/brands/b1/reports/generate");
    const body = JSON.parse(String(init.body));
    expect(body.periodType).toBe("weekly");
    expect(body.contents.choices).toHaveLength(2);
  });

  it("adds an agency action through the route and lists it with the agency label", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            action: {
              id: "a2",
              title: "Refresh the service pages",
              detail: null,
              priority: "medium",
              status: "open",
              position: null,
            },
          },
          { status: 201 },
        ),
      ),
    );
    render(<ReportContentsPanel {...props()} />);
    expect(screen.getByTestId("p08-agency")).toHaveTextContent("Recommended by Splice Marketing");
    fireEvent.click(screen.getByTestId("p08-add-action"));
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Refresh the service pages" },
    });
    fireEvent.click(
      within(screen.getByTestId("p08-agency-form")).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => expect(screen.getAllByTestId("p08-agency-item")).toHaveLength(2));
    expect(screen.getAllByText("Your recommendation")).toHaveLength(2);
  });

  it("Escape closes the panel", () => {
    const p = props();
    render(<ReportContentsPanel {...p} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(p.onClose).toHaveBeenCalled();
  });
});

describe("Growth: read-only with the Agency lock", () => {
  it("toggles, moves, notes and agency actions are disabled; Upgrade goes to /pricing; Generate works with no choices", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ message: "Report generation started" }, { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    render(
      <ReportContentsPanel
        {...props({ curated: false, whatToDoNext: { ...NEXT, agencyActions: [], curated: false } })}
      />,
    );
    expect(screen.getByTestId("p08-lock")).toHaveTextContent("Available on Agency and up");
    expect(screen.getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", "/pricing");
    expect(
      screen.getByRole("switch", { name: "Include: Link your Yellow Pages profile" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("button", { name: "Move down: Link your Yellow Pages profile" }),
    ).toBeDisabled();
    expect(screen.queryByRole("textbox", { name: /Note for your client/ })).toBeNull();
    expect(screen.getByTestId("p08-add-action")).toBeDisabled();
    fireEvent.click(screen.getByTestId("p08-generate"));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    // S01 part 8, contract P08.footer: "the existing generate route with { periodType, tier, contents }".
    expect(JSON.parse(String(init.body))).toEqual({ periodType: "weekly", tier: "enhanced" });
  });
});

describe("no measured actions", () => {
  it("says so in one sentence and still offers the agency's own", () => {
    render(<ReportContentsPanel {...props({ whatToDoNext: { ...NEXT, measured: [] } })} />);
    expect(screen.getByTestId("p08-empty")).toHaveTextContent(
      "No measured actions for this audit. You can still add your own.",
    );
    expect(screen.getByTestId("p08-add-action")).toBeEnabled();
  });
});
