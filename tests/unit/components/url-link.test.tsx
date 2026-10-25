// @vitest-environment jsdom

/**
 * Task 14 (phones) -- every raw-URL list shows a URL on one line: host
 * and path, cut off with an ellipsis, never broken every few characters.
 * The full URL stays in the href and the title; the accessible name says
 * where the link goes.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { EvidenceLink } from "@/components/domain/action-center/evidence-link";
import { displayUrl, UrlLink } from "@/components/shared/url-link";

const LONG =
  "https://www.hipages.com.au/connect/omegaservicesplumbingandgasfittingbondi/service/1234567/?utm_source=chatgpt.com";

describe("displayUrl", () => {
  it("is the host (no www.) and path -- no protocol, query or trailing slash", () => {
    expect(displayUrl(LONG)).toBe(
      "hipages.com.au/connect/omegaservicesplumbingandgasfittingbondi/service/1234567",
    );
  });

  it("a bare domain is just the host", () => {
    expect(displayUrl("https://example.com.au/")).toBe("example.com.au");
  });

  it("something that isn't a URL comes back unchanged", () => {
    expect(displayUrl("not a url")).toBe("not a url");
  });
});

describe("UrlLink", () => {
  it("one line with an ellipsis; the full URL in href and title; a 'new tab' accessible name", () => {
    render(<UrlLink url={LONG} />);
    const link = screen.getByRole("link", {
      name: "Open hipages.com.au/connect/omegaservicesplumbingandgasfittingbondi/service/1234567 in a new tab",
    });
    expect(link).toHaveAttribute("href", LONG);
    expect(link).toHaveAttribute("title", LONG);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent(
      /^hipages\.com\.au\/connect\/omegaservicesplumbingandgasfittingbondi\/service\/1234567$/,
    );
    expect(link).toHaveStyle({
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      minWidth: "0",
    });
  });

  it("a label replaces the shown text and the accessible name, never the href", () => {
    render(<UrlLink url={LONG} label="hipages.com.au/connect/omega" />);
    const link = screen.getByRole("link", {
      name: "Open hipages.com.au/connect/omega in a new tab",
    });
    expect(link).toHaveTextContent("hipages.com.au/connect/omega");
    expect(link).toHaveAttribute("href", LONG);
  });
});

describe("Action Center evidence: a checker's URL", () => {
  it("is its own one-line link under the summary, not run into the sentence", () => {
    render(
      <EvidenceLink
        evidenceRefs={[
          {
            source: "hipages",
            url: LONG,
            summary: "Cited in 3 of 39 answers.",
            sourceType: "checker",
          },
        ]}
        fallbackDescription="Check your hipages listing."
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /View evidence/ }));

    expect(screen.getByText("Cited in 3 of 39 answers.")).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: /^Open hipages\.com\.au\/connect\/.+ in a new tab$/,
    });
    expect(link).toHaveAttribute("href", LONG);
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(link).toHaveStyle({ whiteSpace: "nowrap", textOverflow: "ellipsis" });
    expect(link).not.toHaveTextContent("https://");
  });
});
