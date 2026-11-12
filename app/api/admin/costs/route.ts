import { NextResponse } from "next/server";
import { loadOperatorCosts } from "@/lib/admin/costs";
import { checkPlatformAdmin } from "@/lib/auth/platform-admin";

const ROUTE = "/api/admin/costs";

/**
 * Part 14 (Sri, 13 Nov): what the providers cost us this month, per workspace and per audit (lib/admin/
 * costs.ts). Operators only, checked on the server (lib/auth/platform-admin.ts: PLATFORM_ADMIN_EMAILS, a
 * verified address); everyone else gets 403 and nothing else. Every attempt is logged by user id, never
 * the email, as the other admin routes do.
 */
export async function GET() {
  const { allowed, userId } = await checkPlatformAdmin();
  console.log(JSON.stringify({ event: "admin_access", userId, route: ROUTE, allowed }));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await loadOperatorCosts(), { headers: { "Cache-Control": "no-store" } });
}
