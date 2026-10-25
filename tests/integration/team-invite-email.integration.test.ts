/**
 * Task 15, item 3 -- team invites send an email, on a real database.
 * Creating an invite emails the accept link with the inviter's and the
 * org's names; inviting someone whose invite is still pending re-sends
 * it with a fresh link; a fourth invite to one address within the hour
 * is refused (429) and sends nothing; an existing member is still a 409.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { sendEmailMock, currentUserMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  currentUserMock: vi.fn(),
}));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: sendEmailMock,
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: currentUserMock }));

const ORG_ID = randomUUID();
const OTHER_ORG_ID = randomUUID();
const INVITER_ID = randomUUID();
const INVITEE_ID = randomUUID();
const MEMBER_ID = randomUUID();
const INVITEE = `invitee-${ORG_ID.slice(0, 8)}@invite-test.example.com.au`;
const MEMBER = `member-${ORG_ID.slice(0, 8)}@invite-test.example.com.au`;

let client: ReturnType<typeof postgres>;

async function invite(email: string) {
  const { POST } = await import("@/app/api/organizations/[orgId]/members/invite/route");
  const res = await POST(
    new Request(`http://localhost:3000/api/organizations/${ORG_ID}/members/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role: "admin" }),
    }),
    { params: Promise.resolve({ orgId: ORG_ID }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  process.env.NEXT_PUBLIC_APP_URL = "https://app.vunnara.com.au";
  client = postgres(url, { max: 1 });

  for (const [id, name] of [
    [ORG_ID, "Harbour Agency"],
    [OTHER_ORG_ID, "Invitee's Own Org"],
  ]) {
    await client`
      INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${id}, ${`invite-test-${id}`}, ${name}, ${`invite-test-${id}`})
    `;
  }
  await client`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role) VALUES
      (${INVITER_ID}, ${`invite-test-${INVITER_ID}`}, ${ORG_ID}, ${`owner-${ORG_ID.slice(0, 8)}@invite-test.example.com.au`}, 'Sri Owner', 'owner'),
      (${INVITEE_ID}, ${`invite-test-${INVITEE_ID}`}, ${OTHER_ORG_ID}, ${INVITEE}, 'Invitee', 'owner'),
      (${MEMBER_ID}, ${`invite-test-${MEMBER_ID}`}, ${OTHER_ORG_ID}, ${MEMBER}, 'Member', 'owner')
  `;
  // Already a member of the inviting org.
  await client`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG_ID}, ${MEMBER_ID}, 'viewer', now(), now(), true)
  `;

  currentUserMock.mockResolvedValue({
    id: INVITER_ID,
    organizationId: ORG_ID,
    email: `owner-${ORG_ID.slice(0, 8)}@invite-test.example.com.au`,
    name: "Sri Owner",
    role: "owner",
    organization: { id: ORG_ID, name: "Harbour Agency" },
  });
}, 60000);

beforeEach(() => {
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ ok: true, id: "em_1" });
});

afterAll(async () => {
  await client`DELETE FROM audit_trail WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM users WHERE id IN (${INVITER_ID}, ${INVITEE_ID}, ${MEMBER_ID})`;
  await client`DELETE FROM organizations WHERE id IN (${ORG_ID}, ${OTHER_ORG_ID})`;
  await client`DELETE FROM rate_limit_counters WHERE bucket_key LIKE 'team-invite:%'`;
  await client.end();
});

describe("team invite emails", () => {
  let firstToken = "";

  it("creating an invite emails the accept link, with the inviter's and the org's names", async () => {
    const { status, body } = await invite(INVITEE);
    expect(status).toBe(201);
    expect(body).toMatchObject({ resent: false, emailSent: true });
    firstToken = String(body.token);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sent = sendEmailMock.mock.calls[0][0];
    expect(sent).toMatchObject({ to: INVITEE, category: "team_invite", organizationId: ORG_ID });
    expect(sent.subject).toBe("Sri Owner invited you to Harbour Agency on Vunnara");
    expect(sent.text).toContain(
      `Accept the invitation: https://app.vunnara.com.au/invite/${ORG_ID}/${firstToken}`,
    );
  });

  it("inviting again while it's pending re-sends it with a fresh link", async () => {
    const { status, body } = await invite(INVITEE);
    expect(status).toBe(200);
    expect(body).toMatchObject({ resent: true, emailSent: true });
    expect(body.token).not.toBe(firstToken);

    const [row] = await client<{ invitation_token: string }[]>`
      SELECT invitation_token FROM org_members WHERE organization_id = ${ORG_ID} AND user_id = ${INVITEE_ID}
    `;
    expect(row.invitation_token).toBe(body.token);
    expect(sendEmailMock.mock.calls[0][0].text).toContain(`/invite/${ORG_ID}/${body.token}`);
  });

  it("a fourth invite to one address within the hour is refused and sends nothing", async () => {
    expect((await invite(INVITEE)).status).toBe(200);
    sendEmailMock.mockClear();
    const { status } = await invite(INVITEE);
    expect(status).toBe(429);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("someone who's already a member is still a 409, with no email", async () => {
    const { status } = await invite(MEMBER);
    expect(status).toBe(409);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("if the email fails, the invite still exists and the response says so", async () => {
    await client`DELETE FROM rate_limit_counters WHERE bucket_key LIKE 'team-invite:%'`;
    sendEmailMock.mockResolvedValue({ ok: false, reason: "missing_api_key", message: "x" });
    const { status, body } = await invite(INVITEE);
    expect(status).toBe(200);
    expect(body).toMatchObject({ emailSent: false });
  });
});
