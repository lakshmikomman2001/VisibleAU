import { Resend } from "resend";
import { getOrgTimezone } from "@/lib/platform/org-timezone";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error("RESEND_API_KEY is not set — cannot send email.");
    }
    _resend = new Resend(key);
  }
  return _resend;
}

export async function sendDigestEmail(to: string, html: string): Promise<void> {
  await getResend().emails.send({
    from: "digest@visibleau.com",
    to,
    // "Dates show in Sydney time" (23 Oct), item 3
    subject: `VisibleAU Weekly Digest — ${new Date().toLocaleDateString("en-AU", { timeZone: getOrgTimezone() })}`,
    html,
  });
}
