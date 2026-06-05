import { and, count, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { checkBrandLimit, inheritRegion } from "@/lib/brands";

const createBrandSchema = z.object({
  name: z.string().min(1).max(100),
  domain: z.string().min(1).max(253),
  vertical: z.enum(["tradies", "allied_health", "saas"]),
  competitors: z.array(z.string()).optional().default([]),
  primaryRegions: z
    .array(
      z
        .string()
        .regex(
          /^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$/,
          "Format: STATE:Suburb (e.g. NSW:Bondi, VIC:Fitzroy)",
        ),
    )
    .optional()
    .default([]),
});

function cleanDomain(raw: string): string {
  let d = raw.trim();
  d = d.replace(/^https?:\/\//i, "");
  d = d.replace(/\/+$/, "");
  return d.toLowerCase();
}

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

  const orgBrands = await db
    .select()
    .from(brands)
    .where(and(eq(brands.organizationId, currentUser.organizationId), isNull(brands.deletedAt)));

  return NextResponse.json({ brands: orgBrands });
}

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
  const parsed = createBrandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [existing] = await db
    .select({ count: count() })
    .from(brands)
    .where(and(eq(brands.organizationId, currentUser.organizationId), isNull(brands.deletedAt)));

  if (!checkBrandLimit(currentUser.organization, existing.count)) {
    return NextResponse.json(
      { error: "Brand limit reached for your tier. Upgrade to add more brands." },
      { status: 403 },
    );
  }

  const region = inheritRegion(currentUser.organization);

  const [brand] = await db
    .insert(brands)
    .values({
      organizationId: currentUser.organizationId,
      name: parsed.data.name,
      domain: cleanDomain(parsed.data.domain),
      vertical: parsed.data.vertical,
      region,
      competitors: parsed.data.competitors,
      primaryRegions: parsed.data.primaryRegions,
    })
    .returning();

  return NextResponse.json({ brand }, { status: 201 });
}
