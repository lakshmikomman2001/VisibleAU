import { type RenderedEmail, renderEmail } from "../layout";

export function promptPackGenerationFailedEmail(i: {
  brandName: string;
  brandUrl: string;
}): RenderedEmail {
  return renderEmail({
    category: "alert",
    subject: `[${i.brandName}] Audit not run — couldn't prepare its questions`,
    preview: `An audit for ${i.brandName} didn't run. Nothing was spent.`,
    heading: `An audit for ${i.brandName} didn't run`,
    blocks: [
      {
        kind: "paragraph",
        text: `The audit didn't run because its questions couldn't be refreshed first. No AI engine was asked anything and nothing was spent. Reviewing the brand's business details usually fixes this.`,
      },
      { kind: "button", label: "Review business details", url: i.brandUrl },
      { kind: "note", text: "You'll get this email at most once a day for this brand." },
    ],
  });
}
