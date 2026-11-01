import { and, eq, inArray } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { engineCallFailures } from "@/db/schema";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import {
  describeEngineFailure,
  type EngineFailureReason,
  engineNameList,
  fullyFailedEngines,
  summarizeEngineFailures,
} from "./engine-failure";

const ENGINE_NAMES: Record<string, string> = { ...ENGINE_DISPLAY_NAMES };

/**
 * Engine-failure follow-ups (1 Nov), item 4 -- how many of an audit's
 * engines answered, for the surfaces clients see: the client portal, the
 * audit PDF, the narrative report, the audit-complete email and the
 * audit.completed webhook. Same rule as the audit page's banner
 * (fullyFailedEngines: every one of an engine's calls failed), and the
 * same plain reason (describeEngineFailure) -- the provider's message is
 * matched on the server and never leaves it.
 */
export interface EngineCoverage {
  enginesPlanned: number;
  enginesAnswered: number;
  /** Engine ids, e.g. ["claude"]. Empty when every engine answered. */
  fullyFailedEngines: string[];
  failures: Array<{ engine: string; reason: EngineFailureReason }>;
  /** "3 of 4 engines"; null when every engine answered. */
  label: string | null;
  /**
   * "Based on 3 of 4 engines. Claude returned an error for every question:
   * Provider spend limit reached (...)." -- null when every engine answered.
   */
  note: string | null;
}

interface AuditCoverageInput {
  id: string;
  engines: string[] | null;
  promptsCount: number | null;
  metadata: unknown;
}

/** "Claude returned an error for every question: <reason>." (one sentence per distinct reason). */
function failureSentence(failures: EngineCoverage["failures"]): string {
  const engines = failures.map((f) => f.engine);
  const reasons = [...new Set(failures.map((f) => f.reason.label))];
  const verb = `returned an error for every question`;
  if (reasons.length === 1) return `${engineNameList(engines)} ${verb}: ${reasons[0]}.`;
  const each = failures.map((f) => `${ENGINE_NAMES[f.engine] ?? f.engine}: ${f.reason.label}.`);
  return `${engineNameList(engines)} ${verb}. ${each.join(" ")}`;
}

/** Coverage from the audit row and its failure rows' reasons -- pure, for callers that already have both. */
export function engineCoverageFrom(
  audit: Omit<AuditCoverageInput, "id">,
  failureRows: Array<{ engine: string; errorClass: string; errorMessage: string | null }>,
): EngineCoverage {
  const planned = audit.engines?.length ?? 0;
  const failed = fullyFailedEngines(audit);
  if (failed.length === 0 || planned === 0) {
    return {
      enginesPlanned: planned,
      enginesAnswered: planned,
      fullyFailedEngines: [],
      failures: [],
      label: null,
      note: null,
    };
  }
  const summary = summarizeEngineFailures(failureRows.filter((r) => failed.includes(r.engine)));
  const failures = failed.map((engine) => ({
    engine,
    reason:
      summary.get(engine)?.reason ?? describeEngineFailure({ errorClass: "other", message: null }),
  }));
  const answered = planned - failed.length;
  const label = `${answered} of ${planned} engines`;
  return {
    enginesPlanned: planned,
    enginesAnswered: answered,
    fullyFailedEngines: failed,
    failures,
    label,
    note: `Based on ${label}. ${failureSentence(failures)}`,
  };
}

/** Reads the failure rows only when some engine answered nothing. */
export async function resolveEngineCoverage(
  db: DbClient,
  audit: AuditCoverageInput,
): Promise<EngineCoverage> {
  const failed = fullyFailedEngines(audit);
  const rows =
    failed.length > 0
      ? await db
          .select({
            engine: engineCallFailures.engine,
            errorClass: engineCallFailures.errorClass,
            errorMessage: engineCallFailures.errorMessage,
          })
          .from(engineCallFailures)
          .where(
            and(
              eq(engineCallFailures.auditId, audit.id),
              inArray(engineCallFailures.engine, failed),
            ),
          )
      : [];
  return engineCoverageFrom(audit, rows);
}

/** The "what to check" lines for the fully failed engines, de-duplicated. */
export function engineCoverageChecks(coverage: EngineCoverage): string[] {
  return [...new Set(coverage.failures.map((f) => f.reason.check))];
}
