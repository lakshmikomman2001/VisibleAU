// @vitest-environment jsdom
/**
 * S01C part 4 (LLD amendment 63; contract v1.6 P07.beyond.crawlers, P07.beyond.technical): the audit page card's
 * "AI crawlers" and "Website technical" tiles in each state, as an invented business's results give them. The card
 * keeps its title, "Beyond AI answers" (the PDF's heading is "What else we checked about your business").
 */
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { BeyondAiCard } from "@/components/domain/audit/beyond-ai-card";
import { type BeyondAiRaw, buildBeyondAiAnswers } from "@/lib/reports/beyond-ai";

const AS_OF = new Date("2026-11-24T00:00:00Z");
const ROBOTS = {
  aiBotsAllowed: ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Googlebot"],
  aiBotsBlocked: [],
  fetchStatus: "found",
};

function raw(technical: BeyondAiRaw["technical"]): BeyondAiRaw {
  return {
    brand: { abn: null, youtubeChannelUrl: null, domain: "waratahhome.example.com.au" },
    entity: null,
    youtube: null,
    youtubeGateOn: true,
    technical,
    visits: [],
    directories: null,
  };
}

const measured = (
  dims: Record<string, string>,
  score = "40.00",
): NonNullable<BeyondAiRaw["technical"]> => ({
  scoreComposite: score,
  findings: { scoringVersion: 4, robots: ROBOTS },
  createdAt: new Date("2026-11-21T01:00:00Z"),
  dims,
});

function tile(technical: BeyondAiRaw["technical"], id: "technical" | "crawlers") {
  render(<BeyondAiCard answers={buildBeyondAiAnswers(raw(technical), AS_OF)} brandId="b-1" />);
  return screen.getByTestId(`p07-beyond-${id}`);
}

describe("P07 Beyond AI answers card, S01C copy", () => {
  it("keeps its title", () => {
    render(<BeyondAiCard answers={buildBeyondAiAnswers(raw(null), AS_OF)} brandId="b-1" />);
    expect(screen.getByRole("heading", { name: "Beyond AI answers" })).toBeInTheDocument();
  });

  it("Website technical, measured: points, the date and the weakest area in plain words", () => {
    const t = tile(
      measured({
        scoreRobots: "18.00",
        scoreSchema: "4.00",
        scoreMeta: "9.00",
        scoreContent: "5.00",
        scoreBrandEntity: "2.00",
        scoreSignals: "2.00",
      }),
      "technical",
    );
    expect(t).toHaveTextContent("40 of 74 points");
    expect(t).toHaveTextContent("checked 21 Nov 2026");
    expect(t).toHaveTextContent("Weakest: structured data, 4 of 16 points");
    expect(t).not.toHaveTextContent("v4 scoring");
    expect(t).not.toHaveTextContent("Schema");
  });

  it("Website technical, measured with no area scores stored: no weakest line", () => {
    const t = tile(measured({}), "technical");
    expect(t).toHaveTextContent("40 of 74 points");
    expect(t).not.toHaveTextContent("Weakest");
  });

  it("Website technical, never run: 'Not checked yet' and 'Run check'", () => {
    const t = tile(null, "technical");
    expect(t).toHaveTextContent("Not checked yet");
    expect(within(t).getByRole("link", { name: "Run check" })).toBeInTheDocument();
    expect(t).not.toHaveTextContent("points");
  });

  it("Website technical, a run that couldn't score: 'Not checked' with the date and why", () => {
    const t = tile({ ...measured({}), scoreComposite: null }, "technical");
    expect(t).toHaveTextContent("Not checked");
    expect(t).toHaveTextContent("Couldn't check on 21 Nov 2026");
  });

  it("AI crawlers, measured: what the figure counts", () => {
    const t = tile(measured({}), "crawlers");
    expect(t).toHaveTextContent("4 of 4 AI search crawlers allowed · checked 21 Nov 2026");
  });

  it("AI crawlers, one blocked: the count of those allowed, and the blocked one named", () => {
    const t = tile(
      {
        ...measured({}),
        findings: {
          scoringVersion: 4,
          robots: {
            ...ROBOTS,
            aiBotsAllowed: ROBOTS.aiBotsAllowed.slice(1),
            aiBotsBlocked: ["OAI-SearchBot"],
          },
        },
      },
      "crawlers",
    );
    expect(t).toHaveTextContent("3 of 4 AI search crawlers allowed");
    expect(t).toHaveTextContent("Blocked: OAI-SearchBot");
  });
});
