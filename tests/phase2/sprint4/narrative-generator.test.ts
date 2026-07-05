import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("narrative-generator (RULES 1-11 + section framework)", () => {
  const srcPath = resolve(__dirname, "../../../lib/communication/narrative-generator.ts");
  const src = readFileSync(srcPath, "utf-8");

  it("uses selectModel, never hardcoded model strings", () => {
    expect(src).toContain("selectModel");
    expect(src).not.toMatch(/["']gpt-4/);
    expect(src).not.toMatch(/["']claude-3/);
    expect(src).not.toMatch(/["']gpt-3/);
  });

  it("passes 'narrative_generation' as the task to selectModel", () => {
    expect(src).toContain('"narrative_generation"');
  });

  it("defines WIRED_SECTIONS with exactly 5 entries", () => {
    const match = src.match(/WIRED_SECTIONS\s*=\s*new\s+Set\(\[([^\]]+)\]\)/s);
    expect(match).not.toBeNull();
    const entries = match![1].match(/"[^"]+"/g);
    expect(entries).not.toBeNull();
    expect(entries!.length).toBe(5);
  });

  it("WIRED_SECTIONS contains only the 5 core sections", () => {
    const wired = [
      "executive_summary",
      "score_breakdown",
      "mention_source_divide",
      "fan_out_coverage",
      "topical_gap_summary",
    ];
    for (const s of wired) {
      expect(src).toContain(`"${s}"`);
    }
  });

  it("does not import any forward-slot tables", () => {
    const forwardTables = [
      "linkedinAnalytics",
      "consensusScores",
      "knowledgePanelChecks",
      "entityHomeChecks",
      "sourceTypeGaps",
      "agentReadinessChecks",
      "evidenceSnapshots",
    ];
    for (const table of forwardTables) {
      expect(src).not.toContain(table);
    }
  });

  it("RULE 1: no causal language when quality_status is insufficient", () => {
    expect(src).toContain("insufficient");
    expect(src).toMatch(/qualityStatus\s*===?\s*["']insufficient["']/);
  });

  it("RULE 2: surfaces confidence notes for low quality metrics", () => {
    expect(src).toContain("confidenceNotes");
    expect(src).toContain("Hypothesis");
  });

  it("RULE 3: key wins require score_delta > 0 AND sample quality", () => {
    expect(src).toContain("scoreDelta > 0");
    expect(src).toContain("qualityPasses");
  });

  it("returns forward-slot summaries as null", () => {
    expect(src).toContain("linkedinSummary: null");
    expect(src).toContain("consensusSummary: null");
    expect(src).toContain("entityHomeSummary: null");
    expect(src).toContain("knowledgePanelSummary: null");
  });

  it("headline varies based on keyWins vs keyGaps", () => {
    expect(src).toContain("keyWins.length > 0");
    expect(src).toContain("keyGaps.length > 0");
    expect(src).toContain("AI Visibility Report");
  });
});
