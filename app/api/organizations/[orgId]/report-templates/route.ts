import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { reportTemplates } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  templateType: z.string().min(1).default("standard"),
  sections: z.array(
    z.object({
      type: z.enum([
        "executive_summary",
        "score_breakdown",
        "mention_source_divide",
        "fan_out_coverage",
        "topical_gap_summary",
        "source_type_gaps",
        "agent_readiness",
        "linkedin_performance",
        "consensus_score",
        "knowledge_panel_status",
        "entity_home_status",
        "evidence_snapshots",
      ]),
      include: z.boolean(),
      order: z.number().int().optional(),
    }),
  ),
  tone: z.enum(["professional", "plain_english", "executive"]).default("professional"),
  isDefault: z.boolean().default(false),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (orgId !== currentUser.organizationId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const templates = await tx
      .select()
      .from(reportTemplates)
      .where(eq(reportTemplates.organizationId, currentUser.organizationId));

    return NextResponse.json(templates);
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (orgId !== currentUser.organizationId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [template] = await tx
      .insert(reportTemplates)
      .values({
        organizationId: currentUser.organizationId,
        name: parsed.data.name,
        templateType: parsed.data.templateType,
        sections: parsed.data.sections,
        tone: parsed.data.tone,
        isDefault: parsed.data.isDefault,
      })
      .returning();

    return NextResponse.json(template, { status: 201 });
  });
}
