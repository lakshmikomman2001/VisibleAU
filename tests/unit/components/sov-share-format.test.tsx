// @vitest-environment jsdom
/**
 * Overview (7 Nov), item 3 -- the Visibility page's Share of Voice card showed its headline as "13%"
 * and the same share in its row as "12.7%". The headline and every row now go through one formatter,
 * in whole percentages as Visibility is. (One Share of Voice, 7 Nov: the card shows the shared
 * counter's payload, so the shares here arrive computed.)
 */
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { SovDonut } from "@/components/domain/visibility/sov-donut";
import type { SovPayload } from "@/lib/visibility/share-of-voice-display";

const payload: SovPayload = {
  line: {
    brandId: "b",
    brandName: "hipages",
    share: "13%",
    detail: "10 of 79 mentions",
    audit: "Audit #36, 24 Oct",
    smallSample: false,
    note: null,
  },
  measured: true,
  brandName: "hipages",
  brandMentions: 10,
  totalMentions: 79,
  sharePct: 12.7,
  smallSample: false,
  competitors: [{ name: "ServiceSeeking", mentions: 3, sharePct: 3.8 }],
  unverifiable: [],
  perEngine: [],
};

describe("Share of Voice: headline and rows in one format", () => {
  it("12.7% and 3.8% read 13% and 4%, in the headline and in the rows", () => {
    render(React.createElement(SovDonut, { sov: payload }));
    expect(screen.getByText("13%")).toBeInTheDocument();
    expect(screen.getByText("13% · 10")).toBeInTheDocument();
    expect(screen.getByText("4% · 3")).toBeInTheDocument();
    expect(screen.queryByText(/\d\.\d%/)).toBeNull();
  });
});
