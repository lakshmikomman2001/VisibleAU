import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPlatformAdmin } from "@/lib/auth/platform-admin";
import {
  FlagChangeRejected,
  type FlagSaveResult,
  loadFeatureFlagAdminView,
  setGlobalFlag,
  setWorkspaceFlagOverride,
} from "@/lib/flags/admin";
import { FLAG_NAMES } from "@/lib/flags/flags";
import { operatorProfileId } from "@/lib/governance/google-surfaces";

const ROUTE = "/api/admin/feature-flags";

/**
 * S00 part 2 (22 Nov; LLD section 17): the feature flags on /admin/settings. Operators only, decided on the server
 * (lib/auth/platform-admin.ts), as /api/admin/settings: anyone else gets 403 and nothing else, neither the flags
 * nor a workspace's name. Every access attempt is logged by user id, never the email. Every change is written to
 * the Changes log (lib/flags/admin.ts); a save of the value in force answers "unchanged" and writes nothing.
 */
async function operator() {
  const { allowed, userId } = await checkPlatformAdmin();
  console.log(JSON.stringify({ event: "admin_access", userId, route: ROUTE, allowed }));
  return { allowed, userId };
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET(req: Request) {
  const { allowed } = await operator();
  if (!allowed) return forbidden();
  const workspace = new URL(req.url).searchParams.get("workspace");
  const id = workspace && z.string().uuid().safeParse(workspace).success ? workspace : null;
  return NextResponse.json(await loadFeatureFlagAdminView(id));
}

const body = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("global"), flag: z.enum(FLAG_NAMES), enabled: z.boolean() }),
  z.object({
    scope: z.literal("workspace"),
    workspaceId: z.string().uuid(),
    flag: z.enum(FLAG_NAMES),
    state: z.enum(["on", "off", "default"]),
  }),
]);

export async function POST(req: Request) {
  const { allowed, userId } = await operator();
  if (!allowed) return forbidden();

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That change isn't one this page can make." },
      { status: 400 },
    );
  }
  const actor = await operatorProfileId(userId);
  const change = parsed.data;
  let status: FlagSaveResult;
  try {
    if (change.scope === "global") {
      status = await setGlobalFlag(change.flag, change.enabled, actor);
    } else {
      const state = change.state === "default" ? null : change.state === "on";
      status = await setWorkspaceFlagOverride(change.workspaceId, change.flag, state, actor);
    }
  } catch (err) {
    if (err instanceof FlagChangeRejected) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
  console.log(
    JSON.stringify({
      event: "feature_flag_saved",
      userId,
      scope: change.scope,
      flag: change.flag,
      status,
    }),
  );
  return NextResponse.json({ ok: true, status });
}
