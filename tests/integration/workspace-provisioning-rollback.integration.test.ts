/**
 * Follow-ups from 6e27afc..01a6a8c, part 2 -- provisioning writes the workspace row, the profile and the
 * owner membership in one transaction, so a failure at any step leaves none of them behind. Forced here at
 * the last step: the default report template can't be written (its sections are missing), after the row,
 * the profile and the membership were. Against the test database.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

// The template step's sections, missing: its insert fails (sections is NOT NULL).
vi.mock("@/lib/reports/report-sections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reports/report-sections")>()),
  DEFAULT_REPORT_SECTIONS: undefined,
}));

const RUN = randomUUID().slice(0, 8);
const AUTH_ID = `rollback-${RUN}`;
const AUTH_ORG = `rollback-org-${RUN}`;

let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO auth_users (id, name, email, email_verified)
    VALUES (${AUTH_ID}, 'Rollback', ${`rollback-${RUN}@provisioning.example.com.au`}, true)
  `;
});

afterAll(async () => {
  await sql`DELETE FROM auth_users WHERE id = ${AUTH_ID}`;
  await sql.end();
});

describe("a failure mid-provisioning", () => {
  it("leaves no workspace row, profile or membership", async () => {
    const { provisionAppWorkspace } = await import("@/lib/auth/server");
    await expect(
      provisionAppWorkspace({
        authOrgId: AUTH_ORG,
        orgName: `Rollback ${RUN}`,
        authUserId: AUTH_ID,
        email: `rollback-${RUN}@provisioning.example.com.au`,
        name: "Rollback",
      }),
    ).rejects.toMatchObject({ step: "report_template" });
    expect(await sql`SELECT id FROM organizations WHERE clerk_org_id = ${AUTH_ORG}`).toHaveLength(
      0,
    );
    expect(await sql`SELECT id FROM users WHERE clerk_user_id = ${AUTH_ID}`).toHaveLength(0);
    expect(
      await sql`SELECT m.id FROM org_members m JOIN users u ON u.id = m.user_id WHERE u.clerk_user_id = ${AUTH_ID}`,
    ).toHaveLength(0);
  });
});
