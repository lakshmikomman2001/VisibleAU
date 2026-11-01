import type { ReportSection, ReportSectionType } from "@/lib/communication/types";

/**
 * DEMO-BLOCKER (1 Nov), part 5 point 5 -- which of the report PDF's
 * sections a report template can leave out. The cover, the executive
 * summary, the engine pages and "Where AI looks" are always included; these
 * five are optional. A template that doesn't mention a section (every
 * template made before these existed) includes it.
 */
export const OPTIONAL_REPORT_SECTIONS = [
  "competitors",
  "diagnosis",
  "trend",
  "recommended_next",
  "method",
] as const satisfies readonly ReportSectionType[];

export type OptionalReportSection = (typeof OPTIONAL_REPORT_SECTIONS)[number];
export type ReportSectionFlags = Record<OptionalReportSection, boolean>;

export const OPTIONAL_REPORT_SECTION_LABELS: Record<OptionalReportSection, string> = {
  competitors: "Competitors (share of voice)",
  diagnosis: "Diagnosis (findings)",
  trend: "Over time",
  recommended_next: "Recommended next",
  method: "Method and notes",
};

/** A new template: every optional section included. */
export const DEFAULT_REPORT_SECTIONS: ReportSection[] = OPTIONAL_REPORT_SECTIONS.map((type) => ({
  type,
  include: true,
}));

export const ALL_REPORT_SECTIONS: ReportSectionFlags = {
  competitors: true,
  diagnosis: true,
  trend: true,
  recommended_next: true,
  method: true,
};

export function reportSectionFlags(
  sections: readonly ReportSection[] | null | undefined,
): ReportSectionFlags {
  const flags = { ...ALL_REPORT_SECTIONS };
  for (const s of sections ?? []) {
    if ((OPTIONAL_REPORT_SECTIONS as readonly string[]).includes(s.type) && s.include === false) {
      flags[s.type as OptionalReportSection] = false;
    }
  }
  return flags;
}
