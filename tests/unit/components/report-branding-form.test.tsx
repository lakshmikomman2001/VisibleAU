// @vitest-environment jsdom
/**
 * 2 Nov -- Settings -> Report branding's form: the workspace's agency name,
 * logo, footer text and contact line, a per-brand override where only the
 * filled-in fields replace the workspace's, and a preview of the report's
 * own cover top bar and footer that follows what's typed.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  ReportBrandingForm,
  type WorkspaceBrandingValues,
} from "@/components/domain/branding/report-branding-form";

const WORKSPACE: WorkspaceBrandingValues = {
  agencyName: "Splice Marketing",
  logoUrl: null,
  footerText: "",
  contactLine: "02 9000 0000",
  primaryColor: "#0066CC",
  secondaryColor: "#1A1A1A",
  accentColor: "#FF6B35",
};
const BRANDS = [
  { id: "b-omega", name: "Omega Services" },
  { id: "b-sigma", name: "Sigma Plumbing" },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "DELETE")
      return new Response(JSON.stringify({ removed: 1 }), { status: 200 });
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ saved: body, changed: ["agencyName"] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function preview(): HTMLIFrameElement {
  return screen.getByTitle(
    "Preview of the report cover's top bar and page footer",
  ) as HTMLIFrameElement;
}

function lastBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return JSON.parse(String(call[1].body));
}

describe("the workspace's branding", () => {
  it("shows what's saved, labelled, and previews the report's own top bar and footer with it", () => {
    render(<ReportBrandingForm workspace={WORKSPACE} overrides={{}} brands={BRANDS} />);
    expect(screen.getByLabelText("Agency name")).toHaveValue("Splice Marketing");
    expect(screen.getByLabelText("Footer text")).toHaveAttribute("placeholder", "Confidential");
    expect(screen.getByLabelText("Contact line")).toHaveValue("02 9000 0000");
    expect(
      screen.getByRole("button", { name: "Upload a logo for your agency" }),
    ).toBeInTheDocument();
    const src = new URL(preview().src, "http://localhost");
    expect(src.pathname).toBe("/api/report-branding/preview");
    expect(src.searchParams.get("agencyName")).toBe("Splice Marketing");
    expect(src.searchParams.get("contactLine")).toBe("02 9000 0000");
    expect(src.searchParams.get("brandName")).toBe("Omega Services");
  });

  it("the preview follows what's typed", async () => {
    render(<ReportBrandingForm workspace={WORKSPACE} overrides={{}} brands={BRANDS} />);
    await userEvent.type(screen.getByLabelText("Agency name"), " Pty Ltd");
    await waitFor(() =>
      expect(new URL(preview().src, "http://localhost").searchParams.get("agencyName")).toBe(
        "Splice Marketing Pty Ltd",
      ),
    );
  });

  it("Save sends it, colours included, and says so", async () => {
    render(<ReportBrandingForm workspace={WORKSPACE} overrides={{}} brands={BRANDS} />);
    await userEvent.type(screen.getByLabelText("Footer text"), "Commercial in confidence");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Saved. Reports generated from now on use it.",
      ),
    );
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/report-branding");
    expect(lastBody()).toEqual({
      brandId: null,
      agencyName: "Splice Marketing",
      logoUrl: null,
      footerText: "Commercial in confidence",
      contactLine: "02 9000 0000",
      primaryColor: "#0066CC",
      secondaryColor: "#1A1A1A",
      accentColor: "#FF6B35",
    });
  });

  it("without an agency name, says the cover shows only 'Powered by Vunnara'", () => {
    render(
      <ReportBrandingForm
        workspace={{ ...WORKSPACE, agencyName: "" }}
        overrides={{}}
        brands={BRANDS}
      />,
    );
    expect(
      screen.getByText('No agency name yet: the cover shows only "Powered by Vunnara".'),
    ).toBeInTheDocument();
  });

  it("a refusal shows the server's reason", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Only owners and admins can change report branding" }), {
        status: 403,
      }),
    );
    render(<ReportBrandingForm workspace={WORKSPACE} overrides={{}} brands={BRANDS} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Only owners and admins can change report branding",
      ),
    );
  });
});

describe("a brand's own branding", () => {
  it("only the fields filled in; the rest show the workspace's and are sent empty; no colours", async () => {
    render(<ReportBrandingForm workspace={WORKSPACE} overrides={{}} brands={BRANDS} />);
    await userEvent.selectOptions(screen.getByLabelText("Branding for"), "b-sigma");
    const name = screen.getByLabelText("Agency name");
    expect(name).toHaveValue("");
    expect(name).toHaveAttribute("placeholder", "Splice Marketing");
    expect(screen.queryByText("Client portal colours")).toBeNull();
    // The preview prints what Sigma's reports would: the workspace's values.
    await waitFor(() => {
      const shown = new URL(preview().src, "http://localhost").searchParams;
      expect(shown.get("brandName")).toBe("Sigma Plumbing");
      expect(shown.get("agencyName")).toBe("Splice Marketing");
    });

    await userEvent.type(name, "Splice Digital");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved."));
    expect(lastBody()).toEqual({
      brandId: "b-sigma",
      agencyName: "Splice Digital",
      logoUrl: null,
      footerText: "",
      contactLine: "",
    });
    expect(
      screen.getByRole("option", { name: "Sigma Plumbing (its own branding)" }),
    ).toBeInTheDocument();
  });

  it("can be removed: the brand goes back to the workspace's branding", async () => {
    render(
      <ReportBrandingForm
        workspace={WORKSPACE}
        overrides={{
          "b-sigma": {
            agencyName: "Splice Digital",
            logoUrl: null,
            footerText: "",
            contactLine: "",
          },
        }}
        brands={BRANDS}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText("Branding for"), "b-sigma");
    await userEvent.click(
      screen.getByRole("button", { name: "Use the workspace branding for this brand" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Sigma Plumbing now uses the workspace branding.",
      ),
    );
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/report-branding?brandId=b-sigma");
    expect((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).method).toBe("DELETE");
    expect(screen.getByLabelText("Agency name")).toHaveValue("");
  });

  it("emptied and saved, it isn't called the brand's own branding any more", async () => {
    render(
      <ReportBrandingForm
        workspace={WORKSPACE}
        overrides={{
          "b-sigma": {
            agencyName: "Splice Digital",
            logoUrl: null,
            footerText: "",
            contactLine: "",
          },
        }}
        brands={BRANDS}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText("Branding for"), "b-sigma");
    await userEvent.clear(screen.getByLabelText("Agency name"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Sigma Plumbing now uses the workspace branding.",
      ),
    );
    expect(screen.getByRole("option", { name: "Sigma Plumbing" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Sigma Plumbing (its own branding)" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Use the workspace branding for this brand" }),
    ).toBeNull();
  });
});

describe("the agency name's placeholder", () => {
  it("is never another company's name: a plain prompt until the workspace has its own", async () => {
    render(
      <ReportBrandingForm
        workspace={{ ...WORKSPACE, agencyName: "" }}
        overrides={{}}
        brands={BRANDS}
      />,
    );
    const name = screen.getByLabelText("Agency name");
    expect(name).toHaveAttribute("placeholder", "Your agency's name");
    await userEvent.selectOptions(screen.getByLabelText("Branding for"), "b-sigma");
    expect(screen.getByLabelText("Agency name")).toHaveAttribute(
      "placeholder",
      "Your agency's name",
    );
  });
});
