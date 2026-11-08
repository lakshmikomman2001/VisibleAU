import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { INVITE_UNUSABLE_REFUSAL, inviteSignInAddress } from "@/lib/auth/invite";
import { inviteRateLimitRefusal } from "@/lib/auth/invite-rate-limit";
import { PASSWORD_MAX_LENGTH } from "@/lib/auth/password-rules";
import { auth } from "@/lib/auth/server";
import { markInvitedAddressVerified } from "@/lib/auth/sign-in-account";

const bodySchema = z.object({ password: z.string().min(1).max(PASSWORD_MAX_LENGTH) });

const WRONG_PASSWORD = {
  error: "That password isn't right. Try again, or reset it.",
  code: "wrong_password",
};

/** better-auth's answer to a sign-in, as a status and its error code (asResponse: true, or thrown). */
async function attempt(
  email: string,
  password: string,
  headers: Headers,
): Promise<{ ok: true; cookies: string[] } | { ok: false; status: number; code: string | null }> {
  try {
    const res = await auth.api.signInEmail({
      body: { email, password },
      headers,
      asResponse: true,
    });
    if (res.ok) return { ok: true, cookies: res.headers.getSetCookie() };
    const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
    return {
      ok: false,
      status: res.status,
      code: typeof body?.code === "string" ? body.code : null,
    };
  } catch (e) {
    const err = e as { statusCode?: unknown; body?: { code?: unknown } };
    return {
      ok: false,
      status: typeof err.statusCode === "number" ? err.statusCode : 500,
      code: typeof err.body?.code === "string" ? err.body.code : null,
    };
  }
}

/**
 * Live invite test follow-ups (8 Nov), part 2 -- signing in through an invite to an address that has an
 * account (with or without a profile). The address is the invite's own (lib/auth/invite.ts
 * inviteSignInAddress), never one the browser sends; only the password comes from the form. better-auth
 * checks it, as its own sign-in does.
 *
 * An account whose address isn't verified yet: better-auth refuses it with EMAIL_NOT_VERIFIED, which it only
 * says after accepting the password (node_modules/better-auth/dist/api/routes/sign-in.mjs checks the
 * password first). The token proves the address -- it only ever left the app in the email to it -- as it does
 * for an account made through the invite, so the address is marked verified (auth_users.email_verified, as
 * better-auth's own link would) and the sign-in goes through. Never without the password: an account someone
 * else registered with this address stays theirs to verify. Then the invite page accepts, and an account with
 * no profile gets one in the inviting workspace (claimInviteForAccount).
 *
 * Public (middleware.ts: /api/invites). Rate-limited per caller and per token, like the invite sign-up; an
 * unknown, expired or used token gets the one answer.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string; token: string }> },
) {
  const { orgId, token } = await params;
  const limited = await inviteRateLimitRefusal(req, orgId, token);
  if (limited) return limited;

  const { status: unusableStatus, ...unusable } = INVITE_UNUSABLE_REFUSAL;
  if (!z.string().uuid().safeParse(orgId).success || token.length < 10) {
    return NextResponse.json(unusable, { status: unusableStatus });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter your password." }, { status: 400 });

  const target = await inviteSignInAddress(orgId, token);
  if (!target.ok) {
    const { status, ...refusal } = target.refusal;
    return NextResponse.json(refusal, { status });
  }

  let result = await attempt(target.email, parsed.data.password, req.headers);
  if (!result.ok && result.code === "EMAIL_NOT_VERIFIED") {
    if (await markInvitedAddressVerified(target.email)) {
      console.log(JSON.stringify({ event: "invite_proved_address", organizationId: orgId }));
    }
    result = await attempt(target.email, parsed.data.password, req.headers);
  }
  if (!result.ok) {
    return result.status === 401 || result.status === 403
      ? NextResponse.json(WRONG_PASSWORD, { status: 401 })
      : NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const res = NextResponse.json({ signedIn: true });
  for (const cookie of result.cookies) res.headers.append("set-cookie", cookie);
  return res;
}
