import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
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

  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;

  const tasks = await getTasksByBrand(brandId, status);
  return NextResponse.json(tasks);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

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

  if (parsed.data.recommendationId && !parsed.data.title) {
    const result = await createTaskFromRecommendation(
      parsed.data.recommendationId,
      currentUser.organizationId,
      brandId,
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
  });

  return NextResponse.json(task, { status: 201 });
}
