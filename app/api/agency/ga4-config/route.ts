import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const ga4Schema = z.object({
  ga4MeasurementId: z.string().min(1).max(50),
  ga4ApiSecret: z.string().min(1).max(100),
});

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = currentUser.organization;

  return NextResponse.json({
    ga4Config: {
      ga4MeasurementId: org.ga4MeasurementId ?? null,
      ga4ApiSecretSet: !!org.ga4ApiSecret,
    },
  });
}

export async function PATCH(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ga4Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await db
    .update(organizations)
    .set({
      ga4MeasurementId: parsed.data.ga4MeasurementId,
      ga4ApiSecret: parsed.data.ga4ApiSecret,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, currentUser.organizationId));

  return NextResponse.json({
    ga4Config: {
      ga4MeasurementId: parsed.data.ga4MeasurementId,
      ga4ApiSecretSet: true,
    },
  });
}
