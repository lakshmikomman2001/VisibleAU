import { type RenderedEmail, renderEmail } from "../layout";

/**
 * URGENT PDF reports (1 Nov), part 2 -- a report's PDF couldn't be made
 * because of file storage (not the report itself). Same recipients as the
 * whole-engine-failure alert: the "org" copy to the org's owners and
 * admins, the "operator" copy to PLATFORM_ADMIN_EMAILS. The operator copy
 * carries the plain reason (lib/communication/types.ts's PDF_FAILURE_LABELS)
 * and the category code -- never a raw message, a URL or a key; since S02
 * part 0B (LLD amendment 71) the org copy says only that it's on our side.
 */
/** S02 part 0B (LLD amendment 71): the whole of what the org's owners and admins are told. */
export const REPORT_PDF_FAILED_ORG_SENTENCE =
  "We couldn't create this report because of a problem on our side. Try again in a few minutes.";

export function reportPdfFailedEmail(i: {
  audience: "org" | "operator";
  brandName: string;
  organizationName: string;
  periodLabel: string | null;
  reasonLabel: string;
  reason: string;
  reportUrl: string;
}): RenderedEmail {
  const report = i.periodLabel ? `the ${i.periodLabel} report` : "a report";
  // S02 part 0B (LLD amendment 71): the org copy says only that it's on our side; the operator copy keeps the reason.
  const sentence =
    i.audience === "operator"
      ? `The PDF for ${report} couldn't be created: ${i.reasonLabel}.`
      : REPORT_PDF_FAILED_ORG_SENTENCE;
  return renderEmail({
    category: "alert",
    subject: `${i.audience === "operator" ? "[ops] " : ""}[${i.brandName}] A report PDF couldn't be created`,
    preview: sentence,
    heading: "A report PDF couldn't be created",
    blocks: [
      { kind: "headline", text: sentence },
      ...(i.audience === "operator"
        ? [
            {
              kind: "paragraph" as const,
              text: `Reason: ${i.reason}. Check the storage settings and that the storage project is running, then press "Try again" on the report.`,
            },
          ]
        : []),
      { kind: "button", label: "Open the report", url: i.reportUrl },
      ...(i.audience === "operator"
        ? [{ kind: "note" as const, text: `Organisation: ${i.organizationName}.` }]
        : []),
    ],
    reason:
      i.audience === "operator"
        ? "You're on Vunnara's operator list, so you get every report PDF that fails for a storage reason."
        : "You're an owner or admin of this organisation, so you're told when a report's PDF couldn't be created.",
  });
}
