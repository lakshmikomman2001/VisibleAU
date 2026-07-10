import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { contentDrafts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";
import { assertBrandAccess, BrandAccessDeniedError, recordAction } from "@/lib/governance";

const updateDraftSchema = z.object({
  status: z.enum(["approved", "rejected", "published"]).optional(),
  title: z.string().min(1).optional(),
  body: z.string().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brandId: string; id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { brandId, id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const brand = await getBrandForOrg(brandId, currentUser.organizationId, tx);
    if (!brand) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [draft] = await tx
      .select()
      .from(contentDrafts)
      .where(eq(contentDrafts.id, id));

    if (!draft) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(draft);
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ brandId: string; id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { brandId, id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  const parsed = updateDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400 },
    );
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const brand = await getBrandForOrg(brandId, currentUser.organizationId, tx);
    if (!brand) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (parsed.data.status) {
      updates.status = parsed.data.status;
      if (parsed.data.status === "approved") {
        updates.approvedAt = new Date();
        updates.approvedBy = currentUser.id;
      }
      if (parsed.data.status === "published") {
        updates.publishedAt = new Date();
      }
    }
    if (parsed.data.title) updates.title = parsed.data.title;
    if (parsed.data.body) {
      updates.body = parsed.data.body;
      updates.wordCount = parsed.data.body.split(/\s+/).length;
    }

    const [updated] = await tx
      .update(contentDrafts)
      .set(updates)
      .where(eq(contentDrafts.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (parsed.data.status === "approved") {
      await recordAction({
        organizationId: currentUser.organizationId,
        userId: currentUser.id,
        action: "draft_approved",
        resourceType: "content_draft",
        resourceId: id,
        metadata: { brandId },
      });
    } else if (parsed.data.status === "rejected") {
      await recordAction({
        organizationId: currentUser.organizationId,
        userId: currentUser.id,
        action: "draft_dismissed",
        resourceType: "content_draft",
        resourceId: id,
        metadata: { brandId },
      });
    }

    return NextResponse.json(updated);
  });
}
