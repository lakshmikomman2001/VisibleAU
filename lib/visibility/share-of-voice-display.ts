import { formatVisibilityPercent } from "@/lib/scoring/visibility-display";

/**
 * How Share of Voice is shown -- safe to import from client components
 * (lib/visibility/share-of-voice.ts, which counts it, reads the database).
 * Nothing here computes a share: every share arrives already computed by that one counter.
 */

/** Fewer mentions than this in all, and the share is marked "small sample". */
export const SOV_SMALL_SAMPLE_BELOW = 5;

/** Every share on screen in whole percentages, rounded as Visibility is: 12.7 -> "13%". */
export function formatSharePercent(value: number): string {
  return formatVisibilityPercent(value);
}

/** One business's mentions in an audit's everyday answers, and its share of all of them. */
export interface SovShare {
  name: string;
  mentions: number;
  /** null when nobody was mentioned. */
  sharePct: number | null;
}

/** The same counts for one engine's answers. */
export interface SovEngine {
  engine: string;
  brandMentions: number;
  brandSharePct: number | null;
  totalMentions: number;
  competitors: SovShare[];
}

/** One brand's line on the Overview's Share of Voice card. */
export interface SovLine {
  brandId: string;
  brandName: string;
  /** "13%", only when measured. */
  share: string | null;
  /** "10 of 79 mentions", or why there's no share. */
  detail: string;
  /** "Audit #36, 24 Oct" (Sydney date); null with no audit. */
  audit: string | null;
  smallSample: boolean;
}

/** What GET /api/brands/[brandId]/visibility sends the Visibility page's card. */
export interface SovPayload {
  line: SovLine;
  measured: boolean;
  brandName: string;
  brandMentions: number;
  totalMentions: number;
  sharePct: number | null;
  smallSample: boolean;
  competitors: SovShare[];
  perEngine: SovEngine[];
}

export const SOV_NOTE =
  "Your mentions as a share of every mention of you and your competitors, in the everyday answers of " +
  "each brand's latest complete audit (first run only). A mention of you counts once it's verified, as " +
  `in Visibility; competitors are the ones set on the brand. Under ${SOV_SMALL_SAMPLE_BELOW} mentions in all, it's a small sample.`;
