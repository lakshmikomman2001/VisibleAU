import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  assertBrandAccess,
  assertTier,
  BrandAccessDeniedError,
  TierInsufficientError,
} from "@/lib/governance";
import { inngest } from "@/lib/inngest/client";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

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

  try {
    await assertBrandAccess(currentUser, brandId);
    await assertTier(currentUser.organizationId, "starter");
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    if (e instanceof TierInsufficientError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const brand = await withRlsContext(currentUser.organizationId, async (tx) => {
    const [b] = await tx
      .select({ id: brands.id, organizationId: brands.organizationId, domain: brands.domain })
      .from(brands)
      .where(
        and(
          eq(brands.id, brandId),
          eq(brands.organizationId, currentUser.organizationId),
          isNull(brands.deletedAt),
        ),
      );
    return b ?? null;
  });

  if (!brand)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  if (!formData)
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });

  const file = formData.get("file") as File | null;
  if (!file)
    return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const filename = file.name.toLowerCase();
  if (!filename.endsWith(".log") && !filename.endsWith(".gz") && !filename.endsWith(".csv"))
    return NextResponse.json(
      { error: "Unsupported file type. Accepts .log, .gz, .csv" },
      { status: 400 },
    );

  if (file.size > MAX_FILE_SIZE)
    return NextResponse.json({ error: "File too large (50 MB max)" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const content = buffer.toString("base64");

  await inngest.send({
    name: "crawler-log/uploaded",
    data: {
      brandId: brand.id,
      organizationId: brand.organizationId,
      domain: brand.domain,
      filename: file.name,
      contentBase64: content,
      uploadedBy: currentUser.id,
    },
  });

  return NextResponse.json(
    { status: "accepted", message: "Log file queued for processing" },
    { status: 202 },
  );
}
