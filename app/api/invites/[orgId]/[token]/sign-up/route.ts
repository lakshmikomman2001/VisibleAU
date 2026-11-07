import { hashPassword } from "better-auth/crypto";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { INVITE_NOT_FOUND, signUpByInvite } from "@/lib/auth/invite";
import { auth } from "@/lib/auth/server";

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(MIN_PASSWORD).max(MAX_PASSWORD),
});

/**
 * Team follow-ups (31 Oct), item 4 -- signing up through an invite sent to an address with no account. The
 * account, its profile in the inviting workspace and the accepted membership are made in one transaction
 * keyed by the token (lib/auth/invite.ts signUpByInvite), with no workspace of its own; the address counts as
 * verified only because it's the invited one. Then it's signed in, through better-auth, and lands in the
 * workspace.
 *
 * Public (middleware.ts): nobody is signed in yet. The token is the key.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string; token: string }> },
) {
  const { orgId, token } = await params;
  if (!z.string().uuid().safeParse(orgId).success || token.length < 10) {
    return NextResponse.json({ error: INVITE_NOT_FOUND }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const tooShort = parsed.error.issues.some((i) => i.path[0] === "password");
    return NextResponse.json(
      {
        error: tooShort
          ? `Use a password of ${MIN_PASSWORD} to ${MAX_PASSWORD} characters.`
          : "Enter your name, and the address the invitation was sent to.",
      },
      { status: 400 },
    );
  }

  const joined = await signUpByInvite({
    organizationId: orgId,
    token,
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash: await hashPassword(parsed.data.password),
  });
  if (!joined.ok) {
    return NextResponse.json(
      {
        error: joined.refusal.error,
        ...(joined.refusal.code ? { code: joined.refusal.code } : {}),
      },
      { status: joined.refusal.status },
    );
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
