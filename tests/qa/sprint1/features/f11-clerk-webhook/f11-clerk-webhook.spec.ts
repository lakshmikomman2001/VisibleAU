import crypto from "node:crypto";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { organizations, users } from "../../../../../db/schema";
import { cleanupOrg } from "../../shared/cleanup";
import { db } from "../../shared/db";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

// P5 fix: svix HMAC signing algorithm corrected.
// Svix signs: HMAC-SHA256(base64url-decode(secret_without_prefix), svix-id + '.' + ts + '.' + body)
// Output is base64-encoded (not hex). The secret has 'whsec_' prefix stripped then base64url-decoded.
// Reference: https://docs.svix.com/receiving/verifying-payloads/how
function signClerkWebhook(secret: string, svixId: string, body: string, timestamp: string): string {
  // Strip 'whsec_' prefix and base64url-decode the secret bytes
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  // Sign: svix-id + '.' + svix-timestamp + '.' + body
  const toSign = `${svixId}.${timestamp}.${body}`;
  return crypto.createHmac("sha256", secretBytes).update(toSign).digest("base64");
}

async function sendClerkWebhook(
  request: import("@playwright/test").APIRequestContext,
  event: object,
  type: string,
) {
  const body = JSON.stringify({ type, data: (event as { data?: object }).data ?? event });
  const ts = Math.floor(Date.now() / 1000).toString();
  const msgId = `msg_${Date.now()}`;
  const secret = process.env.CLERK_WEBHOOK_SECRET ?? "whsec_dGVzdA=="; // fallback: base64('test')
  const sig = signClerkWebhook(secret, msgId, body, ts);
  return request.post(`${BASE}/api/webhooks/clerk`, {
    headers: {
      "Content-Type": "application/json",
      "svix-id": msgId,
      "svix-timestamp": ts,
      "svix-signature": `v1,${sig}`, // base64 output, not hex
    },
    data: body,
  });
}

let testOrgId = "";

test.describe("F11: Clerk webhook handler", () => {
  test.afterAll(async () => {
    if (testOrgId) await cleanupOrg(testOrgId);
  });

  test("F11-01: organization.created webhook inserts organizations row", async ({ request }) => {
    const clerkOrgId = `org_qa_f11_${Date.now()}`;
    const res = await sendClerkWebhook(
      request,
      {
        data: {
          id: clerkOrgId,
          name: "[S1-QA] F11 Webhook Org",
          created_at: Date.now(),
          public_metadata: { region: "au", tier: "free" },
        },
      },
      "organization.created",
    );
    // Webhook handler should return 200
    expect([200, 204]).toContain(res.status());
    // DB row must exist
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.clerkOrgId, clerkOrgId));
    expect(org, "organizations row must be created by webhook").toBeDefined();
    expect(org.region).toBe("au");
    expect(org.tier).toBe("free");
    testOrgId = org.id;
  });

  test("F11-02: organization.created is idempotent (duplicate event safe)", async ({ request }) => {
    const clerkOrgId = `org_qa_f11_idem_${Date.now()}`;
    const payload = {
      data: {
        id: clerkOrgId,
        name: "[S1-QA] F11 Idempotent Org",
        created_at: Date.now(),
        public_metadata: { region: "au", tier: "free" },
      },
    };
    // Send twice
    await sendClerkWebhook(request, payload, "organization.created");
    await sendClerkWebhook(request, payload, "organization.created");
    // Should not throw or create two rows
    const rows = await db
      .select()
      .from(organizations)
      .where(eq(organizations.clerkOrgId, clerkOrgId));
    expect(rows.length).toBe(1);
    const [idempOrg] = rows;
    await cleanupOrg(idempOrg.id);
  });

  test("F11-03: organizationMembership.created inserts users row", async ({ request }) => {
    if (!testOrgId) test.skip();
    const clerkUserId = `user_qa_f11_${Date.now()}`;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, testOrgId));
    const res = await sendClerkWebhook(
      request,
      {
        data: {
          id: `mem_qa_${Date.now()}`,
          organization: { id: org.clerkOrgId },
          public_user_data: {
            user_id: clerkUserId,
            identifier: `qa-f11-${Date.now()}@visibleau.test`,
            first_name: "QA",
            last_name: "Test",
          },
        },
      },
      "organizationMembership.created",
    );
    expect([200, 204]).toContain(res.status());
    const [user] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
    expect(user, "users row must be created by membership webhook").toBeDefined();
    expect(user.organizationId).toBe(testOrgId);
  });

  test("F11-04: Invalid signature returns 400 (webhook security)", async ({ request }) => {
    const res = await request.post(`${BASE}/api/webhooks/clerk`, {
      headers: {
        "Content-Type": "application/json",
        "svix-id": "msg_bad",
        "svix-timestamp": "9999999999",
        "svix-signature": "v1,invalid",
      },
      data: JSON.stringify({ type: "organization.created", data: {} }),
    });
    expect([400, 401]).toContain(res.status());
  });
});
