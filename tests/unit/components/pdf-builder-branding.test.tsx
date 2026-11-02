// @vitest-environment jsdom
/**
 * 2 Nov -- the White-Label Report Builder's "Branding" card had boxes for the
 * agency name, a logo URL, a colour and a footer contact that were never
 * saved: "Generate PDF" prints the saved branding, so whatever was typed
 * there vanished. It now shows what's saved and says where to change it, so
 * Account -> Report branding is the one place to set it. Its on-screen preview
 * follows the same rule as the export: the agency, or "Powered by Vunnara".
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import PdfBuilderPage from "@/app/(auth)/agency/reports/pdf-builder/page";

vi.mock("@/components/domain/set-breadcrumbs", () => ({ SetBreadcrumbs: () => null }));

const AUDIT = {
  id: "audit-1",
  auditNumber: 7,
  scoreComposite: "8.0",
  scoreFrequency: "8.0",
  scoreSentimentNumeric: null,
  scoreContextNumeric: null,
  mentionedCount: 3,
  rankedCount: 0,
  medianPosition: null,
  sourcedCount: 0,
  scoreConfidenceLow: null,
  scoreConfidenceHigh: null,
  completedAt: "2026-11-01T00:00:00.000Z",
  engines: [],
  visibility: { value: "8%", detail: "3 of 40" },
};

function stubApi(branding: Record<string, unknown> | null, audit: typeof AUDIT | null = null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body =
        url === "/api/agency/branding"
          ? { branding }
          : url === "/api/brands"
            ? [{ id: "b-omega", name: "Omega Services" }]
            : { audit, actionItems: [], engineStats: [], priorAudit: null };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

beforeEach(() => {
  stubApi({
    agencyName: "Splice Marketing",
    logoUrl: "/api/branding/logo/org/logo.png",
    primaryColor: "#0066CC",
    secondaryColor: "#1A1A1A",
    accentColor: "#FF6B35",
    footerText: null,
    contactLine: "02 9000 0000",
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the White-Label Report Builder's branding", () => {
  it("has nothing to type into: no agency name, logo URL, colour or contact box", async () => {
    const { container } = render(<PdfBuilderPage />);
    await screen.findByRole("heading", { name: "Branding" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(container.querySelector('input[type="color"]')).toBeNull();
  });

  it("shows what's saved and links to the one place to change it", async () => {
    render(<PdfBuilderPage />);
    await screen.findByRole("heading", { name: "Branding" });
    expect(screen.getByText("Agency name")).toBeInTheDocument();
    expect(screen.getByText("Splice Marketing")).toBeInTheDocument();
    expect(screen.getByText("02 9000 0000")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Change these in Account → Report branding" }),
    ).toHaveAttribute("href", "/settings/report-branding");
  });

  it("says plainly when nothing is saved", async () => {
    stubApi(null);
    render(<PdfBuilderPage />);
    await screen.findByRole("heading", { name: "Branding" });
    expect(screen.getAllByText("Not set")).toHaveLength(3);
  });

  it("the preview's header: 'Powered by Vunnara' when no agency name is saved, as the export prints", async () => {
    stubApi(null, AUDIT);
    render(<PdfBuilderPage />);
    expect(await screen.findByText("Powered by Vunnara")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Logo" })).toBeNull();
  });

  it("the preview's header: the saved agency and its logo", async () => {
    stubApi(
      {
        agencyName: "Splice Marketing",
        logoUrl: "/api/branding/logo/org/logo.png",
        contactLine: null,
      },
      AUDIT,
    );
    render(<PdfBuilderPage />);
    expect(await screen.findByRole("img", { name: "Logo" })).toHaveAttribute(
      "src",
      "/api/branding/logo/org/logo.png",
    );
    expect(screen.queryByText("Powered by Vunnara")).toBeNull();
  });
});
