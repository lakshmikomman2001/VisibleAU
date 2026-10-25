/**
 * lib/email/send.ts -- the one way the app sends email. A missing key
 * or a rejected send is a typed failure plus an error log, never a fake
 * success; the idempotency key reaches Resend; addresses are masked in
 * every log line; production ignores RESEND_DEV_RECIPIENT.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import {
  EmailSendError,
  emailBackendStatus,
  idempotencyKeyFor,
  maskEmail,
  sendEmail,
  sendEmailOrThrow,
} from "@/lib/email/send";

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

beforeEach(() => {
  sendMock.mockReset();
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

  it("a missing RESEND_FROM_EMAIL is a typed failure too -- the from address is never made up", async () => {
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    const result = await sendEmail(INPUT);
    expect(result).toMatchObject({ ok: false, reason: "missing_from_address" });
    expect(sendMock).not.toHaveBeenCalled();
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
