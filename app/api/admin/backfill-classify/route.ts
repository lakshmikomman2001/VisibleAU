import { isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { inngest } from "@/lib/inngest/client";

export async function POST() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (currentUser.role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const pending = await db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(isNull(brands.classification));

  if (pending.length === 0) {
    return NextResponse.json({ message: "No unclassified brands found", count: 0 });
  }

  await inngest.send({ name: "brand/classify-all", data: {} });

  return NextResponse.json({
    message: `Backfill triggered for ${pending.length} unclassified brand(s)`,
    count: pending.length,
    brands: pending.map((b) => b.name),
    mode: process.env.LLM_MODE ?? "real",
  });
}
