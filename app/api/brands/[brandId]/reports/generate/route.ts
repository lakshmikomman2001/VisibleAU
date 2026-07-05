import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { serviceDb } from "@/db/client";
import { subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { inngest } from "@/lib/inngest/client";
import { formatPeriodLabel } from "@/lib/visibility/visibility-trend-aggregator";

const GROWTH_PLUS = ["growth", "agency", "agency_pro", "enterprise"];

const generateSchema = z.object({
  periodLabel: z.string().optional(),
  periodType: z.enum(["weekly", "monthly"]).default("weekly"),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [sub] = await serviceDb
    .select({ tier: subscriptions.tier })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, currentUser.organizationId))
    .limit(1);

  const tier = sub?.tier ?? "free";
  if (!GROWTH_PLUS.includes(tier)) {
    return NextResponse.json(
      { error: "Reports require Growth tier or above" },
      { status: 403 },
    );
  }

  const body = await req.json();
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const periodType = parsed.data.periodType;
  const periodLabel =
    parsed.data.periodLabel ?? formatPeriodLabel(new Date(), periodType);

  await inngest.send({
    name: "trend/aggregated",
    data: {
      brandId,
      organizationId: currentUser.organizationId,
      periodLabel,
      periodType,
      manual: true,
    },
  });

  return NextResponse.json({ message: "Report generation started", periodLabel }, { status: 202 });
}
