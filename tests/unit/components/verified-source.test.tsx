// @vitest-environment jsdom

/**
 * ⚠️ RRR — the first shared "evidence link" component in the codebase
 * (confirmed via PPP: nothing like it existed). Every Brand & Entity
 * signal genuinely queries a real source; this is what turns a bare
 * verdict into a checkable claim -- a real external link when there's a
 * URL to check, honest inert text when there isn't (never a link to
 * nowhere, never an overclaiming "Verified" label on an unconfirmed URL).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { VerifiedSource } from "@/components/domain/brand-entity/verified-source";

describe("⚠️ RRR — VerifiedSource", () => {
  it("renders a real external link when url is set, with the default 'Verified against {source}' label", () => {
    render(<VerifiedSource source="Australian Business Register" url="https://abr.business.gov.au/ABN/View?abn=123" />);
    const link = screen.getByRole("link", { name: /Verified against Australian Business Register/ });
    expect(link).toHaveAttribute("href", "https://abr.business.gov.au/ABN/View?abn=123");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders plain, non-clickable text when url is null, with the default 'Checked against {source}' fallback", () => {
    render(<VerifiedSource source="Wikipedia" url={null} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Checked against Wikipedia")).toBeInTheDocument();
  });

  it("an explicit label overrides the default link text (e.g. for an unconfirmed-but-linkable result)", () => {
    render(
      <VerifiedSource
        source="Australian Business Register"
        url="https://abr.business.gov.au/ABN/View?abn=123"
        label="View the ABR record"
      />,
    );
    expect(screen.getByRole("link", { name: "View the ABR record" })).toBeInTheDocument();
    expect(screen.queryByText(/Verified against/)).toBeNull();
  });

  it("an explicit fallbackLabel overrides the default no-url text", () => {
    render(<VerifiedSource source="Wikipedia" url={null} fallbackLabel="Checked Wikipedia — no Australian page found" />);
    expect(screen.getByText("Checked Wikipedia — no Australian page found")).toBeInTheDocument();
  });
});
