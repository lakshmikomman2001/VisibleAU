import { possessive } from "@/lib/copy/possessive";
import { PRODUCT_NAME } from "@/lib/product";
import { type RenderedEmail, renderEmail } from "../layout";

/**
 * Google AI follow-ups (12 Nov), part 3 -- to the operators (PLATFORM_ADMIN_EMAILS) only, when the Google
 * provider refused the account (login rejected, out of credit) and an audit's Google run stopped early.
 * At most one per category per 24 hours (lib/audit/google-surfaces/operator.ts). It carries the category,
 * the provider's status code and where it happened -- never the credentials, a request header or the
 * provider's own message (that's on /admin/settings).
 */
export function googleProviderProblemEmail(i: {
  /** "login rejected", "out of credit". */
  label: string;
  statusCode: number;
  auditNumber: number;
  brandName: string;
  organizationName: string;
  /** "12 Nov 2026, 2:03 pm (Sydney)". */
  at: string;
  /** How many questions weren't sent because of it. */
  notSent: number;
  adminUrl: string;
}): RenderedEmail {
  const action =
    i.label === "out of credit"
      ? "Top up the DataForSEO balance, then run Test connection on /admin/settings."
      : "Check DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in Vercel (and redeploy), then run Test connection on /admin/settings.";
  return renderEmail({
    category: "alert",
    subject: `[ops] Google AI checks stopped: ${i.label} (Audit #${i.auditNumber})`,
    preview: `DataForSEO answered ${i.statusCode} at ${i.at}.`,
    heading: `Google AI checks stopped: ${i.label}`,
    blocks: [
      {
        kind: "headline",
        text: `DataForSEO answered ${i.statusCode} (${i.label}) at ${i.at}, in Audit #${i.auditNumber} for ${i.brandName}.`,
      },
      {
        kind: "paragraph",
        text: `The rest of that audit's Google questions weren't sent (${i.notSent}). Customers see "a problem on our side; it will be checked again on the next audit", never the provider's message.`,
      },
      { kind: "paragraph", text: action },
      { kind: "button", label: "Open /admin/settings", url: i.adminUrl },
      { kind: "note", text: `Organisation: ${i.organizationName}.` },
    ],
    reason: `You're on ${possessive(PRODUCT_NAME)} operator list. This alert is sent at most once a day for each kind of problem.`,
  });
}
