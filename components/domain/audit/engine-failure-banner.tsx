import { TriangleAlert } from "lucide-react";
import {
  type EngineFailureReason,
  engineNameList,
  engineTotalFailureSentence,
} from "@/lib/audit/engine-failure";

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
  // One line per distinct reason, naming the engines it applies to.
  const byReason = new Map<string, { reason: EngineFailureReason; engines: string[] }>();
  for (const f of failedEngines) {
    const entry = byReason.get(f.reason.key) ?? { reason: f.reason, engines: [] };
    entry.engines.push(f.engine);
    byReason.set(f.reason.key, entry);
  }
  const reasons = [...byReason.values()];
  const prefix = (engines: string[]) =>
    failedEngines.length > 1 ? `${engineNameList(engines)}: ` : "";
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
        {reasons.map(({ reason, engines }) => (
          <p key={reason.key} style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>
            {prefix(engines)}
            {reason.label}
          </p>
        ))}
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", color: "var(--accent-blue)", fontWeight: 500 }}>
            What to check
          </summary>
          {reasons.map(({ reason, engines }) => (
            <p key={reason.key} style={{ margin: "6px 0 0", color: "var(--text-secondary)" }}>
              {prefix(engines)}
              {reason.check} Drift alerts and the weekly trend leave this audit out.
            </p>
          ))}
        </details>
      </div>
    </div>
  );
}
