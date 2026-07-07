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

  it("has 10 sections with include: true (S4 core + S5 trust)", () => {
    const includeTrue = seedContent.match(/include:\s*true/g);
    expect(includeTrue).not.toBeNull();
    expect(includeTrue!.length).toBe(10);
  });

  it("has 2 sections with include: false (S6 forward-slots)", () => {
    const includeFalse = seedContent.match(/include:\s*false/g);
    expect(includeFalse).not.toBeNull();
    expect(includeFalse!.length).toBe(2);
  });

  it("S4 + S5 wired sections are include: true", () => {
    const wiredSections = [
      "executive_summary",
      "score_breakdown",
      "mention_source_divide",
      "fan_out_coverage",
      "topical_gap_summary",
      "source_type_gaps",
      "linkedin_performance",
      "consensus_score",
      "knowledge_panel_status",
      "evidence_snapshots",
    ];
    for (const section of wiredSections) {
      const pattern = new RegExp(`type:\\s*"${section}",\\s*include:\\s*true`);
      expect(seedContent).toMatch(pattern);
    }
  });

  it("S6 forward-slot sections are include: false", () => {
    const forwardSlots = [
      "agent_readiness",
      "entity_home_status",
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
