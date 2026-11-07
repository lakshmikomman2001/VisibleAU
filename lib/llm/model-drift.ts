import { ENGINE_DISPLAY_NAMES } from "./interface";

/**
 * Sri's decision 6 (7 Nov) -- a provider can answer with a different model than the one we asked for:
 * Perplexity's sonar-pro answered by sonar or "fast", or, from 1 Dec 2026, every gemini-2.5-flash call
 * served by gemini-3.5-flash-lite. Each answer stores both: citations.llm_model (the model the app asked
 * for) and citations.llm_model_answered (the one the provider's response named; NULL when it named none,
 * and on rows from before migration 0126).
 *
 * The one rule for "different", used by the audit page's note, the PDF's method page and the alert
 * (lib/audit/model-drift-alert.ts). A dated or numbered snapshot of the model asked for is the same model:
 * OpenAI answers "gpt-4.1-mini" as "gpt-4.1-mini-2025-04-14", Anthropic "claude-haiku-4-5" as
 * "claude-haiku-4-5-20251001", Google can add "-001".
 */
export interface ModelDrift {
  engine: string;
  requested: string;
  answered: string;
  /** This engine's answers in the audit that came from `answered`. */
  answers: number;
  /** All of this engine's answers in the audit. */
  engineAnswers: number;
}

const SNAPSHOT_TAG = /^(\d{4}-\d{2}-\d{2}|\d{8}|\d{3})$/;

function normaliseModel(model: string): string {
  return model
    .trim()
    .toLowerCase()
    .replace(/^models\//, "");
}

/** Whether the model a response named is the one asked for, or a dated snapshot of it. */
export function isSameModel(requested: string, answered: string): boolean {
  const asked = normaliseModel(requested);
  const got = normaliseModel(answered);
  if (got === asked) return true;
  return got.startsWith(`${asked}-`) && SNAPSHOT_TAG.test(got.slice(asked.length + 1));
}

/** The model a provider's raw response body names in `field` ("model" for OpenAI and Anthropic,
 * "modelVersion" for Gemini, which @ai-sdk/google doesn't surface as response.modelId), or undefined. */
export function modelNamedIn(body: unknown, field: "model" | "modelVersion"): string | undefined {
  if (body === null || typeof body !== "object") return undefined;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/** The model to record as the one that answered: the first a request named that differs from the
 * one asked for, else the last one named (one answer can be several requests, e.g. a paused Claude
 * turn continued). Undefined when no request named a model. */
export function answeredModelOf(
  requested: string,
  named: Array<string | null | undefined>,
): string | undefined {
  const models = named.filter((m): m is string => typeof m === "string" && m.trim().length > 0);
  return models.find((m) => !isSameModel(requested, m)) ?? models.at(-1);
}

/** One audit's answers: which engines answered with another model, how often, in engine order. */
export function findModelDrift(
  rows: Array<{ engine: string; llmModel: string | null; llmModelAnswered: string | null }>,
): ModelDrift[] {
  const perEngine = new Map<string, number>();
  const drifted = new Map<string, ModelDrift>();
  for (const row of rows) {
    perEngine.set(row.engine, (perEngine.get(row.engine) ?? 0) + 1);
    if (!row.llmModel || !row.llmModelAnswered) continue;
    if (isSameModel(row.llmModel, row.llmModelAnswered)) continue;
    const key = `${row.engine}\n${row.llmModel}\n${row.llmModelAnswered}`;
    const entry = drifted.get(key) ?? {
      engine: row.engine,
      requested: row.llmModel,
      answered: row.llmModelAnswered,
      answers: 0,
      engineAnswers: 0,
    };
    entry.answers += 1;
    drifted.set(key, entry);
  }
  return [...drifted.values()]
    .map((d) => ({ ...d, engineAnswers: perEngine.get(d.engine) ?? d.answers }))
    .sort(
      (a, b) =>
        a.engine.localeCompare(b.engine) ||
        b.answers - a.answers ||
        a.answered.localeCompare(b.answered),
    );
}

/** "Perplexity answered with sonar instead of sonar-pro (12 of 12 answers)". */
export function modelDriftNote(d: ModelDrift): string {
  const name = (ENGINE_DISPLAY_NAMES as Record<string, string>)[d.engine] ?? d.engine;
  return `${name} answered with ${d.answered} instead of ${d.requested} (${d.answers} of ${d.engineAnswers} ${d.engineAnswers === 1 ? "answer" : "answers"})`;
}
