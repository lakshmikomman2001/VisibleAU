import { TriangleAlert } from "lucide-react";
import { customerEngineReason } from "@/lib/audit/customer-reasons";
import { type EngineFailureReason, engineTotalFailureSentence } from "@/lib/audit/engine-failure";

export interface FullyFailedEngine {
  engine: string;
  reason: EngineFailureReason;
}

/**
 * URGENT audit #37 (31 Oct), item 2 -- shown above the finished audit's
 * headline when every call to at least one engine failed. Production
 * audit #37 showed only "13 failed: 13 errors, not counted" in small
 * print next to a normal-looking 17%. The reason comes from
 * lib/audit/engine-failure.ts (error class, status code, a fixed list of
 * message patterns) -- never the provider's raw message.
 *
 * S01C part 1 (LLD amendment 58): customers see only the plain reason
 * ("a problem on our side"). The banner printed the operator's label
 * ("Provider spend limit reached (a monthly limit set in the provider's
 * console)") and, under "What to check", the operator's steps ("Raise the
 * monthly spend limit in the provider's console"); the operator copy of the
 * whole-engine failure email keeps them.
 */
export function EngineTotalFailureBanner({
  failedEngines,
  questionCount,
  enginesAsked,
  answerCount,
}: {
  failedEngines: FullyFailedEngine[];
  questionCount: number;
  enginesAsked: number;
  answerCount: number;
}) {
  if (failedEngines.length === 0) return null;
  const reasons = [...new Set(failedEngines.map((f) => customerEngineReason(f.reason)))];
  return (
    <div
      role="alert"
      data-engine-total-failure
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: 16,
        marginBottom: 20,
        borderRadius: 8,
        border: "1px solid var(--danger)",
        background: "rgba(239,68,68,0.06)",
      }}
    >
      <TriangleAlert
        aria-hidden="true"
        style={{ width: 18, height: 18, flexShrink: 0, marginTop: 1, color: "var(--danger)" }}
      />
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--text-primary)" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>
          {engineTotalFailureSentence({
            engines: failedEngines.map((f) => f.engine),
            questionCount,
            enginesAsked,
            answerCount,
          })}
        </p>
        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }} data-engine-failure-why>
          Why: {reasons.join("; ")}. Drift alerts and the weekly trend leave this audit out.
        </p>
      </div>
    </div>
  );
}
