import type { Mock } from "vitest";

/**
 * Follow-ups from 6e27afc..01a6a8c, part 4 -- an invite's token is stored only as its hash (migration
 * 0134), so the one place a test can find it is where a person would: the link in the invitation email.
 * The token from the last invitation `sendEmail` was asked to send to `to`, for workspace `orgId`. The link
 * is the invite page (/invite/<org>/<token>) or, for an address with no account, sign-up carrying it
 * (/sign-up?redirectTo=%2Finvite%2F<org>%2F<token>).
 */
export function inviteTokenFromEmail(sendEmail: Mock, to: string, orgId: string): string {
  const sent = sendEmail.mock.calls
    .map(([message]) => message as { to?: string })
    .filter((message) => message.to?.toLowerCase() === to.toLowerCase());
  const last = sent.at(-1);
  if (!last) throw new Error("no invitation was emailed to that address");
  const body = JSON.stringify(last);
  const match =
    body.match(new RegExp(`/invite/${orgId}/([A-Za-z0-9_-]{10,})`)) ??
    body.match(new RegExp(`%2Finvite%2F${orgId}%2F([A-Za-z0-9_-]{10,})`, "i"));
  if (!match) throw new Error("the invitation email has no invite link");
  return match[1];
}
