import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { reportDeliverySchedules, subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isTierAtLeast } from "@/lib/brands";

const createScheduleSchema = z
  .object({
    brandId: z.string().uuid().optional(),
    templateId: z.string().uuid().optional(),
    frequency: z.enum(["weekly", "monthly"]),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(28).optional(),
    timeOfDay: z.string().default("23:00"),
    recipientEmails: z.array(z.email()).min(1),
    isActive: z.boolean().default(true),
  })
  .refine((d) => d.frequency !== "weekly" || d.dayOfWeek != null, {
    message: "day_of_week required for weekly",
  })
  .refine((d) => d.frequency !== "monthly" || d.dayOfMonth != null, {
    message: "day_of_month required for monthly",
  });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (orgId !== currentUser.organizationId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [sub] = await tx
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, currentUser.organizationId))
      .limit(1);

    const tier = sub?.tier ?? "free";
    if (!isTierAtLeast(tier, "agency")) {
      return NextResponse.json(
        { error: "Delivery schedules require Agency tier or above" },
        { status: 403 },
      );
    }

    const schedules = await tx
      .select()
      .from(reportDeliverySchedules)
      .where(eq(reportDeliverySchedules.organizationId, currentUser.organizationId));

    return NextResponse.json(schedules);
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (orgId !== currentUser.organizationId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [sub] = await tx
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, currentUser.organizationId))
      .limit(1);

    const tier = sub?.tier ?? "free";
    if (!isTierAtLeast(tier, "agency")) {
      return NextResponse.json(
        { error: "Delivery schedules require Agency tier or above" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const parsed = createScheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const [schedule] = await tx
      .insert(reportDeliverySchedules)
      .values({
        organizationId: currentUser.organizationId,
        brandId: parsed.data.brandId ?? null,
        templateId: parsed.data.templateId ?? null,
        frequency: parsed.data.frequency,
        dayOfWeek: parsed.data.frequency === "weekly" ? parsed.data.dayOfWeek! : null,
        dayOfMonth: parsed.data.frequency === "monthly" ? parsed.data.dayOfMonth! : null,
        timeOfDay: parsed.data.timeOfDay,
        recipientEmails: parsed.data.recipientEmails,
        isActive: parsed.data.isActive,
      })
      .returning();

    return NextResponse.json(schedule, { status: 201 });
  });
}
