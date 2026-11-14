/**
 * "Mention detection" (6 Nov), part 6 -- drift is never measured across a methodology change, the same way
 * it's never measured against an audit that lost a whole engine. lib/drift/baseline.ts, shared by
 * inngest/functions/detect-drift.ts and lib/audit/run-audit-inline.ts.
 *
 * Methodology v2.2 (Sri's decision, 7 Nov), part 3 -- nor across a change of models (a plan change from
 * Claude Haiku to Sonnet, Gemini 2.5 Flash to 3.5 Flash-Lite), nor with an audit a provider answered with
 * another model than the one asked for.
 */
import { describe, expect, it } from "vitest";
import type { AuditModelsOf } from "@/lib/audit/model-drift";
import { driftBaseline } from "@/lib/drift/baseline";
import type { ModelDrift } from "@/lib/llm/model-drift";

const STARTER = {
  chatgpt: ["gpt-4.1-mini"],
  claude: ["claude-haiku-4-5"],
  gemini: ["gemini-3.5-flash-lite"],
  perplexity: ["sonar"],
};
const GROWTH = { ...STARTER, claude: ["claude-sonnet-4-6"] };
const BEFORE_SWITCH = { ...STARTER, gemini: ["gemini-2.5-flash"] };
const DRIFT: ModelDrift = {
  engine: "perplexity",
  requested: "sonar",
  answered: "sonar-reasoning",
  answers: 13,
  engineAnswers: 13,
};

/** 15 Nov, part 2: the everyday questions an audit asked (audits.question_set_hash); the same unless a test says. */
const QUESTIONS_V4 = { questionSetHash: "q-v4", promptPackVersion: 3 };
const QUESTIONS_V3 = { questionSetHash: "q-v3", promptPackVersion: 3 };

const audit = (
  id: string,
  methodologyVersion: number | null,
  failedEngine = false,
  questions: { questionSetHash: string | null; promptPackVersion: number | null } = QUESTIONS_V4,
) => ({
  id,
  methodologyVersion,
  ...questions,
  engines: ["chatgpt", "claude", "gemini", "perplexity"],
  promptsCount: 10,
  metadata: failedEngine ? { engineFailures: { claude: 10 } } : {},
});

/** Every audit on Starter's models, unless named here; `drifted` audits had model drift. */
function models(
  ids: string[],
  sets: Record<string, AuditModelsOf["models"]> = {},
  drifted: string[] = [],
): Map<string, AuditModelsOf> {
  return new Map(
    ids.map((id) => [
      id,
      { models: sets[id] ?? STARTER, drift: drifted.includes(id) ? [DRIFT] : [] },
    ]),
  );
}

describe("driftBaseline", () => {
  it("the latest earlier full audit under the same methodology", () => {
    const candidates = [audit("v3-partial", 3, true), audit("v3-full", 3), audit("v2-full", 2)];
    expect(
      driftBaseline(
        { id: "now", methodologyVersion: 3, ...QUESTIONS_V4 },
        candidates,
        models(["now", ...candidates.map((c) => c.id)]),
      ),
    ).toEqual({ previous: candidates[1], reason: null });
  });

  it("a v2.1 audit with only v2 audits before it is not compared: methodology_changed", () => {
    expect(
      driftBaseline(
        { id: "now", methodologyVersion: 3, ...QUESTIONS_V4 },
        [audit("a", 2), audit("b", 2)],
        models(["now", "a", "b"]),
      ),
    ).toEqual({ previous: null, reason: "methodology_changed" });
  });

  it("no earlier full audit at all: first_audit_no_comparison, as before", () => {
    expect(
      driftBaseline(
        { id: "now", methodologyVersion: 3, ...QUESTIONS_V4 },
        [audit("a", 3, true)],
        models(["now", "a"]),
      ),
    ).toEqual({ previous: null, reason: "first_audit_no_comparison" });
  });

  it("an audit with no version recorded counts as version 1, as everywhere else", () => {
    const legacy = audit("legacy", null);
    expect(
      driftBaseline(
        { id: "now", methodologyVersion: 1, ...QUESTIONS_V4 },
        [legacy],
        models(["now", "legacy"]),
      ),
    ).toEqual({ previous: legacy, reason: null });
  });
});

describe("driftBaseline: the same models, no model drift (methodology v2.2, part 3)", () => {
  it("two same-model, same-version audits are compared", () => {
    const earlier = audit("earlier", 4);
    expect(
      driftBaseline(
        { id: "now", methodologyVersion: 4, ...QUESTIONS_V4 },
        [earlier],
        models(["now", "earlier"]),
      ),
    ).toEqual({ previous: earlier, reason: null });
  });

  it("Starter -> Growth (Claude Haiku -> Sonnet) isn't compared: models_changed", () => {
    expect(
      driftBaseline(
        { id: "growth", methodologyVersion: 4, ...QUESTIONS_V4 },
        [audit("starter", 4)],
        models(["growth", "starter"], { growth: GROWTH }),
      ),
    ).toEqual({ previous: null, reason: "models_changed" });
  });

  it("Gemini 2.5 Flash -> 3.5 Flash-Lite isn't compared: models_changed", () => {
    expect(
      driftBaseline(
        { id: "now", methodologyVersion: 4, ...QUESTIONS_V4 },
        [audit("before-switch", 4)],
        models(["now", "before-switch"], { "before-switch": BEFORE_SWITCH }),
      ),
    ).toEqual({ previous: null, reason: "models_changed" });
  });

  it("the latest earlier audit with the same models, past one with others", () => {
    const candidates = [audit("starter", 4), audit("growth-earlier", 4)];
    expect(
      driftBaseline(
        { id: "now", methodologyVersion: 4, ...QUESTIONS_V4 },
        candidates,
        models(["now", "starter", "growth-earlier"], { now: GROWTH, "growth-earlier": GROWTH }),
      ),
    ).toEqual({ previous: candidates[1], reason: null });
  });

  it("an audit a provider answered with another model is never the baseline", () => {
    const candidates = [audit("drifted", 4), audit("clean", 4)];
    expect(
      driftBaseline(
        { id: "now", methodologyVersion: 4, ...QUESTIONS_V4 },
        candidates,
        models(["now", "drifted", "clean"], {}, ["drifted"]),
      ),
    ).toEqual({ previous: candidates[1], reason: null });
    expect(
      driftBaseline(
        { id: "now", methodologyVersion: 4, ...QUESTIONS_V4 },
        [audit("drifted", 4)],
        models(["now", "drifted"], {}, ["drifted"]),
      ),
    ).toEqual({ previous: null, reason: "model_drift" });
  });

  it("nor is it compared itself: model_drift", () => {
    expect(
      driftBaseline(
        { id: "now", methodologyVersion: 4, ...QUESTIONS_V4 },
        [audit("earlier", 4)],
        models(["now", "earlier"], {}, ["now"]),
      ),
    ).toEqual({ previous: null, reason: "model_drift" });
  });

  // 15 Nov, part 2 (Sri, Hero's #48 and #50): #50 ran generator v4's questions under #48's pack version (the pack
  // is regenerated after the audit row is stamped), so only the stored question set tells them apart.
  it("nor across a change of everyday questions, even under the same pack version: questions_changed", () => {
    expect(
      driftBaseline(
        { id: "now", methodologyVersion: 4, ...QUESTIONS_V4 },
        [audit("v3-questions", 4, false, QUESTIONS_V3)],
        models(["now", "v3-questions"]),
      ),
    ).toEqual({ previous: null, reason: "questions_changed" });
  });

  it("the latest earlier audit with the same questions is the baseline", () => {
    const candidates = [audit("v3-questions", 4, false, QUESTIONS_V3), audit("v4-earlier", 4)];
    expect(
      driftBaseline(
        { id: "now", methodologyVersion: 4, ...QUESTIONS_V4 },
        candidates,
        models(["now", ...candidates.map((c) => c.id)]),
      ),
    ).toEqual({ previous: candidates[1], reason: null });
  });

  it("an audit with no stored question set: the pack versions decide, as before migration 0150", () => {
    const legacy = { questionSetHash: null, promptPackVersion: 3 };
    expect(
      driftBaseline(
        { id: "now", methodologyVersion: 4, ...QUESTIONS_V4 },
        [audit("legacy", 4, false, legacy)],
        models(["now", "legacy"]),
      ).previous?.id,
    ).toBe("legacy");
    expect(
      driftBaseline(
        { id: "now", methodologyVersion: 4, ...QUESTIONS_V4 },
        [audit("older-pack", 4, false, { questionSetHash: null, promptPackVersion: 2 })],
        models(["now", "older-pack"]),
      ),
    ).toEqual({ previous: null, reason: "questions_changed" });
  });
});
