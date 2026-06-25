import { and, asc, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { auditSchedules, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { calculateNextRun } from "@/lib/scheduling/calculate-next-run";
import { TIER_AUDIT_LIMITS } from "@/lib/scheduling/tier-limits";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

  const schedules = await db
    .select({
      id: auditSchedules.id,
      brandId: auditSchedules.brandId,
      brandName: brands.name,
      domain: brands.domain,
      frequency: auditSchedules.frequency,
      status: auditSchedules.status,
      nextRunAt: auditSchedules.nextRunAt,
      lastRunAt: auditSchedules.lastRunAt,
      pausedReason: auditSchedules.pausedReason,
      createdAt: auditSchedules.createdAt,
    })
    .from(auditSchedules)
    .innerJoin(brands, eq(auditSchedules.brandId, brands.id))
    .where(eq(auditSchedules.organizationId, currentUser.organizationId))
    .orderBy(asc(brands.name));

  return NextResponse.json({ schedules });
}

const createSchema = z.object({ brandId: z.string().uuid() });

export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { brandId } = parsed.data;
  const tier = currentUser.organization.tier as keyof typeof TIER_AUDIT_LIMITS;
  const limits = TIER_AUDIT_LIMITS[tier];
  if (!limits || limits.maxScheduled === 0) {
    return NextResponse.json(
      { error: "Your plan does not include scheduled audits." },
      { status: 403 },
    );
  }

  const frequency = limits.frequency;

  const [brand] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(
      and(eq(brands.id, brandId), eq(brands.organizationId, currentUser.organizationId)),
    );

  if (!brand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [existing] = await db
    .select({ id: auditSchedules.id })
    .from(auditSchedules)
    .where(
      and(
        eq(auditSchedules.brandId, brandId),
        eq(auditSchedules.organizationId, currentUser.organizationId),
      ),
    );

  if (!existing) {
    if (Number.isFinite(limits.maxScheduled)) {
      const [{ c }] = await db
        .select({ c: count() })
        .from(auditSchedules)
        .where(eq(auditSchedules.organizationId, currentUser.organizationId));
      if (c >= limits.maxScheduled) {
        return NextResponse.json(
          {
            error: `You've reached your plan's limit of ${limits.maxScheduled} scheduled audits. Remove one or upgrade.`,
          },
          { status: 409 },
        );
      }
    }

    const [created] = await db
      .insert(auditSchedules)
      .values({
        organizationId: currentUser.organizationId,
        brandId,
        frequency,
        status: "active",
        nextRunAt: calculateNextRun(frequency, new Date()),
      })
      .returning();

    return NextResponse.json({ schedule: created }, { status: 201 });
  }

  const [updated] = await db
    .update(auditSchedules)
    .set({
      frequency,
      status: "active",
      pausedReason: null,
      nextRunAt: calculateNextRun(frequency, new Date()),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(auditSchedules.id, existing.id),
        eq(auditSchedules.organizationId, currentUser.organizationId),
      ),
    )
    .returning();

  return NextResponse.json({ schedule: updated });
}
