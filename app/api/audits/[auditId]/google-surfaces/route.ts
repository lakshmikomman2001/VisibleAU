import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { audits } from "@/db/schema";
import { loadGoogleSurfaceSummary } from "@/lib/audit/google-surfaces/summary";
import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * Google AI surfaces, Phase 1, part 3 -- an audit's Google Search AI block, for the audit page to poll while
 * Google is still being checked (the block reloads the page when it's complete). 404 for an audit that ran
 * without Google, as for one in another workspace.
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(_req: Request, { params }: { params: Promise<{ auditId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { auditId } = await params;
  if (!z.string().uuid().safeParse(auditId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [audit] = await tx
      .select({ id: audits.id })
      .from(audits)
      .where(and(eq(audits.id, auditId), eq(audits.organizationId, currentUser.organizationId)));
    if (!audit) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const summary = await loadGoogleSurfaceSummary(tx, auditId);
    if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(
      {
        status: summary.status,
        rows: summary.rows.map((r) => ({ surface: r.surface, line: r.line })),
      },
      { headers: NO_STORE },
    );
  });
}
