import { type RenderedEmail, renderEmail } from "../layout";

export function scheduleNeedsConfirmationEmail(i: {
  brandName: string;
  confirmUrl: string;
}): RenderedEmail {
  return renderEmail({
    category: "alert",
    subject: `[${i.brandName}] Scheduled audits paused — confirm business details to resume`,
    preview: `Scheduled audits for ${i.brandName} are paused until you confirm its details.`,
    heading: `Scheduled audits for ${i.brandName} are paused`,
    blocks: [
      {
        kind: "paragraph",
        text: `Scheduled audits for ${i.brandName} are paused until you confirm its business type and location. It takes about 30 seconds, and makes sure every audit asks the right questions for your business.`,
      },
      { kind: "button", label: "Confirm business details", url: i.confirmUrl },
      {
        kind: "note",
        text: "Scheduled audits start again once you've confirmed. You won't get this email again for this brand unless it's paused again.",
      },
    ],
  });
}
