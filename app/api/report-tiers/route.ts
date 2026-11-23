import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isEnabled } from "@/lib/flags/flags";
import { workspaceTierOptions } from "@/lib/reports/report-tier-choice";

/**
 * S01 part 8 (LLD 8.1.7): the workspace's report types, for forms that aren't about one brand -- the delivery-schedule
 * form's "Report type" (Agency). `{ enabled: false }` while report_v2 is off (the form is then as today). Otherwise each
 * tier's name (the workspace's own names on Agency and up, D-RT3), appendix E's description and, for a tier above the
 * plan, the plan it needs. Read under the workspace's RLS context; nothing here is a plan's price or a cost.
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isEnabled("report_v2", currentUser.organizationId)))
    return NextResponse.json({ enabled: false });
  const { maxTier, options } = await withRlsContext(currentUser.organizationId, (tx) =>
    workspaceTierOptions(tx, currentUser.organizationId),
  );
  return NextResponse.json({ enabled: true, maxTier, tiers: options });
}
