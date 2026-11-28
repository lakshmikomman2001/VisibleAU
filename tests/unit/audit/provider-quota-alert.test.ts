/**
 * S04B part 2 (LLD amendment 100): the operators (PLATFORM_ADMIN_EMAILS) get one email per provider per 24 hours while
 * an engine's spend or quota refusals continue, through the existing alert path (claimOncePerWindow, sendEmailOrThrow),
 * worded "{Engine} refused calls: its spend or quota limit is reached. {provider message}. Raise the limit in the
 * provider's console." An alert never fails the audit's call. The real once-a-day claim, through the database, is in
 * tests/integration/provider-quota-stop.integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/db/client";

const claim = vi.hoisted(() => ({
  claimed: new Set<string>(),
  claimOncePerWindow: vi.fn(),
  releaseClaim: vi.fn(),
}));
vi.mock("@/lib/governance/pg-rate-limit", () => ({
  claimOncePerWindow: claim.claimOncePerWindow,
  releaseClaim: claim.releaseClaim,
}));
const sent = vi.hoisted(() => ({ emails: [] as Array<Record<string, unknown>>, fail: false }));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmailOrThrow: vi.fn(async (input: Record<string, unknown>) => {
    if (sent.fail) throw new Error("Resend refused the send");
    sent.emails.push(input);
    return "email-id";
  }),
}));

const {
  alertOperatorsOnProviderQuota,
  providerMessageOf,
  providerQuotaAlertKey,
  providerQuotaAlertText,
} = await import("@/lib/audit/provider-quota");

const META = {
  auditNumber: 57,
  organizationId: "00000000-0000-4000-8000-000000000057",
  brand: "Wattle Creek Plumbing",
  workspace: "Kookaburra Agency",
};
/** A stand-in for the runner's database: the audit's number, brand and workspace. */
const db = {
  select: () => ({
    from: () => ({ leftJoin: () => ({ leftJoin: () => ({ where: async () => [META] }) }) }),
  }),
} as unknown as DbClient;

const STORED =
  "HTTP 400 invalid_request_error: You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.";
const SENTENCE =
  "Claude refused calls: its spend or quota limit is reached. You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC. Raise the limit in the provider's console.";

beforeEach(() => {
  vi.stubEnv("PLATFORM_ADMIN_EMAILS", "ops-one@example.test, ops-two@example.test");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
  claim.claimed.clear();
  claim.claimOncePerWindow.mockReset().mockImplementation(async (key: string) => {
    if (claim.claimed.has(key)) return false;
    claim.claimed.add(key);
    return true;
  });
  claim.releaseClaim.mockReset().mockImplementation(async (key: string) => {
    claim.claimed.delete(key);
  });
  sent.emails.length = 0;
  sent.fail = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the operators' alert", () => {
  it("says what the sprint says, with the provider's own words", () => {
    expect(providerMessageOf(STORED)).toBe(
      "You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.",
    );
    expect(providerQuotaAlertText("claude", providerMessageOf(STORED))).toBe(SENTENCE);
    expect(providerQuotaAlertText("perplexity", "Payment Required")).toBe(
      "Perplexity refused calls: its spend or quota limit is reached. Payment Required. Raise the limit in the provider's console.",
    );
    expect(
      providerMessageOf(
        'HTTP 402: Perplexity API 402: {"error":{"message":"Insufficient credits.","type":"payment_required"}}',
      ),
    ).toBe("Insufficient credits.");
  });

  it("emails every operator once, then nothing more for that provider within the day", async () => {
    expect(
      await alertOperatorsOnProviderQuota(db, { auditId: "a1", engine: "claude", message: STORED }),
    ).toBe(2);
    expect(sent.emails.map((e) => e.to)).toEqual(["ops-one@example.test", "ops-two@example.test"]);
    const first = sent.emails[0];
    expect(first.subject).toBe(
      "[ops] Claude refused calls: spend or quota limit reached (Audit #57)",
    );
    expect(String(first.text)).toContain(SENTENCE);
    expect(String(first.text)).toContain("Wattle Creek Plumbing");
    expect(first.category).toBe("alert");

    expect(
      await alertOperatorsOnProviderQuota(db, { auditId: "a2", engine: "claude", message: STORED }),
    ).toBe(0);
    expect(sent.emails).toHaveLength(2);
    expect(claim.claimOncePerWindow).toHaveBeenCalledWith(
      providerQuotaAlertKey("claude"),
      24 * 60 * 60 * 1000,
    );
  });

  it("another provider gets its own email the same day", async () => {
    await alertOperatorsOnProviderQuota(db, { auditId: "a1", engine: "claude", message: STORED });
    expect(
      await alertOperatorsOnProviderQuota(db, {
        auditId: "a1",
        engine: "chatgpt",
        message: "HTTP 429 insufficient_quota: You exceeded your current quota.",
      }),
    ).toBe(2);
    expect(sent.emails).toHaveLength(4);
    expect(String(sent.emails[2].subject)).toMatch(/^\[ops\] ChatGPT refused calls/);
  });

  it("a send that fails gives the claim back and never throws (the next refusal tries again)", async () => {
    sent.fail = true;
    await expect(
      alertOperatorsOnProviderQuota(db, { auditId: "a1", engine: "claude", message: STORED }),
    ).resolves.toBe(0);
    expect(claim.releaseClaim).toHaveBeenCalledWith(providerQuotaAlertKey("claude"));
    sent.fail = false;
    expect(
      await alertOperatorsOnProviderQuota(db, { auditId: "a2", engine: "claude", message: STORED }),
    ).toBe(2);
  });

  it("no operator list: nothing is claimed or sent", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "");
    expect(
      await alertOperatorsOnProviderQuota(db, { auditId: "a1", engine: "claude", message: STORED }),
    ).toBe(0);
    expect(claim.claimOncePerWindow).not.toHaveBeenCalled();
    expect(sent.emails).toHaveLength(0);
  });
});
