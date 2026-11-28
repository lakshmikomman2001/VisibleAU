import { possessive } from "@/lib/copy/possessive";
import { PRODUCT_NAME } from "@/lib/product";
import { type RenderedEmail, renderEmail } from "../layout";

/**
 * S04B part 2 (LLD amendment 100) -- to the operators (PLATFORM_ADMIN_EMAILS) only, when an engine's provider refused
 * calls because a spend limit, credit or quota on our account is reached. At most one per provider per 24 hours while
 * refusals continue (lib/audit/provider-quota.ts). It carries the provider's own message (a sentence such as "You have
 * reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC."), never a key or a
 * request header.
 */
export function engineProviderQuotaEmail(i: {
  /** "Claude". */
  engineName: string;
  /** providerQuotaAlertText: "{Engine} refused calls: its spend or quota limit is reached. {provider message}. Raise
   * the limit in the provider's console." */
  text: string;
  auditNumber: number;
  brandName: string;
  organizationName: string;
  adminUrl: string;
}): RenderedEmail {
  return renderEmail({
    category: "alert",
    subject: `[ops] ${i.engineName} refused calls: spend or quota limit reached (Audit #${i.auditNumber})`,
    preview: i.text,
    heading: `${i.engineName} refused calls`,
    blocks: [
      { kind: "headline", text: i.text },
      {
        kind: "paragraph",
        text: `First seen in Audit #${i.auditNumber} for ${i.brandName}. The rest of that audit's ${i.engineName} calls weren't sent, and later audits stop at the first refusal too. Customers see "a problem on our side", never the provider's message.`,
      },
      { kind: "button", label: "Open /admin/settings", url: i.adminUrl },
      { kind: "note", text: `Organisation: ${i.organizationName}.` },
    ],
    reason: `You're on ${possessive(PRODUCT_NAME)} operator list. This alert is sent at most once a day for each provider.`,
  });
}
