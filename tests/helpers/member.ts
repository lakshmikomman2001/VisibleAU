import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type { OrgRole } from "@/lib/governance/permissions";

/**
 * Follow-ups from 6e27afc..01a6a8c, part 1 -- a role comes only from an active, accepted membership
 * (lib/governance roleOf); a profile's own users.role no longer counts. A test that stubs the signed-in
 * user (getCurrentUser) needs that user to be what every production account is: a profile in the
 * workspace with a membership there in its role. This makes both, and `remove` takes them away again
 * (before the workspace's own cleanup, which the rows would otherwise block).
 */
export async function seedMember(
  sql: postgres.Sql,
  input: { organizationId: string; role: OrgRole; email: string; name?: string },
): Promise<{ id: string; remove: () => Promise<void> }> {
  const id = randomUUID();
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${id}, ${`member-${id}`}, ${input.organizationId}, ${input.email}, ${input.name ?? "Test Member"}, ${input.role})
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${input.organizationId}, ${id}, ${input.role}, now(), now(), true)
  `;
  return {
    id,
    remove: async () => {
      await sql`DELETE FROM audit_trail WHERE user_id = ${id}`;
      await sql`DELETE FROM org_members WHERE user_id = ${id}`;
      await sql`DELETE FROM users WHERE id = ${id}`;
    },
  };
}
