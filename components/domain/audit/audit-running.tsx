"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface AuditRunningProps {
  auditId: string;
  brandName: string;
  initialStatus: string;
  initialProgress: number;
  initialCost: number;
  initialMentions: number;
  initialCompletedCalls: number;
  totalCalls: number;
  engineCount: number;
  promptCount: number;
  runCount: number;
  errorMessage: string | null;
}

export function AuditRunningView({
  auditId,
  brandName,
  initialStatus,
  initialProgress,
  initialCost,
  initialMentions,
  initialCompletedCalls,
  totalCalls,
  engineCount,
  promptCount,
  runCount,
  errorMessage: initialError,
}: AuditRunningProps) {
  const router = useRouter();

  const [status, setStatus] = useState(initialStatus);
  const [progress, setProgress] = useState(initialProgress);
  const [cost, setCost] = useState(initialCost);
  const [mentions, setMentions] = useState(initialMentions);
  const [completed, setCompleted] = useState(initialCompletedCalls);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/audits/${auditId}`);
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data.audit.status);
      const completedCalls = data.citationCount ?? 0;
      setCompleted(completedCalls);
      setProgress(totalCalls > 0 ? Math.min(100, (completedCalls / totalCalls) * 100) : 0);
      setCost(data.audit.totalCostUsd ? Number.parseFloat(data.audit.totalCostUsd) : 0);
      setMentions(data.mentionCount ?? 0);
      if (data.audit.status === "failed") {
        setErrorMsg((data.audit.metadata as Record<string, string>)?.error ?? "Unknown error");
      }
      if (data.audit.status === "complete") {
        router.refresh();
      }
    } catch {
      /* network errors are non-fatal — retry on next interval */
    }
  }, [auditId, totalCalls, router]);

  useEffect(() => {
    if (status === "complete" || status === "failed") return;
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [status, poll]);

  const steps = deriveSteps(progress, engineCount, promptCount, runCount, completed, totalCalls);

  if (status === "failed") {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 32px" }}>
        <div
          style={{
            padding: 24,
            borderRadius: 8,
            border: "1px solid var(--accent-red)",
            background: "rgba(239,68,68,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <AlertCircle
              style={{
                width: 20,
                height: 20,
                marginTop: 2,
                flexShrink: 0,
                color: "var(--accent-red)",
              }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 4,
                }}
              >
                Audit failed
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                This audit could not complete. Error:{" "}
                <code
                  style={{
                    fontSize: 12,
                    padding: "1px 6px",
                    borderRadius: 4,
                    background: "var(--bg-subtle)",
                  }}
                >
                  {errorMsg}
                </code>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 16 }}>
                No charge was applied — audit cost is only recorded on successful completion.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  style={{
                    height: 28,
                    padding: "0 10px",
                    borderRadius: 6,
                    background: "var(--accent-primary)",
                    color: "var(--accent-primary-fg)",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  Retry audit
                </button>
                <button
                  type="button"
                  onClick={() => router.back()}
                  style={{
                    height: 28,
                    padding: "0 10px",
                    borderRadius: 6,
                    background: "var(--bg-elevated)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-default)",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  Back to brand
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 32px" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            borderRadius: 9999,
            marginBottom: 20,
            background: "var(--accent-blue-soft)",
            color: "var(--accent-blue)",
          }}
        >
          <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>Audit in progress</span>
        </div>

        <h1
          style={{
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            margin: "0 0 8px",
          }}
        >
          Running audit for {brandName}
        </h1>

        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
          Querying {engineCount} engine{engineCount !== 1 ? "s" : ""} &times; {promptCount} prompts
          &times; {runCount} run{runCount !== 1 ? "s" : ""} = {totalCalls} LLM calls. Estimated{" "}
          {engineCount >= 4 ? "4–6" : "1–2"} minutes.
        </p>
      </div>

      {/* Progress card */}
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          padding: 28,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>
            Progress
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              color: "var(--text-primary)",
            }}
          >
            {Math.round(progress)}%
          </span>
        </div>

        {/* Animated striped progress bar */}
        <div
          style={{
            height: 8,
            borderRadius: 9999,
            overflow: "hidden",
            marginBottom: 24,
            background: "var(--accent-muted)",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 9999,
              width: `${progress}%`,
              background: "linear-gradient(90deg, var(--accent-blue), #6366f1)",
              backgroundSize: "40px 40px",
              animation: "progress-stripe 1s linear infinite",
              transition: "width 0.5s ease",
            }}
          />
        </div>

        {/* 8-step checklist */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map((s) => (
            <div
              key={s.id}
              style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}
            >
              <StepIcon status={s.status} />
              <span
                style={{
                  color: s.status === "pending" ? "var(--text-tertiary)" : "var(--text-primary)",
                }}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 3 live stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          marginBottom: 32,
        }}
      >
        {[
          {
            label: "Cost so far",
            value: `US$${cost.toFixed(2)}`,
            sub: `of ~US$${(totalCalls * 0.015).toFixed(2)} budget (${totalCalls} calls)`,
          },
          {
            label: "Mentions found",
            value: String(mentions),
            sub: `across ${completed} LLM calls`,
          },
          {
            label: "Avg position",
            value: "—",
            sub: "when mentioned",
          },
        ].map((m) => (
          <div
            key={m.label}
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              padding: 16,
              animation: "pulse-soft 2.4s ease-in-out infinite",
            }}
          >
            <div
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-tertiary)",
                marginBottom: 6,
              }}
            >
              {m.label}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                color: "var(--text-primary)",
              }}
            >
              {m.value}
            </div>
            <div style={{ fontSize: 11, marginTop: 4, color: "var(--text-tertiary)" }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Skip ghost button */}
      <div style={{ textAlign: "center" }}>
        <button
          type="button"
          onClick={() => router.refresh()}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          Skip and view raw output &rarr;
        </button>
      </div>
    </div>
  );
}

function StepIcon({ status }: { status: string }) {
  if (status === "complete") {
    return (
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--success-soft)",
          color: "var(--success)",
        }}
      >
        <Check style={{ width: 12, height: 12 }} />
      </div>
    );
  }
  if (status === "running") {
    return (
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--accent-blue-soft)",
          color: "var(--accent-blue)",
        }}
      >
        <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
      </div>
    );
  }
  return (
    <div
      style={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        flexShrink: 0,
        border: "1px dashed var(--border-strong)",
      }}
    />
  );
}

interface Step {
  id: number;
  label: string;
  status: string;
}

function deriveSteps(
  progress: number,
  engineCount: number,
  promptCount: number,
  runCount: number,
  completed: number,
  totalCalls: number,
): Step[] {
  const raw = [
    { id: 1, label: "Loading brand context" },
    { id: 2, label: `Generating prompts (${promptCount} from vertical pack)` },
    {
      id: 3,
      label: `Querying ${engineCount} engines × ${promptCount} prompts × ${runCount} runs (${completed}/${totalCalls} LLM calls)`,
    },
    { id: 4, label: "Detecting brand mentions" },
    { id: 5, label: "Detecting competitors" },
    { id: 6, label: "Extracting cited sources" },
    { id: 7, label: "Calculating composite score" },
    { id: 8, label: "Persisting citations + audit row" },
  ];

  const thresholds = [5, 10, 80, 85, 88, 91, 95, 100];
  const firstPending = thresholds.findIndex((t) => progress < t);

  return raw.map((s, i) => ({
    ...s,
    status:
      firstPending === -1
        ? "complete"
        : i < firstPending
          ? "complete"
          : i === firstPending
            ? "running"
            : "pending",
  }));
}
