import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { serviceDb } from "@/db/client";
import { audits } from "@/db/schema";

// Task #46 (14th follow-up): serviceDb audit (MEDIUM). This route has no
// auth check and no organization_id/brand_id filter in the serviceDb query
// itself (:13-20) -- the ONLY thing standing between any caller and any
// audit row in the system is the application-level `metadata.isSample`
// boolean check at :27. Contrast with the sibling
// app/api/sample-audit/[auditId]/status/route.ts, which gets the same
// guarantee from an unforgeable DB-level join against the hard-coded
// `__sample__` org -- structurally impossible to return a real tenant's
// row no matter what auditId is supplied. This route instead trusts that
// `isSample` was set correctly at write time and never flipped by a bug,
// migration, admin tool, or test-seeding mistake; if a real customer
// audit's metadata ever has `isSample: true`, its status + full metadata
// become world-readable via a guessable/enumerable UUID with zero
// authentication. Recommend replacing this with the same organizations-join
// pattern the sibling route uses. Flagged for Sri, not fixed here (this
// follow-up only requires Highs to be fixed).
export async function GET(_req: Request, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  if (!z.string().uuid().safeParse(auditId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [audit] = await serviceDb
    .select({
      id: audits.id,
      status: audits.status,
      metadata: audits.metadata,
    })
    .from(audits)
    .where(eq(audits.id, auditId));

  if (!audit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const meta = audit.metadata as Record<string, unknown> | null;
  if (!meta?.isSample) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ status: audit.status });
}
