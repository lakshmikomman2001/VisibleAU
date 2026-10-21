import { describe, expect, it } from "vitest";
import { MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE, resolveHeadline } from "@/lib/scoring/dimension-result";
import { wilsonCI } from "@/lib/scoring/wilson";
import {
  SAMPLE_AUDIT_CONFIG,
  SAMPLE_AUDIT_DEADLINE_MS,
  SAMPLE_AUDIT_STALE_THRESHOLD_MS,
} from "@/lib/sample-audit/config";

describe("SAMPLE_AUDIT_CONFIG", () => {
  it("engines x promptsCount x runsPerPrompt equals totalCallsExpected (12)", () => {
    expect(SAMPLE_AUDIT_CONFIG.engines.length * SAMPLE_AUDIT_CONFIG.promptsCount * SAMPLE_AUDIT_CONFIG.runsPerPrompt).toBe(
      SAMPLE_AUDIT_CONFIG.totalCallsExpected,
    );
  });

  // Audit reliability, Part C, item 1: "score whatever succeeded: 10 or
  // more answers give a score, otherwise 'Not enough data'". With 12
  // planned calls, up to 2 engine failures must still clear
  // MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE (10) -- the exact property
  // lib/sample-audit/config.ts's own promptsCount comment claims.
  it("tolerates up to 2 engine failures and still clears MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE", () => {
    const worstCaseSuccesses = SAMPLE_AUDIT_CONFIG.totalCallsExpected - 2;
    expect(worstCaseSuccesses).toBeGreaterThanOrEqual(MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE);

    const headline = resolveHeadline(
      50,
      wilsonCI(worstCaseSuccesses / 2, worstCaseSuccesses),
      worstCaseSuccesses,
    );
    expect(headline.status).toBe("scored");
  });

  it("a 3rd failure (9 successes) drops below the threshold -- insufficient_data, not a fabricated score", () => {
    const belowThreshold = SAMPLE_AUDIT_CONFIG.totalCallsExpected - 3;
    expect(belowThreshold).toBeLessThan(MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE);

    const headline = resolveHeadline(50, wilsonCI(belowThreshold / 2, belowThreshold), belowThreshold);
    expect(headline.status).toBe("insufficient_data");
    if (headline.status === "insufficient_data") {
      expect(headline.reason).toBe("no_answers");
    }
  });
});

// Audit reliability, Part C, item 1 -- the sample's overall deadline
// must leave real headroom inside the route's 60s maxDuration
// (vercel.json), and the stale-run guard's own threshold must sit
// comfortably after it (it exists specifically to catch a run that
// somehow outlives the deadline mechanism, not to race it).
describe("SAMPLE_AUDIT_DEADLINE_MS / SAMPLE_AUDIT_STALE_THRESHOLD_MS", () => {
  const ROUTE_MAX_DURATION_MS = 60_000;

  it("the deadline leaves real headroom inside the route's 60s maxDuration", () => {
    expect(SAMPLE_AUDIT_DEADLINE_MS).toBeGreaterThan(0);
    expect(SAMPLE_AUDIT_DEADLINE_MS).toBeLessThan(ROUTE_MAX_DURATION_MS);
  });

  it("the stale threshold is strictly after the deadline, giving post-call work (scoring, recommendations, drift) room to finish", () => {
    expect(SAMPLE_AUDIT_STALE_THRESHOLD_MS).toBeGreaterThan(SAMPLE_AUDIT_DEADLINE_MS);
  });
});
