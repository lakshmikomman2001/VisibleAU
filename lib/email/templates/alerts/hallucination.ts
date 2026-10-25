import { type RenderedEmail, renderEmail } from "../layout";

/** What detect-hallucinations actually found: counts by severity, for one
 * audit. (It used to send "engine: multiple" and "correct value: Review
 * required" as if they were findings.) */
export function hallucinationAlertEmail(i: {
  brandName: string;
  auditNumber: number | null;
  criticalCount: number;
  warningCount: number;
  reviewUrl: string;
}): RenderedEmail {
  const count = (n: number, kind: string) =>
    `${n} ${kind} ${n === 1 ? "inaccuracy" : "inaccuracies"}`;
  const found = [
    i.criticalCount > 0 ? count(i.criticalCount, "critical") : null,
    i.warningCount > 0 ? count(i.warningCount, "possible") : null,
  ]
    .filter((s): s is string => s !== null)
    .join(" and ");
  const where = i.auditNumber == null ? "the latest audit" : `audit #${i.auditNumber}`;
  return renderEmail({
    category: "alert",
    subject: `[${i.brandName}] AI answers got facts about your business wrong`,
    preview: `${found} in what AI engines said about ${i.brandName}.`,
    heading: `AI answers got facts about ${i.brandName} wrong`,
    blocks: [
      {
        kind: "paragraph",
        text: `In ${where}, we found ${found} in what AI engines said about ${i.brandName}.`,
      },
      { kind: "button", label: "Review what they said", url: i.reviewUrl },
    ],
  });
}
