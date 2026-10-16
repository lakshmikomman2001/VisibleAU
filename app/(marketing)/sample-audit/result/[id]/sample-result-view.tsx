"use client";

import { ArrowRight } from "lucide-react";

interface AuditResult {
  id: string;
  status: string;
  // Task #46 Phase 3, Part C: the live-recomputed composite (excludes
  // Sentiment/Context) -- not the stale stored audits.score_composite
  // column, which was blended with both fabricated from mention presence.
  compositeValue: number | null;
  scoreFrequency: string | null;
  scorePosition: string | null;
  scoreAccuracy: string | null;
  brandName: string;
  brandDomain: string;
  // Task #46 Phase 2: true when this (completed) sample audit has zero
  // organic, run-1 brand-mention rows -- the scores above are then real,
  // non-fabricated "0.00" strings (lib/scoring/dimension-result.ts), not a
  // measured bottom score, and the page below renders honest, constructive
  // framing instead of five alarming red "0/100" cards.
  insufficientData: boolean;
  sampleSize: number;
}

interface Props {
  audit: AuditResult;
}

function ScoreCard({
  label,
  value,
  insufficient,
  notMeasured,
}: {
  label: string;
  value: string | null;
  insufficient?: boolean;
  notMeasured?: boolean;
}) {
  const num = value ? Number(value) : null;

  // Task #46 Phase 3, Part C: a THIRD, distinct state from insufficient_data
  // -- Sentiment/Context have no real classifier behind them at all (not a
  // mention-count gap), so they get their own label instead of "N/A".
  if (notMeasured) {
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
        <div
          className="text-sm font-bold"
          style={{ color: "var(--text-tertiary)" }}
          title="Tone and recommendation analysis isn't built yet, so this dimension isn't scored"
        >
          Not yet measured
        </div>
      </div>
    );
  }

  if (insufficient) {
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
        <div className="text-2xl font-bold" style={{ color: "var(--text-tertiary)" }}>
          N/A
        </div>
      </div>
    );
  }

  const display = num !== null ? `${Math.round(num)}/100` : "—";
  const color =
    num === null
      ? "var(--text-tertiary)"
      : num >= 70
        ? "#22c55e"
        : num >= 40
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
  const composite = audit.compositeValue;
  const compositeDisplay = composite !== null ? String(Math.round(composite)) : "—";
  const compositeColor =
    composite === null
      ? "var(--text-tertiary)"
      : composite >= 70
        ? "#22c55e"
        : composite >= 40
          ? "#f59e0b"
          : "#ef4444";

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
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
          {audit.insufficientData ? (
            // Task #46 Phase 2: the highest-visibility instance of the
            // insufficient-data bug -- this free, pre-signup page used to
            // show a big red "0/100" for a brand AI engines simply haven't
            // mentioned yet, which reads as alarming and is also just
            // wrong (it's not a measured bottom score). Honest, upbeat
            // framing here is also better marketing: it names the real,
            // fixable problem instead of implying a uniformly bad audit.
            <div
              className="text-center rounded-lg p-8 mb-8"
              style={{
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
              }}
            >
              <div className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>
                Overall AI Visibility Score
              </div>
              <div className="text-xl font-bold" style={{ color: "#3b82f6" }}>
                AI engines don&apos;t mention {audit.brandName} yet
              </div>
              <p className="text-sm mt-3" style={{ color: "var(--text-secondary)" }}>
                We checked {audit.sampleSize} AI answer{audit.sampleSize === 1 ? "" : "s"} and found
                zero mentions of {audit.brandName} — common for newer businesses or those with a
                limited structured web presence. That&apos;s fixable, and here&apos;s where to start.
              </p>
            </div>
          ) : (
            <div
              className="text-center rounded-lg p-8 mb-8"
              style={{
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
              }}
            >
              <div className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>
                Overall AI Visibility Score
              </div>
              <div className="text-5xl font-bold" style={{ color: compositeColor }}>
                {compositeDisplay}
              </div>
              <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                Sample composite score
              </div>
            </div>
          )}

          {/* Dimension scores */}
          {/* Display-only relabel ("Source citation"): this dimension measures citation rate
          (accuracyDimensionScore), not factual correctness. DB column (score_accuracy) and
          internal key (accuracy) are unchanged — see docs/ops for the Phase 1 writeup. */}
          <div className="grid grid-cols-2 gap-4 mb-10">
            {/* Frequency is always a real measurement, even at 0 mentions
                (lib/scoring/dimension-result.ts's `alwaysScored`) -- it's
                the one card insufficientData never applies to. */}
            <ScoreCard label="Frequency" value={audit.scoreFrequency} />
            <ScoreCard
              label="Position"
              value={audit.scorePosition}
              insufficient={audit.insufficientData}
            />
            {/* Task #46 Phase 3, Part C: unconditionally not-yet-measured
                -- never gated on audit.insufficientData, unlike
                Position/Source citation above/below (that's about
                whether there's data to measure; this is that nothing real
                measures Sentiment/Context either way). */}
            <ScoreCard label="Sentiment" value={null} notMeasured />
            <ScoreCard label="Context" value={null} notMeasured />
            <ScoreCard
              label="Source citation"
              value={audit.scoreAccuracy}
              insufficient={audit.insufficientData}
            />
          </div>

          {/* CTA */}
          <div
            className="rounded-lg p-6 text-center"
            style={{
              backgroundColor: "rgba(59,130,246,0.08)",
              border: "1px solid rgba(59,130,246,0.2)",
            }}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              {audit.insufficientData ? "Fix this and track progress" : "Want deeper insights?"}
            </h3>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
              Sign up to track your visibility across 4 AI engines with weekly automated audits,
              actionable recommendations, and drift alerts.
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

          <p className="text-center text-xs mt-4" style={{ color: "var(--text-tertiary)" }}>
            This sample used 1 AI engine and 5 prompts. Full audits use 4 engines and up to 50
            prompts for comprehensive coverage.
          </p>
        </>
      )}
    </div>
  );
}
