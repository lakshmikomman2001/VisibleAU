"use client";

import { ArrowRight } from "lucide-react";

interface AuditResult {
  id: string;
  status: string;
  scoreComposite: string | null;
  scoreFrequency: string | null;
  scorePosition: string | null;
  scoreSentimentNumeric: string | null;
  scoreContextNumeric: string | null;
  scoreAccuracy: string | null;
  brandName: string;
  brandDomain: string;
}

interface Props {
  audit: AuditResult;
}

function ScoreCard({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  const num = value ? Number(value) : null;
  const display = num !== null ? num.toFixed(1) : "—";
  const color =
    num === null
      ? "var(--text-tertiary)"
      : num >= 7
        ? "#22c55e"
        : num >= 4
          ? "#f59e0b"
          : "#ef4444";

  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div className="text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </div>
      <div className="text-2xl font-bold" style={{ color }}>
        {display}
      </div>
    </div>
  );
}

export default function SampleResultView({ audit }: Props) {
  const composite = audit.scoreComposite ? Number(audit.scoreComposite) : null;
  const compositeDisplay =
    composite !== null ? composite.toFixed(1) : "—";
  const compositeColor =
    composite === null
      ? "var(--text-tertiary)"
      : composite >= 7
        ? "#22c55e"
        : composite >= 4
          ? "#f59e0b"
          : "#ef4444";

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="text-center mb-10">
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          AI Visibility Score for {audit.brandName}
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {audit.brandDomain}
        </p>
      </div>

      {audit.status !== "complete" ? (
        <div
          className="text-center rounded-lg p-8"
          style={{
            backgroundColor: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <p style={{ color: "var(--text-secondary)" }}>
            {audit.status === "failed"
              ? "This audit encountered an error. Please try again."
              : "Audit is still processing. Please check back shortly."}
          </p>
        </div>
      ) : (
        <>
          {/* Composite score */}
          <div
            className="text-center rounded-lg p-8 mb-8"
            style={{
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
            }}
          >
            <div
              className="text-xs mb-2"
              style={{ color: "var(--text-tertiary)" }}
            >
              Overall AI Visibility Score
            </div>
            <div
              className="text-5xl font-bold"
              style={{ color: compositeColor }}
            >
              {compositeDisplay}
            </div>
            <div
              className="text-sm mt-1"
              style={{ color: "var(--text-secondary)" }}
            >
              out of 10
            </div>
          </div>

          {/* Dimension scores */}
          <div className="grid grid-cols-2 gap-4 mb-10">
            <ScoreCard label="Frequency" value={audit.scoreFrequency} />
            <ScoreCard label="Position" value={audit.scorePosition} />
            <ScoreCard
              label="Sentiment"
              value={audit.scoreSentimentNumeric}
            />
            <ScoreCard label="Context" value={audit.scoreContextNumeric} />
            <ScoreCard label="Accuracy" value={audit.scoreAccuracy} />
          </div>

          {/* CTA */}
          <div
            className="rounded-lg p-6 text-center"
            style={{
              backgroundColor: "rgba(59,130,246,0.08)",
              border: "1px solid rgba(59,130,246,0.2)",
            }}
          >
            <h3
              className="text-lg font-semibold mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              Want deeper insights?
            </h3>
            <p
              className="text-sm mb-4"
              style={{ color: "var(--text-secondary)" }}
            >
              Sign up to track your visibility across 4 AI engines with weekly
              automated audits, actionable recommendations, and drift alerts.
            </p>
            <a
              href="/sign-up"
              className="inline-flex items-center gap-1.5 rounded-md px-6 py-2.5 text-sm font-medium"
              style={{ backgroundColor: "#3b82f6", color: "#fff" }}
            >
              Start free — no credit card
              <ArrowRight style={{ width: 14, height: 14 }} />
            </a>
          </div>

          <p
            className="text-center text-xs mt-4"
            style={{ color: "var(--text-tertiary)" }}
          >
            This sample used 1 AI engine and 5 prompts. Full audits use 4
            engines and up to 50 prompts for comprehensive coverage.
          </p>
        </>
      )}
    </div>
  );
}
