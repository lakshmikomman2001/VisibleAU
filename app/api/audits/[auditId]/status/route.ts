import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/db/client";
import { audits } from "@/db/schema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;
  if (!z.string().uuid().safeParse(auditId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [audit] = await db
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
