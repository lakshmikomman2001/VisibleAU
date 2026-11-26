// @vitest-environment jsdom
/**
 * S01 part 8 (contract P08.tier, P08.basicNote, P08.outline, P08.footer, P08.states.loading and overLimit; LLD 8.1.7):
 * the report contents panel with its report type.
 * - Opens on the tier it's given (the brand's last, else the plan's highest), with focus on that card.
 * - The left column and the outline follow the tier: Basic shows one help line and today's pages ("Why your score is
 *   what it is"); Standard "Why, and what to do next · {n} actions"; Enhanced also "Beyond AI answers".
 * - "Generate {tierName} report" sends { periodType, tier, contents } (no contents for Basic, or below Agency); Save
 *   without generating saves the tier as the default.
 * - 402 report_tier_not_in_plan: the server's words inline, and the picker falls back to the highest allowed tier.
 * - The Reports page (report_v2 on) opens the panel at once with its skeleton while the view loads; the page's button
 *   never shows "Generating..." for that.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ReportContentsPanel,
  ReportContentsPanelLoading,
  type ReportContentsPanelProps,
} from "@/components/domain/reports/report-contents-panel";
import { ReportV2Provider } from "@/components/domain/reports/report-v2-context";
import { RoleProvider } from "@/components/domain/role-context";
import type { WhatToDoNext } from "@/lib/reports/report-contents";
import type { TierOption } from "@/lib/reports/report-tier-choice";
import { TIER_DESCRIPTIONS } from "@/lib/reports/report-tiers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ brandId: "brand-1" }),
  usePathname: () => "/brands/brand-1/reports",
}));

import ReportsListPage from "@/app/(auth)/brands/[brandId]/reports/page";

const ITEM = "11111111-1111-4111-8111-111111111111";
const OWNER = "owner" as const;
const NEXT: WhatToDoNext = {
  measured: [
    {
      key: ITEM,
      actionItemId: ITEM,
      title: "Link your Yellow Pages profile",
      evidence: "Yellow Pages cited in 17 of 40 answers · audit #54",
      priority: "high",
      status: "open",
      included: true,
      note: null,
    },
  ],
  agencyActions: [],
  doneSinceLast: [],
  generalAdvice: [],
  includeGeneralAdvice: true,
  includeDoneSinceLast: true,
  curated: true,
};

const option = (tier: TierOption["tier"], name: string, lockedPlan: string | null = null) => ({
  tier,
  name,
  description: TIER_DESCRIPTIONS[tier],
  lockedPlan,
});
const AGENCY = [
  option("basic", "Basic"),
  option("standard", "Standard"),
  option("enhanced", "Enhanced"),
];
const GROWTH = [
  option("basic", "Basic"),
  option("standard", "Standard"),
  option("enhanced", "Enhanced", "Agency"),
];

function props(over: Partial<ReportContentsPanelProps> = {}): ReportContentsPanelProps {
  return {
    brandId: "b1",
    brandName: "Wren Home Services",
    basisAuditNumber: 54,
    periodLabel: "2026-W47",
    agencyName: "Possum Marketing",
    curated: true,
    whatToDoNext: NEXT,
    tierOptions: AGENCY,
    initialTier: "enhanced",
    onClose: vi.fn(),
    onGenerated: vi.fn(),
    ...over,
  };
}

const outline = () => screen.getByTestId("p08-outline");
const lastBody = (f: ReturnType<typeof vi.fn>) =>
  JSON.parse(String((f.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body));

beforeAll(() => {
  render(<ReportContentsPanel {...props()} />).unmount();
}, 60_000);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the tier decides the panel and the outline", () => {
  it("opens on the tier given, focused, with Enhanced's outline and button", () => {
    render(<ReportContentsPanel {...props()} />);
    const enhanced = screen.getByRole("radio", { name: "Enhanced" });
    expect(enhanced).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toBe(enhanced);
    expect(outline()).toHaveTextContent("Report outline · Enhanced");
    expect(outline()).toHaveTextContent("Why, and what to do next · 1 actions");
    expect(outline()).toHaveTextContent("Beyond AI answers");
    expect(screen.getByTestId("p08-generate")).toHaveTextContent("Generate Enhanced report");
  });

  it("Basic: one help line instead of the lists, today's pages in the outline", () => {
    render(<ReportContentsPanel {...props()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Basic" }));
    expect(screen.getByTestId("p08-basic-note")).toHaveTextContent(
      "A Basic report has today's report pages, including why the score is what it is. Choose Standard to add an action plan.",
    );
    expect(screen.queryByTestId("p08-measured")).toBeNull();
    expect(screen.queryByTestId("p08-agency")).toBeNull();
    expect(screen.queryByTestId("p08-sections")).toBeNull();
    expect(outline()).toHaveTextContent("Why your score is what it is");
    expect(outline()).not.toHaveTextContent("Why, and what to do next");
    expect(outline()).not.toHaveTextContent("Beyond AI answers");
    expect(screen.getByTestId("p08-generate")).toHaveTextContent("Generate Basic report");
  });

  it("Standard: the action plan and no Beyond AI answers", () => {
    render(<ReportContentsPanel {...props()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Standard" }));
    expect(screen.getByTestId("p08-measured")).toBeInTheDocument();
    expect(outline()).toHaveTextContent("Why, and what to do next · 1 actions");
    expect(outline()).not.toHaveTextContent("Beyond AI answers");
  });

  it("an agency's own names in the outline and the button", () => {
    render(
      <ReportContentsPanel
        {...props({
          tierOptions: [
            option("basic", "Essentials"),
            option("standard", "Growth Plan"),
            option("enhanced", "Premium Audit"),
          ],
        })}
      />,
    );
    expect(outline()).toHaveTextContent("Report outline · Premium Audit");
    expect(screen.getByTestId("p08-generate")).toHaveTextContent("Generate Premium Audit report");
    fireEvent.click(screen.getByRole("radio", { name: "Essentials" }));
    expect(screen.getByTestId("p08-basic-note")).toHaveTextContent(
      "Choose Growth Plan to add an action plan.",
    );
  });

  it("the Basic note's second sentence only when Standard is in the plan", () => {
    render(
      <ReportContentsPanel
        {...props({
          initialTier: "basic",
          tierOptions: [
            option("basic", "Basic"),
            option("standard", "Standard", "Growth"),
            option("enhanced", "Enhanced", "Agency"),
          ],
        })}
      />,
    );
    expect(screen.getByTestId("p08-basic-note")).toHaveTextContent(
      "A Basic report has today's report pages, including why the score is what it is.",
    );
    expect(screen.getByTestId("p08-basic-note")).not.toHaveTextContent("Choose");
  });
});

describe("what the buttons send", () => {
  it("Generate sends the tier and the contents (Standard); Basic sends no contents", async () => {
    const fetchImpl = vi.fn(async () => Response.json({}, { status: 202 }));
    vi.stubGlobal("fetch", fetchImpl);
    const p = props();
    const { unmount } = render(<ReportContentsPanel {...p} />);
    fireEvent.click(screen.getByRole("radio", { name: "Standard" }));
    fireEvent.click(screen.getByTestId("p08-generate"));
    await waitFor(() => expect(p.onGenerated).toHaveBeenCalled());
    const body = lastBody(fetchImpl);
    expect(body).toMatchObject({ periodType: "weekly", tier: "standard" });
    expect(body.contents.choices).toHaveLength(1);
    unmount();

    const q = props();
    render(<ReportContentsPanel {...q} />);
    fireEvent.click(screen.getByRole("radio", { name: "Basic" }));
    fireEvent.click(screen.getByTestId("p08-generate"));
    await waitFor(() => expect(q.onGenerated).toHaveBeenCalled());
    expect(lastBody(fetchImpl)).toEqual({ periodType: "weekly", tier: "basic" });
  });

  it("Save without generating saves the tier as the brand's default", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ preferences: {} }));
    vi.stubGlobal("fetch", fetchImpl);
    render(<ReportContentsPanel {...props()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Basic" }));
    fireEvent.click(screen.getByTestId("p08-save"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Report contents saved."),
    );
    expect(lastBody(fetchImpl)).toEqual({ defaultTier: "basic" });
  });

  it("Growth: Enhanced locked, Standard by default; Generate sends the tier and no contents", async () => {
    const fetchImpl = vi.fn(async () => Response.json({}, { status: 202 }));
    vi.stubGlobal("fetch", fetchImpl);
    const p = props({
      curated: false,
      tierOptions: GROWTH,
      initialTier: "standard",
      whatToDoNext: { ...NEXT, curated: false },
    });
    render(<ReportContentsPanel {...p} />);
    expect(
      screen.getByRole("radio", { name: "Enhanced, available on Agency and up" }),
    ).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByTestId("p08-generate"));
    await waitFor(() => expect(p.onGenerated).toHaveBeenCalled());
    expect(lastBody(fetchImpl)).toEqual({ periodType: "weekly", tier: "standard" });
  });

  it("402 report_tier_not_in_plan: the server's words inline; the picker falls back and locks what's above", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: "Your plan now includes reports up to Standard. Choose another report type.",
            code: "report_tier_not_in_plan",
            maxTier: "standard",
          },
          { status: 402 },
        ),
      ),
    );
    const p = props();
    render(<ReportContentsPanel {...p} />);
    fireEvent.click(screen.getByTestId("p08-generate"));
    await waitFor(() =>
      expect(screen.getByTestId("p08-over-limit")).toHaveTextContent(
        "Your plan now includes reports up to Standard. Choose another report type.",
      ),
    );
    expect(p.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Standard" })).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: "Enhanced, available on Agency and up" }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});

describe("loading (P08.states.loading)", () => {
  it("the skeleton: a dialog with three tier cards and rows, busy, that closes", () => {
    const onClose = vi.fn();
    render(<ReportContentsPanelLoading onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Report contents" });
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(within(dialog).getAllByTestId("p08-skeleton-tier")).toHaveLength(3);
    expect(within(dialog).getAllByTestId("p08-skeleton-row").length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("the Reports page (report_v2 on) opens the panel at once, then fills it; its button never says Generating", async () => {
    const gate: { release: (() => void) | null } = { release: null };
    const view = {
      enabled: true,
      curated: true,
      tier: "agency",
      brandName: "Wren Home Services",
      periodLabel: "2026-W47",
      basis: { auditId: "a1", auditNumber: 54 },
      whatToDoNext: NEXT,
      preferences: {
        includeGeneralAdvice: true,
        includeDoneSinceLast: true,
        defaultTier: null,
        choices: [],
      },
      agencyName: "Possum Marketing",
      tiers: AGENCY,
      defaultTier: "enhanced",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/report-preferences"))
          return new Promise<Response>((resolve) => {
            gate.release = () => resolve(Response.json(view));
          });
        if (url.startsWith("/api/report-branding")) return Response.json({ agencyName: "" });
        return Response.json([]);
      }),
    );
    render(
      <RoleProvider role={OWNER}>
        <ReportV2Provider on>
          <ReportsListPage />
        </ReportV2Provider>
      </RoleProvider>,
    );
    const button = await screen.findByRole(
      "button",
      { name: "Generate report" },
      { timeout: 30_000 },
    );
    fireEvent.click(button);
    expect(await screen.findByTestId("p08-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("generate-report")).toHaveTextContent("Generate report");
    expect(screen.getByTestId("generate-report")).not.toHaveTextContent("Generating");
    await waitFor(() => expect(gate.release).not.toBeNull());
    gate.release?.();
    expect(await screen.findByTestId("p08-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("p08-skeleton")).toBeNull();
    expect(screen.getByRole("radio", { name: "Enhanced" })).toHaveAttribute("aria-checked", "true");
  }, 60_000);
});
