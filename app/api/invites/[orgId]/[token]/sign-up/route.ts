import { hashPassword } from "better-auth/crypto";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { INVITE_UNUSABLE_REFUSAL, signUpByInvite } from "@/lib/auth/invite";
import { inviteRateLimitRefusal } from "@/lib/auth/invite-rate-limit";
import { passwordProblem } from "@/lib/auth/password-rules";
import { auth } from "@/lib/auth/server";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  // Display only: the account gets the invite's address (signUpByInvite). One sent anyway must be it.
  email: z.string().email().optional(),
  password: z.string(),
});

/**
 * Team follow-ups (31 Oct), item 4 -- signing up through an invite sent to an address with no account. The
 * account, its profile in the inviting workspace and the accepted membership are made in one transaction
 * keyed by the token (lib/auth/invite.ts signUpByInvite), with no workspace of its own; the address counts as
 * verified only because it's the invited one. Then it's signed in, through better-auth, and lands in the
 * workspace.
 *
 * Public (middleware.ts): nobody is signed in yet. The token is the key. Follow-ups from d247ba7..f13411d,
 * part 3: rate-limited per caller and per token; the password rule is the normal sign-up's
 * (lib/auth/password-rules.ts); the password is hashed before the token is looked at, so an unknown, expired
 * or used token takes as long as a good one to refuse, and gets the same 404 and body.
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
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter your name, and the address the invitation was sent to." },
      { status: 400 },
    );
  }
  const weak = passwordProblem(parsed.data.password);
  if (weak) return NextResponse.json({ error: weak, code: "weak_password" }, { status: 400 });

  const joined = await signUpByInvite({
    organizationId: orgId,
    token,
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash: await hashPassword(parsed.data.password),
  });
  if (!joined.ok) {
    const { status, ...refusal } = joined.refusal;
    return NextResponse.json(refusal, { status });
  }

  // The account exists, verified, and is in the workspace: sign it in the way the sign-in form does.
  const signedIn = await auth.api
    .signInEmail({
      body: { email: joined.email, password: parsed.data.password },
      headers: req.headers,
      asResponse: true,
    })
    .catch(() => null);
  const res = NextResponse.json(
    { joined: true, memberId: joined.memberId, signedIn: signedIn?.ok ?? false },
    { status: 201 },
  );
  for (const cookie of signedIn?.ok ? signedIn.headers.getSetCookie() : []) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
}
