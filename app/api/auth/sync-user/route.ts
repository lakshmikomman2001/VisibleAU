import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@/lib/auth/server";
import { finishWorkspace, workspaceResponse } from "@/lib/auth/workspace";

const bodySchema = z.object({ organizationId: z.string().min(1) });

/**
 * Finishes the app's side of a better-auth organisation the signed-in
 * account created -- its workspace, profile and owner membership -- by
 * that organisation's id, sent explicitly. /no-workspace's "Open <org>".
 *
 * It used to take no id and use the session's active organisation, which
 * is never stored, then the account's first membership: the wrong one for
 * an account with an earlier half-finished organisation, so "Create
 * workspace" answered 404 "Org not found" (30 Oct, production).
 */
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return workspaceResponse({ ok: false, code: "session_ended" });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Send the organizationId of the workspace to finish.", code: "invalid_request" },
      { status: 400 },
    );
  }

  const { id, email, name } = session.user;
  return workspaceResponse(
    await finishWorkspace({ id, email, name: name ?? "" }, parsed.data.organizationId),
  );
}
