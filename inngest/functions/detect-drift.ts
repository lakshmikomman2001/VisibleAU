import { and, desc, eq, ne } from "drizzle-orm";
import { db, setRlsContext } from "@/db/client";
import { audits, driftAlerts } from "@/db/schema";
import { detectDrift } from "@/lib/drift/detect";
import { inngest } from "@/lib/inngest/client";

export const detectDriftFn = inngest.createFunction(
  { id: "detect-drift", retries: 2, triggers: [{ event: "audit.complete" }] },
  async ({ event, step }: { event: { data: { auditId: string; brandId?: string; organizationId?: string } }; step: any }) => {
    const { auditId, brandId: eventBrandId, organizationId: eventOrgId } = event.data;

    const loaded = await step.run("load-audits", async () => {
      const [current] = await db.select().from(audits).where(eq(audits.id, auditId));
      if (!current) return null;

      const bId = eventBrandId ?? current.brandId;
      const orgId = eventOrgId ?? current.organizationId;
      await setRlsContext(db, orgId);

      const [previous] = await db
        .select()
        .from(audits)
        .where(
          and(
            eq(audits.brandId, bId),
            ne(audits.id, auditId),
            eq(audits.status, "complete"),
          ),
        )
        .orderBy(desc(audits.createdAt))
        .limit(1);

      return { current, previous: previous ?? null, brandId: bId, organizationId: orgId };
    });

    if (!loaded) return { skipped: true, reason: "audit_not_found" };
    if (!loaded.previous) return { skipped: true, reason: "first_audit_no_comparison" };

    const { current, previous, brandId, organizationId } = loaded;

    const currentScores = (current.metadata as Record<string, unknown>)?.scores as Record<string, number> | undefined ?? {};
    const previousScores = (previous.metadata as Record<string, unknown>)?.scores as Record<string, number> | undefined ?? {};

    const currentCIs = (current.confidenceIntervals as Record<string, { lower: number; upper: number }>) ?? {};
    const previousCIs = (previous.confidenceIntervals as Record<string, { lower: number; upper: number }>) ?? {};

    const result = await step.run("compute-drift", () =>
      detectDrift({
        currentScores,
        previousScores,
        currentCIs,
        previousCIs,
        currentComposite: Number(current.scoreComposite ?? 0),
        previousComposite: Number(previous.scoreComposite ?? 0),
      }),
    );

    if (!result.hasSignificant) return { skipped: true, reason: "within_noise" };

    await step.run("persist-alert", async () => {
      await setRlsContext(db, organizationId);
      await db.insert(driftAlerts).values({
        organizationId,
        brandId,
        currentAuditId: auditId,
        previousAuditId: previous.id,
        severity: result.compositeSeverity,
        scoreDelta: String(result.scoreDelta),
        dimensionDeltas: result.dimensionDeltas,
      });
    });

    if (result.compositeSeverity !== "within_noise") {
      await inngest.send({
        name: "drift.detected",
        data: { brandId, organizationId, auditId },
      });
    }

    return { severity: result.compositeSeverity, delta: result.scoreDelta };
  },
);
