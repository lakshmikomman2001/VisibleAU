import { type RenderedEmail, renderEmail } from "../layout";

/** No caller sends this yet (lib/communication/alert-composer.ts). */
export function volatilityAlertEmail(i: {
  brandName: string;
  currentScore: number;
  trend: string;
  recommendedAction: string;
}): RenderedEmail {
  return renderEmail({
    category: "alert",
    subject: `[${i.brandName}] The sources AI cites for you are changing quickly`,
    preview: i.trend,
    heading: `The sources AI cites for ${i.brandName} are changing quickly`,
    blocks: [
      { kind: "headline", text: `Volatility ${i.currentScore.toFixed(1)} (alert threshold 15.0)` },
      { kind: "paragraph", text: i.trend },
      { kind: "paragraph", text: `What to do: ${i.recommendedAction}` },
    ],
  });
}
