import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendDigestEmail(to: string, html: string): Promise<void> {
  await resend.emails.send({
    from: "digest@visibleau.com",
    to,
    subject: `VisibleAU Weekly Digest — ${new Date().toLocaleDateString("en-AU")}`,
    html,
  });
}
