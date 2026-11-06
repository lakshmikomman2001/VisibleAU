// @vitest-environment jsdom
/**
 * Overview (7 Nov), item 3 -- the Visibility page's Share of Voice card showed its headline as "13%"
 * and the same share in its row as "12.7%". The headline and every row now go through one formatter,
 * in whole percentages as Visibility is.
 */
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { SovDonut } from "@/components/domain/visibility/sov-donut";

describe("Share of Voice: headline and rows in one format", () => {
  it("12.7% and 3.8% read 13% and 4%, in the headline and in the rows", () => {
    render(
      React.createElement(SovDonut, {
        entries: [
          {
            competitorDomain: "serviceseeking.com.au",
            brandShare: 12.7,
            competitorShare: 3.8,
            engine: "chatgpt",
          },
        ],
        brandDomain: "hipages.com.au",
      }),
    );
    // The headline and the brand's own row.
    expect(screen.getAllByText("13%")).toHaveLength(2);
    expect(screen.getByText("4%")).toBeInTheDocument();
    expect(screen.queryByText(/\d\.\d%/)).toBeNull();
  });
});
