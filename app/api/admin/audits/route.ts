import { NextResponse } from "next/server";
import { z } from "zod";
import {
  loadTrendExclusionAdminView,
  setAuditTrendExclusion,
  TrendExclusionRejected,
} from "@/lib/admin/trend-exclusions";
import { TREND_EXCLUSION_REASON_MAX } from "@/lib/audit/trend-exclusion";
import { checkPlatformAdmin } from "@/lib/auth/platform-admin";
import { operatorProfileId } from "@/lib/governance/google-surfaces";

const ROUTE = "/api/admin/audits";

/**
 * 14 Nov, part 5 -- /admin/audits: exclude an audit from trends and comparisons, with a reason, or include it
 * again (lib/admin/trend-exclusions.ts). Operators only (lib/auth/platform-admin.ts), as /api/admin/settings:
 * anyone else gets 403 and nothing else. Every access attempt is logged by user id; every change goes in the
 * operator's change history.
 */
async function operator() {
  const { allowed, userId } = await checkPlatformAdmin();
  console.log(JSON.stringify({ event: "admin_access", userId, route: ROUTE, allowed }));
  return { allowed, userId };
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET() {
  const { allowed } = await operator();
  if (!allowed) return forbidden();
  return NextResponse.json(await loadTrendExclusionAdminView());
}

const body = z.object({
  auditId: z.string().uuid(),
  /** Null (or blank): include the audit in trends again. */
  reason: z.string().max(TREND_EXCLUSION_REASON_MAX).nullable(),
});

export async function POST(req: Request) {
  const { allowed, userId } = await operator();
  if (!allowed) return forbidden();

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: `Pick an audit, and give a reason of at most ${TREND_EXCLUSION_REASON_MAX} characters.`,
      },
      { status: 400 },
    );
  }
  const actor = await operatorProfileId(userId);
  try {
    const status = await setAuditTrendExclusion(parsed.data.auditId, parsed.data.reason, actor);
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    if (err instanceof TrendExclusionRejected) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
