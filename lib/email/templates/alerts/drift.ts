import { type RenderedEmail, renderEmail } from "../layout";

/** No caller sends this yet (lib/communication/alert-composer.ts). */
export function driftAlertEmail(i: {
  brandName: string;
  dimension: string;
  scoreBefore: number;
  scoreAfter: number;
  auditUrl: string;
}): RenderedEmail {
  const drop = i.scoreBefore - i.scoreAfter;
  return renderEmail({
    category: "alert",
    subject: `[${i.brandName}] ${i.dimension} dropped`,
    preview: `${i.dimension} went from ${i.scoreBefore.toFixed(0)} to ${i.scoreAfter.toFixed(0)}.`,
    heading: `${i.dimension} dropped for ${i.brandName}`,
    blocks: [
      {
        kind: "headline",
        text: `${i.dimension}: ${i.scoreBefore.toFixed(0)} → ${i.scoreAfter.toFixed(0)} (down ${drop.toFixed(0)})`,
      },
      { kind: "button", label: "View the audit", url: i.auditUrl },
    ],
  });
}
