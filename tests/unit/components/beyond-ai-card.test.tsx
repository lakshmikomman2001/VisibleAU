// @vitest-environment jsdom
/**
 * S01 part 6 (contract P07.beyond): the audit page's "Beyond AI answers" card -- four tiles in order with test ids,
 * each read as "{label}: {value}, {detail}"; a stale line in the warning colour; action links; no tile shows a 0.
 */
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { BeyondAiCard } from "@/components/domain/audit/beyond-ai-card";
import { type BeyondAiRaw, buildBeyondAiAnswers } from "@/lib/reports/beyond-ai";

const AS_OF = new Date("2026-11-24T00:00:00Z");

function answers(overrides: Partial<BeyondAiRaw> = {}) {
  return buildBeyondAiAnswers(
    {
      brand: { abn: "17701710947", youtubeChannelUrl: null, domain: "techcoreit.com.au" },
      entity: {
        abnVerified: true,
        abnNumber: "17701710947",
        abnEntityName: "ASTORIO GROUP PTY LTD",
        abnStatus: "Active",
        wikipediaAuPresent: false,
        auTldDomains: ["techcoreit.com.au"],
        checkedAt: new Date("2026-10-10T00:00:00Z"),
      },
      youtube: null,
      youtubeGateOn: true,
      technical: {
        scoreComposite: "38.00",
        findings: {
          scoringVersion: 4,
          robots: {
            aiBotsAllowed: ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Googlebot"],
            aiBotsBlocked: [],
            fetchStatus: "found",
          },
        },
        createdAt: new Date("2026-11-22T01:00:00Z"),
        dims: { scoreSchema: "2.00", scoreMeta: "6.00" },
      },
      visits: [],
      directories: null,
      ...overrides,
    },
    AS_OF,
  );
}

describe("BeyondAiCard", () => {
  it("title, subtitle and four tiles in contract order", () => {
    render(<BeyondAiCard answers={answers()} brandId="b-1" />);
    const card = screen.getByTestId("p07-beyond");
    expect(within(card).getByRole("heading", { name: "Beyond AI answers" })).toBeInTheDocument();
    expect(card).toHaveTextContent("Separate from the Visibility score");
    expect(
      within(card)
        .getAllByRole("listitem")
        .map((li) => li.getAttribute("data-testid")),
    ).toEqual([
      "p07-beyond-identity",
      "p07-beyond-youtube",
      "p07-beyond-crawlers",
      "p07-beyond-technical",
    ]);
  });

  it("columns: 1, then 2 from 641 px, 4 from 1100 px -- no named breakpoint that would override the 4", () => {
    render(<BeyondAiCard answers={answers()} brandId="b-1" />);
    const classes = screen.getByTestId("p07-beyond-tiles").className.split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining([
        "grid-cols-1",
        "min-[641px]:grid-cols-2",
        "min-[1100px]:grid-cols-4",
      ]),
    );
    expect(classes.filter((c) => /^(sm|md|lg|xl):/.test(c))).toEqual([]);
  });

  it("each tile reads as label: value, detail", () => {
    render(<BeyondAiCard answers={answers()} brandId="b-1" />);
    expect(screen.getByTestId("p07-beyond-technical")).toHaveAttribute(
      "aria-label",
      // S01C part 4, LLD amendment 63: points, the date, the weakest area; the scoring version is on the PDF's Method.
      "Website technical: 38 of 74 points, checked 22 Nov 2026, Weakest: structured data, 2 of 16 points",
    );
    expect(screen.getByTestId("p07-beyond-youtube")).toHaveAttribute(
      "aria-label",
      "YouTube: No channel linked, Add your channel",
    );
  });

  it("a stale result's line is in the warning colour", () => {
    render(<BeyondAiCard answers={answers()} brandId="b-1" />);
    const stale = within(screen.getByTestId("p07-beyond-identity")).getByText(
      "Last checked 10 Oct 2026, may be out of date",
    );
    expect(stale).toHaveAttribute("data-tone", "warn");
    expect(stale).toHaveStyle({ color: "var(--warning)" });
  });

  it("not checked tiles link to where the check is set up, and never show a 0", () => {
    render(
      <BeyondAiCard
        answers={answers({
          technical: null,
          entity: null,
          brand: { abn: null, youtubeChannelUrl: null, domain: "x.com" },
        })}
        brandId="b-1"
      />,
    );
    expect(
      within(screen.getByTestId("p07-beyond-identity")).getByRole("link", { name: "Add your ABN" }),
    ).toHaveAttribute("href", "/brands/b-1");
    expect(
      within(screen.getByTestId("p07-beyond-technical")).getByRole("link", { name: "Run check" }),
    ).toHaveAttribute("href", "/brands/b-1/technical-audit");
    expect(screen.getByTestId("p07-beyond-technical")).not.toHaveTextContent(/\b0\b/);
  });
});
