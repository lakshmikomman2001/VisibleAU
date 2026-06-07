import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { getNextAuditNumber } from "@/lib/audit/numbering";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { getCurrentUser } from "@/lib/auth/current-user";
import { inngest } from "@/lib/inngest/client";

const createAuditSchema = z.object({
  brandId: z.string().uuid(),
  scenario: z.enum(["happy_path", "no_mention", "partial_failure", "rate_limited"]).optional(),
});

export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setRlsContext(db, currentUser.organizationId);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createAuditSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { brandId, scenario } = parsed.data;

  const [brand] = await db
    .select()
    .from(brands)
    .where(
      and(
        eq(brands.id, brandId),
        eq(brands.organizationId, currentUser.organizationId),
        isNull(brands.deletedAt),
      ),
    );
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { auditId, auditNumber } = await db.transaction(async (tx) => {
    const num = await getNextAuditNumber(currentUser.organizationId, tx);
    const [inserted] = await tx
      .insert(audits)
      .values({
        brandId,
        organizationId: currentUser.organizationId,
        auditNumber: num,
        triggeredBy: "manual",
        status: "pending",
        metadata: { mockScenario: scenario ?? null },
      })
      .returning({ id: audits.id, auditNumber: audits.auditNumber });
    return { auditId: inserted.id, auditNumber: inserted.auditNumber };
  });

  let inngestOk = false;
  try {
    await inngest.send({ name: "audit.run", data: { auditId } });
    inngestOk = true;
  } catch (err) {
    console.warn("[audit] Inngest send failed, running inline:", (err as Error).message);
  }

  if (!inngestOk) {
    runAuditInline(auditId).catch((err) =>
      console.error("[audit] Inline execution failed:", err),
    );
  }

  return NextResponse.json({ auditId, auditNumber }, { status: 201 });
}
