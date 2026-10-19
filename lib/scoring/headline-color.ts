/**
 * Vunnara (19 Oct, post-aa83b3a) + (20 Oct, post-a093ceb), headline-fix
 * follow-up item 5: the ONE place every surface that colour-codes the
 * headline (mention rate) reads its thresholds from -- deliberately NOT
 * the same 70/40 bands used for Position/Sentiment/Context/Source-
 * citation (see app/(auth)/audits/[auditId]/page.tsx's own
 * dimensionColor). Those dimensions are conditioned on already being
 * mentioned, so a "good" dimension score is realistically 70+; the
 * headline is a mention rate over EVERY organic question asked, most of
 * which never name any brand at all -- showing up in even a third of
 * them is already a strong result for a real local business, not a
 * middling one. Chosen as a starting point (not derived from a
 * benchmark dataset): STRONG at 30%+ (consistently showing up),
 * DEVELOPING at 10-29% (showing up sometimes), LOW below 10% (rarely
 * showing up at all) -- so a typical trade business's 16% mention rate
 * reads as "developing" (amber), never as a red "crisis" score.
 *
 * Before this fix, the public embeddable badge (app/api/badge/route.ts)
 * and the pre-signup sample-audit result page (app/(marketing)/
 * sample-audit/result/[id]/sample-result-view.tsx) each had their own,
 * separate copy of the DIMENSION bands (70/40) applied to the HEADLINE
 * value instead -- a business with a genuinely good 35% mention rate
 * would have shown red on those two public surfaces while the audit
 * page itself (which already used 30/10) showed green for the exact
 * same number. Both now read from here.
 */
export const HEADLINE_COLOR_THRESHOLDS = { strong: 30, developing: 10 } as const;

export type HeadlineColorBand = "strong" | "developing" | "low";

export function headlineColorBand(value: number): HeadlineColorBand {
  if (value >= HEADLINE_COLOR_THRESHOLDS.strong) return "strong";
  if (value >= HEADLINE_COLOR_THRESHOLDS.developing) return "developing";
  return "low";
}
