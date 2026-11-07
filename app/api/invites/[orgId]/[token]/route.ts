import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { INVITE_UNUSABLE_REFUSAL, previewInvite } from "@/lib/auth/invite";
import { inviteRateLimitRefusal } from "@/lib/auth/invite-rate-limit";

/**
 * Team follow-ups (31 Oct), item 4 -- what the sign-up page shows for an invite link, before anyone is signed
 * in: the workspace's name and the role, and, for an invite to an address with no account yet, that address
 * (filled in and locked on the form). Public (middleware.ts): the token, which only left the app in the email
 * to that address, is the key.
 *
 * Follow-ups from d247ba7..f13411d, part 3: rate-limited per caller and per token; and an unknown, expired or
 * used token -- or one that isn't even shaped like one -- gets the same 404 and body, after the same work.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgId: string; token: string }> },
) {
  const { orgId, token } = await params;
  const limited = await inviteRateLimitRefusal(req, orgId, token);
  if (limited) return limited;

  const { status, ...refusal } = INVITE_UNUSABLE_REFUSAL;
  if (!z.string().uuid().safeParse(orgId).success || token.length < 10) {
    return NextResponse.json(refusal, { status });
  }
  const preview = await previewInvite(orgId, token);
  if (!preview.ok) {
    const { status: refusedStatus, ...body } = preview.refusal;
    return NextResponse.json(body, { status: refusedStatus });
  }
  const { ok: _ok, ...invite } = preview;
  return NextResponse.json(invite, { headers: { "Cache-Control": "private, no-store" } });
}
