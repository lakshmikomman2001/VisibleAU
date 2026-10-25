/**
 * Task 15, item 3 -- password reset through better-auth itself, on a real
 * database. An address with an account gets the reset email (a link with
 * better-auth's token); an address without one gets the very same
 * response and no email; the address never appears in a log line; and
 * the fourth request for one address within the hour is refused (429),
 * the same way whether or not it has an account.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: sendEmailMock,
}));

const RUN = randomUUID().slice(0, 8);
const EXISTING = `reset-${RUN}@auth-emails-test.example.com.au`;
const MISSING = `nobody-${RUN}@auth-emails-test.example.com.au`;

let client: ReturnType<typeof postgres>;
type Auth = typeof import("@/lib/auth/server").auth;
let auth: Auth;

/** Through better-auth's HTTP handler, as the browser's request goes. */
function request(email: string, ip: string) {
  return auth.handler(
    new Request("http://localhost:3000/api/auth/request-password-reset", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email, redirectTo: "/reset-password" }),
    }),
  );
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET ??= "test-only-secret-for-auth-emails-integration-0123456789";
  client = postgres(url, { max: 1 });
  sendEmailMock.mockResolvedValue({ ok: true, id: "em_1" });

  ({ auth } = await import("@/lib/auth/server"));
  await auth.api.signUpEmail({
    body: { email: EXISTING, password: "CorrectHorse123!", name: "Reset Tester" },
  });
}, 60000);

afterAll(async () => {
  const [user] = await client<
    { id: string }[]
  >`SELECT id FROM auth_users WHERE email = ${EXISTING}`;
  if (user) {
    await client`DELETE FROM auth_verifications WHERE value = ${user.id}`;
    await client`DELETE FROM auth_sessions WHERE user_id = ${user.id}`;
    await client`DELETE FROM auth_accounts WHERE user_id = ${user.id}`;
    await client`DELETE FROM auth_users WHERE id = ${user.id}`;
  }
  await client`DELETE FROM rate_limit_counters WHERE bucket_key LIKE 'auth-email-%'`;
  await client.end();
});

describe("password reset", () => {
  it("emails a reset link to an address that has an account", async () => {
    sendEmailMock.mockClear();
    const res = await request(EXISTING, `10.0.${RUN.length}.1`);
    expect(res.status).toBe(200);

    // Sent after the response (lib/auth/emails.ts runAfterResponse).
    await vi.waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(1));
    const sent = sendEmailMock.mock.calls[0][0];
    expect(sent).toMatchObject({ to: EXISTING, category: "password_reset" });
    expect(sent.text).toMatch(/Choose a new password: \S+\/reset-password\/\S+/);
    expect(sent.text).toContain("The link works once, for 60 minutes.");
  });

  it("answers an address without an account exactly the same way, sends nothing, logs no address", async () => {
    sendEmailMock.mockClear();
    const logged: string[] = [];
    const spies = (["log", "info", "warn", "error"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(" "));
      }),
    );
    try {
      const existing = await request(EXISTING, "10.0.2.1");
      const missing = await request(MISSING, "10.0.2.2");
      expect(missing.status).toBe(existing.status);
      expect(await missing.json()).toEqual(await existing.json());

      await vi.waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(1));
      expect(sendEmailMock.mock.calls.map((c) => c[0].to)).toEqual([EXISTING]);
      expect(logged.join("\n")).not.toContain(MISSING);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("refuses the fourth request for one address within the hour -- account or not", async () => {
    for (const email of [`limit-${RUN}@auth-emails-test.example.com.au`, `${EXISTING}`]) {
      await client`DELETE FROM rate_limit_counters WHERE bucket_key LIKE 'auth-email-%'`;
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) statuses.push((await request(email, `10.0.3.${i}`)).status);
      expect(statuses).toEqual([200, 200, 200, 429]);
    }
  });
});
