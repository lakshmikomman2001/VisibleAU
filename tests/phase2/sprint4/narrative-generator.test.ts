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

  it("defines WIRED_SECTIONS with 12 entries (S4 core + S5 trust + S6 readiness)", () => {
    const match = src.match(/WIRED_SECTIONS\s*=\s*new\s+Set\(\[([^\]]+)\]\)/s);
    expect(match).not.toBeNull();
    const entries = match![1].match(/"[^"]+"/g);
    expect(entries).not.toBeNull();
    expect(entries!.length).toBe(12);
  });

  it("WIRED_SECTIONS contains S4 + S5 + S6 sections", () => {
    const wired = [
      "executive_summary",
      "score_breakdown",
      "mention_source_divide",
      "fan_out_coverage",
      "topical_gap_summary",
      "linkedin_performance",
      "consensus_score",
      "knowledge_panel_status",
      "source_type_gaps",
      "evidence_snapshots",
      "entity_home_status",
      "agent_readiness",
    ];
    for (const s of wired) {
      expect(src).toContain(`"${s}"`);
    }
  });

  it("imports S6 tables for entity-home and agent-readiness", () => {
    expect(src).toContain("contentStructureAudits");
    expect(src).toContain("agentReadinessScores");
  });

  it("RULE 1: no causal language when quality_status is insufficient", () => {
    expect(src).toContain("Insufficient data");
    expect(src).toMatch(/sampleQuality\s*===?\s*["']Insufficient data["']/);
  });

  it("RULE 2: surfaces confidence notes for low quality metrics", () => {
    expect(src).toContain("confidenceNotes");
    expect(src).toContain("Hypothesis");
  });

  it("RULE 3: key wins require score_delta > 0 AND sample quality", () => {
    expect(src).toContain("scoreDelta > 0");
    expect(src).toContain("qualityPasses");
  });

  it("initialises S6 summaries as null (populated when data exists)", () => {
    expect(src).toContain("let entityHomeSummary");
    expect(src).toContain("let agentReadinessSummary");
  });

  it("headline varies based on keyWins vs keyGaps", () => {
    expect(src).toContain("keyWins.length > 0");
    expect(src).toContain("keyGaps.length > 0");
    expect(src).toContain("AI Visibility Report");
  });
});
