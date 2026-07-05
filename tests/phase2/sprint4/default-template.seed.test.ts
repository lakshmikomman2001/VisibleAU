import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("default-report-template seed script", () => {
  const seedPath = resolve(__dirname, "../../../db/seed/default-report-template.ts");
  const seedContent = readFileSync(seedPath, "utf-8");

  it("defines exactly 12 section types", () => {
    const matches = seedContent.match(/type:\s*"(\w+)"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(12);
  });

  it("has 5 sections with include: true", () => {
    const includeTrue = seedContent.match(/include:\s*true/g);
    expect(includeTrue).not.toBeNull();
    expect(includeTrue!.length).toBe(5);
  });

  it("has 7 sections with include: false", () => {
    const includeFalse = seedContent.match(/include:\s*false/g);
    expect(includeFalse).not.toBeNull();
    expect(includeFalse!.length).toBe(7);
  });

  it("wired sections are executive_summary, score_breakdown, mention_source_divide, fan_out_coverage, topical_gap_summary", () => {
    const wiredSections = [
      "executive_summary",
      "score_breakdown",
      "mention_source_divide",
      "fan_out_coverage",
      "topical_gap_summary",
    ];
    for (const section of wiredSections) {
      const pattern = new RegExp(`type:\\s*"${section}",\\s*include:\\s*true`);
      expect(seedContent).toMatch(pattern);
    }
  });

  it("forward-slot sections are include: false", () => {
    const forwardSlots = [
      "source_type_gaps",
      "agent_readiness",
      "linkedin_performance",
      "consensus_score",
      "knowledge_panel_status",
      "entity_home_status",
      "evidence_snapshots",
    ];
    for (const section of forwardSlots) {
      const pattern = new RegExp(`type:\\s*"${section}",\\s*include:\\s*false`);
      expect(seedContent).toMatch(pattern);
    }
  });

  it("does not use ON CONFLICT / upsert (append-only pattern)", () => {
    expect(seedContent).not.toMatch(/onConflict|ON CONFLICT/i);
  });

  it("checks for existing default before inserting", () => {
    expect(seedContent).toContain("isDefault");
    expect(seedContent).toContain("existing.length === 0");
  });
});
