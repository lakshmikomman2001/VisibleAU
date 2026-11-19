import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import {
  CRAWLER_LOG_BUCKET,
  type CrawlerLogUploadedEvent,
  crawlerLogContentType,
  crawlerLogExtension,
  crawlerLogPath,
  MAX_CRAWLER_LOG_BYTES,
  sha256Hex,
} from "@/lib/agent-analytics/log-upload-storage";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  assertBrandAccess,
  assertTier,
  brandAccessErrorResponse,
  roleRefusal,
  TierInsufficientError,
  tierRefusal,
} from "@/lib/governance";
import { inngest } from "@/lib/inngest/client";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";
import { getStorage } from "@/lib/storage";

export async function POST(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
    await assertTier(currentUser.organizationId, brandFeaturePlan("agent_analytics"));
  } catch (e) {
    const denied = brandAccessErrorResponse(e);
    if (denied) return denied;
    if (e instanceof TierInsufficientError) return tierRefusal(e);
    throw e;
  }
  const forbidden = await roleRefusal(currentUser, "edit_brand_data");
  if (forbidden) return forbidden;

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

  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A body that says it's over the limit is refused before it's read.
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_CRAWLER_LOG_BYTES + 64 * 1024)
    return NextResponse.json({ error: "File too large (50 MB max)" }, { status: 400 });

  const formData = await req.formData().catch(() => null);
  if (!formData)
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!crawlerLogExtension(file.name))
    return NextResponse.json(
      { error: "Unsupported file type. Accepts .log, .gz, .csv" },
      { status: 400 },
    );

  if (file.size > MAX_CRAWLER_LOG_BYTES)
    return NextResponse.json({ error: "File too large (50 MB max)" }, { status: 400 });

  // 20 Nov (part 5): the file goes to private storage, under this workspace's and brand's folder -- the path is built
  // here from the signed-in workspace and the brand it owns, never from the request -- and the event carries only that
  // reference (lib/agent-analytics/log-upload-storage.ts). It went base64 into the event, every visitor's IP with it.
  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = crawlerLogPath(currentUser.organizationId, brand.id, file.name);
  const storage = getStorage(CRAWLER_LOG_BUCKET);
  try {
    await storage.upload(storagePath, buffer, crawlerLogContentType(file.name));
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "crawler_log_store_failed",
        error: err instanceof Error ? err.name : "unknown",
      }),
    );
    return NextResponse.json(
      { error: "We couldn't store your log file. Try again in a minute." },
      { status: 503 },
    );
  }

  const data: CrawlerLogUploadedEvent = {
    brandId: brand.id,
    organizationId: currentUser.organizationId,
    domain: brand.domain,
    filename: file.name,
    storagePath,
    sizeBytes: buffer.length,
    sha256: sha256Hex(buffer),
    uploadedBy: currentUser.id,
  };
  try {
    await inngest.send({ name: "crawler-log/uploaded", data });
  } catch (err) {
    // Nothing will read it: don't keep it.
    await storage.delete([storagePath]).catch(() => {});
    throw err;
  }

  return NextResponse.json(
    { status: "accepted", message: "Log file queued for processing" },
    { status: 202 },
  );
}
