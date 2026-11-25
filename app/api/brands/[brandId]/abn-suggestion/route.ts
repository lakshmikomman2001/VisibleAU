import { eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { type AbnSuggestion, searchAbnByName } from "@/lib/brand-entity/abn-lookup";
import { runBrandEntityCheck } from "@/lib/brand-entity/entity-check";
import { isEnabled } from "@/lib/flags/flags";
import {
  assertBrandAccess,
  brandAccessErrorResponse,
  recordAction,
  roleRefusal,
} from "@/lib/governance";

/**
 * S01 part 11 (LLD 8.8.6, T8; contract P01.abn; flag abn_suggestion): "Is this your ABN?" in brand settings.
 * GET: the suggestion for a brand with no ABN in the Australian market -- searched once on the ABR by the business's
 *   name (MatchingNames, filtered by postcode or state, confirmed Active with AbnDetails: searchAbnByName), then kept
 *   in brands.abn_suggestion until it's answered; a search that found nothing isn't repeated for 30 days (one that
 *   failed, for a day). Any member who can see the brand.
 * POST { action: "confirm" | "dismiss" }: owners and admins (manage_brands). Confirm writes brands.abn (the same
 *   column as the ABN field), queues the entity check and goes in the audit trail; Not mine hides it for good.
 * Flag off: GET says there's none and POST is 404. Every read and write under the workspace's RLS context.
 */

type Stored =
  | {
      status: "found";
      suggestion: AbnSuggestion;
      answer?: "confirmed" | "dismissed";
      answeredAt?: string;
    }
  | { status: "none" | "failed"; checkedAt: string }
  /** S01C part 5b (LLD amendment 65): "Not mine", kept after retention cleared the suggestion's ABR data. */
  | { status: "dismissed" };

const DAY_MS = 86_400_000;
const AGAIN_AFTER_DAYS = { none: 30, failed: 1 } as const;

function storedOf(value: unknown): Stored | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as { status?: unknown };
  return v.status === "found" ||
    v.status === "none" ||
    v.status === "failed" ||
    v.status === "dismissed"
    ? (value as Stored)
    : null;
}

async function guard(brandId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return { refusal: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  if (!z.uuid().safeParse(brandId).success)
    return { refusal: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    const denied = brandAccessErrorResponse(e);
    if (denied) return { refusal: denied } as const;
    throw e;
  }
  return { currentUser } as const;
}

async function loadBrand(organizationId: string, brandId: string) {
  return withRlsContext(organizationId, async (tx) => {
    const [brand] = await tx
      .select({
        name: brands.name,
        abn: brands.abn,
        region: brands.region,
        postcode: brands.postcode,
        state: brands.state,
        abnSuggestion: brands.abnSuggestion,
      })
      .from(brands)
      .where(eq(brands.id, brandId));
    return brand ?? null;
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const g = await guard(brandId);
  if (g.refusal) return g.refusal;
  const { currentUser } = g;
  if (!(await isEnabled("abn_suggestion", currentUser.organizationId)))
    return NextResponse.json({ suggestion: null });
  const brand = await loadBrand(currentUser.organizationId, brandId);
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Only for a brand with no ABN, in the Australian market (the ABR is Australia's register).
  if (brand.abn || brand.region !== "au") return NextResponse.json({ suggestion: null });

  const stored = storedOf(brand.abnSuggestion);
  // S01C part 5b: "Not mine" lasts, after retention too, until the brand's name changes.
  if (stored?.status === "dismissed") return NextResponse.json({ suggestion: null });
  if (stored?.status === "found")
    return NextResponse.json({ suggestion: stored.answer ? null : stored.suggestion });
  if (
    stored &&
    Date.now() - new Date(stored.checkedAt).getTime() < AGAIN_AFTER_DAYS[stored.status] * DAY_MS
  )
    return NextResponse.json({ suggestion: null });

  const result = await searchAbnByName(brand.name, {
    postcode: brand.postcode,
    state: brand.state,
  });
  // No GUID, or the bypass: nothing was looked up, so nothing is stored either.
  if (result.status === "skipped") return NextResponse.json({ suggestion: null });
  const next: Stored =
    result.status === "found"
      ? { status: "found", suggestion: result.suggestion }
      : { status: result.status, checkedAt: new Date().toISOString() };
  await withRlsContext(currentUser.organizationId, (tx) =>
    tx.update(brands).set({ abnSuggestion: next }).where(eq(brands.id, brandId)),
  );
  return NextResponse.json({ suggestion: next.status === "found" ? next.suggestion : null });
}

const answerSchema = z.strictObject({ action: z.enum(["confirm", "dismiss"]) });

export async function POST(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const g = await guard(brandId);
  if (g.refusal) return g.refusal;
  const { currentUser } = g;
  const forbidden = await roleRefusal(currentUser, "manage_brands");
  if (forbidden) return forbidden;
  if (!(await isEnabled("abn_suggestion", currentUser.organizationId)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = answerSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "action: confirm or dismiss" }, { status: 400 });

  const brand = await loadBrand(currentUser.organizationId, brandId);
  const stored = storedOf(brand?.abnSuggestion);
  if (!brand || stored?.status !== "found" || stored.answer)
    return NextResponse.json({ error: "No ABN suggestion for this brand" }, { status: 404 });
  if (parsed.data.action === "confirm" && brand.abn)
    return NextResponse.json({ error: "This brand already has an ABN" }, { status: 409 });

  const answered: Stored = {
    ...stored,
    answer: parsed.data.action === "confirm" ? "confirmed" : "dismissed",
    answeredAt: new Date().toISOString(),
  };
  await withRlsContext(currentUser.organizationId, (tx) =>
    tx
      .update(brands)
      .set({
        abnSuggestion: answered,
        ...(parsed.data.action === "confirm" ? { abn: stored.suggestion.abn } : {}),
        updatedAt: new Date(),
      })
      .where(eq(brands.id, brandId)),
  );
  if (parsed.data.action === "dismiss") return NextResponse.json({ dismissed: true });

  await recordAction({
    organizationId: currentUser.organizationId,
    userId: currentUser.id,
    action: "brand_abn_changed",
    resourceType: "brand",
    resourceId: brandId,
    metadata: { source: "abn_suggestion", abn: stored.suggestion.abn },
  });
  after(() => runBrandEntityCheck(currentUser.organizationId, brandId));
  return NextResponse.json({ abn: stored.suggestion.abn });
}
