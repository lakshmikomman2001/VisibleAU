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
import { BudgetPolicyService } from "@/lib/platform/budget-policy.service";

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
    // (or an external caller -- a CI pipeline, an API-key integration)
    // turns into a call to action, rather than falling back.
    //
    // Build 1 addendum (entry-point check): 409, not 400 -- this isn't
    // a malformed request, it's a real, current state conflict (the
    // resource exists and is valid, it just isn't ready for the
    // requested action yet). confirmUrl lets any caller -- the brand
    // page's own "Run audit" button, or an external CI script -- link
    // straight to where this gets resolved, and a CI integration can
    // treat this specific code as "skip the gate, don't fail the
    // build" rather than a real audit failure.
    if (
      !brandReadyForAudit({
        classificationStatus: brand.classificationStatus,
        classification: brand.classification,
        categoryConfirmedAt: brand.categoryConfirmedAt,
        categories: brand.categories,
        audience: brand.audience,
        locationMode: brand.locationMode,
      })
    ) {
      return NextResponse.json(
        {
          error: "brand_needs_confirmation",
          message: "Confirm your business type and location before running an audit.",
          confirmUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/brands/${brandId}#confirm-business-details`,
        },
        { status: 409 },
      );
    }

    // "Make the daily spend cap real", item 2 -- checked BEFORE
    // creating the audit row, mirroring brandReadyForAudit above: this
    // is the ONE place that ever sends the "audit.run" event (inngest/
    // functions/run-audit.ts's only trigger), so blocking here is
    // sufficient to keep that path's run from starting at all -- no
    // orphan "pending" row, no engine calls, nothing to clean up.
    const dailySpend = await BudgetPolicyService.checkDailySpend(currentUser.organizationId);
    if (!dailySpend.allowed) {
      return NextResponse.json(
        { error: "daily_spend_cap_exceeded", message: "Daily spending limit reached; audits resume tomorrow." },
        { status: 429 },
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
