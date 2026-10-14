import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { serviceDb } from "@/db/client";
import { audits, organizations } from "@/db/schema";
import { checkSampleAuditReadRateLimit } from "@/lib/sample-audit/rate-limit";

const SAMPLE_ORG_SLUG = "__sample__";

// Task #46 (15th follow-up), Part B -- fixes the MEDIUM the 14th follow-up
// documented without fixing. No frontend code anywhere in this repo
// actually calls this route (checked: audit-running.tsx polls
// /api/audits/[auditId] directly, not .../status; the sample-audit running
// page polls the sibling app/api/sample-audit/[auditId]/status/route.ts) --
// it appears to be dead/superseded, but a dead route is still a live,
// publicly reachable HTTP endpoint, so it gets the same defence-in-depth
// fix as its sibling rather than being left as-is.
//
// serviceDb stays justified here (not a "prefer db" case): this route has
// no session/org context to scope an RLS transaction with -- the whole
// point is reading across potentially-any-org's audits by id, gated by the
// sample-org join below, same as the already-safe sibling route.
//
// Defence in depth, matching Part B's spec: BOTH the DB-level join against
// the hardcoded sample org (primary -- unforgeable, structurally cannot
// return a real tenant's row no matter what auditId is supplied) AND the
// app-level metadata.isSample check (secondary, redundant on purpose) must
// pass. A minimal field allow-list (just `status`) was already in place.
// auditId is validated as a real UUID (defaultRandom() in the schema --
// not sequential or otherwise guessable) before either check runs.
export async function GET(req: Request, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  if (!z.string().uuid().safeParse(auditId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await checkSampleAuditReadRateLimit(ip);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const [audit] = await serviceDb
    .select({ status: audits.status, metadata: audits.metadata })
    .from(audits)
    .innerJoin(organizations, eq(audits.organizationId, organizations.id))
    .where(and(eq(audits.id, auditId), eq(organizations.slug, SAMPLE_ORG_SLUG)));

  if (!audit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const meta = audit.metadata as Record<string, unknown> | null;
  if (!meta?.isSample) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ status: audit.status });
}
