import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { brands, generatedReports, organizations } from "@/db/schema";
import { appUrl } from "@/lib/email/links";
import { operatorRecipients } from "@/lib/email/operator-recipients";
import { resolveAlertRecipients } from "@/lib/email/recipients";
import { idempotencyKeyFor, sendEmailOrThrow } from "@/lib/email/send";
import { reportPdfFailedEmail } from "@/lib/email/templates/alerts/report-pdf-failed";
import { PDF_FAILURE_LABELS, type PdfFailureReason } from "./types";

/**
 * URGENT PDF reports (1 Nov), part 2 -- tells the org's owners and admins,
 * and the operators ([ops]), that a report's PDF failed for a storage
 * reason, the same pattern as lib/audit/engine-total-failure-alert.ts.
 * One email per recipient per run (`runKey`, the Inngest event id): a
 * replay of the same run sends nothing new, and a "Try again" that fails
 * again is a new run, so it alerts again. Someone on both lists gets the
 * operator copy only. Returns how many emails went out.
 */
export async function sendReportPdfFailedAlert(input: {
  reportId: string;
  reason: PdfFailureReason;
  runKey: string;
}): Promise<number> {
  const [report] = await serviceDb
    .select({
      organizationId: generatedReports.organizationId,
      brandId: generatedReports.brandId,
      periodLabel: generatedReports.periodLabel,
    })
    .from(generatedReports)
    .where(eq(generatedReports.id, input.reportId));
  if (!report) return 0;
  const [brand] = await serviceDb
    .select({ name: brands.name })
    .from(brands)
    .where(eq(brands.id, report.brandId));
  const [org] = await serviceDb
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, report.organizationId));

  const operators = operatorRecipients();
  const members = (await resolveAlertRecipients(report.organizationId)).filter(
    (email) => !operators.includes(email),
  );
  const sends: Array<{ to: string; audience: "org" | "operator" }> = [
    ...members.map((to) => ({ to, audience: "org" as const })),
    ...operators.map((to) => ({ to, audience: "operator" as const })),
  ];
  const reportUrl = appUrl(`/brands/${report.brandId}/reports/${input.reportId}`);
  for (const { to, audience } of sends) {
    const email = reportPdfFailedEmail({
      audience,
      brandName: brand?.name ?? "",
      organizationName: org?.name ?? "",
      periodLabel: report.periodLabel,
      reasonLabel: PDF_FAILURE_LABELS[input.reason],
      reason: input.reason,
      reportUrl,
    });
    await sendEmailOrThrow({
      to,
      ...email,
      category: "alert",
      organizationId: report.organizationId,
      idempotencyKey: idempotencyKeyFor(`report-pdf-failed:${input.reportId}:${input.runKey}`, to),
    });
  }
  console.warn(
    JSON.stringify({
      event: "report_pdf_failed",
      reportId: input.reportId,
      organizationId: report.organizationId,
      reason: input.reason,
      alerted: sends.length,
      ...(operators.length === 0 ? { note: "PLATFORM_ADMIN_EMAILS is not set" } : {}),
    }),
  );
  return sends.length;
}
