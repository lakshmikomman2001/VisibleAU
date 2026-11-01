/**
 * Engine-failure follow-ups (1 Nov), item 4 -- the shared "3 of 4
 * engines" note every client-facing surface shows, and the PDF's
 * like-for-like caveat.
 */
import { describe, expect, it } from "vitest";
import { engineCoverageChecks, engineCoverageFrom } from "@/lib/audit/engine-coverage";
import { likeForLikeCaveat } from "@/lib/pdf/render";

const ENGINES = ["chatgpt", "claude", "gemini", "perplexity"];
const USAGE_LIMIT =
  "HTTP 400 invalid_request_error: You have reached your specified API usage limits. You will regain access on Nov 1, 2026 at 00:00 UTC.";

function rows(engine: string, message: string, n = 13) {
  return Array.from({ length: n }, () => ({ engine, errorClass: "other", errorMessage: message }));
}

describe("engineCoverageFrom", () => {
  it("audit #37: 3 of 4 engines, Claude's plain reason, never the provider's message", () => {
    const c = engineCoverageFrom(
      { engines: ENGINES, promptsCount: 13, metadata: { engineFailures: { claude: 13 } } },
      rows("claude", USAGE_LIMIT),
    );
    expect(c).toMatchObject({
      enginesPlanned: 4,
      enginesAnswered: 3,
      fullyFailedEngines: ["claude"],
      label: "3 of 4 engines",
      note: "Based on 3 of 4 engines. Claude returned an error for every question: Provider spend limit reached (a monthly limit set in the provider's console).",
    });
    expect(engineCoverageChecks(c)).toEqual([
      "Raise the monthly spend limit in the provider's console, or wait for it to reset.",
    ]);
    expect(JSON.stringify(c)).not.toContain("specified API usage limits");
  });

  it("two engines with different reasons: each named", () => {
    const c = engineCoverageFrom(
      {
        engines: ENGINES,
        promptsCount: 13,
        metadata: { engineFailures: { claude: 13, gemini: 13 } },
      },
      [
        ...rows("claude", USAGE_LIMIT),
        ...rows("gemini", "HTTP 401 authentication_error: API key not valid"),
      ],
    );
    expect(c.label).toBe("2 of 4 engines");
    expect(c.note).toBe(
      "Based on 2 of 4 engines. Claude and Gemini returned an error for every question. Claude: Provider spend limit reached (a monthly limit set in the provider's console). Gemini: Provider error: API key rejected.",
    );
    expect(engineCoverageChecks(c)).toHaveLength(2);
  });

  it("every engine answered (even with some failures): no label, no note", () => {
    const c = engineCoverageFrom(
      { engines: ENGINES, promptsCount: 13, metadata: { engineFailures: { claude: 2 } } },
      rows("claude", USAGE_LIMIT, 2),
    );
    expect(c).toEqual({
      enginesPlanned: 4,
      enginesAnswered: 4,
      fullyFailedEngines: [],
      failures: [],
      label: null,
      note: null,
    });
  });
});

describe("likeForLikeCaveat (the PDF's comparison with the prior audit)", () => {
  it("names whichever audit was missing an engine, and nothing when neither was", () => {
    expect(likeForLikeCaveat({ engineCoverage: { label: "3 of 4 engines" } })).toBe(
      "That's not like for like: this audit is based on 3 of 4 engines, the earlier one on all of them.",
    );
    expect(likeForLikeCaveat({ priorEngineCoverageLabel: "3 of 4 engines" })).toBe(
      "That's not like for like: the earlier audit was based on 3 of 4 engines.",
    );
    expect(
      likeForLikeCaveat({
        engineCoverage: { label: "3 of 4 engines" },
        priorEngineCoverageLabel: "2 of 4 engines",
      }),
    ).toBe(
      "That's not like for like: this audit is based on 3 of 4 engines, the earlier one on 2 of 4 engines.",
    );
    expect(likeForLikeCaveat({})).toBeNull();
  });
});
