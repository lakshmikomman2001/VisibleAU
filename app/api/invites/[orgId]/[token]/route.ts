import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { INVITE_NOT_FOUND, previewInvite } from "@/lib/auth/invite";

/**
 * Team follow-ups (31 Oct), item 4 -- what the sign-up page shows for an invite link, before anyone is signed
 * in: the workspace's name and the role, and, for an invite to an address with no account yet, that address
 * (filled in and locked on the form). An expired, used or unknown invite answers why it can't be used.
 * Public (middleware.ts): the token, which only left the app in the email to that address, is the key.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string; token: string }> },
) {
  const { orgId, token } = await params;
  if (!z.string().uuid().safeParse(orgId).success || token.length < 10) {
    return NextResponse.json({ error: INVITE_NOT_FOUND }, { status: 404 });
  }
  const preview = await previewInvite(orgId, token);
  if (!preview.ok) {
    return NextResponse.json({ error: preview.refusal.error }, { status: preview.refusal.status });
  }
  const { ok: _ok, ...invite } = preview;
  return NextResponse.json(invite, { headers: { "Cache-Control": "private, no-store" } });
}
