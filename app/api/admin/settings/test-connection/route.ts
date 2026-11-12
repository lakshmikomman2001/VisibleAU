import { NextResponse } from "next/server";
import { checkPlatformAdmin } from "@/lib/auth/platform-admin";
import { claimOncePerWindow } from "@/lib/governance/pg-rate-limit";
import { hasGoogleSurfaceProviderCredentials } from "@/lib/serp/credentials";
import { DataForSeoProvider } from "@/lib/serp/dataforseo";
import {
  credentialsNotSetResult,
  TEST_CONNECTION_WINDOW_MS,
  testConnectionResult,
} from "@/lib/serp/test-connection";

const ROUTE = "/api/admin/settings/test-connection";

/**
 * Google AI follow-ups (12 Nov), part 4 -- the operator's Test connection on /admin/settings: does
 * DataForSEO accept the login, and the balance (lib/serp/dataforseo.ts accountStatus, its free
 * appendix/user_data endpoint; lib/serp/test-connection.ts says it in words).
 *
 * Operators only (lib/auth/platform-admin.ts; anyone else 403, and nothing is called). Once per 30 seconds
 * for everyone (claimOncePerWindow; 429 otherwise). The answer never carries the credentials or a request
 * header: the adapter puts them only in its own Authorization header, and only the status, its message
 * and the balance come back. Logged by user id with the state and code, never the email.
 */
export async function POST() {
  const { allowed, userId } = await checkPlatformAdmin();
  console.log(JSON.stringify({ event: "admin_access", userId, route: ROUTE, allowed }));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const checkedAt = new Date().toISOString();
  if (!hasGoogleSurfaceProviderCredentials()) {
    return NextResponse.json(credentialsNotSetResult(checkedAt));
  }
  if (!(await claimOncePerWindow("admin-google-test-connection", TEST_CONNECTION_WINDOW_MS))) {
    return NextResponse.json(
      { error: "Wait 30 seconds between connection tests." },
      { status: 429 },
    );
  }
  const result = testConnectionResult(await new DataForSeoProvider().accountStatus(), checkedAt);
  console.log(
    JSON.stringify({
      event: "google_provider_test_connection",
      userId,
      state: result.state,
      statusCode: result.statusCode,
    }),
  );
  return NextResponse.json(result);
}
