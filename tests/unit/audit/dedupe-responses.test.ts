/**
 * ⚠️ TTT — the Responses tab's evidence screen labelled 4 byte-identical
 * 48h-cache replays as independent "Run 2-5" rows (task SSS confirmed:
 * the LLM cache key has no run index, so only run 1 of each (engine,
 * prompt) pair is ever a real call). dedupeResponses collapses rows
 * whose response text is IDENTICAL within the same (engine, prompt) group
 * into their first occurrence, content-based -- not a hardcoded "5" --
 * so a future genuinely-independent run with distinct text still shows.
 */
import { describe, expect, it } from "vitest";
import { dedupeResponses } from "@/lib/audit/dedupe-responses";

function row(overrides: {
  engine: string;
  prompt: string;
  responseSnippet: string | null;
  id?: string;
}) {
  return { id: overrides.id ?? `${overrides.engine}-${overrides.prompt}-${Math.random()}`, ...overrides };
}

describe("⚠️ TTT — dedupeResponses", () => {
  it("5 identical-text rows for the same (engine, prompt) -> 1 row, replicaCount 5", () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      row({ engine: "chatgpt", prompt: "Is X good?", responseSnippet: "Yes it is.", id: `r${i}` }),
    );
    const deduped = dedupeResponses(rows);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].replicaCount).toBe(5);
    expect(deduped[0].id).toBe("r0"); // keeps the first occurrence
  });

  it("two genuinely different responses for the same (engine, prompt) both show distinctly -- content-based, not hardcoded-5", () => {
    const rows = [
      row({ engine: "chatgpt", prompt: "Is X good?", responseSnippet: "Yes it is.", id: "a" }),
      row({ engine: "chatgpt", prompt: "Is X good?", responseSnippet: "Yes it is.", id: "b" }),
      row({ engine: "chatgpt", prompt: "Is X good?", responseSnippet: "No, not really.", id: "c" }),
      row({ engine: "chatgpt", prompt: "Is X good?", responseSnippet: "No, not really.", id: "d" }),
      row({ engine: "chatgpt", prompt: "Is X good?", responseSnippet: "No, not really.", id: "e" }),
    ];
    const deduped = dedupeResponses(rows);
    expect(deduped).toHaveLength(2);
    expect(deduped.map((d) => d.replicaCount).sort()).toEqual([2, 3]);
    expect(deduped.map((d) => d.responseSnippet)).toEqual(["Yes it is.", "No, not really."]);
  });

  it("the same response text for a DIFFERENT prompt is not merged -- dedup is scoped to (engine, prompt)", () => {
    const rows = [
      row({ engine: "chatgpt", prompt: "Is X good?", responseSnippet: "Yes.", id: "a" }),
      row({ engine: "chatgpt", prompt: "Is Y good?", responseSnippet: "Yes.", id: "b" }),
    ];
    const deduped = dedupeResponses(rows);
    expect(deduped).toHaveLength(2);
    expect(deduped.every((d) => d.replicaCount === 1)).toBe(true);
  });

  it("the same response text for a DIFFERENT engine is not merged -- dedup is scoped to (engine, prompt)", () => {
    const rows = [
      row({ engine: "chatgpt", prompt: "Is X good?", responseSnippet: "Yes.", id: "a" }),
      row({ engine: "claude", prompt: "Is X good?", responseSnippet: "Yes.", id: "b" }),
    ];
    const deduped = dedupeResponses(rows);
    expect(deduped).toHaveLength(2);
    expect(deduped.every((d) => d.replicaCount === 1)).toBe(true);
  });

  it("a single run with no replays -> replicaCount 1, row unchanged", () => {
    const rows = [row({ engine: "chatgpt", prompt: "Is X good?", responseSnippet: "Yes.", id: "a" })];
    const deduped = dedupeResponses(rows);
    expect(deduped).toEqual([{ ...rows[0], replicaCount: 1 }]);
  });

  it("empty input -> empty output, no crash", () => {
    expect(dedupeResponses([])).toEqual([]);
  });

  it("preserves input order by first occurrence across multiple groups", () => {
    const rows = [
      row({ engine: "chatgpt", prompt: "Q1", responseSnippet: "A1", id: "1" }),
      row({ engine: "claude", prompt: "Q2", responseSnippet: "A2", id: "2" }),
      row({ engine: "chatgpt", prompt: "Q1", responseSnippet: "A1", id: "3" }), // replay of row 1
      row({ engine: "claude", prompt: "Q2", responseSnippet: "A2", id: "4" }), // replay of row 2
    ];
    const deduped = dedupeResponses(rows);
    expect(deduped.map((d) => d.id)).toEqual(["1", "2"]);
    expect(deduped.map((d) => d.replicaCount)).toEqual([2, 2]);
  });
});
