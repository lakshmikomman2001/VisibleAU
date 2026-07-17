import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/client", () => ({
  serviceDb: { execute: vi.fn() },
}));

import { serviceDb } from "@/db/client";
import { computeCdnShieldJoin, deriveVerdict } from "@/lib/agent-analytics/cdn-shield-join";

const mockExecute = serviceDb.execute as ReturnType<typeof vi.fn>;

describe("CDN Shield Join — §5.3, exactly 4 verdicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allowed + crawling → healthy", () => {
    expect(deriveVerdict(false, true)).toBe("healthy");
  });

  it("allowed + never_seen → not_blocked_never_visited", () => {
    expect(deriveVerdict(false, false)).toBe("not_blocked_never_visited");
  });

  it("blocked + never_seen → self_blocked", () => {
    expect(deriveVerdict(true, false)).toBe("self_blocked");
  });

  it("blocked + crawling → robots_violation (NOT healthy)", () => {
    const verdict = deriveVerdict(true, true);
    expect(verdict).toBe("robots_violation");
    expect(verdict).not.toBe("healthy");
  });

  it("computeCdnShieldJoin integrates shield diagnoses with crawl data", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        { vendor: "openai", crawler_name: "GPTBot" },
        { vendor: "google", crawler_name: "Googlebot" },
      ],
    });

    const results = await computeCdnShieldJoin(
      "brand-1",
      [
        { vendor: "openai", isBlocked: false },
        { vendor: "anthropic", isBlocked: true },
      ],
      new Date("2026-07-01"),
      new Date("2026-07-31"),
    );

    const openai = results.find((r) => r.vendor === "openai")!;
    const anthropic = results.find((r) => r.vendor === "anthropic")!;
    const google = results.find((r) => r.vendor === "google")!;

    expect(openai.verdict).toBe("healthy");
    expect(anthropic.verdict).toBe("self_blocked");
    expect(google.verdict).toBe("healthy"); // crawling but no shield diagnosis → assumed allowed
  });

  it("no 5th verdict exists — all inputs map to one of 4", () => {
    const allCombos = [
      { blocked: false, crawling: true },
      { blocked: false, crawling: false },
      { blocked: true, crawling: true },
      { blocked: true, crawling: false },
    ];

    const validVerdicts = new Set([
      "healthy",
      "not_blocked_never_visited",
      "self_blocked",
      "robots_violation",
    ]);

    for (const combo of allCombos) {
      const v = deriveVerdict(combo.blocked, combo.crawling);
      expect(validVerdicts.has(v)).toBe(true);
    }
  });
});
