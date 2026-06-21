import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, setRlsContext } from "@/db/client";
import { webhookEndpoints } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { AuditCompletedPayload } from "@/lib/webhooks/events";
import { formatForChannel } from "@/lib/webhooks/format";
import { signHmacSha256 } from "@/lib/webhooks/sign";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setRlsContext(db, currentUser.organizationId);
  const { id } = await params;

  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, id),
        eq(webhookEndpoints.organizationId, currentUser.organizationId),
      ),
    );

  if (!endpoint)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const testPayload: AuditCompletedPayload = {
    eventName: "audit.completed",
    brandId: "test",
    brandName: "Test Brand",
    auditId: "test",
    scoreComposite: 72,
    createdAt: new Date().toISOString(),
    url: `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/brands/test`,
  };

  const body = formatForChannel(
    endpoint.channel,
    "audit.completed",
    testPayload,
  );
  const sig = signHmacSha256(
    JSON.stringify(body),
    endpoint.signingSecret,
  );

  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VisibleAU-Signature": `sha256=${sig}`,
        "X-VisibleAU-Event": "audit.completed",
        "X-VisibleAU-Test": "true",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    return NextResponse.json({ status: res.status, ok: res.ok });
  } catch {
    return NextResponse.json(
      { status: 0, ok: false, error: "Connection failed" },
      { status: 502 },
    );
  }
}
