import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { generateAnswerCapsule } from "@/lib/answer-capsules/generate-capsule";
import { getCurrentUser } from "@/lib/auth/current-user";

const generateSchema = z.object({
  question: z.string().min(5),
  existingContent: z.string().optional().default(""),
});

export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const msg = Object.entries(fieldErrors)
      .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
      .join("; ");
    return NextResponse.json({ error: msg || "Invalid input" }, { status: 400 });
  }

  try {
    const capsule = await generateAnswerCapsule(parsed.data.question, parsed.data.existingContent);
    return NextResponse.json({ capsule });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 },
    );
  }
}
