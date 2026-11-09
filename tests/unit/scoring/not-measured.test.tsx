// @vitest-environment jsdom
/**
 * Mock-gate and retention follow-ups (9 Nov), part 9 -- never show 0 for something that wasn't measured. Omega
 * Services' Trust page showed "Overall Trust Score 0/100" with an empty bar under "No trust data is available",
 * "Run an audit or check to establish a baseline score" (it had 5 audits; audits don't produce that score), and
 * announced "Hallucination detection hasn't been built yet".
 * - the one helper (lib/scoring/measured.ts): not measured reads "Not measured yet", a measured 0 is 0;
 * - the score card: no number and no bar when not measured; a measured 0 shows 0 with what it's based on;
 * - the Trust page: the overall card follows the API's null; the hallucination card and the tiles of checks that
 *   aren't built are hidden until they are;
 * - no score display defaults a missing value to 0 (source scan).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrustScoreCard } from "@/components/domain/trust/trust-score-card";
import { ExplainabilityService } from "@/lib/platform/explainability";
import { measured, NOT_MEASURED, scoreText } from "@/lib/scoring/measured";
import { readSourcesBeforeAll, sourceFiles } from "../../helpers/source-files";

vi.mock("next/navigation", () => ({
  useParams: () => ({ brandId: "b1" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/domain/plan-tier-context", () => ({ usePlanTier: () => "agency_pro" }));
vi.mock("@/components/domain/pricing/brand-feature-gate", () => ({
  useBrandFeatureGate: () => ({ locked: false, planRefused: async () => false }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The scan's one walk, before the file's tests (tests/helpers/source-files.ts).
readSourcesBeforeAll(["app", "components"]);

describe("one helper", () => {
  it("missing is not measured; 0 is a measured 0", () => {
    expect(measured(null)).toEqual({ measured: false });
    expect(measured(undefined)).toEqual({ measured: false });
    expect(measured("")).toEqual({ measured: false });
    expect(measured(0)).toEqual({ measured: true, value: 0 });
    expect(measured("0.00")).toEqual({ measured: true, value: 0 });
    expect(scoreText(null, 100)).toBe(NOT_MEASURED);
    expect(scoreText(0, 100)).toBe("0/100");
  });
});

describe("the score card", () => {
  it("not measured: 'Not measured yet', no number, no bar", () => {
    const { container } = render(
      <TrustScoreCard
        label="Overall Trust Score"
        score={null}
        maxScore={100}
        rationale="r"
        confidenceLabel={null}
      />,
    );
    expect(screen.getByText(NOT_MEASURED)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*100/);
    expect(container.querySelector('[style*="width"]')).toBeNull();
  });

  it("a measured 0: '0/100' with its basis", () => {
    const { container } = render(
      <TrustScoreCard
        label="Overall Trust Score"
        score={0}
        basis="Based on: Entity 0/100"
        maxScore={100}
        rationale="r"
        confidenceLabel={null}
      />,
    );
    expect(container.textContent).toMatch(/0\s*\/100/);
    expect(screen.getByText("Based on: Entity 0/100")).toBeInTheDocument();
    expect(screen.queryByText(NOT_MEASURED)).toBeNull();
  });

  it("the rationale for a measured 0 is a result, never 'no data'; nothing checked is 'not measured'", () => {
    const zero = ExplainabilityService.annotate({
      score: 0,
      scoreLabel: "Trust Score",
      maxScore: 100,
      context: { brandName: "Omega Services", dimension: "trust" },
    }).rationale;
    expect(zero).toBe(
      "Omega Services's trust score is 0/100: none of the signals it measures was found.",
    );
    expect(zero).not.toMatch(/No .* data|Run an audit|baseline/);
    const none = ExplainabilityService.annotate({
      score: 0,
      scoreLabel: "Hallucination Risk",
      maxScore: 100,
      context: { brandName: "Omega Services", dimension: "hallucination risk", sampleSize: 0 },
    }).rationale;
    expect(none).toContain(NOT_MEASURED);
  });
});

describe("the Trust page", () => {
  it("an unmeasured overall score reads 'Not measured yet'; unbuilt checks' card and tiles are hidden", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          hallucinationRisk: 0,
          citationCount: 0,
          entityScore: null,
          linkedinPresenceScore: null,
          consensusScore: null,
          youtubePresenceScore: null,
          overallTrustScore: null,
          overallBasis: null,
          rationale:
            "Not measured yet. Omega Services's Trust Score comes from the Entity check...",
          confidence_label: null,
          confidence_note: null,
          top_action: null,
          riskLevel: null,
          riskRationale: NOT_MEASURED,
        }),
      }),
    );
    const Page = (await import("@/app/(auth)/brands/[brandId]/trust/page")).default;
    const { container } = render(<Page />);
    await screen.findByText("Overall Trust Score");
    expect(container.textContent).toContain(NOT_MEASURED);
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*100/);
    expect(container.textContent).not.toMatch(/Hallucination Risk|hasn't been built/);
    for (const hidden of ["Hallucination Incidents", "LinkedIn Presence", "Consensus Score"]) {
      expect(screen.queryByText(hidden)).toBeNull();
    }
    for (const shown of [
      "Entity Score",
      "YouTube Presence",
      "Evidence Archive",
      "Citation Sources",
    ]) {
      expect(screen.getByText(shown)).toBeInTheDocument();
    }
  }, 30_000);
});

describe("no score display defaults a missing value to 0", () => {
  it("no page or component writes `score ?? 0` (or || 0) for a score", () => {
    const DEFAULTS_TO_ZERO =
      /\b\w*(?:[sS]core|[rR]isk|[rR]eadiness|[pP]resence|[cC]onsistency|[aA]uthority)\w*\s*(?:\?\?|\|\|)\s*0\b/;
    const offenders = sourceFiles(["app", "components"]).flatMap((f) =>
      f.text
        .split("\n")
        .map((line, i) => ({ line, at: `${f.path}:${i + 1}` }))
        .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line) && DEFAULTS_TO_ZERO.test(line))
        .map(({ at, line }) => `${at}  ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
