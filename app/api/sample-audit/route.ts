import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { checkSampleAuditRateLimit } from "@/lib/sample-audit/rate-limit";
import { runSampleAudit } from "@/lib/sample-audit/run";

const sampleAuditSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(255)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/),
  vertical: z.string().min(1).max(100),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const { allowed, remaining, retryAfterSeconds } = await checkSampleAuditRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      {
        error:
          "You've used your 3 free sample audits for today. Please try again tomorrow, or sign up for unlimited audits.",
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(remaining),
          "Retry-After": String(retryAfterSeconds),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = sampleAuditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await runSampleAudit(parsed.data.domain, parsed.data.vertical);
    return NextResponse.json(result, {
      status: 201,
      headers: { "X-RateLimit-Remaining": String(remaining) },
    });
  } catch (err) {
    console.error("[sample-audit] Failed:", err);
    return NextResponse.json({ error: "Failed to start sample audit" }, { status: 500 });
  }
}
