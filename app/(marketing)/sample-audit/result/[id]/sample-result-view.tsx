"use client";

import { ArrowRight } from "lucide-react";
import { SAMPLE_AUDIT_CONFIG } from "@/lib/sample-audit/config";
import { headlineColorBand } from "@/lib/scoring/headline-color";

interface AuditResult {
  id: string;
  status: string;
  // Task #46 (fix: stored value contradicting its own CI): every value
  // below is the live-recomputed one (lib/scoring/resolve-audit-
  // dimensions.ts) -- never the stale stored audits.score_* columns,
  // which can disagree with the real citations the moment a prod-fix
  // changes which rows count as organic without the audit being re-run.
  // null means insufficient_data (Position/Accuracy) -- insufficientData
  // below already tells the caller when that applies to both.
  // headlineValue (Vunnara, 19 Oct) is the Frequency DimensionResult's
  // value -- the mention rate, never a weighted blend -- and is null only
  // when noAnswers is true (zero successful organic answers).
  headlineValue: number | null;
  frequencyValue: number | null;
  positionValue: number | null;
  accuracyValue: number | null;
  brandName: string;
  brandDomain: string;
  // Task #46 Phase 2: true when this (completed) sample audit has zero
  // organic, run-1 brand-mention rows -- the scores above are then real,
  // non-fabricated "0.00" strings (lib/scoring/dimension-result.ts), not a
  // measured bottom score, and the page below renders honest, constructive
  // framing instead of five alarming red "0/100" cards.
  insufficientData: boolean;
  // True when the headline itself is insufficient_data ("no_answers"):
  // not a single successful organic AI answer came back for this audit.
  // Implies insufficientData too (zero answers means zero mentions).
  noAnswers: boolean;
  sampleSize: number;
  // Vunnara (sample-audit follow-up, 20 Oct), item 6: so the headline
  // can show the same "mentioned in k of n answers" format real audits
  // use (app/(auth)/audits/[auditId]/page.tsx), not a different phrase.
  mentionedCount: number;
}

interface Props {
  audit: AuditResult;
}

function ScoreCard({
  label,
  value,
  insufficient,
  notMeasured,
  useHeadlineThresholds,
}: {
  label: string;
  value: number | null;
  insufficient?: boolean;
  notMeasured?: boolean;
  // Vunnara (20 Oct, post-a093ceb), item 5: Frequency's value here is
  // byte-identical to the headline above it (resolve-audit-
  // dimensions.ts aliases frequency = headline) -- it must use the
  // SAME 30/10 bands (lib/scoring/headline-color.ts), or the exact same
  // number could show green above and red in this card. Position/
  // Source-citation stay on the real dimension 70/40 bands (they ARE
  // conditioned on already being mentioned).
  useHeadlineThresholds?: boolean;
}) {
  const num = value;

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
      : useHeadlineThresholds
        ? headlineColorBand(num) === "strong"
          ? "#22c55e"
          : headlineColorBand(num) === "developing"
            ? "#f59e0b"
            : "#ef4444"
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
  const headline = audit.headlineValue;
  const headlineDisplay = headline !== null ? String(Math.round(headline)) : "—";
  // Vunnara (20 Oct, post-a093ceb), item 5: the headline's own 30/10
  // colour bands (lib/scoring/headline-color.ts), not the 70/40 bands
  // that fit an already-mentioned dimension -- this is a mention rate
  // over every question asked, most of which never name any brand at
  // all, so showing up a third of the time is already a strong result.
  const headlineColor =
    headline === null
      ? "var(--text-tertiary)"
      : headlineColorBand(headline) === "strong"
        ? "#22c55e"
        : headlineColorBand(headline) === "developing"
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
          {/* Headline score (= mention rate) */}
          {audit.noAnswers ? (
            // Headline is insufficient_data ("no_answers"): no AI answer
            // came back at all, so there's no rate to show -- never a
            // fabricated 0, and never the "found zero mentions" copy
            // below (which would claim "We checked 0 AI answers").
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
              <div className="text-xl font-bold" style={{ color: "var(--text-tertiary)" }}>
                Not enough data
              </div>
              {/* Vunnara (sample-audit follow-up, 20 Oct): the old copy
                  ("We couldn't get ANY AI answers back") was only ever
                  true for a genuine 0-of-N case -- with the new 12-
                  planned shape, this state is now also reachable at,
                  say, 9 real answers (one short of
                  MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE). Names the real
                  count instead of claiming zero either way. */}
              <p className="text-sm mt-3" style={{ color: "var(--text-secondary)" }}>
                We only got {audit.sampleSize} AI answer{audit.sampleSize === 1 ? "" : "s"} back this
                time (need at least 10), so there&apos;s nothing to score yet.
              </p>
              <a
                href="/sample-audit"
                className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium"
                style={{ color: "#3b82f6" }}
              >
                Try again
              </a>
            </div>
          ) : audit.insufficientData ? (
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
              <div className="text-5xl font-bold" style={{ color: headlineColor }}>
                {headlineDisplay}
                <span className="text-xl">%</span>
              </div>
              {/* Vunnara (sample-audit follow-up, 20 Oct), item 6: same
                  "Mentioned in k of n answers" format real audits use
                  (app/(auth)/audits/[auditId]/page.tsx), not a
                  different phrase for this one surface. */}
              <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                Mentioned in {audit.mentionedCount} of {audit.sampleSize} answer
                {audit.sampleSize === 1 ? "" : "s"}
              </div>
            </div>
          )}

          {/* Dimension scores */}
          {/* Display-only relabel ("Source citation"): this dimension measures citation rate
          (accuracyDimensionScore), not factual correctness. DB column (score_accuracy) and
          internal key (accuracy) are unchanged — see docs/ops for the Phase 1 writeup. */}
          <div className="grid grid-cols-2 gap-4 mb-10">
            {/* Frequency is a real measurement even at 0 mentions -- it's
                insufficient only when there were zero answers at all
                (headline's "no_answers" gate, lib/scoring/dimension-result.ts's
                resolveHeadline). */}
            <ScoreCard
              label="Frequency"
              value={audit.frequencyValue}
              insufficient={audit.noAnswers}
              useHeadlineThresholds
            />
            <ScoreCard
              label="Position"
              value={audit.positionValue}
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
              value={audit.accuracyValue}
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
            {/* Vunnara (sample-audit follow-up, 20 Oct): read from
                SAMPLE_AUDIT_CONFIG instead of a hardcoded "1 engine and
                5 prompts" -- that string had already drifted out of
                sync with what actually ran (lib/sample-audit/run.ts
                never passed the config's own fields into execution
                before this fix). Deriving it here means it can't drift
                again. */}
            This sample used {SAMPLE_AUDIT_CONFIG.engines.length} AI engines and{" "}
            {SAMPLE_AUDIT_CONFIG.promptsCount} prompts. Full audits use 4 engines and up to 50
            prompts for comprehensive coverage.
          </p>
          {/* Build 1 addendum (entry-point check): this sample's brand has
              no confirmed category or location (there's no sign-up step
              yet to confirm them) -- its questions are general ones for
              the vertical and region, not tailored to this specific
              business. Say so plainly, matching the honesty this page
              already applies to the insufficient-data framing above. */}
          <p className="text-center text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
            These are general questions. Sign up to tailor them to your business and location.
          </p>
        </>
      )}
    </div>
  );
}
