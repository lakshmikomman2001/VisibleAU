import { NextResponse } from "next/server";
import { client, serviceClient } from "@/db/client";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import { checkDbRole } from "@/lib/db/role-check";

// Task #46 (13th follow-up): platform-admin only, 404 (not 403) for
// everyone else -- doesn't confirm this route exists to an unauthorized
// caller. Returns exactly what checkDbRole() returns for both of the
// app's own runtime connections; never a connection string, password, or
// token (role names aren't secrets, credentials are).
export async function GET() {
  if (!(await isPlatformAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [app, service] = await Promise.all([checkDbRole(client), checkDbRole(serviceClient)]);

  return NextResponse.json({ app, service });
}
