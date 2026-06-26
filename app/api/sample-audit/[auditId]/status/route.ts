import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/db/client";
import { audits, organizations } from "@/db/schema";

const SAMPLE_ORG_SLUG = "__sample__";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;
  if (!z.string().uuid().safeParse(auditId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [audit] = await db
    .select({ status: audits.status })
    .from(audits)
    .innerJoin(organizations, eq(audits.organizationId, organizations.id))
    .where(
      and(eq(audits.id, auditId), eq(organizations.slug, SAMPLE_ORG_SLUG)),
    );

  if (!audit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ status: audit.status });
}
