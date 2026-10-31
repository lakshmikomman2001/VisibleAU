import { and, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { serviceDb } from "@/db/client";
import { inOpenWorkspace } from "@/db/open-workspace";
import { brands } from "@/db/schema";
import { checkPlatformAdmin } from "@/lib/auth/platform-admin";
import { inngest } from "@/lib/inngest/client";

const ROUTE = "/api/admin/backfill-classify";

// Task #46 (14th follow-up): this scans brands.classification across EVERY
// organization (no org filter -- it has to, the whole point is a
// platform-wide sweep) and used to gate that on `currentUser.role ===
// "owner"` -- an ordinary PER-ORG role every org's own first user gets by
// default, not a platform-wide privilege. Any customer who owns their own
// org could call this and get back, in the response body, the names of
// unclassified brands belonging to every OTHER organization too. Gated by
// isPlatformAdmin() instead -- the same allowlist /api/admin/db-role-check
// uses, fails closed, verified-email-only.
export async function POST() {
  const { allowed, userId } = await checkPlatformAdmin();
  console.log(JSON.stringify({ event: "admin_access", userId, route: ROUTE, allowed }));

  if (!allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pending = await serviceDb
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(and(isNull(brands.classification), inOpenWorkspace(brands.organizationId)));

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
