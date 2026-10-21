import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { serviceDb } from "@/db/client";
import { audits, citations, engineCallFailures, organizations } from "@/db/schema";
import { failIfStale } from "@/lib/audit/stale-audit-guard";
import { SAMPLE_AUDIT_STALE_THRESHOLD_MS } from "@/lib/sample-audit/config";
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
    .select({ status: audits.status, metadata: audits.metadata, totalCalls: audits.totalCalls })
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

  // Audit reliability, Part C, item 2 -- lazy stale-run guard: a sample
  // left pending/running well past its own deadline (no dedicated cron
  // exists yet) is flipped to failed, with reason "Timed out", right
  // here, before this response is built -- so the running page's very
  // next poll already shows the failure and "Try again" instead of
  // climbing a fake progress bar forever.
  let status = audit.status;
  if (status === "pending" || status === "running") {
    const wentStale = await failIfStale(serviceDb, auditId, SAMPLE_AUDIT_STALE_THRESHOLD_MS);
    if (wentStale) status = "failed";
  }

  // Part C, item 3 -- real progress: how many of the planned calls have
  // actually returned (succeeded, into citations, or failed, into
  // engine_call_failures -- Part A), driving "k of N answers received"
  // instead of the old client-side-only fake bar that just climbed to
  // 95% on a timer regardless of real progress.
  const [[{ citationCount }], [{ failureCount }]] = await Promise.all([
    serviceDb
      .select({ citationCount: count() })
      .from(citations)
      .where(eq(citations.auditId, auditId)),
    serviceDb
      .select({ failureCount: count() })
      .from(engineCallFailures)
      .where(eq(engineCallFailures.auditId, auditId)),
  ]);

  return NextResponse.json({
    status,
    answeredCount: Number(citationCount) + Number(failureCount),
    totalCalls: audit.totalCalls,
  });
}
