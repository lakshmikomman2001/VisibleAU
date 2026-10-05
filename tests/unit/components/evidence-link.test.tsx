// @vitest-environment jsdom

/**
 * ⚠️ XXX — Action Center's Evidence Link rendered `ref.source` and
 * `ref.summary` directly and unconditionally, with no provenance gate
 * (unlike /methods after task VVV). Because evidenceRefs is baked onto
 * action_items.evidence_refs at generation time and never re-joined, any
 * ref built before sourceType existed (every row frozen pre-UUU) has NO
 * sourceType field at all -- that missing-field case is the one that
 * matters most: it's what makes an already-frozen fabricated ref (e.g.
 * the pre-UUU "SE Ranking Dec 2025" / "4.9 vs 4.4" text) render honestly
 * the moment this component deploys, with zero database change.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { EvidenceLink } from "@/components/domain/action-center/evidence-link";

const FALLBACK = "Add FAQ blocks to your main service page content.";

describe("⚠️ XXX — EvidenceLink: provenance-gated rendering", () => {
  it("a frozen-style ref with NO sourceType (every pre-XXX row) renders the neutral label and the fallback description -- never the raw frozen source/summary", () => {
    render(
      <EvidenceLink
        evidenceRefs={[
          {
            source: "SE Ranking Dec 2025",
            url: "https://seranking.com/blog/ai-overviews-study/",
            summary: "FAQ blocks average 4.9 AI citations vs 4.4 without.",
          },
        ]}
        fallbackDescription={FALLBACK}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /View research/ }));

    expect(screen.queryByText("SE Ranking Dec 2025")).toBeNull();
    expect(screen.queryByText(/4\.9 AI citations vs 4\.4/)).toBeNull();
    expect(screen.queryByRole("link", { name: /SE Ranking/ })).toBeNull();
    expect(screen.getByText("Vunnara estimate")).toBeInTheDocument();
    expect(screen.getByText(FALLBACK)).toBeInTheDocument();
  });

  it("an explicit vunnara_estimate ref (post-XXX, honestly labelled) renders the same neutral way", () => {
    render(
      <EvidenceLink
        evidenceRefs={[
          { source: "VisibleAU Original", url: "", summary: "Some internal note.", sourceType: "vunnara_estimate" },
        ]}
        fallbackDescription={FALLBACK}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /View research/ }));

    expect(screen.queryByText("Some internal note.")).toBeNull();
    expect(screen.getByText("Vunnara estimate")).toBeInTheDocument();
    expect(screen.getByText(FALLBACK)).toBeInTheDocument();
  });

  it("a genuine research ref (sourceType research + a real url) renders the linked VerifiedSource and its real summary", () => {
    render(
      <EvidenceLink
        evidenceRefs={[
          {
            source: "Aggarwal et al., GEO (Princeton, KDD 2024)",
            url: "https://arxiv.org/abs/2311.09735",
            summary: "One of three top-performing GEO methods (+30-40% GEO-bench).",
            sourceType: "research",
          },
        ]}
        fallbackDescription={FALLBACK}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /View research/ }));

    const link = screen.getByRole("link", { name: /Research: Aggarwal et al\./ });
    expect(link).toHaveAttribute("href", "https://arxiv.org/abs/2311.09735");
    expect(screen.getByText(/top-performing GEO methods/)).toBeInTheDocument();
    expect(screen.queryByText("Vunnara estimate")).toBeNull();
    expect(screen.queryByText(FALLBACK)).toBeNull();
  });

  it("sourceType: research but a missing url still falls through to neutral (never a link to nowhere)", () => {
    render(
      <EvidenceLink
        evidenceRefs={[
          { source: "Aggarwal et al., GEO (Princeton, KDD 2024)", url: "", summary: "Should not show.", sourceType: "research" },
        ]}
        fallbackDescription={FALLBACK}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /View research/ }));

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Vunnara estimate")).toBeInTheDocument();
    expect(screen.getByText(FALLBACK)).toBeInTheDocument();
  });

  it("no evidenceRefs -> renders nothing", () => {
    const { container } = render(<EvidenceLink evidenceRefs={[]} fallbackDescription={FALLBACK} />);
    expect(container).toBeEmptyDOMElement();
  });
});
