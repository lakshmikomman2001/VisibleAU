import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { serviceDb } from "@/db/client";
import { audits, organizations } from "@/db/schema";
import { checkSampleAuditReadRateLimit } from "@/lib/sample-audit/rate-limit";

const SAMPLE_ORG_SLUG = "__sample__";

// Task #46 (15th follow-up), Part B: this is the route actually polled
// every 3s by app/(marketing)/sample-audit/running/page.tsx, so of the two
// sample-audit status endpoints, THIS one carries the real public traffic
// -- rate limiting it matters more than the orphaned sibling
// app/api/audits/[auditId]/status/route.ts. Added the same read-rate-limit
// and the same redundant metadata.isSample check as defence in depth on
// top of the org-join this route already had (the org-join was already
// the stronger, DB-level guarantee -- the isSample check here is belt and
// suspenders, not the primary defence).
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
