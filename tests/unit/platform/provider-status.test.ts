/**
 * 13 Nov (Sri's walk-through, part 12): the dashboard's "All systems normal" was a fixed label; the morning
 * after Claude refused all 14 questions of audit #47 on a spend limit, it still said so. What it says is
 * measured now: an engine (or Google's checks) is unavailable when a failure that stops it until someone
 * acts came after its last successful answer in the last 24 hours; "answered" only when answers were
 * measured; nothing when nothing was.
 */
import { describe, expect, it } from "vitest";
import { providerOutages, providerStatusLine } from "@/lib/platform/provider-status";

// 12 Nov 2026, 23:30 in Sydney (UTC+11).
const NOW = new Date("2026-11-12T12:30:00Z");
const at = (iso: string) => new Date(iso);
const PLAN = ["chatgpt", "claude", "gemini", "perplexity"];

describe("providerOutages", () => {
  it("a stopping failure after the last success is an outage, from the first such failure", () => {
    const outages = providerOutages({
      failures: [
        { provider: "claude", at: at("2026-11-12T11:30:00Z"), reason: "spend limit", stops: true },
        { provider: "claude", at: at("2026-11-12T12:00:00Z"), reason: "spend limit", stops: true },
      ],
      lastSuccess: { claude: at("2026-11-12T10:00:00Z") },
    });
    expect(outages).toEqual([
      {
        provider: "claude",
        name: "Claude",
        since: at("2026-11-12T11:30:00Z"),
        reason: "spend limit",
      },
    ]);
  });

  it("recovered (a success after it) is no outage; a rate limit or timeout never is", () => {
    expect(
      providerOutages({
        failures: [
          {
            provider: "claude",
            at: at("2026-11-12T11:30:00Z"),
            reason: "spend limit",
            stops: true,
          },
        ],
        lastSuccess: { claude: at("2026-11-12T13:00:00Z") },
      }),
    ).toEqual([]);
    expect(
      providerOutages({
        failures: [
          {
            provider: "gemini",
            at: at("2026-11-12T11:30:00Z"),
            reason: "rate limit",
            stops: false,
          },
        ],
        lastSuccess: {},
      }),
    ).toEqual([]);
  });

  it("Google's refused login is 'Google AI checks'", () => {
    expect(
      providerOutages({
        failures: [
          { provider: "dataforseo", at: at("2026-11-12T03:03:00Z"), reason: "login", stops: true },
        ],
        lastSuccess: {},
      })[0].name,
    ).toBe("Google AI checks");
  });
});

describe("providerStatusLine", () => {
  const claudeDown = {
    outages: [
      {
        provider: "claude",
        name: "Claude",
        since: at("2026-11-12T11:30:00Z"),
        reason: "spend limit",
      },
    ],
    answered: 40,
  };

  it("'Claude unavailable since 22:30 — audits use 3 engines' (Sydney time, the plan's engines)", () => {
    expect(providerStatusLine(claudeDown, { planEngines: PLAN, usesGoogle: false }, NOW)).toEqual({
      tone: "down",
      text: "Claude unavailable since 22:30 — audits use 3 engines",
      provider: "claude",
    });
  });

  it("an earlier day says the date", () => {
    const old = {
      ...claudeDown,
      outages: [{ ...claudeDown.outages[0], since: at("2026-11-11T10:00:00Z") }],
    };
    expect(providerStatusLine(old, { planEngines: PLAN, usesGoogle: false }, NOW)?.text).toBe(
      "Claude unavailable since 11 Nov 21:00 — audits use 3 engines",
    );
  });

  it("an engine outside the plan isn't this workspace's problem; Google's only when it uses Google", () => {
    expect(
      providerStatusLine(
        claudeDown,
        { planEngines: ["chatgpt", "perplexity"], usesGoogle: false },
        NOW,
      ),
    ).toEqual({
      tone: "ok",
      text: "AI engines answered in the last 24 hours",
      provider: null,
    });
    const googleDown = {
      outages: [
        {
          provider: "dataforseo",
          name: "Google AI checks",
          since: at("2026-11-11T16:03:00Z"),
          reason: "login",
        },
      ],
      answered: 10,
    };
    expect(
      providerStatusLine(googleDown, { planEngines: PLAN, usesGoogle: false }, NOW)?.tone,
    ).toBe("ok");
    expect(providerStatusLine(googleDown, { planEngines: PLAN, usesGoogle: true }, NOW)?.text).toBe(
      "Google AI checks unavailable since 03:03",
    );
  });

  it("nothing measured, nothing said", () => {
    expect(
      providerStatusLine(
        { outages: [], answered: 0 },
        { planEngines: PLAN, usesGoogle: true },
        NOW,
      ),
    ).toBeNull();
  });
});
