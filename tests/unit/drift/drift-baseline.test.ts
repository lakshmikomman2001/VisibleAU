/**
 * "Mention detection" (6 Nov), part 6 -- drift is never measured across a methodology change, the same way
 * it's never measured against an audit that lost a whole engine. lib/drift/baseline.ts, shared by
 * inngest/functions/detect-drift.ts and lib/audit/run-audit-inline.ts.
 */
import { describe, expect, it } from "vitest";
import { driftBaseline } from "@/lib/drift/baseline";

const audit = (id: string, methodologyVersion: number | null, failedEngine = false) => ({
  id,
  methodologyVersion,
  engines: ["chatgpt", "claude"],
  promptsCount: 10,
  metadata: failedEngine ? { engineFailures: { claude: 10 } } : {},
});

describe("driftBaseline", () => {
  it("the latest earlier full audit under the same methodology", () => {
    const candidates = [audit("v3-partial", 3, true), audit("v3-full", 3), audit("v2-full", 2)];
    expect(driftBaseline({ methodologyVersion: 3 }, candidates)).toEqual({
      previous: candidates[1],
      reason: null,
    });
  });

  it("a v2.1 audit with only v2 audits before it is not compared: methodology_changed", () => {
    expect(driftBaseline({ methodologyVersion: 3 }, [audit("a", 2), audit("b", 2)])).toEqual({
      previous: null,
      reason: "methodology_changed",
    });
  });

  it("no earlier full audit at all: first_audit_no_comparison, as before", () => {
    expect(driftBaseline({ methodologyVersion: 3 }, [audit("a", 3, true)])).toEqual({
      previous: null,
      reason: "first_audit_no_comparison",
    });
  });

  it("an audit with no version recorded counts as version 1, as everywhere else", () => {
    const legacy = audit("legacy", null);
    expect(driftBaseline({ methodologyVersion: 1 }, [legacy])).toEqual({
      previous: legacy,
      reason: null,
    });
  });
});
