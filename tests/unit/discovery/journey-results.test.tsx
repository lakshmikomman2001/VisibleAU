// @vitest-environment jsdom
/**
 * 17 Nov, part 3 -- a journey run as stored, on the page.
 *
 * journey_run_results.turn_results is the runner's TurnResult[] (lib/conversational/types.ts), keyed
 * `brand_mentioned`. The page's chips read `brandMentioned`, so every turn showed grey ("not named") whatever
 * the answer said. And repeat runs had no date, so they looked identical.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { JourneyResultCard } from "@/components/domain/discovery/journey-result-card";
import { journeyTurnChips, orderJourneyRuns } from "@/lib/conversational/journey-results";
import type { TurnResult } from "@/lib/conversational/types";

afterEach(cleanup);

// What run-journey.ts stores: the runner's own TurnResult objects.
const STORED: TurnResult[] = [
  {
    turn: 1,
    prompt: "Who are the best plumbers in Bondi?",
    brand_mentioned: true,
    position: 1,
    context_label: "top_recommendation",
    competitors_mentioned: [],
  },
  {
    turn: 2,
    prompt: "Which of them are open on weekends?",
    brand_mentioned: false,
    position: null,
    context_label: "not_mentioned",
    competitors_mentioned: [],
  },
  {
    turn: 3,
    prompt: "Is Bondi Plumbing licensed?",
    brand_mentioned: true,
    position: 2,
    context_label: "mentioned",
    competitors_mentioned: [],
  },
];

describe("journeyTurnChips -- reads the key the rows are stored with", () => {
  it("brand_mentioned true/false comes through as named / not named", () => {
    expect(journeyTurnChips(STORED)).toEqual([
      { turn: 1, brandMentioned: true },
      { turn: 2, brandMentioned: false },
      { turn: 3, brandMentioned: true },
    ]);
  });

  it("a turn with no recorded value is null (not recorded), never a 'no'", () => {
    expect(journeyTurnChips([{ turn: 1 }, { turn: 2, brandMentioned: true }])).toEqual([
      { turn: 1, brandMentioned: null },
      { turn: 2, brandMentioned: true },
    ]);
  });

  it("anything that isn't a list of turns is no chips", () => {
    expect(journeyTurnChips(null)).toEqual([]);
    expect(journeyTurnChips({ turn: 1 })).toEqual([]);
    expect(journeyTurnChips([null, "x", { prompt: "no turn number" }])).toEqual([]);
  });
});

describe("JourneyResultCard -- a stored run's chips and date", () => {
  it("the turns the answer named the business in are the green ones", () => {
    render(
      React.createElement(JourneyResultCard, {
        journeyName: "Tradies awareness",
        engine: "chatgpt",
        journeyScore: 76.67,
        firstMentionTurn: 1,
        turnResults: journeyTurnChips(STORED),
        runAt: "2026-11-14T23:30:00.000Z",
        latestForEngine: true,
      }),
    );
    expect(screen.getByLabelText("Turn 1: the answer named the business")).toHaveAttribute(
      "data-turn-named",
      "true",
    );
    expect(screen.getByLabelText("Turn 2: the answer didn't name the business")).toHaveAttribute(
      "data-turn-named",
      "false",
    );
    expect(screen.getByLabelText("Turn 3: the answer named the business")).toHaveAttribute(
      "data-turn-named",
      "true",
    );
    // 23:30 UTC on 14 Nov is 15 Nov in Sydney (lib/platform/org-timezone.ts).
    expect(screen.getByText("Latest run, 15 Nov 2026")).toBeInTheDocument();
  });

  it("an earlier run says so, with its own date", () => {
    render(
      React.createElement(JourneyResultCard, {
        journeyName: "Tradies awareness",
        engine: "chatgpt",
        journeyScore: 40,
        firstMentionTurn: 2,
        turnResults: journeyTurnChips(STORED),
        runAt: "2026-11-01T02:00:00.000Z",
        latestForEngine: false,
      }),
    );
    expect(screen.getByText("Earlier run, 1 Nov 2026")).toBeInTheDocument();
  });
});

describe("orderJourneyRuns -- each engine's latest run first, then the earlier ones", () => {
  it("marks each engine's newest run latest and lists those first, newest first", () => {
    const runs = [
      { id: "c-old", engine: "claude", runAt: "2026-11-01T00:00:00Z" },
      { id: "g-new", engine: "chatgpt", runAt: "2026-11-14T00:00:00Z" },
      { id: "g-old", engine: "chatgpt", runAt: "2026-11-02T00:00:00Z" },
      { id: "c-new", engine: "claude", runAt: "2026-11-13T00:00:00Z" },
    ];
    expect(
      orderJourneyRuns(runs).map(({ run, latestForEngine }) => [run.id, latestForEngine]),
    ).toEqual([
      ["g-new", true],
      ["c-new", true],
      ["g-old", false],
      ["c-old", false],
    ]);
  });
});
