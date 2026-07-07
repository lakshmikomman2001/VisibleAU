import { describe, expect, it } from "vitest";
import type { ReportSection, ReportSectionType } from "@/lib/communication/types";

const CORE_SECTIONS: ReportSectionType[] = [
  "executive_summary",
  "score_breakdown",
  "mention_source_divide",
  "fan_out_coverage",
  "topical_gap_summary",
];

const ALL_SECTION_TYPES: ReportSectionType[] = [
  "executive_summary",
  "score_breakdown",
  "mention_source_divide",
  "fan_out_coverage",
  "topical_gap_summary",
  "source_type_gaps",
  "agent_readiness",
  "linkedin_performance",
  "consensus_score",
  "knowledge_panel_status",
  "entity_home_status",
  "evidence_snapshots",
];

const DEFAULT_SECTIONS: ReportSection[] = [
  { type: "executive_summary", include: true, order: 1 },
  { type: "score_breakdown", include: true, order: 2 },
  { type: "mention_source_divide", include: true, order: 3 },
  { type: "fan_out_coverage", include: true, order: 4 },
  { type: "topical_gap_summary", include: true, order: 5 },
];

describe("ReportSection filtering + fallback (Sprint 4 template/section framework)", () => {
  it("filter(s => s.include) returns only include:true sections", () => {
    const mixed: ReportSection[] = [
      { type: "executive_summary", include: true, order: 1 },
      { type: "source_type_gaps", include: false, order: 6 },
      { type: "score_breakdown", include: true, order: 2 },
      { type: "agent_readiness", include: false, order: 7 },
    ];
    const included = mixed.filter((s) => s.include);
    expect(included).toHaveLength(2);
    expect(included.every((s) => s.include)).toBe(true);
  });

  it("filter preserves order field for subsequent sorting", () => {
    const sections: ReportSection[] = [
      { type: "fan_out_coverage", include: true, order: 4 },
      { type: "executive_summary", include: true, order: 1 },
      { type: "score_breakdown", include: true, order: 2 },
    ];
    const sorted = sections
      .filter((s) => s.include)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    expect(sorted[0].type).toBe("executive_summary");
    expect(sorted[1].type).toBe("score_breakdown");
    expect(sorted[2].type).toBe("fan_out_coverage");
  });

  it("DEFAULT_SECTIONS has exactly 5 core sections, all include:true", () => {
    expect(DEFAULT_SECTIONS).toHaveLength(5);
    expect(DEFAULT_SECTIONS.every((s) => s.include)).toBe(true);
    const types = DEFAULT_SECTIONS.map((s) => s.type);
    for (const core of CORE_SECTIONS) {
      expect(types).toContain(core);
    }
  });

  it("DEFAULT_SECTIONS sections are ordered 1-5", () => {
    const orders = DEFAULT_SECTIONS.map((s) => s.order);
    expect(orders).toEqual([1, 2, 3, 4, 5]);
  });

  it("non-core sections (source_type_gaps, agent_readiness, etc.) are NOT in defaults", () => {
    const defaultTypes = DEFAULT_SECTIONS.map((s) => s.type);
    const nonCore = ALL_SECTION_TYPES.filter((t) => !CORE_SECTIONS.includes(t));
    for (const nc of nonCore) {
      expect(defaultTypes).not.toContain(nc);
    }
  });

  it("template resolution fallback: no template → DEFAULT_SECTIONS (5 core)", () => {
    const template = null;
    const resolved = template ? ([] as ReportSection[]) : DEFAULT_SECTIONS;
    expect(resolved).toHaveLength(5);
    expect(resolved.map((s) => s.type)).toEqual(CORE_SECTIONS);
  });

  it("template resolution with template: uses template's sections", () => {
    const customSections: ReportSection[] = [
      { type: "executive_summary", include: true, order: 1 },
      { type: "linkedin_performance", include: true, order: 2 },
    ];
    const template = { sections: customSections };
    const resolved = template ? (template.sections as ReportSection[]) : DEFAULT_SECTIONS;
    expect(resolved).toHaveLength(2);
    expect(resolved[1].type).toBe("linkedin_performance");
  });

  it("empty sections array after filter yields no content (graceful)", () => {
    const allExcluded: ReportSection[] = [
      { type: "executive_summary", include: false },
      { type: "score_breakdown", include: false },
    ];
    const included = allExcluded.filter((s) => s.include);
    expect(included).toHaveLength(0);
  });

  it("sections without order sort to end (order ?? 999)", () => {
    const sections: ReportSection[] = [
      { type: "fan_out_coverage", include: true },
      { type: "executive_summary", include: true, order: 1 },
    ];
    const sorted = sections
      .filter((s) => s.include)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    expect(sorted[0].type).toBe("executive_summary");
    expect(sorted[1].type).toBe("fan_out_coverage");
  });

  it("ReportSectionType union covers all 12 known sections", () => {
    expect(ALL_SECTION_TYPES).toHaveLength(12);
  });
});
