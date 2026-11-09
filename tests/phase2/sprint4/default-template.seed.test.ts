import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

describe("default-report-template seed script", () => {
  const seedPath = resolve(__dirname, "../../../db/seed/default-report-template.ts");
  const seedContent = readFileSync(seedPath, "utf-8");

  it("defines exactly 12 section types", () => {
    const matches = seedContent.match(/type:\s*"(\w+)"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(12);
  });

  // 9021120 (Sprint 6, 9 Jul) built agent readiness and entity home and switched the two S6 forward slots
  // on: every one of the 12 sections is included since.
  it("has 12 sections with include: true (S4 core + S5 trust + S6 retrieval)", () => {
    const includeTrue = seedContent.match(/include:\s*true/g);
    expect(includeTrue).not.toBeNull();
    expect(includeTrue!.length).toBe(12);
  });

  it("has no section with include: false", () => {
    expect(seedContent.match(/include:\s*false/g)).toBeNull();
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

  it("the S6 sections, built in 9021120, are include: true", () => {
    for (const section of ["agent_readiness", "entity_home_status"]) {
      const pattern = new RegExp(`type:\\s*"${section}",\\s*include:\\s*true`);
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
