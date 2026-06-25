import path from "node:path";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: path.resolve(process.cwd(), ".env.local") });

const dbUrl = process.env.DATABASE_URL ?? "";
if (!dbUrl) {
  console.error("ERROR: DATABASE_URL not set. Run START-DEV.bat first to copy .env.dev → .env.local");
  process.exit(1);
}
if (
  dbUrl.includes("neon.tech") ||
  dbUrl.includes(".supabase.") ||
  dbUrl.includes("amazonaws.com") ||
  dbUrl.includes("azure")
) {
  console.error("REFUSING: DATABASE_URL looks like production/cloud. This seed is dev-only.");
  process.exit(1);
}

const pg = postgres(dbUrl, { max: 1 });
const BASE = process.env.BETTER_AUTH_URL || "http://localhost:3000";
const PASSWORD = "TestPass123!";

const TIERS = ["free", "starter", "growth", "agency", "agency_pro"] as const;

interface TestUser {
  tier: string;
  index: number;
  email: string;
  name: string;
  orgName: string;
  orgSlug: string;
}

function capitalize(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function buildTestUsers(): TestUser[] {
  const users: TestUser[] = [];
  for (const tier of TIERS) {
    for (const idx of [1, 2]) {
      const emailPrefix = tier.replace(/_/g, "");
      users.push({
        tier,
        index: idx,
        email: `${emailPrefix}${idx}@test.visibleau.dev`,
        name: `Test ${capitalize(tier)} ${idx}`,
        orgName: `Test Org ${capitalize(tier)} ${idx}`,
        orgSlug: `test-${tier.replace(/_/g, "-")}-${idx}`,
      });
    }
  }
  return users;
}

async function getCookie(email: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) return null;
  const cookies = res.headers.getSetCookie?.() ?? [];
  const session = cookies.find((c) => c.includes("better-auth"));
  return session ? session.split(";")[0] : null;
}

interface SeedResult {
  status: "created" | "exists" | "failed";
  detail: string;
}

async function seedOneUser(user: TestUser): Promise<SeedResult> {
  // 1. Sign up (idempotent — 409/error if user already exists)
  const signUpRes = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ name: user.name, email: user.email, password: PASSWORD }),
  });
  const isNewUser = signUpRes.ok;

  // 2. Sign in → session cookie
  const cookie = await getCookie(user.email);
  if (!cookie) {
    return { status: "failed", detail: "sign-in failed — is the dev server running?" };
  }

  // 3. Create org (idempotent — fails if slug already taken)
  await fetch(`${BASE}/api/auth/organization/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: BASE },
    body: JSON.stringify({ name: user.orgName, slug: user.orgSlug }),
  });

  // 4. Sync user → writes real email/name into app users table
  const syncRes = await fetch(`${BASE}/api/auth/sync-user`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: BASE },
  });
  if (!syncRes.ok) {
    return { status: "failed", detail: `sync-user failed (${syncRes.status})` };
  }

  // 5. Set tier + onboardingComplete (the hook always creates with tier='free')
  const updated = await pg`
    UPDATE organizations
    SET tier = ${user.tier}, onboarding_complete = true, slug = ${user.orgSlug}
    WHERE clerk_org_id = (
      SELECT id FROM auth_organizations WHERE slug = ${user.orgSlug} LIMIT 1
    )
  `;
  if (updated.count === 0) {
    return { status: "failed", detail: "org not found for tier update — auth_organizations slug mismatch?" };
  }

  return {
    status: isNewUser ? "created" : "exists",
    detail: isNewUser ? "user + org created" : "already existed (tier ensured)",
  };
}

async function main() {
  console.log("=== VisibleAU Test User Seed (DEV ONLY) ===\n");
  console.log(`  Server:   ${BASE}`);
  console.log(`  Database: ${dbUrl.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")}\n`);

  // Smoke-check: is the dev server up?
  try {
    const health = await fetch(`${BASE}/api/auth/ok`, { method: "GET" }).catch(() => null);
    if (!health) {
      // Try a different endpoint
      const root = await fetch(BASE, { method: "HEAD", redirect: "manual" }).catch(() => null);
      if (!root) {
        console.error("ERROR: Dev server not reachable at " + BASE);
        console.error("       Start it with: pnpm dev\n");
        await pg.end();
        process.exit(1);
      }
    }
  } catch {
    // continue — some fetch errors are OK if server redirects
  }

  const testUsers = buildTestUsers();
  const results: { user: TestUser; result: SeedResult }[] = [];

  for (const user of testUsers) {
    process.stdout.write(`  ${user.email.padEnd(38)} `);
    try {
      const result = await seedOneUser(user);
      console.log(`${result.status.padEnd(8)} ${result.detail}`);
      results.push({ user, result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`failed   ${msg}`);
      results.push({ user, result: { status: "failed", detail: msg } });
    }
  }

  // --- Verification ---
  console.log("\n--- Verification: App tables ---\n");
  const rows = await pg`
    SELECT o.name AS org_name, o.tier, o.onboarding_complete, u.email
    FROM organizations o
    JOIN users u ON u.organization_id = o.id
    WHERE u.email LIKE '%@test.visibleau.dev'
    ORDER BY o.tier, u.email
  `;

  console.log("  Org Name                           Tier           Onboard  Email");
  console.log("  " + "-".repeat(88));
  for (const r of rows) {
    const onb = r.onboarding_complete ? "yes" : "no";
    console.log(
      `  ${String(r.org_name).padEnd(35)}  ${String(r.tier).padEnd(13)}  ${onb.padEnd(7)}  ${r.email}`,
    );
  }

  console.log("\n--- Verification: Auth records ---\n");
  const authCheck = await pg`
    SELECT au.email, COUNT(aa.id)::int AS acct
    FROM auth_users au
    LEFT JOIN auth_accounts aa ON aa.user_id = au.id
    WHERE au.email LIKE '%@test.visibleau.dev'
    GROUP BY au.email
    ORDER BY au.email
  `;
  console.log(`  ${authCheck.length} auth_users found`);
  const noAcct = authCheck.filter((r) => r.acct === 0);
  if (noAcct.length > 0) {
    console.error("  WARNING: users with NO auth_accounts (cannot log in):");
    for (const m of noAcct) console.error(`    ${m.email}`);
  } else if (authCheck.length > 0) {
    console.log("  All have auth_accounts → login-able");
  }

  // --- Summary ---
  const created = results.filter((r) => r.result.status === "created").length;
  const existed = results.filter((r) => r.result.status === "exists").length;
  const failed = results.filter((r) => r.result.status === "failed").length;

  console.log("\n=== Summary ===\n");
  console.log(`  Total: ${results.length} | Created: ${created} | Existed: ${existed} | Failed: ${failed}`);
  console.log(`  Password (all users): ${PASSWORD}`);
  console.log(`  Sign in: ${BASE}/sign-in\n`);

  if (failed > 0) {
    console.error("  FAILED:");
    for (const f of results.filter((r) => r.result.status === "failed")) {
      console.error(`    ${f.user.email}: ${f.result.detail}`);
    }
    console.log();
  }

  console.log("  Test accounts:");
  console.log("  | Tier         | Email                              | Password      | Org Name                    |");
  console.log("  |" + "-".repeat(14) + "|" + "-".repeat(36) + "|" + "-".repeat(15) + "|" + "-".repeat(29) + "|");
  for (const { user } of results) {
    console.log(
      `  | ${user.tier.padEnd(12)} | ${user.email.padEnd(34)} | ${PASSWORD.padEnd(13)} | ${user.orgName.padEnd(27)} |`,
    );
  }
  console.log();

  await pg.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("Seed failed:", err);
  await pg.end();
  process.exit(1);
});
