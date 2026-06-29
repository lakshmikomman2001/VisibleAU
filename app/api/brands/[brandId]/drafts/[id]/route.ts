import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { contentDrafts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";

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

  await setRlsContext(db, currentUser.organizationId);

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [draft] = await db
    .select()
    .from(contentDrafts)
    .where(eq(contentDrafts.id, id));

  if (!draft) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(draft);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ brandId: string; id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400 },
    );
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

  const [updated] = await db
    .update(contentDrafts)
    .set(updates)
    .where(eq(contentDrafts.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
