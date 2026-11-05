/**
 * 27 Oct (Resend refused every email: 422 "Invalid `from` field") -- a send Resend
 * refuses for its configuration shows up for the operator, as email_config_error with
 * Resend's error name and message and no values, while the person asking to reset a
 * password gets exactly the answer they always did. Through better-auth's own handler,
 * the real lib/email/send.ts and a Resend stand-in, on the local test database.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { sendMock, captureMessage } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));
vi.mock("@sentry/nextjs", () => ({ captureMessage }));

const RUN = randomUUID().slice(0, 8);
const EXISTING = `config-${RUN}@email-config-test.example.com.au`;
const MISSING = `nobody-${RUN}@email-config-test.example.com.au`;
const KEY = `re_test_${RUN}_config_errors`;
const FROM = "Vunnara <audits@vunnara.com.au>";
/** What Resend answered on 27 Oct. */
const INVALID_FROM = {
  name: "validation_error",
  message:
    "Invalid `from` field. The email address needs to follow the `email@example.com` or `Name <email@example.com>` format.",
  statusCode: 422,
};

let client: ReturnType<typeof postgres>;
type Auth = typeof import("@/lib/auth/server").auth;
let auth: Auth;
let logged: string[] = [];

/** Each JSON log line, parsed. */
function events(): Record<string, unknown>[] {
  return logged.flatMap((line) => {
    try {
      return [JSON.parse(line) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
}

/** Through better-auth's HTTP handler, as the forgot-password page's request goes. */
function requestReset(email: string, ip: string) {
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
  process.env.BETTER_AUTH_SECRET ??= "test-only-secret-for-email-config-errors-0123456789";
  vi.stubEnv("RESEND_API_KEY", KEY);
  vi.stubEnv("RESEND_FROM_EMAIL", FROM);
  vi.stubEnv("RESEND_DEV_RECIPIENT", "");
  client = postgres(url, { max: 1 });
  sendMock.mockResolvedValue({ data: null, error: INVALID_FROM, headers: null });
  for (const level of ["error", "warn", "info", "log"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
  }

  ({ auth } = await import("@/lib/auth/server"));
  await auth.api.signUpEmail({
    body: { email: EXISTING, password: "CorrectHorse123!", name: "Config Tester" },
  });
  // Sign-up's verification email goes out after its response, and is refused too.
  await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
  logged = [];
}, 60_000);

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
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Resend refuses the send for its configuration", () => {
  it("the forgot-password answer is the same, account or not", async () => {
    const withAccount = await requestReset(EXISTING, `10.9.${RUN.length}.1`);
    const without = await requestReset(MISSING, `10.9.${RUN.length}.2`);
    expect(withAccount.status).toBe(200);
    expect(without.status).toBe(200);
    expect(await withAccount.json()).toEqual(await without.json());
    // The reset email was tried (after the response) and refused.
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(2));
  });

  it("the operator sees email_config_error, with Resend's error name and message", async () => {
    await vi.waitFor(() =>
      expect(events()).toContainEqual(
        expect.objectContaining({ event: "email_config_error", category: "password_reset" }),
      ),
    );
    expect(
      events().find((e) => e.event === "email_config_error" && e.category === "password_reset"),
    ).toEqual({
      event: "email_config_error",
      category: "password_reset",
      errorName: INVALID_FROM.name,
      statusCode: INVALID_FROM.statusCode,
      message: INVALID_FROM.message,
    });
    expect(events()).toContainEqual(
      expect.objectContaining({ event: "email_send_failed", category: "password_reset" }),
    );
    await vi.waitFor(() =>
      expect(captureMessage).toHaveBeenCalledWith(
        "email_config_error",
        expect.objectContaining({
          tags: expect.objectContaining({
            category: "password_reset",
            errorName: "validation_error",
          }),
        }),
      ),
    );
  });

  it("and no log line, nor the operator's event, carries a value", () => {
    const everything = [...logged, JSON.stringify(captureMessage.mock.calls)].join("\n");
    for (const value of [EXISTING, MISSING, KEY, "audits@vunnara.com.au"]) {
      expect(everything).not.toContain(value);
    }
  });
});
