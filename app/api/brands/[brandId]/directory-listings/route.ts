import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brandDirectoryListings } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";
import {
  getDirectoriesForBrand,
  getDirectoriesForMarket,
} from "@/lib/directories/registry";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
import { recordAction } from "@/lib/governance/audit-trail";
import { isUuid } from "@/lib/validation/uuid";

/**
 * Vunnara (21 Oct, "directory listings... never scraping", Part C) --
 * the owner's own confirmed directory presence. GET lists every
 * enabled directory relevant to the brand (lib/directories/registry.ts)
 * merged with whatever this brand has already confirmed; PUT records
 * one directory's status. Neither ever fetches a profile URL -- a
 * pasted link is validated by host + the directory's own
 * profileUrlPattern (Part B), never requested.
 */

const putBodySchema = z.object({
  directoryKey: z.string().min(1).max(100),
  status: z.enum(["listed", "not_listed", "unsure"]),
  // Required only when status is "listed" -- checked below, not here,
  // so a wrong status/profileUrl pairing gets a specific error message
  // rather than zod's generic one.
  profileUrl: z.string().trim().max(500).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!isUuid(brandId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError) {
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    }
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const brand = await getBrandForOrg(brandId, currentUser.organizationId, tx);
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const relevant = getDirectoriesForBrand(brand.region, brand.categories);

    const existing = await tx
      .select()
      .from(brandDirectoryListings)
      .where(eq(brandDirectoryListings.brandId, brandId));
    const existingByKey = new Map(existing.map((row) => [row.directoryKey, row]));

    const directories = relevant.map((dir) => {
      const row = existingByKey.get(dir.key);
      return {
        key: dir.key,
        name: dir.name,
        // Vunnara: never pre-selected -- a directory this brand hasn't
        // confirmed yet has status: null, not a guessed default.
        status: row?.status ?? null,
        profileUrl: row?.profileUrl ?? null,
        confirmedAt: row?.confirmedAt ?? null,
      };
    });

    return NextResponse.json({ directories });
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!isUuid(brandId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError) {
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    }
    throw e;
  }

  const json = await req.json().catch(() => null);
  const parsed = putBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { directoryKey, status } = parsed.data;

  // Vunnara: checked against the registry, not trusted as a free
  // string -- an unknown or disabled key is never silently accepted
  // (there would be nothing to validate a profile link's host against).
  const directory = getDirectoriesForMarket("AU_EN", { enabledOnly: false })
    .concat(getDirectoriesForMarket("US_EN", { enabledOnly: false }))
    .find((d) => d.key === directoryKey);
  if (!directory || !directory.enabled) {
    return NextResponse.json({ error: "Unknown or disabled directory" }, { status: 400 });
  }

  // Vunnara: "listed" is a factual claim -- it must come with a link,
  // and that link must actually point at THIS directory. "not_listed"/
  // "unsure" never carry a profile URL, whatever was sent -- there's
  // nothing to validate a link against for those.
  let profileUrl: string | null = null;
  if (status === "listed") {
    if (!parsed.data.profileUrl) {
      return NextResponse.json(
        { error: "profileUrl is required when status is 'listed'" },
        { status: 400 },
      );
    }
    if (!directory.profileUrlPattern.test(parsed.data.profileUrl)) {
      return NextResponse.json(
        { error: `That link doesn't look like a ${directory.name} profile page` },
        { status: 400 },
      );
    }
    profileUrl = parsed.data.profileUrl;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const brand = await getBrandForOrg(brandId, currentUser.organizationId, tx);
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = new Date();
    const [row] = await tx
      .insert(brandDirectoryListings)
      .values({
        organizationId: currentUser.organizationId,
        brandId,
        directoryKey,
        status,
        profileUrl,
        confirmedAt: now,
        confirmedBy: currentUser.id,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [brandDirectoryListings.brandId, brandDirectoryListings.directoryKey],
        set: { status, profileUrl, confirmedAt: now, confirmedBy: currentUser.id, updatedAt: now },
      })
      .returning();

    await recordAction({
      organizationId: currentUser.organizationId,
      userId: currentUser.id,
      action: "directory_listing_confirmed",
      resourceType: "directory_listing",
      resourceId: row.id,
      metadata: { brandId, directoryKey, status },
    });

    return NextResponse.json({
      key: directory.key,
      name: directory.name,
      status: row.status,
      profileUrl: row.profileUrl,
      confirmedAt: row.confirmedAt,
    });
  });
}
