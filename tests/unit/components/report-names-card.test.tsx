// @vitest-environment jsdom
/**
 * S01 part 10 (contract P18): Report branding -> Report names.
 * - Three labelled inputs with their help; the cover preview follows what's typed (aria-live polite).
 * - Save is disabled until something changes and while a name breaks the rule (the error under that field, tied by
 *   aria-describedby); Save sends PUT /api/report-branding { reportTierNames }, inline "Report names saved.".
 * - Reset fills the defaults (still needs Save). "What each report contains" lists the names with appendix E's words.
 * - A name is text (an XSS payload is shown as typed).
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ReportNamesCard } from "@/components/domain/branding/report-names-card";
import { TIER_DESCRIPTIONS } from "@/lib/reports/report-tiers";

const DEFAULTS = { basic: "Basic", standard: "Standard", enhanced: "Enhanced" };

beforeAll(() => {
  render(<ReportNamesCard initial={DEFAULTS} />).unmount();
}, 60_000);

afterEach(() => vi.unstubAllGlobals());

describe("Report names (P18)", () => {
  it("labelled inputs, the preview follows the Enhanced name, Save waits for a change", () => {
    render(<ReportNamesCard initial={DEFAULTS} />);
    const enhanced = screen.getByLabelText("Enhanced report name");
    expect(screen.getByLabelText("Basic report name")).toHaveAccessibleDescription(
      "Default: Basic · up to 24 characters",
    );
    expect(screen.getByRole("button", { name: "Save names" })).toBeDisabled();
    fireEvent.change(enhanced, { target: { value: "Premium Audit" } });
    expect(screen.getByTestId("p18-preview")).toHaveTextContent(
      "Cover preview: PREMIUM AUDIT · Your clients see these names, not Basic, Standard or Enhanced, unless you keep them.",
    );
    expect(screen.getByTestId("p18-preview")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "Save names" })).toBeEnabled();
  });

  it("a name that breaks the rule says so under its field and Save stays off", () => {
    render(<ReportNamesCard initial={DEFAULTS} />);
    fireEvent.change(screen.getByLabelText("Standard report name"), { target: { value: "basic" } });
    const field = screen.getByLabelText("Standard report name");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(
      "Default: Standard Use 1–24 characters, different from your other report names.",
    );
    expect(screen.getByRole("button", { name: "Save names" })).toBeDisabled();
  });

  it("Save sends the names; the saved feedback is inline; the table uses the saved names", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ saved: {}, changed: ["reportTierNames"] }));
    vi.stubGlobal("fetch", fetchImpl);
    render(<ReportNamesCard initial={DEFAULTS} />);
    fireEvent.change(screen.getByLabelText("Basic report name"), {
      target: { value: " Essentials " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save names" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Report names saved."),
    );
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/report-branding");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({
      reportTierNames: { basic: " Essentials ", standard: "Standard", enhanced: "Enhanced" },
    });
    const table = screen.getByTestId("p18-contents");
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      `Essentials${TIER_DESCRIPTIONS.basic}`,
    );
  });

  it("Reset fills the defaults, still to be saved; a refused save says why", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "Only owners and admins can change report branding" },
          { status: 403 },
        ),
      ),
    );
    render(
      <ReportNamesCard
        initial={{ basic: "Essentials", standard: "Growth Plan", enhanced: "Premium Audit" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(screen.getByLabelText("Basic report name")).toHaveValue("Basic");
    fireEvent.click(screen.getByRole("button", { name: "Save names" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Only owners and admins can change report branding",
      ),
    );
  });

  it("a name is text: an XSS payload is shown as typed", () => {
    render(<ReportNamesCard initial={{ ...DEFAULTS, enhanced: "<b>Gold</b>" }} />);
    expect(screen.getByTestId("p18-contents")).toHaveTextContent("<b>Gold</b>");
    expect(document.querySelector("b")).toBeNull();
  });
});
