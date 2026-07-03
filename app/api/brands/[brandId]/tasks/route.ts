import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { eq, and } from "drizzle-orm";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createTask,
  createTaskFromRecommendation,
  getTasksByBrand,
} from "@/lib/workflow/task-manager";

const createTaskSchema = z
  .object({
    auditId: z.string().uuid().optional(),
    recommendationId: z.string().uuid().optional(),
    recommendationKey: z.string().optional(),
    title: z.string().min(1).max(500).optional(),
    description: z.string().optional(),
    dimension: z.string().optional(),
    effort: z.enum(["low", "medium", "high"]).optional(),
    qualityStatus: z.string().optional(),
    scoreBefore: z.number().optional(),
    estimatedAfter: z.number().optional(),
  })
  .refine((data) => data.title || data.recommendationId, {
    message: "Either title or recommendationId is required",
  });

export async function GET(
  req: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.id, brandId), eq(brands.organizationId, currentUser.organizationId)));
    if (!brand) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const tasks = await getTasksByBrand(brandId, status, tx);
    return NextResponse.json(tasks);
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400 },
    );
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.id, brandId), eq(brands.organizationId, currentUser.organizationId)));
    if (!brand) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (parsed.data.recommendationId && !parsed.data.title) {
      const result = await createTaskFromRecommendation(
        parsed.data.recommendationId,
        currentUser.organizationId,
        brandId,
        tx,
      );
      return NextResponse.json(result.task, {
        status: result.existing ? 200 : 201,
      });
    }

    if (!parsed.data.title) {
      return NextResponse.json(
        { error: "Title is required for manual task creation" },
        { status: 400 },
      );
    }

    const task = await createTask({
      organizationId: currentUser.organizationId,
      brandId,
      ...parsed.data,
      title: parsed.data.title,
    }, tx);

    return NextResponse.json(task, { status: 201 });
  });
}
