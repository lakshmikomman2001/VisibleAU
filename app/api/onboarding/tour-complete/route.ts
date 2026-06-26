import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function POST() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [org] = await db
    .select({ metadata: organizations.metadata })
    .from(organizations)
    .where(eq(organizations.id, currentUser.organizationId));

  await db
    .update(organizations)
    .set({
      metadata: {
        ...((org?.metadata as Record<string, unknown>) ?? {}),
        productTourComplete: true,
      },
    })
    .where(eq(organizations.id, currentUser.organizationId));

  return NextResponse.json({ ok: true });
}
