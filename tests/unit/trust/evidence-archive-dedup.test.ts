/**
 * Task #40: Evidence Archive persisted cache replays as distinct
 * "evidence" -- captureEvidenceSnapshots copied every citations row for
 * an audit (including all ~4 byte-identical cache-replay rows per
 * (engine, prompt) pair, task SSS/#24) into evidence_snapshots, which
 * has no run_number column, so the replay information was lost at
 * insert. Fixed write-time (filter to run_number = 1 before capturing)
 * and read-time (reuse the existing dedupeResponses() helper from #24,
 * with the raw fetch over-provisioned so a full page of DISTINCT
 * responses survives the dedupe). See
 * docs/ops/post-launch-db-hardening.md section 40.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dedupeResponses } from "@/lib/audit/dedupe-responses";
import { captureEvidenceSnapshots } from "@/lib/trust/evidence-archiver";

describe("captureEvidenceSnapshots -- write-time: only run_number = 1 is captured", () => {
  const src = readFileSync("lib/trust/evidence-archiver.ts", "utf8");

  it("the citations query filters to run_number = 1", () => {
    expect(src).toContain("eq(citations.runNumber, 1)");
  });

  it("captures exactly one snapshot per row the (already-filtered) query returns -- no further write-time grouping", async () => {
    // Simulates what a correctly-filtered `run_number = 1` query returns:
    // one row per distinct (engine, prompt) pair for this audit -- the 4
    // replay rows per pair never reach this function at all once the
    // WHERE clause (asserted above) is applied by the real DB.
    const filteredCitations = [
      { engine: "chatgpt", prompt: "Is Bondi Plumbing good?", responseSnippet: "Yes, well regarded.", sentimentScore: "0.80" },
      { engine: "claude", prompt: "Is Bondi Plumbing good?", responseSnippet: "Generally positive.", sentimentScore: "0.70" },
      { engine: "chatgpt", prompt: "Bondi Plumbing vs Plumbing 911", responseSnippet: "Both are reputable.", sentimentScore: "0.50" },
    ];

    const inserted: unknown[] = [];
    const tx = {
      select: () => ({
        from: () => ({ where: () => Promise.resolve(filteredCitations) }),
      }),
      insert: () => ({
        values: (v: unknown) => {
          inserted.push(v);
          return Promise.resolve();
        },
      }),
    };

    const result = await captureEvidenceSnapshots(
      tx as any,
      "audit-1",
      "brand-1",
      "org-1",
    );

    expect(result.snapshotCount).toBe(3);
    expect(inserted).toHaveLength(3);
    // Each distinct (engine, prompt) pair still gets its own snapshot --
    // the run_number filter removes replays, not genuine variety.
    expect((inserted[0] as { engine: string }).engine).toBe("chatgpt");
    expect((inserted[2] as { prompt: string }).prompt).toBe("Bondi Plumbing vs Plumbing 911");
  });
});

describe("evidence/route.ts -- read-time: reuses dedupeResponses(), fetches a margin over DISPLAY_LIMIT", () => {
  const src = readFileSync("app/api/brands/[brandId]/evidence/route.ts", "utf8");

  it("imports the shared dedupeResponses() instead of re-implementing it", () => {
    expect(src).toContain('import { dedupeResponses } from "@/lib/audit/dedupe-responses"');
    expect(src).toContain("dedupeResponses(");
  });

  it("fetches DISPLAY_LIMIT * RUNS_MAX raw rows, not a plain DISPLAY_LIMIT", () => {
    expect(src).toContain(".limit(DISPLAY_LIMIT * RUNS_MAX)");
  });

  it("slices to DISPLAY_LIMIT after dedup, not before", () => {
    const dedupeIndex = src.indexOf("dedupeResponses(");
    const sliceIndex = src.indexOf(".slice(0, DISPLAY_LIMIT)");
    expect(dedupeIndex).toBeGreaterThan(-1);
    expect(sliceIndex).toBeGreaterThan(dedupeIndex);
  });
});

describe("the route's dedupe+slice composition -- up to DISPLAY_LIMIT DISTINCT responses survive, not ~1/RUNS_MAX of it", () => {
  const DISPLAY_LIMIT = 200;
  const RUNS_MAX = 5;

  function makeRawRow(groupIndex: number, replicaIndex: number) {
    return {
      id: `g${groupIndex}-r${replicaIndex}`,
      engine: "chatgpt",
      prompt: `Prompt #${groupIndex}`,
      rawResponse: `Response for prompt #${groupIndex}`,
      scoreAtCapture: null,
      capturedAt: new Date(2026, 0, 1, 0, 0, groupIndex), // newest = highest groupIndex
    };
  }

  it("1000 raw rows (200 distinct groups x 5 replicas) -> all 200 distinct groups survive the fetch-margin + dedupe + slice", () => {
    // Reproduces exactly what the route does: fetch DISPLAY_LIMIT * RUNS_MAX
    // raw rows (here, already representing that full fetched set), then
    // dedupeResponses() + slice(0, DISPLAY_LIMIT) -- the same composition
    // as app/api/brands/[brandId]/evidence/route.ts.
    const raw: ReturnType<typeof makeRawRow>[] = [];
    for (let g = 0; g < DISPLAY_LIMIT; g++) {
      for (let r = 0; r < RUNS_MAX; r++) raw.push(makeRawRow(g, r));
    }
    expect(raw).toHaveLength(DISPLAY_LIMIT * RUNS_MAX); // 1000

    const deduped = dedupeResponses(
      raw.map((s) => ({ ...s, responseSnippet: s.rawResponse })),
    ).slice(0, DISPLAY_LIMIT);

    expect(deduped).toHaveLength(DISPLAY_LIMIT); // all 200 distinct groups, not ~40
    const distinctPrompts = new Set(deduped.map((d) => d.prompt));
    expect(distinctPrompts.size).toBe(DISPLAY_LIMIT);
  });

  it("contrast: naively limiting to DISPLAY_LIMIT raw rows BEFORE dedup collapses to ~1/RUNS_MAX as many distinct responses (the bug this fix avoids)", () => {
    const raw: ReturnType<typeof makeRawRow>[] = [];
    for (let g = 0; g < DISPLAY_LIMIT; g++) {
      for (let r = 0; r < RUNS_MAX; r++) raw.push(makeRawRow(g, r));
    }

    // The old behaviour: fetch only DISPLAY_LIMIT raw rows (no margin),
    // THEN dedupe -- most of that window is replicas of the same few
    // groups, since replicas of one group are adjacent in insertion order.
    const naiveRawWindow = raw.slice(0, DISPLAY_LIMIT);
    const naiveDeduped = dedupeResponses(
      naiveRawWindow.map((s) => ({ ...s, responseSnippet: s.rawResponse })),
    );

    expect(naiveDeduped.length).toBeLessThan(DISPLAY_LIMIT / 2);
  });

  it("a realistic mix (some groups with no replicas, some with 5) -- genuinely distinct single responses are never merged with an unrelated group", () => {
    const raw = [
      makeRawRow(0, 0), // single real response, no replicas
      makeRawRow(1, 0),
      makeRawRow(1, 1),
      makeRawRow(1, 2),
      makeRawRow(1, 3),
      makeRawRow(1, 4), // 5 replicas of the same response
      makeRawRow(2, 0), // another single real response
    ];

    const deduped = dedupeResponses(
      raw.map((s) => ({ ...s, responseSnippet: s.rawResponse })),
    ).slice(0, DISPLAY_LIMIT);

    expect(deduped).toHaveLength(3);
    expect(new Set(deduped.map((d) => d.prompt)).size).toBe(3);
  });
});
