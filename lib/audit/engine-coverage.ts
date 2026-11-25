import { and, eq, inArray } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { engineCallFailures } from "@/db/schema";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { customerEngineReason } from "./customer-reasons";
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
 * (fullyFailedEngines: every one of an engine's calls failed). The
 * provider's message is matched on the server and never leaves it, and
 * since S01C part 1 (LLD amendment 58) the note gives the customer's plain
 * reason (customerEngineReason), never the operator's label.
 */
export interface EngineCoverage {
  enginesPlanned: number;
  enginesAnswered: number;
  /** Engine ids, e.g. ["claude"]. Empty when every engine answered. */
  fullyFailedEngines: string[];
  /** The operator's reasons (describeEngineFailure): map them with customerEngineReason before a customer sees one. */
  failures: Array<{ engine: string; reason: EngineFailureReason }>;
  /** "3 of 4 engines"; null when every engine answered. */
  label: string | null;
  /**
   * "Based on 3 of 4 engines. Claude returned an error for every question:
   * a problem on our side." -- null when every engine answered.
   */
  note: string | null;
}

interface AuditCoverageInput {
  id: string;
  engines: string[] | null;
  promptsCount: number | null;
  metadata: unknown;
}

/** "Claude returned an error for every question: <plain reason>." (one sentence per distinct reason). */
function failureSentence(failures: EngineCoverage["failures"]): string {
  const engines = failures.map((f) => f.engine);
  const reasons = [...new Set(failures.map((f) => customerEngineReason(f.reason)))];
  const verb = `returned an error for every question`;
  if (reasons.length === 1) return `${engineNameList(engines)} ${verb}: ${reasons[0]}.`;
  const each = failures.map(
    (f) => `${ENGINE_NAMES[f.engine] ?? f.engine}: ${customerEngineReason(f.reason)}.`,
  );
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

/**
 * The operator's "what to check" lines for the fully failed engines, de-duplicated. Operator wording ("Raise the
 * monthly spend limit in the provider's console"): never on a customer surface (S01C part 1, LLD amendment 58; the
 * audit-complete email printed them until then).
 */
export function engineCoverageChecks(coverage: EngineCoverage): string[] {
  return [...new Set(coverage.failures.map((f) => f.reason.check))];
}
