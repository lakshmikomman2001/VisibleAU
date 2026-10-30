import { z } from "zod/v4";
import { auth } from "@/lib/auth/server";
import { createWorkspace, workspaceResponse } from "@/lib/auth/workspace";

const bodySchema = z.object({ name: z.string() });

/**
 * Creates a workspace by name for the signed-in account: sign-up's last
 * step, and /no-workspace's "Create workspace". A repeat after a
 * half-finished attempt finishes that one instead of making a second.
 */
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return workspaceResponse({ ok: false, code: "session_ended" });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return workspaceResponse({ ok: false, code: "invalid_name" });

  const { id, email, name } = session.user;
  return workspaceResponse(
    await createWorkspace(req.headers, { id, email, name: name ?? "" }, parsed.data.name),
  );
}
