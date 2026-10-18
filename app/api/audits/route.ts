import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { getNextAuditNumber } from "@/lib/audit/numbering";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { runTechnicalAuditInline } from "@/lib/audit/run-technical-audit-inline";
import { getCurrentUser } from "@/lib/auth/current-user";
import { brandReadyForAudit } from "@/lib/brands/needs-confirmation";
import { inngest } from "@/lib/inngest/client";
import { METHODOLOGY_VERSION } from "@/lib/llm/methodology";

const createAuditSchema = z.object({
  brandId: z.string().uuid(),
  scenario: z.enum(["happy_path", "no_mention", "partial_failure", "rate_limited"]).optional(),
});

export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createAuditSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { brandId, scenario } = parsed.data;

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
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

    // Build 1 addendum, item 9: never silently run a generic or
    // stale-classification pack for a brand that hasn't confirmed its
    // business type and location -- block, with a clear reason the UI
    // turns into a call to action, rather than falling back.
    if (
      !brandReadyForAudit({
        classificationStatus: brand.classificationStatus,
        classification: brand.classification,
        categoryConfirmedAt: brand.categoryConfirmedAt,
        locationMode: brand.locationMode,
      })
    ) {
      return NextResponse.json(
        {
          error: "needs_confirmation",
          message: "Confirm your business type and location before running an audit.",
        },
        { status: 400 },
      );
    }

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
        // Vunnara Build 1, Part E.2: remembers which prompt-pack
        // generation this audit actually ran, so a later regeneration
        // never silently rewrites what an already-completed audit used.
        promptPackVersion: brand.promptPackVersion ?? 1,
        // Vunnara Build 1, Part G.7: this audit runs under the CURRENT
        // build's methodology (web-grounded, v2) -- never inferred,
        // always the named constant.
        methodologyVersion: METHODOLOGY_VERSION,
      })
      .returning({ id: audits.id, auditNumber: audits.auditNumber });
    const auditId = inserted.id;
    const auditNumber = inserted.auditNumber;

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

    runTechnicalAuditInline(auditId, brandId).catch((err) =>
      console.error("[tech-audit] Inline execution failed:", err),
    );

    return NextResponse.json({ auditId, auditNumber }, { status: 201 });
  });
}
