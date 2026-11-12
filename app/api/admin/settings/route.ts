import { NextResponse } from "next/server";
import { z } from "zod";
import { loadGoogleOperatorHealth } from "@/lib/audit/google-surfaces/operator";
import { checkPlatformAdmin } from "@/lib/auth/platform-admin";
import {
  GOOGLE_SETTING_KEYS,
  GOOGLE_SURFACES,
  type GoogleSaveResult,
  GoogleSettingRejected,
  loadGoogleSurfaceAdminView,
  operatorProfileId,
  setBrandGooglePostcode,
  setWorkspaceGoogleOverride,
  updateGoogleSurfaceSetting,
} from "@/lib/governance/google-surfaces";

const ROUTE = "/api/admin/settings";

/**
 * Google AI surfaces, Phase 1, part 1 -- the operator's settings (/admin/settings). Operators only:
 * lib/auth/platform-admin.ts (PLATFORM_ADMIN_EMAILS, a verified address) decides who that is, on the
 * server. Everyone else gets 403 (the spec's choice; the older admin routes answer 404) and nothing else:
 * no settings, no workspace names. Every access attempt is logged by user id (never the email), as the
 * other admin routes do. Every change is written to the change history (lib/governance/google-surfaces.ts).
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
  const [view, health] = await Promise.all([
    loadGoogleSurfaceAdminView(workspace),
    loadGoogleOperatorHealth(),
  ]);
  return NextResponse.json({ ...view, health });
}

const settingNames = Object.keys(GOOGLE_SETTING_KEYS) as [
  keyof typeof GOOGLE_SETTING_KEYS,
  ...(keyof typeof GOOGLE_SETTING_KEYS)[],
];

const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("setting"), name: z.enum(settingNames), value: z.unknown() }),
  z.object({
    kind: z.literal("workspace"),
    workspaceId: z.string().uuid(),
    surface: z.enum(GOOGLE_SURFACES),
    state: z.enum(["on", "off", "default"]),
  }),
  z.object({
    kind: z.literal("brand"),
    brandId: z.string().uuid(),
    postcode: z.string().nullable(),
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
  // 12 Nov, part 5: "unchanged" when the value is the one in force -- nothing written, not even the history.
  let status: GoogleSaveResult;
  try {
    if (change.kind === "setting") {
      status = await updateGoogleSurfaceSetting(change.name, change.value, actor);
    } else if (change.kind === "workspace") {
      const state = change.state === "default" ? null : change.state === "on";
      status = await setWorkspaceGoogleOverride(change.workspaceId, change.surface, state, actor);
    } else {
      status = await setBrandGooglePostcode(change.brandId, change.postcode, actor);
    }
  } catch (err) {
    if (err instanceof GoogleSettingRejected) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true, status });
}
