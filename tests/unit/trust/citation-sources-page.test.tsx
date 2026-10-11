// @vitest-environment jsdom

/**
 * Task #46 (3rd follow-up), Part B: an audited engine that cited no
 * sources at all must render as a measured result ("{Engine} cited no
 * sources in {N} answers."), not be silently absent from the screen --
 * indistinguishable from an engine that was never audited at all.
 */
import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ brandId: "test-brand-id" }),
}));

import CitationSourcesPage from "@/app/(auth)/brands/[brandId]/trust/citation-sources/page";
import { NO_CITATIONS_SOURCE_TYPE } from "@/lib/trust/citation-intelligence";

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

function stubFetch(body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    engine: "claude",
    sourceType: "au_directory",
    citationCount: 3,
    citationShare: 100,
    brandPresentInSource: false,
    gapSeverity: "critical",
    sourceAffinityNote: "Directories are cited for contact details.",
    topDomains: [{ domain: "hipages.com.au", count: 3, origin: "recalled" }],
    ...overrides,
  };
}

describe("CitationSourcesPage -- engines with zero cited sources render as a neutral row, not silently", () => {
  it('renders "Gemini cited no sources in 5 answers." for a NO_CITATIONS_SOURCE_TYPE row', async () => {
    stubFetch({
      sources: [
        makeCard({
          id: "no-cit-gemini",
          engine: "gemini",
          sourceType: NO_CITATIONS_SOURCE_TYPE,
          citationCount: 5,
          citationShare: 0,
          gapSeverity: "unclassified",
          sourceAffinityNote: null,
          topDomains: [],
        }),
      ],
      citationCount: 5,
    });

    render(<CitationSourcesPage />);

    await waitFor(() => {
      expect(screen.getByText("Gemini cited no sources in 5 answers.")).toBeInTheDocument();
    });
  });

  it("uses singular 'answer' for exactly 1", async () => {
    stubFetch({
      sources: [
        makeCard({
          id: "no-cit-chatgpt",
          engine: "chatgpt",
          sourceType: NO_CITATIONS_SOURCE_TYPE,
          citationCount: 1,
          citationShare: 0,
          gapSeverity: "unclassified",
          sourceAffinityNote: null,
          topDomains: [],
        }),
      ],
      citationCount: 1,
    });

    render(<CitationSourcesPage />);

    await waitFor(() => {
      expect(screen.getByText("Chatgpt cited no sources in 1 answer.")).toBeInTheDocument();
    });
  });

  it("renders both a real category card AND the no-citations row together, not one or the other", async () => {
    stubFetch({
      sources: [
        makeCard({ id: "real-card", engine: "claude", sourceType: "au_directory", citationCount: 3 }),
        makeCard({
          id: "no-cit-gemini",
          engine: "gemini",
          sourceType: NO_CITATIONS_SOURCE_TYPE,
          citationCount: 5,
          citationShare: 0,
          gapSeverity: "unclassified",
          sourceAffinityNote: null,
          topDomains: [],
        }),
      ],
      citationCount: 8,
    });

    render(<CitationSourcesPage />);

    await waitFor(() => {
      expect(screen.getByText("au directory")).toBeInTheDocument(); // the real card's title
      expect(screen.getByText("Gemini cited no sources in 5 answers.")).toBeInTheDocument();
    });
  });

  it("the no-citations row has no badge/share -- it's plain text, not rendered via SourceGapCard", async () => {
    stubFetch({
      sources: [
        makeCard({
          id: "no-cit-gemini",
          engine: "gemini",
          sourceType: NO_CITATIONS_SOURCE_TYPE,
          citationCount: 5,
          citationShare: 0,
          gapSeverity: "unclassified",
          sourceAffinityNote: null,
          topDomains: [],
        }),
      ],
      citationCount: 5,
    });

    render(<CitationSourcesPage />);

    await waitFor(() => {
      expect(screen.getByText("Gemini cited no sources in 5 answers.")).toBeInTheDocument();
    });
    // No SourceGapCard-style badge text ("Unclassified"/"Critical gap"/etc.) for this row.
    expect(screen.queryByText("Unclassified")).not.toBeInTheDocument();
    expect(screen.queryByText("Critical gap")).not.toBeInTheDocument();
  });
});
