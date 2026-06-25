import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { agencyBrandAssets } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const optionalUrl = z.union([z.string().url(), z.literal(""), z.null()]).optional();
const optionalEmail = z.union([z.string().email(), z.literal(""), z.null()]).optional();
const optionalText = (max: number) =>
  z.union([z.string().max(max), z.null()]).optional();

const upsertSchema = z.object({
  logoUrl: optionalUrl,
  primaryColor: optionalText(20),
  secondaryColor: optionalText(20),
  accentColor: optionalText(20),
  footerText: optionalText(500),
  contactLine: optionalText(200),
  agencyName: optionalText(100),
  contactEmail: optionalEmail,
});

function emptyToNull(v: string | null | undefined): string | null {
  return v?.trim() ? v.trim() : null;
}

function emptyToUndefined(v: string | null | undefined): string | undefined {
  return v?.trim() ? v.trim() : undefined;
}

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

  const [branding] = await db
    .select()
    .from(agencyBrandAssets)
    .where(
      and(
        eq(agencyBrandAssets.organizationId, currentUser.organizationId),
        isNull(agencyBrandAssets.brandId),
      ),
    );

  return NextResponse.json({ branding: branding ?? null });
}

export async function PATCH(req: Request) {
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

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.issues.map((i) => {
      const field = i.path.join(".");
      return field ? `${field}: ${i.message}` : i.message;
    });
    return NextResponse.json(
      { error: fieldErrors.join("; "), issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const values = {
    logoUrl: emptyToNull(parsed.data.logoUrl),
    primaryColor: emptyToUndefined(parsed.data.primaryColor),
    secondaryColor: emptyToUndefined(parsed.data.secondaryColor),
    accentColor: emptyToUndefined(parsed.data.accentColor),
    footerText: emptyToNull(parsed.data.footerText),
    contactLine: emptyToNull(parsed.data.contactLine),
    agencyName: emptyToNull(parsed.data.agencyName),
    contactEmail: emptyToNull(parsed.data.contactEmail),
  };

  const [branding] = await db
    .insert(agencyBrandAssets)
    .values({
      organizationId: currentUser.organizationId,
      brandId: null,
      ...values,
    })
    .onConflictDoUpdate({
      target: [agencyBrandAssets.organizationId, agencyBrandAssets.brandId],
      set: {
        ...values,
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json({ branding });
}
