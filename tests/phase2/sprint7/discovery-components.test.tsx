// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// ═══════════════════════════════════════════════════════════════
// 1 — JourneyFlowChart (turn → prompt → intent sequence)
// ═══════════════════════════════════════════════════════════════

describe("JourneyFlowChart", () => {
  async function renderChart(props: {
    turns: Array<{ turn: number; prompt: string; intent?: string }>;
    brandName?: string;
  }) {
    const { JourneyFlowChart } = await import(
      "@/components/domain/discovery/journey-flow-chart"
    );
    return render(React.createElement(JourneyFlowChart, props));
  }

  it("renders each turn number, prompt, and intent label", async () => {
    await renderChart({
      turns: [
        { turn: 1, prompt: "Best plumber in Sydney?", intent: "awareness" },
        { turn: 2, prompt: "Compare them vs others", intent: "consideration" },
        { turn: 3, prompt: "Should I book them?", intent: "decision" },
      ],
    });

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Best plumber in Sydney?")).toBeInTheDocument();
    expect(screen.getByText("Compare them vs others")).toBeInTheDocument();
    expect(screen.getByText("Should I book them?")).toBeInTheDocument();
    expect(screen.getByText("awareness")).toBeInTheDocument();
    expect(screen.getByText("consideration")).toBeInTheDocument();
    expect(screen.getByText("decision")).toBeInTheDocument();
  });

  it("substitutes {brandName} in prompts when provided", async () => {
    await renderChart({
      turns: [{ turn: 1, prompt: "Who is {brandName}?", intent: "awareness" }],
      brandName: "VisibleAU",
    });

    expect(screen.getByText("Who is VisibleAU?")).toBeInTheDocument();
    expect(screen.queryByText("{brandName}")).not.toBeInTheDocument();
  });

  it("renders empty when turns array is empty", async () => {
    const { container } = await renderChart({ turns: [] });
    expect(container.firstChild).toBeInTheDocument();
    expect(container.textContent).toBe("");
  });

  it("renders a single turn without a connector line", async () => {
    await renderChart({
      turns: [{ turn: 1, prompt: "Only one turn", intent: "awareness" }],
    });
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Only one turn")).toBeInTheDocument();
  });

  it("omits intent badge when intent is undefined", async () => {
    await renderChart({
      turns: [{ turn: 1, prompt: "No intent here" }],
    });
    expect(screen.getByText("No intent here")).toBeInTheDocument();
    expect(screen.queryByText("awareness")).not.toBeInTheDocument();
    expect(screen.queryByText("consideration")).not.toBeInTheDocument();
    expect(screen.queryByText("decision")).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// 2 — JourneyResultCard (journey_score + per-turn mention)
// ═══════════════════════════════════════════════════════════════

describe("JourneyResultCard", () => {
  async function renderCard(props: {
    journeyName: string;
    engine: string;
    journeyScore: number | null;
    firstMentionTurn: number | null;
    turnResults: Array<{ turn: number; brandMentioned: boolean }>;
  }) {
    const { JourneyResultCard } = await import(
      "@/components/domain/discovery/journey-result-card"
    );
    return render(React.createElement(JourneyResultCard, props));
  }

  it("renders the score as integer (70.0 → '70', not '0.70' or '7')", async () => {
    await renderCard({
      journeyName: "Tradies awareness",
      engine: "chatgpt",
      journeyScore: 70.0,
      firstMentionTurn: 1,
      turnResults: [
        { turn: 1, brandMentioned: true },
        { turn: 2, brandMentioned: false },
        { turn: 3, brandMentioned: true },
      ],
    });

    expect(screen.getByText("70")).toBeInTheDocument();
    expect(screen.getByText("/ 100")).toBeInTheDocument();
    expect(screen.queryByText("0.70")).not.toBeInTheDocument();
    expect(screen.queryByText("7")).not.toBeInTheDocument();
  });

  it("shows journey name and engine", async () => {
    await renderCard({
      journeyName: "Allied health path",
      engine: "gemini",
      journeyScore: 45,
      firstMentionTurn: 2,
      turnResults: [{ turn: 1, brandMentioned: false }],
    });

    expect(screen.getByText("Allied health path")).toBeInTheDocument();
    expect(screen.getByText("gemini")).toBeInTheDocument();
  });

  it("renders first-mention turn when provided", async () => {
    await renderCard({
      journeyName: "Test",
      engine: "claude",
      journeyScore: 80,
      firstMentionTurn: 2,
      turnResults: [
        { turn: 1, brandMentioned: false },
        { turn: 2, brandMentioned: true },
      ],
    });

    expect(screen.getByText("First mention: turn 2")).toBeInTheDocument();
  });

  it("does not show first-mention when null", async () => {
    await renderCard({
      journeyName: "Test",
      engine: "perplexity",
      journeyScore: 0,
      firstMentionTurn: null,
      turnResults: [{ turn: 1, brandMentioned: false }],
    });

    expect(screen.queryByText(/First mention/)).not.toBeInTheDocument();
  });

  it("renders score as 0 when journeyScore is null", async () => {
    await renderCard({
      journeyName: "Pending",
      engine: "chatgpt",
      journeyScore: null,
      firstMentionTurn: null,
      turnResults: [],
    });

    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// 3 — ComparisonVerdictCard (brand_won: true/false/null)
// THE important one: nullable brand_won → INCONCLUSIVE neutral card
// ═══════════════════════════════════════════════════════════════

describe("ComparisonVerdictCard", () => {
  async function renderVerdict(props: {
    competitorDomain: string;
    engine: string;
    brandWon: boolean | null;
    brandMentioned: boolean;
    competitorMentioned: boolean;
  }) {
    const { ComparisonVerdictCard } = await import(
      "@/components/domain/discovery/comparison-verdict-card"
    );
    return render(React.createElement(ComparisonVerdictCard, props));
  }

  it("brand_won=true renders 'Won' verdict", async () => {
    await renderVerdict({
      competitorDomain: "competitor.com.au",
      engine: "chatgpt",
      brandWon: true,
      brandMentioned: true,
      competitorMentioned: true,
    });

    expect(screen.getByText("Won")).toBeInTheDocument();
    expect(screen.queryByText("Lost")).not.toBeInTheDocument();
    expect(screen.queryByText("Inconclusive")).not.toBeInTheDocument();
  });

  it("brand_won=false renders 'Lost' verdict", async () => {
    await renderVerdict({
      competitorDomain: "rival.com.au",
      engine: "claude",
      brandWon: false,
      brandMentioned: true,
      competitorMentioned: true,
    });

    expect(screen.getByText("Lost")).toBeInTheDocument();
    expect(screen.queryByText("Won")).not.toBeInTheDocument();
    expect(screen.queryByText("Inconclusive")).not.toBeInTheDocument();
  });

  it("brand_won=null renders 'Inconclusive' neutral card (LLD 288)", async () => {
    const { container } = await renderVerdict({
      competitorDomain: "ambiguous.com.au",
      engine: "gemini",
      brandWon: null,
      brandMentioned: true,
      competitorMentioned: false,
    });

    expect(screen.getByText("Inconclusive")).toBeInTheDocument();
    expect(screen.queryByText("Won")).not.toBeInTheDocument();
    expect(screen.queryByText("Lost")).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain("Error");
  });

  it("renders competitor domain with 'vs' prefix", async () => {
    await renderVerdict({
      competitorDomain: "testcomp.com.au",
      engine: "chatgpt",
      brandWon: true,
      brandMentioned: true,
      competitorMentioned: true,
    });

    expect(screen.getByText("vs testcomp.com.au")).toBeInTheDocument();
  });

  it("renders engine label", async () => {
    await renderVerdict({
      competitorDomain: "x.com",
      engine: "perplexity",
      brandWon: false,
      brandMentioned: false,
      competitorMentioned: true,
    });

    expect(screen.getByText("perplexity")).toBeInTheDocument();
  });

  it("renders brand_mentioned and competitor_mentioned flags", async () => {
    await renderVerdict({
      competitorDomain: "other.com",
      engine: "chatgpt",
      brandWon: null,
      brandMentioned: true,
      competitorMentioned: false,
    });

    expect(screen.getByText("Brand mentioned: Yes")).toBeInTheDocument();
    expect(screen.getByText("Competitor mentioned: No")).toBeInTheDocument();
  });

  it("shows mention flags as No/No when neither mentioned", async () => {
    await renderVerdict({
      competitorDomain: "ghost.com",
      engine: "gemini",
      brandWon: null,
      brandMentioned: false,
      competitorMentioned: false,
    });

    expect(screen.getByText("Brand mentioned: No")).toBeInTheDocument();
    expect(screen.getByText("Competitor mentioned: No")).toBeInTheDocument();
  });
});
