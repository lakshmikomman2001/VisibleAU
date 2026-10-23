/**
 * "Fix the Data Residency compute line, and check whether production
 * emails are actually sent" (23 Oct), item 2 -- lib/email/client.ts's
 * SMTP shim used to swallow a transport failure into console.log
 * ("[EMAIL] SMTP not available — email logged only"), indistinguishable
 * from its own routine info line and discarding the real error. On
 * this repo's own production config (.env.prod's SMTP_HOST=localhost,
 * confirmed not used by Vercel at all -- see this task's report), this
 * is exactly the failure mode that would hit in prod: every email this
 * shim sends (audit-complete, scheduled reports, alerts) would land
 * here, silently, at info severity, with the actual error gone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMailMock = vi.fn();

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail: sendMailMock }),
  },
}));

describe("lib/email/client.ts -- a failed SMTP send logs at error severity, with the real cause", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    sendMailMock.mockReset();
  });

  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("logs console.error with the real error, never console.log, when the transport throws", async () => {
    sendMailMock.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:1025"));
    const { resend } = await import("@/lib/email/client");

    const result = await resend.emails.send({
      from: "noreply@visibleau.com",
      to: "owner@example.com",
      subject: "Audit complete",
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "[EMAIL] SMTP send failed — email NOT sent:",
      "connect ECONNREFUSED 127.0.0.1:1025",
    );
    const infoLogsMentionFailure = logSpy.mock.calls.some((call: unknown[]) =>
      String(call[0]).includes("not available"),
    );
    expect(infoLogsMentionFailure).toBe(false);
    // Unchanged behaviour: still never throws, still returns a fake
    // success id -- only the log severity/content changed.
    expect(result.id).toMatch(/^local-/);
  });
});
