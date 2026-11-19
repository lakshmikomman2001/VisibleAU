import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { technicalAudits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { technicalScoringOf } from "@/lib/technical-audit/scoring-version";
import { isUuid } from "@/lib/validation/uuid";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [audit] = await tx
      .select()
      .from(technicalAudits)
      .where(
        and(
          eq(technicalAudits.id, id),
          eq(technicalAudits.organizationId, currentUser.organizationId),
        ),
      );
    if (!audit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 20 Nov (part 7): with the rules it was scored under -- its version, its composite's maximum and each check's
    // (lib/technical-audit/scoring-version.ts) -- so a reader never takes today's maximum for an older audit's.
    return NextResponse.json({ ...audit, scoring: technicalScoringOf(audit) });
  });
}
