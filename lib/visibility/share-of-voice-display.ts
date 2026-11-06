import { formatVisibilityPercent } from "@/lib/scoring/visibility-display";

/**
 * Overview (7 Nov), item 3: how Share of Voice is shown -- safe to import from client components
 * (lib/visibility/share-of-voice.ts, which computes it, reads the database).
 */

/** Fewer mentions than this in all, and the share is marked "small sample". */
export const SOV_SMALL_SAMPLE_BELOW = 5;

/** Every share on screen in whole percentages, rounded as Visibility is: 12.7 -> "13%". */
export function formatSharePercent(value: number): string {
  return formatVisibilityPercent(value);
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

export const SOV_NOTE =
  "Your mentions as a share of every mention of you and your competitors, in the everyday answers of " +
  "each brand's latest complete audit (first run only). A mention of you counts once it's verified, as " +
  `in Visibility; competitors are the ones set on the brand. Under ${SOV_SMALL_SAMPLE_BELOW} mentions in all, it's a small sample.`;
