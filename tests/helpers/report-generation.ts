/**
 * S01B part 1 (LLD amendment 49): an Enhanced report is finished by a second function. generate-narrative-report
 * writes the row and sends ENHANCED_CHECKS_REQUESTED; refresh-enhanced-checks runs the checks, writes the snapshot and
 * sends report/generated. This runs the generator the way the tests always have (its handler, a step runner, the
 * events captured instead of sent) and then, as Inngest would, the refresh function for every request the generator
 * sent, so a test sees the report as it is once both have run.
 */
import { vi } from "vitest";

export interface StepRunner {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
}

type Handler = (ctx: {
  event: { id: string; data: Record<string, unknown> };
  step: StepRunner;
}) => Promise<unknown>;

export interface SentEvent {
  id?: string;
  name: string;
  data: Record<string, unknown>;
}

export interface ReportGenerationRun {
  /** What the generator returned. */
  generator: { reportId?: string; [key: string]: unknown };
  /** What the refresh function returned, for an Enhanced report; null when nothing asked for one. */
  checks: unknown;
  /** Every event either function sent, in order. */
  sent: SentEvent[];
}

/**
 * Runs the generator with `data` as its event's data, then refresh-enhanced-checks for each request it sent.
 * `step(fnId)` gives each function's step runner (default: run the step at once).
 */
export async function runReportGeneration(input: {
  data: Record<string, unknown>;
  eventId?: string;
  step?: (fnId: "generate-narrative-report" | "refresh-enhanced-checks") => StepRunner;
}): Promise<ReportGenerationRun> {
  const { inngest } = await import("@/lib/inngest/client");
  const { generateNarrativeReport } = await import("@/inngest/functions/generate-narrative-report");
  const { refreshEnhancedChecksFn } = await import("@/inngest/functions/refresh-enhanced-checks");
  const { ENHANCED_CHECKS_REQUESTED } = await import("@/lib/reports/enhanced-report-steps");
  const sent: SentEvent[] = [];
  const send = vi.spyOn(inngest, "send").mockImplementation(async (payload: unknown) => {
    for (const e of Array.isArray(payload) ? payload : [payload]) sent.push(e as SentEvent);
    return { ids: ["x"] };
  });
  const stepFor = input.step ?? (() => ({ run: <T>(_name: string, fn: () => Promise<T>) => fn() }));
  try {
    const generator = (await (generateNarrativeReport as unknown as { fn: Handler }).fn({
      event: { id: input.eventId ?? `evt-${crypto.randomUUID()}`, data: input.data },
      step: stepFor("generate-narrative-report"),
    })) as ReportGenerationRun["generator"];
    let checks: unknown = null;
    for (const request of sent.filter((e) => e.name === ENHANCED_CHECKS_REQUESTED)) {
      checks = await (refreshEnhancedChecksFn as unknown as { fn: Handler }).fn({
        event: { id: request.id ?? `evt-${crypto.randomUUID()}`, data: request.data },
        step: stepFor("refresh-enhanced-checks"),
      });
    }
    return { generator, checks, sent };
  } finally {
    send.mockRestore();
  }
}
