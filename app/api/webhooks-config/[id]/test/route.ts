import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { webhookEndpoints } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { planFeatureRefusal } from "@/lib/pricing/plan-features";
import { type AuditCompletedPayload, SCORE_BASIS } from "@/lib/webhooks/events";
import { formatForChannel } from "@/lib/webhooks/format";
import { signHmacSha256 } from "@/lib/webhooks/sign";
import { roleRefusal } from "@/lib/governance";
import { WEBHOOK_USER_AGENT } from "@/lib/product";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const refused = await planFeatureRefusal(currentUser.organizationId, "webhooks");
  if (refused) return refused;
  const forbidden = await roleRefusal(currentUser, "manage_integrations");
  if (forbidden) return forbidden;

  const { id } = await params;

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [endpoint] = await tx
      .select()
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.id, id),
          eq(webhookEndpoints.organizationId, currentUser.organizationId),
        ),
      );

    if (!endpoint) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const testPayload: AuditCompletedPayload = {
      eventName: "audit.completed",
      brandId: "test",
      brandName: "Test Brand",
      auditId: "test",
      scoreComposite: 72,
      score_basis: SCORE_BASIS,
      createdAt: new Date().toISOString(),
      url: `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/brands/test`,
    };

    const body = formatForChannel(endpoint.channel, "audit.completed", testPayload);
    const sig = signHmacSha256(JSON.stringify(body), endpoint.signingSecret);

    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VisibleAU-Signature": `sha256=${sig}`,
          "X-VisibleAU-Event": "audit.completed",
          "X-VisibleAU-Test": "true",
          // Before the next push (11 Nov), part 3: the same User-Agent as a real delivery (it sent none).
          "User-Agent": WEBHOOK_USER_AGENT,
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
  });
}
