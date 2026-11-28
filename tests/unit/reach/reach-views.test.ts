/**
 * S04B part 4 (LLD amendment 102; P07.reachFilter): the competitor context of one reach.
 * - countCompetitorMentions, given the audit's question reaches, also counts each competitor per reach, in the same
 *   scan of the same answers (its totals unchanged); without them its result is exactly as before.
 * - shareOfVoiceInReach (the one counter): the brand's and each competitor's mentions in that reach, most first, with a share only where
 *   the whole audit shows one.
 */
import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/db/client";

vi.mock("@/lib/llm/cache", () => ({ getCached: vi.fn().mockResolvedValue(null) }));

const { countCompetitorMentions } = await import("@/lib/audit/competitor-mentions");
const { reachEngineRows } = await import("@/lib/reach/views");
const { shareOfVoiceInReach } = await import("@/lib/visibility/share-of-voice");

const SITE = "wattlecreekplumbing.example.com.au";
const answer = (prompt: string, engine: string, named: boolean) => ({
  prompt,
  engine,
  llmModel: "gpt-4.1-mini",
  responseSnippet: null,
  responseText: named
    ? `Good options are Wattle Creek Plumbing (${SITE}) and others.`
    : "Good options are a few local plumbers.",
  citedSources: named ? [{ domain: SITE, url: `https://${SITE}/` }] : [],
});
const ROWS = [
  answer("Best plumber in Kurrajong Heights?", "chatgpt", true),
  answer("Best plumber in Kurrajong Heights?", "claude", false),
  answer("Can you recommend a plumber in NSW?", "chatgpt", true),
  answer("Can you recommend a plumber in NSW?", "gemini", true),
  answer("Can you recommend a plumber in Australia?", "chatgpt", false),
];
const tx = {
  select: () => ({ from: () => ({ where: async () => ROWS }) }),
} as unknown as DbClient;
const AUDIT = { id: "a1", methodologyVersion: 2 };
const COMPETITOR = [{ name: "Wattle Creek Plumbing", website: SITE }];

describe("competitor mentions per reach", () => {
  it("with the audit's reaches: per reach too, the totals unchanged", async () => {
    const reachOf = new Map([
      ["Best plumber in Kurrajong Heights?", "local"],
      ["Can you recommend a plumber in NSW?", "state"],
      ["Can you recommend a plumber in Australia?", "country"],
    ]);
    const [withReaches] = await countCompetitorMentions(tx, AUDIT, COMPETITOR, reachOf);
    const [without] = await countCompetitorMentions(tx, AUDIT, COMPETITOR);
    expect(withReaches).toEqual({
      name: "Wattle Creek Plumbing",
      mentions: 3,
      perEngine: { chatgpt: 2, gemini: 1 },
      perReach: { local: 1, state: 2 },
    });
    expect(without).toEqual({
      name: "Wattle Creek Plumbing",
      mentions: 3,
      perEngine: { chatgpt: 2, gemini: 1 },
    });
  });

  it("one reach's rows: mentions there, most first; a share only when the audit shows shares", () => {
    const competitors: Array<{ name: string; perReach: Record<string, number> }> = [
      { name: "Wattle Creek Plumbing", perReach: { local: 1, state: 2 } },
      { name: "Ironbark Pipe Co", perReach: { state: 1 } },
    ];
    const shown = shareOfVoiceInReach({
      brandName: "Gum Tree Plumbing",
      brandMentions: 1,
      competitors,
      reach: "state",
      sharesShown: true,
    });
    expect(shown.brandSharePct).toBe(25);
    expect(shown.totalMentions).toBe(4);
    expect(shown.rows).toEqual([
      { name: "Wattle Creek Plumbing", mentions: 2, sharePct: 50, isYou: false },
      { name: "Gum Tree Plumbing", mentions: 1, sharePct: 25, isYou: true },
      { name: "Ironbark Pipe Co", mentions: 1, sharePct: 25, isYou: false },
    ]);
    const unshown = shareOfVoiceInReach({
      brandName: "Gum Tree Plumbing",
      brandMentions: 0,
      competitors,
      reach: "country",
      sharesShown: false,
    });
    expect(unshown.brandSharePct).toBeNull();
    expect(unshown.rows.map((r) => [r.name, r.mentions, r.sharePct])).toEqual([
      ["Gum Tree Plumbing", 0, null],
      ["Wattle Creek Plumbing", 0, null],
      ["Ironbark Pipe Co", 0, null],
    ]);
  });

  it("one reach's per-engine rows: every engine the audit asked, 0 of 0 where none answered there", () => {
    const breakdown = {
      reaches: ["local" as const, "state" as const],
      answers: new Map([
        ["state" as const, [{ engine: "chatgpt", sampleCount: 3, mentionedCount: 1 }]],
      ]),
      failures: new Map(),
    };
    expect(reachEngineRows(breakdown, "state", ["chatgpt", "claude"])).toEqual([
      { engine: "chatgpt", sampleCount: 3, mentionedCount: 1 },
      { engine: "claude", sampleCount: 0, mentionedCount: 0 },
    ]);
  });
});
