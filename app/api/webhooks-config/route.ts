import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, setRlsContext } from "@/db/client";
import { webhookEndpoints } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { VALID_EVENTS } from "@/lib/webhooks/events";

const CreateSchema = z.object({
  url: z.string().url(),
  channel: z.enum(["slack", "discord", "sheets", "airtable", "email", "custom"]),
  events: z
    .array(z.enum(VALID_EVENTS))
    .min(1),
});

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setRlsContext(db, currentUser.organizationId);

  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.organizationId, currentUser.organizationId))
    .orderBy(desc(webhookEndpoints.createdAt));

  return NextResponse.json({ endpoints });
}

export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );

  const { url, channel, events } = parsed.data;
  const signingSecret = `whsec_${randomBytes(24).toString("base64url")}`;

  await setRlsContext(db, currentUser.organizationId);

  const [endpoint] = await db
    .insert(webhookEndpoints)
    .values({
      organizationId: currentUser.organizationId,
      url,
      channel,
      events,
      signingSecret,
      isActive: true,
    })
    .returning();

  return NextResponse.json({
    id: endpoint.id,
    url: endpoint.url,
    channel: endpoint.channel,
    events: endpoint.events,
    signingSecret,
  });
}
