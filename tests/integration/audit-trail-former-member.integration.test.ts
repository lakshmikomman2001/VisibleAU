/**
 * Live invite test follow-ups (8 Nov), part 5 (Sri: confirm "A former member") -- since 6e7d716 the audit
 * trail names an entry's actor from their profile while the workspace can see it, else from the name stored
 * with the entry (lib/governance/audit-trail.ts ACTOR_NAME_KEY), and shows "A former member" only when it has
 * neither: an entry from before names were stored, by someone whose profile the workspace can no longer see
 * -- they left for another workspace, so they're no longer a member here. A current member's older entries
 * keep their name, because a member's profile is always in the workspace.
 *
 * The real route against the test database, as the RLS-enforced app role (visibleau_app), so another
 * workspace's profiles are hidden exactly as in production; AuditLogRow renders what it returns.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalSafeDatabaseUrl } from "@/scripts/db/local-db-guard";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { currentUserMock } = vi.hoisted(() => ({ currentUserMock: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: currentUserMock }));

const RUN = randomUUID().slice(0, 8);
const WORKSPACE = randomUUID();
const ELSEWHERE = randomUUID();
const OWNER = randomUUID();
const CURRENT = randomUUID();
const FORMER = randomUUID();

let su: ReturnType<typeof postgres>;

function appRoleUrl(): string {
  const base = new URL(getTestDatabaseUrl());
  base.username = "visibleau_app";
  base.password = "visibleau_app_dev";
  const url = base.toString();
  assertLocalSafeDatabaseUrl(url);
  return url;
}

interface Entry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string | null; email: string | null } | null;
}

async function trail(): Promise<Entry[]> {
  const { GET } = await import("@/app/api/organizations/[orgId]/audit-trail/route");
  const res = await GET(
    new Request(`http://localhost/api/organizations/${WORKSPACE}/audit-trail`),
    {
      params: Promise.resolve({ orgId: WORKSPACE }),
    },
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { entries: Entry[] }).entries;
}

/** What the trail shows for an entry: the row's own text. */
async function shown(entry: Entry): Promise<string> {
  const { AuditLogRow } = await import("@/components/domain/governance/audit-log-row");
  return renderToStaticMarkup(createElement(AuditLogRow, { entry }));
}

async function entryBy(userId: string, action: string, metadata: Record<string, string> = {}) {
  await su`
    INSERT INTO audit_trail (organization_id, user_id, action, resource_type, metadata)
    VALUES (${WORKSPACE}, ${userId}, ${action}, 'brand', ${su.json(metadata)})
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  su = postgres(url, { max: 1 });
  process.env.DATABASE_URL = appRoleUrl();
  process.env.SERVICE_DATABASE_URL = url;

  for (const [id, name] of [
    [WORKSPACE, "Trail Agency"],
    [ELSEWHERE, "Elsewhere"],
  ]) {
    await su`
      INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${id}, ${`former-${id}`}, ${name}, ${`former-${id}`})
    `;
  }
  const profile = async (id: string, org: string, name: string, role: string) =>
    su`
      INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${id}, ${`former-${id}`}, ${org}, ${`${name.split(" ")[0].toLowerCase()}-${RUN}@former.example.com.au`}, ${name}, ${role})
    `;
  await profile(OWNER, WORKSPACE, "Olive Owner", "owner");
  await profile(CURRENT, WORKSPACE, "Cam Current", "analyst");
  // Fay left: removed here, and her profile now lives in the workspace she joined.
  await profile(FORMER, ELSEWHERE, "Fay Former", "owner");
  for (const [user, role, active] of [
    [OWNER, "owner", true],
    [CURRENT, "analyst", true],
    [FORMER, "analyst", false],
  ] as const) {
    await su`
      INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${WORKSPACE}, ${user}, ${role}, now(), now(), ${active})
    `;
  }
  // Entries from before names were stored with them, and one of Fay's from after.
  await entryBy(CURRENT, "brand_created");
  await entryBy(FORMER, "brand_deleted");
  await entryBy(FORMER, "brand_updated", { actorName: "Fay Former" });

  currentUserMock.mockResolvedValue({
    id: OWNER,
    organizationId: WORKSPACE,
    email: `olive-${RUN}@former.example.com.au`,
    name: "Olive Owner",
    role: "owner",
    organization: { id: WORKSPACE, name: "Trail Agency" },
  });
}, 60_000);

afterAll(async () => {
  await su`DELETE FROM audit_trail WHERE organization_id = ${WORKSPACE}`;
  await su`DELETE FROM org_members WHERE organization_id IN (${WORKSPACE}, ${ELSEWHERE})`;
  await su`DELETE FROM users WHERE id IN (${OWNER}, ${CURRENT}, ${FORMER})`;
  await su`DELETE FROM organizations WHERE id IN (${WORKSPACE}, ${ELSEWHERE})`;
  await su.end();
});

describe("who an audit trail entry names", () => {
  it("a current member's older entry still shows their name", async () => {
    const entry = (await trail()).find((e) => e.action === "brand_created");
    expect(entry?.actor).toMatchObject({ id: CURRENT, name: "Cam Current" });
    const html = await shown(entry as Entry);
    expect(html).toContain("Cam Current");
    expect(html).not.toContain("A former member");
  });

  it("an older entry by someone no longer a member, whose profile it can't see: 'A former member'", async () => {
    const entry = (await trail()).find((e) => e.action === "brand_deleted");
    expect(entry?.actor).toEqual({ id: FORMER, name: null, email: null });
    expect(await shown(entry as Entry)).toContain("A former member");
  });

  it("a newer entry by the same person keeps the name stored with it", async () => {
    const entry = (await trail()).find((e) => e.action === "brand_updated");
    expect(entry?.actor).toMatchObject({ id: FORMER, name: "Fay Former" });
    expect(await shown(entry as Entry)).not.toContain("A former member");
  });

  it("'A former member' only ever names someone without an active membership here", async () => {
    const formerShown = [];
    for (const entry of await trail()) {
      if ((await shown(entry)).includes("A former member")) formerShown.push(entry.actor?.id);
    }
    const [{ active }] = await su<{ active: string[] }[]>`
      SELECT coalesce(array_agg(user_id), '{}') AS active FROM org_members
      WHERE organization_id = ${WORKSPACE} AND is_active AND accepted_at IS NOT NULL
    `;
    expect(formerShown).toEqual([FORMER]);
    expect(active).not.toContain(FORMER);
  });
});
