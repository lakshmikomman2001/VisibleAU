import { type RenderedEmail, renderEmail } from "../layout";

/** Sent only once the cross-platform consistency check is real; it's
 * switched off until then (inngest/functions/check-cross-platform-consensus.ts). */
export function consensusAlertEmail(i: {
  brandName: string;
  sourceType: string;
  discrepancyDetails: string;
  consensusUrl: string;
}): RenderedEmail {
  return renderEmail({
    category: "alert",
    subject: `[${i.brandName}] Brand consistency issue — ${i.sourceType}`,
    preview: i.discrepancyDetails,
    heading: `${i.brandName}'s details don't match everywhere`,
    blocks: [
      { kind: "paragraph", text: `Sources with differences: ${i.sourceType}.` },
      { kind: "paragraph", text: i.discrepancyDetails },
      { kind: "button", label: "See the differences", url: i.consensusUrl },
    ],
  });
}
