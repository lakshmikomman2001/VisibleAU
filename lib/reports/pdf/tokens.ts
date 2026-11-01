/**
 * DEMO-BLOCKER (1 Nov), part 4 -- the approved prototype's design tokens
 * (docs/design/report-pdf-prototype.html, :root), for react-pdf. The
 * prototype is in CSS px at 96 dpi; react-pdf lays out in points:
 * 1 px = 0.75 pt (A4 = 794 x 1123 px = 595 x 842 pt).
 */

/** CSS px -> PDF points. */
export const px = (n: number): number => n * 0.75;

export const C = {
  navy900: "#0B1220",
  navy800: "#111B2E",
  navy700: "#1C2A44",
  ink: "#0F172A",
  ink2: "#334155",
  ink3: "#64748B",
  line: "#E2E8F0",
  surface: "#F8FAFC",
  surface2: "#F1F5F9",
  brand: "#2563EB",
  brandSoft: "#DBEAFE",
  /** Deviation: the prototype's brand blue on brand-soft is 4.2:1; chips
   * use blue-700 to reach 4.5:1. */
  brandOnSoft: "#1D4ED8",
  good: "#15803D",
  goodSoft: "#DCFCE7",
  mid: "#B45309",
  midSoft: "#FEF3C7",
  midFill: "#F59E0B",
  low: "#B91C1C",
  lowSoft: "#FEE2E2",
  lowStripe: "#FECACA",
  neutralFill: "#CBD5E1",
  white: "#FFFFFF",
  // Evidence blocks.
  evidence: "#0F172A",
  evText: "#CBD5E1",
  /** Deviation: the prototype's #64748B label is 3.8:1 on the evidence
   * block; #94A3B8 is 6.9:1. */
  evLabel: "#94A3B8",
  evPos: "#5EEAD4",
  evCmp: "#FCD34D",
  evAbs: "#FCA5A5",
  // Cover.
  coverMuted: "#94A3B8",
  coverSoft: "#CBD5E1",
  coverEyebrow: "#93C5FD",
  coverChip: "#E2E8F0",
  coverWarn: "#FDE68A",
  // Deviation: react-pdf draws rgba() borders wrongly, so the prototype's
  // translucent chip and rule colours are pre-blended over navy-900:
  // white 18% / 6% / 12%, amber 50% / 10%.
  coverChipBorder: "#373D48",
  coverChipBg: "#1A202D",
  coverRule: "#282E3B",
  coverWarnBorder: "#836922",
  coverWarnBg: "#232320",
  // Provenance chip.
  provBg: "#ECFDF5",
  provText: "#047857",
  provBorder: "#A7F3D0",
  // Callouts.
  warnBorder: "#FCD34D",
  warnBg: "#FFFBEB",
  warnText: "#78350F",
  infoBorder: "#BFDBFE",
  infoBg: "#EFF6FF",
  infoText: "#1E3A8A",
  narrative: "#1E293B",
} as const;

/** The hero Visibility figure on the navy cover, by the app's bands
 * (lib/scoring/headline-color.ts). The prototype shows the developing
 * amber; strong and low are the same hues lightened for the dark cover. */
export const COVER_BAND = { strong: "#4ADE80", developing: "#FBBF24", low: "#F87171" } as const;

/** The audit page's band colours: text, soft fill, bar fill. */
export const BAND = {
  strong: { text: C.good, soft: C.goodSoft, fill: C.good },
  developing: { text: C.mid, soft: C.midSoft, fill: C.midFill },
  low: { text: C.low, soft: C.lowSoft, fill: C.low },
} as const;

/** The prototype's engine dots. */
export const ENGINE_DOT: Record<string, string> = {
  chatgpt: "#10A37F",
  claude: "#D97757",
  gemini: "#4285F4",
  perplexity: "#20808D",
};

export const FONT = {
  body: "Inter",
  display: "Fraunces",
  mono: "JetBrains Mono",
} as const;

/** A4 in points, and the prototype's page padding (56 px sides, 72 px bottom). */
export const PAGE = {
  width: 595.28,
  height: 841.89,
  padX: px(56),
  padTop: px(56),
  padBottom: px(72),
} as const;
