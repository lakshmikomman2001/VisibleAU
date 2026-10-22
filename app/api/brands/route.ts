import { and, count, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { checkBrandLimit, inheritRegion } from "@/lib/brands";
import { MAX_COMPARISON_COMPETITORS } from "@/lib/brands/competitor-limits";
import { normalizeBrandName } from "@/lib/brands/normalize";
import { AU_STATES } from "@/lib/constants/au";
import { inngest } from "@/lib/inngest/client";
import { SUBURB_ENTRY_REGEX } from "@/lib/locations";

const AU_STATE_CODES = AU_STATES.map((s) => s.code) as [string, ...string[]];

const createBrandSchema = z.object({
  // Vunnara Build 1, Part A: trim + collapse internal whitespace at
  // write time, so a stored name is never " Omega Services" with a
  // leading space (app/api/brands/route.ts's own pre-fix bug) that
  // detection then has to work around. min/max validate the NORMALIZED
  // result (via .pipe), not the raw input -- an all-whitespace "name"
  // must fail validation, not silently become an empty string.
  name: z.string().transform(normalizeBrandName).pipe(z.string().min(1).max(100)),
  domain: z.string().min(1).max(253),
  vertical: z.enum(["tradies", "allied_health", "saas"]),
  abn: z
    .string()
    .regex(/^\d{2}\s?\d{3}\s?\d{3}\s?\d{3}$/, "Must be an 11-digit ABN")
    .optional(),
  // "Cap competitor comparisons", item 2 -- run-comparison-prompts.ts
  // makes one paid LLM call per (competitor x enabled engine); this
  // caps the input at the API boundary, not just at comparison time,
  // so an owner gets a clear rejection instead of silently having
  // extras dropped later.
  competitors: z
    .array(z.string())
    .max(MAX_COMPARISON_COMPETITORS, `Maximum ${MAX_COMPARISON_COMPETITORS} competitors`)
    .optional()
    .default([]),
  primaryRegions: z
    .array(
      z
        .string()
        .regex(SUBURB_ENTRY_REGEX, "Format: STATE:Suburb (e.g. NSW:Bondi, VIC:Fitzroy)"),
    )
    .optional()
    .default([]),
  // Vunnara Build 1, Part D: structured, confirmed location. Optional
  // at the schema level (old callers/tests don't send it), but the
  // wizard itself always sends either locationMode: "online_only" or
  // a full fixed location -- no silent default lives here or anywhere
  // downstream (NO MOCK DATA IN PRODUCTION: never guess a location).
  locationMode: z.enum(["fixed", "online_only"]).optional(),
  suburb: z.string().trim().min(1).max(100).optional(),
  // Vunnara hotfix (18 Oct, post-df27ef8): nullable -- the wizard sends
  // city: null explicitly when the typed suburb isn't in the curated
  // lib/locations list (never a guessed/invented city).
  city: z.string().trim().min(1).max(100).nullable().optional(),
  state: z.enum(AU_STATE_CODES).optional(),
  country: z.string().trim().min(1).max(100).optional(),
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

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const orgBrands = await tx
      .select()
      .from(brands)
      .where(and(eq(brands.organizationId, currentUser.organizationId), isNull(brands.deletedAt)));

    return NextResponse.json({ brands: orgBrands });
  });
}

export async function POST(req: Request) {
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
  const parsed = createBrandSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const msg = Object.entries(fieldErrors)
      .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
      .join("; ");
    return NextResponse.json({ error: msg || "Invalid input" }, { status: 400 });
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [existing] = await tx
      .select({ count: count() })
      .from(brands)
      .where(and(eq(brands.organizationId, currentUser.organizationId), isNull(brands.deletedAt)));

    const [sub] = await tx
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, currentUser.organizationId))
      .limit(1);
    const tier = sub?.tier ?? "free";

    if (!checkBrandLimit(tier, existing.count)) {
      return NextResponse.json(
        { error: "Brand limit reached for your tier. Upgrade to add more brands." },
        { status: 403 },
      );
    }

    const region = inheritRegion(currentUser.organization);

    const [brand] = await tx
      .insert(brands)
      .values({
        organizationId: currentUser.organizationId,
        name: parsed.data.name,
        domain: cleanDomain(parsed.data.domain),
        vertical: parsed.data.vertical,
        region,
        abn: parsed.data.abn ?? null,
        competitors: parsed.data.competitors,
        primaryRegions: parsed.data.primaryRegions,
        locationMode: parsed.data.locationMode ?? null,
        suburb: parsed.data.suburb ?? null,
        city: parsed.data.city ?? null,
        state: parsed.data.state ?? null,
        country: parsed.data.country ?? null,
        locationConfirmedAt: parsed.data.locationMode ? new Date() : null,
      })
      .returning();

    try {
      await inngest.send({ name: "brand/created", data: { brandId: brand.id } });
    } catch (err: unknown) {
      console.error("[brands/POST] Inngest send failed", err);
    }

    return NextResponse.json({ brand }, { status: 201 });
  });
}
