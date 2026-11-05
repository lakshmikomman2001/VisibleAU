/**
 * lib/email/send.ts -- the one way the app sends email. A missing key
 * or a rejected send is a typed failure plus an error log, never a fake
 * success; the idempotency key reaches Resend; addresses are masked in
 * every log line; production ignores RESEND_DEV_RECIPIENT.
 *
 * 27 Oct: production's RESEND_FROM_EMAIL held the Resend API key, so Resend got
 * the key as the from address (422). The from address is checked before anything
 * is sent, a refused send is flagged for the operator, and no value is ever logged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import {
  DEV_FROM_ADDRESS,
  EmailSendError,
  emailBackendStatus,
  idempotencyKeyFor,
  maskEmail,
  sendEmail,
  sendEmailOrThrow,
} from "@/lib/email/send";

/** What production had in RESEND_FROM_EMAIL: a Resend API key's shape. */
const KEY_AS_FROM = "re_live_4f9c2a7e1b3d5f60";

const OWNER = "sri.owner@vunnara.com.au";
const INPUT = {
  to: OWNER,
  subject: "Audit complete",
  html: "<p>Hi</p>",
  text: "Hi",
  category: "audit_complete" as const,
  organizationId: "11111111-1111-4111-8111-111111111111",
};

let errorSpy: ReturnType<typeof vi.spyOn>;
let infoSpy: ReturnType<typeof vi.spyOn>;

function everythingLogged(): string {
  return [...errorSpy.mock.calls, ...infoSpy.mock.calls].map((c) => c.join(" ")).join("\n");
}

/** Each JSON log line, parsed. */
function loggedEvents(): Record<string, unknown>[] {
  return [...errorSpy.mock.calls, ...infoSpy.mock.calls].flatMap((c) => {
    try {
      return [JSON.parse(String(c[0])) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
}

beforeEach(() => {
  sendMock.mockReset();
  captureMessage.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_FROM_EMAIL", "Vunnara <audits@vunnara.com.au>");
  vi.stubEnv("RESEND_DEV_RECIPIENT", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  errorSpy.mockRestore();
  infoSpy.mockRestore();
});

describe("sendEmail: no key, no fake success", () => {
  it("a missing RESEND_API_KEY is a typed failure and an error log, and Resend is never called", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const result = await sendEmail(INPUT);
    expect(result).toEqual({
      ok: false,
      reason: "missing_api_key",
      message: "RESEND_API_KEY is not set",
    });
    expect(sendMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(String(errorSpy.mock.calls[0][0]));
    expect(logged).toMatchObject({
      event: "email_send_failed",
      reason: "missing_api_key",
      category: "audit_complete",
      to: "s***@vunnara.com.au",
    });
    expect(emailBackendStatus()).toBe("disabled");
  });

  it("in production a missing RESEND_FROM_EMAIL is a typed failure too -- the from address is never made up", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    const result = await sendEmail(INPUT);
    expect(result).toMatchObject({ ok: false, reason: "missing_from_address" });
    expect(sendMock).not.toHaveBeenCalled();
    expect(emailBackendStatus()).toBe("disabled");
  });

  it("outside production a missing RESEND_FROM_EMAIL sends from the local fallback", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    sendMock.mockResolvedValue({ data: { id: "em_dev" }, error: null, headers: null });
    expect((await sendEmail(INPUT)).ok).toBe(true);
    expect(sendMock.mock.calls[0][0].from).toBe("Vunnara Dev <dev@localhost>");
    expect(DEV_FROM_ADDRESS).toBe("Vunnara Dev <dev@localhost>");
  });

  it("a send Resend rejects is a typed failure, with any address in its message masked", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: {
        name: "validation_error",
        message: `Domain not verified for ${OWNER}`,
        statusCode: 403,
      },
      headers: null,
    });
    const result = await sendEmail(INPUT);
    expect(result).toEqual({
      ok: false,
      reason: "provider_error",
      message: "validation_error: Domain not verified for s***@vunnara.com.au",
    });
    expect(everythingLogged()).not.toContain(OWNER);
  });

  it("a network error is a typed failure, not a throw", async () => {
    sendMock.mockRejectedValue(new Error("fetch failed"));
    await expect(sendEmail(INPUT)).resolves.toMatchObject({
      ok: false,
      reason: "provider_error",
    });
  });

  it("sendEmailOrThrow turns a failure into an EmailSendError (so an Inngest step retries)", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendEmailOrThrow(INPUT)).rejects.toBeInstanceOf(EmailSendError);
  });
});

describe("sendEmail: a real send", () => {
  it("sends from RESEND_FROM_EMAIL, with the html, the text and the idempotency key", async () => {
    sendMock.mockResolvedValue({ data: { id: "em_123" }, error: null, headers: null });
    const key = idempotencyKeyFor("audit-complete:abc", OWNER);
    const result = await sendEmail({ ...INPUT, idempotencyKey: key });

    expect(result).toEqual({ ok: true, id: "em_123" });
    expect(sendMock).toHaveBeenCalledWith(
      {
        from: "Vunnara <audits@vunnara.com.au>",
        to: OWNER,
        subject: "Audit complete",
        html: "<p>Hi</p>",
        text: "Hi",
      },
      { idempotencyKey: key },
    );
    expect(emailBackendStatus()).toBe("resend");
  });

  it("logs only the masked address", async () => {
    sendMock.mockResolvedValue({ data: { id: "em_1" }, error: null, headers: null });
    await sendEmail(INPUT);
    expect(everythingLogged()).toContain("s***@vunnara.com.au");
    expect(everythingLogged()).not.toContain(OWNER);
  });
});

describe("the from address is checked before anything is sent", () => {
  it("an API key as the from address: no Resend call, looks_like_secret logged, the value nowhere", async () => {
    vi.stubEnv("RESEND_FROM_EMAIL", KEY_AS_FROM);
    const result = await sendEmail(INPUT);
    expect(result).toMatchObject({ ok: false, reason: "invalid_from_address" });
    expect(sendMock).not.toHaveBeenCalled();
    expect(loggedEvents()).toContainEqual(
      expect.objectContaining({ event: "email_config_invalid", reason: "looks_like_secret" }),
    );
    expect(everythingLogged()).not.toContain(KEY_AS_FROM);
    expect(everythingLogged()).not.toContain("re_live");
    expect(JSON.stringify(result)).not.toContain(KEY_AS_FROM);
    expect(emailBackendStatus()).toBe("misconfigured");
    await vi.waitFor(() =>
      expect(captureMessage).toHaveBeenCalledWith(
        "email_config_invalid",
        expect.objectContaining({ tags: expect.objectContaining({ reason: "looks_like_secret" }) }),
      ),
    );
    expect(JSON.stringify(captureMessage.mock.calls)).not.toContain(KEY_AS_FROM);
  });

  it.each([
    ["a bare address", "audits@vunnara.com.au"],
    ["a display name and an address", "Vunnara <audits@vunnara.com.au>"],
  ])("%s on vunnara.com.au is sent as it is", async (_label, from) => {
    vi.stubEnv("RESEND_FROM_EMAIL", from);
    sendMock.mockResolvedValue({ data: { id: "em_1" }, error: null, headers: null });
    expect((await sendEmail(INPUT)).ok).toBe(true);
    expect(sendMock.mock.calls[0][0].from).toBe(from);
    expect(emailBackendStatus()).toBe("resend");
    expect(loggedEvents().some((e) => e.event === "email_config_invalid")).toBe(false);
  });

  it.each([
    ["another domain", "Vunnara <audits@example.com>", "from_domain"],
    ["a subdomain", "audits@mail.vunnara.com.au", "from_domain"],
    ["not an address", "Vunnara audits", "from_format"],
    ["an angle address with no name", "<audits@vunnara.com.au>", "from_format"],
    ["another key's shape", "sk_live_abcdef1234567890", "looks_like_secret"],
  ])("%s is refused as %s, and never sent or logged", async (_label, from, reason) => {
    vi.stubEnv("RESEND_FROM_EMAIL", from);
    expect(await sendEmail(INPUT)).toMatchObject({ ok: false, reason: "invalid_from_address" });
    expect(sendMock).not.toHaveBeenCalled();
    expect(loggedEvents()).toContainEqual(
      expect.objectContaining({ event: "email_config_invalid", reason }),
    );
    expect(everythingLogged()).not.toContain(from);
    expect(emailBackendStatus()).toBe("misconfigured");
  });
});

describe("a send Resend refuses for its configuration is flagged for the operator", () => {
  it.each([
    [
      422,
      "validation_error",
      "Invalid `from` field. The email address needs to follow the `email@example.com` or `Name <email@example.com>` format.",
    ],
    [401, "missing_api_key", "Missing API key in the authorization header."],
    [403, "invalid_api_key", "API key is invalid"],
  ] as const)("%i %s: email_config_error with Resend's name and message, and no values", async (statusCode, name, message) => {
    sendMock.mockResolvedValue({ data: null, error: { name, message, statusCode }, headers: null });
    expect(await sendEmail(INPUT)).toMatchObject({ ok: false, reason: "provider_error" });
    expect(loggedEvents().find((e) => e.event === "email_config_error")).toEqual({
      event: "email_config_error",
      category: "audit_complete",
      errorName: name,
      statusCode,
      message,
    });
    expect(loggedEvents().some((e) => e.event === "email_send_failed")).toBe(true);
    for (const value of [OWNER, "re_test_key", "audits@vunnara.com.au"]) {
      expect(everythingLogged()).not.toContain(value);
    }
    await vi.waitFor(() =>
      expect(captureMessage).toHaveBeenCalledWith(
        "email_config_error",
        expect.objectContaining({
          tags: expect.objectContaining({ errorName: name, statusCode: String(statusCode) }),
        }),
      ),
    );
  });

  it("a key Resend echoes back in its message is still never logged", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: `Invalid from: ${KEY_AS_FROM}`, statusCode: 422 },
      headers: null,
    });
    await sendEmail(INPUT);
    expect(everythingLogged()).not.toContain(KEY_AS_FROM);
  });

  it("a server error (500) is a failed send, not a config error", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "application_error", message: "Something went wrong", statusCode: 500 },
      headers: null,
    });
    await sendEmail(INPUT);
    expect(loggedEvents().some((e) => e.event === "email_config_error")).toBe(false);
    expect(loggedEvents().some((e) => e.event === "email_send_failed")).toBe(true);
  });
});

describe("RESEND_DEV_RECIPIENT", () => {
  beforeEach(() => {
    sendMock.mockResolvedValue({ data: { id: "em_dev" }, error: null, headers: null });
    vi.stubEnv("RESEND_DEV_RECIPIENT", "dev-inbox@example.com");
  });

  it("production ignores it: the email goes to the real recipient", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await sendEmail(INPUT);
    expect(sendMock.mock.calls[0][0].to).toBe(OWNER);
  });

  it("outside production it replaces the recipient, for local testing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await sendEmail(INPUT);
    expect(sendMock.mock.calls[0][0].to).toBe("dev-inbox@example.com");
  });
});

describe("helpers", () => {
  it("maskEmail keeps the first letter and the domain", () => {
    expect(maskEmail("sri@vunnara.com.au")).toBe("s***@vunnara.com.au");
    expect(maskEmail("not-an-address")).toBe("***");
  });

  it("idempotencyKeyFor is stable per recipient and never contains the address", () => {
    const a = idempotencyKeyFor("audit-complete:abc", OWNER);
    expect(a).toBe(idempotencyKeyFor("audit-complete:abc", ` ${OWNER.toUpperCase()} `));
    expect(a).not.toBe(idempotencyKeyFor("audit-complete:abc", "other@vunnara.com.au"));
    expect(a).toMatch(/^audit-complete:abc:[0-9a-f]{16}$/);
  });
});
