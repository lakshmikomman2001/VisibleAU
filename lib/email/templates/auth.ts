import { orgDateTime } from "./audit-complete";
import { type RenderedEmail, renderEmail } from "./layout";

/** Password reset. The link and its expiry come from better-auth
 * (lib/auth/server.ts); this only says what they are. */
export function passwordResetEmail(i: { url: string; expiresInMinutes: number }): RenderedEmail {
  return renderEmail({
    category: "password_reset",
    subject: "Reset your Vunnara password",
    preview: "Choose a new password for your Vunnara account.",
    heading: "Reset your password",
    blocks: [
      {
        kind: "paragraph",
        text: "Someone asked to reset the password for the Vunnara account with this email address.",
      },
      { kind: "button", label: "Choose a new password", url: i.url },
      {
        kind: "note",
        text: `The link works once, for ${i.expiresInMinutes} minutes.`,
      },
    ],
    reason: "If you didn't ask for this, you can ignore this email. Your password won't change.",
  });
}

export function emailVerificationEmail(i: { url: string }): RenderedEmail {
  return renderEmail({
    category: "email_verification",
    subject: "Confirm your email address for Vunnara",
    preview: "One click to confirm this is your email address.",
    heading: "Confirm your email address",
    blocks: [
      {
        kind: "paragraph",
        text: "Confirm that this email address belongs to you. You need to do this once, for example before you can accept an invitation to a team.",
      },
      { kind: "button", label: "Confirm my email address", url: i.url },
    ],
    reason: "If you didn't create a Vunnara account, you can ignore this email.",
  });
}

export function teamInviteEmail(i: {
  inviterName: string;
  orgName: string;
  role: string;
  acceptUrl: string;
  expiresAt: Date;
  organizationId?: string;
}): RenderedEmail {
  return renderEmail({
    category: "team_invite",
    subject: `${i.inviterName} invited you to ${i.orgName} on Vunnara`,
    preview: `Join ${i.orgName} on Vunnara as ${i.role}.`,
    heading: `Join ${i.orgName} on Vunnara`,
    blocks: [
      {
        kind: "paragraph",
        text: `${i.inviterName} invited you to join ${i.orgName} on Vunnara as ${i.role}.`,
      },
      { kind: "button", label: "Accept the invitation", url: i.acceptUrl },
      {
        kind: "note",
        text: `Sign in with this email address to accept. The invitation expires ${orgDateTime(i.expiresAt, i.organizationId)}.`,
      },
    ],
    reason: `You're getting this because ${i.inviterName} invited this email address. If you weren't expecting it, you can ignore it.`,
  });
}
