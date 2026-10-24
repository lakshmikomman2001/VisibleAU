"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { COST_INCOMPLETE_LABEL, formatAudFromUsd } from "@/lib/constants/currency";
import { PROMPTS_PER_AUDIT } from "@/lib/llm/tier-engines";
import { formatTypicalRank } from "@/lib/scoring/measured-display";

interface AuditRunningProps {
  auditId: string;
  brandId: string;
  brandName: string;
  initialStatus: string;
  initialProgress: number;
  // "Before pushing e53edf2" (24 Oct), item 1 -- a real-time sum of
  // each call's own already-measured cost (lib/audit/answered-
  // count.ts's getCostSoFarUsd), never audits.totalCostUsd (only
  // written once, at completion) and never a projection.
  initialCost: number;
  /** Part of initialCost couldn't be priced (lib/audit/answered-count.ts's AuditCost). */
  initialCostIncomplete: boolean;
  // Items 2-3 -- from the SAME function
  // (lib/scoring/resolve-audit-dimensions.ts) the finished page's own
  // "Mentioned in k of n answers" and "Typically #N when listed" come
  // from, not a second implementation.
  initialMentionedCount: number;
  initialSampleCount: number;
  initialMedianPosition: number | null;
  initialRankedCount: number;
  initialCompletedCalls: number;
  // "The Running audit page shows made-up numbers" (23 Oct), item 2 --
  // all four are genuinely nullable now: the server (app/(auth)/audits/
  // [auditId]/page.tsx) passes the real audits.* column, with no
  // fallback guess, so null here means "not known yet", never a
  // plausible-looking wrong number.
  totalCalls: number | null;
  engineCount: number | null;
  promptCount: number | null;
  runCount: number | null;
  // "Usually about N minutes" (lib/audit/typical-duration.ts) -- null
  // when there's no history for this exact answer count yet.
  typicalDurationMinutes: number | null;
  errorMessage: string | null;
}

export function AuditRunningView({
  auditId,
  brandId,
  brandName,
  initialStatus,
  initialProgress,
  initialCost,
  initialCostIncomplete,
  initialMentionedCount,
  initialSampleCount,
  initialMedianPosition,
  initialRankedCount,
  initialCompletedCalls,
  totalCalls,
  engineCount,
  promptCount,
  runCount,
  typicalDurationMinutes,
  errorMessage: initialError,
}: AuditRunningProps) {
  const router = useRouter();

  const [status, setStatus] = useState(initialStatus);
  const [progress, setProgress] = useState(initialProgress);
  const [cost, setCost] = useState(initialCost);
  const [costIncomplete, setCostIncomplete] = useState(initialCostIncomplete);
  const [mentionedCount, setMentionedCount] = useState(initialMentionedCount);
  const [sampleCount, setSampleCount] = useState(initialSampleCount);
  const [medianPosition, setMedianPosition] = useState(initialMedianPosition);
  const [rankedCount, setRankedCount] = useState(initialRankedCount);
  const [completed, setCompleted] = useState(initialCompletedCalls);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  // "The Running audit page shows made-up numbers" (23 Oct), item 2 --
  // these start as whatever the server already knew (possibly null,
  // for an audit polled within the first second or so of its run,
  // before inngest/functions/run-audit.ts's record-prompt-count step
  // lands), and catch up from the very next poll once the real values
  // exist -- never frozen at the page's own first paint for the
  // audit's entire lifetime.
  const [liveTotalCalls, setLiveTotalCalls] = useState(totalCalls);
  const [liveEngineCount, setLiveEngineCount] = useState(engineCount);
  const [livePromptCount, setLivePromptCount] = useState(promptCount);
  const [liveRunCount, setLiveRunCount] = useState(runCount);
  const [engineProgress, setEngineProgress] = useState<
    Array<{ engine: string; done: number; total: number | null }>
  >([]);
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      if (res.ok) {
        const { auditId: newAuditId } = await res.json();
        router.push(`/audits/${newAuditId}`);
        return;
      }
      // "The Running audit page shows made-up numbers" (23 Oct), item
      // 2c -- "Retry audit" goes through this SAME entry point
      // (app/api/audits/route.ts) a fresh "Run audit" click uses, so
      // the confirmation gate (409) and daily spend cap (429) already
      // applied before this change -- only the generic catch-all
      // message was hiding which one fired. Surfaces the real reason
      // instead of a one-size-fits-all "please try again".
      const body = await res.json().catch(() => null);
      setRetrying(false);
      if (res.status === 409 && body?.message) {
        setErrorMsg(body.message);
      } else if (res.status === 429 && body?.message) {
        setErrorMsg(body.message);
      } else {
        setErrorMsg("Retry failed — please try again from the brand page.");
      }
    } catch {
      setRetrying(false);
      setErrorMsg("Retry failed — please try again from the brand page.");
    }
  };

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/audits/${auditId}`);
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data.audit.status);
      const completedCalls = data.answeredCount ?? 0;
      setCompleted(completedCalls);
      const tc: number | null = data.audit.totalCalls ?? null;
      setLiveTotalCalls(tc);
      setLiveEngineCount(data.audit.engines?.length ?? null);
      setLivePromptCount(data.audit.promptsCount ?? null);
      setLiveRunCount(data.audit.runsPerPrompt ?? null);
      setProgress(tc !== null && tc > 0 ? Math.min(100, (completedCalls / tc) * 100) : 0);
      // "Before pushing e53edf2" (24 Oct), items 1-3 -- all three are
      // already real numbers computed server-side (lib/audit/answered-
      // count.ts's getCostSoFarUsd, lib/scoring/resolve-audit-
      // dimensions.ts's own resolver); nothing left to parse or derive
      // here.
      setCost(typeof data.costSoFarUsd === "number" ? data.costSoFarUsd : 0);
      setCostIncomplete(data.costIncomplete === true);
      setMentionedCount(data.mentionedCount ?? 0);
      setSampleCount(data.sampleCount ?? 0);
      setMedianPosition(data.medianPosition ?? null);
      setRankedCount(data.rankedCount ?? 0);
      if (Array.isArray(data.engineProgress)) {
        setEngineProgress(data.engineProgress);
      }
      if (data.audit.status === "failed") {
        setErrorMsg((data.audit.metadata as Record<string, string>)?.error ?? "Unknown error");
      }
      if (data.audit.status === "complete") {
        router.refresh();
      }
    } catch {
      /* network errors are non-fatal — retry on next interval */
    }
  }, [auditId, router]);

  // "Audits time out on Vercel" follow-up's own step-level deadlines
  // mean a long-running audit can legitimately take 10+ minutes --
  // polling with backoff (3s -> 4.2s -> ... capped at 15s) instead of
  // a flat 5s interval cuts request volume over that whole window
  // without slowing down the detection of the common case (an audit
  // that finishes in the first couple of minutes).
  const pollDelayRef = useRef(3000);
  useEffect(() => {
    if (status === "complete" || status === "failed") return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await poll();
      if (cancelled) return;
      pollDelayRef.current = Math.min(15000, Math.round(pollDelayRef.current * 1.4));
      timeoutId = setTimeout(tick, pollDelayRef.current);
    };
    timeoutId = setTimeout(tick, pollDelayRef.current);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [status, poll]);

  const steps = deriveSteps(
    progress,
    liveEngineCount,
    livePromptCount,
    liveRunCount,
    completed,
    liveTotalCalls,
  );

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
              {/* "The Running audit page shows made-up numbers" (23
                  Oct), item 2c -- production (this same audit, after
                  the stale guard flipped it) showed "No charge was
                  applied — audit cost is only recorded on successful
                  completion". False since Part F: cost IS recorded
                  for failed audits, and the AI providers were charged
                  for every call actually made. Replaced with the real
                  received count and the real recorded cost. */}
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>
                {liveTotalCalls !== null
                  ? `${completed} of ${liveTotalCalls} answers were received before it stopped.`
                  : completed > 0
                    ? `${completed} answers were received before it stopped.`
                    : "No answers were received before it stopped."}
              </div>
              {/* "Before pushing e53edf2" (24 Oct), item 1 -- A$,
                  using the SAME conversion the daily-spend-cap
                  guardrail itself compares against
                  (lib/constants/currency.ts, moved out of
                  lib/platform/budget-policy.service.ts so every
                  surface imports the one real rate), never the old
                  display-only AUD_PER_USD. */}
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 16 }}>
                Cost so far: {formatAudFromUsd(cost)}
                {costIncomplete && ` (${COST_INCOMPLETE_LABEL}: some calls had no price)`} (counted
                toward today's spending limit). Your subscription isn't charged per audit.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={retrying}
                  style={{
                    height: 28,
                    padding: "0 10px",
                    borderRadius: 6,
                    background: "var(--accent-primary)",
                    color: "var(--accent-primary-fg)",
                    border: "none",
                    cursor: retrying ? "not-allowed" : "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                    opacity: retrying ? 0.6 : 1,
                  }}
                >
                  {retrying ? "Retrying…" : "Retry audit"}
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
          {/* Vunnara Build 1, Part F.2: "N questions x M engines = K
              answers" -- never "calls" (every run after the first used
              to replay a cached response, never an independent sample;
              Part F.1 removed that replay, so runCount is 1 for every
              new audit and the "x runs" clause only still appears for
              an audit that started before this fix, mid-flight at a
              higher runCount).
              "The Running audit page shows made-up numbers" (23 Oct),
              item 2 -- no fixed "Estimated 1-2 minutes" guess any
              more; replaced by the real median of this org's own
              history for this exact answer count (lib/audit/typical-
              duration.ts), shown only when that history exists. */}
          {formatQueryLine(
            livePromptCount,
            liveEngineCount,
            liveRunCount,
            liveTotalCalls,
            typicalDurationMinutes,
          )}
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

        {/* 7-step checklist */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map((s) => (
            <div key={s.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
                <StepIcon status={s.status} />
                <span
                  style={{
                    color: s.status === "pending" ? "var(--text-tertiary)" : "var(--text-primary)",
                  }}
                >
                  {s.label}
                </span>
              </div>
              {s.id === 3 && engineProgress.some((e) => e.total !== null) && (
                <PerEngineProgress engines={engineProgress} />
              )}
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
            // "Before pushing e53edf2" (24 Oct), item 1 -- the
            // "~US$X.XX budget (N answers)" projection is gone
            // entirely: it was a projection, not a measurement, and
            // this whole page's point is that every figure on it is
            // real. Cost so far is itself real (see initialCost's own
            // doc comment above), so it keeps its label unchanged.
            // Same A$ figure, same function, as the failed view below and
            // the 429 daily-spend-cap message -- the currency the cap
            // itself is set in.
            label: "Cost so far",
            value: formatAudFromUsd(cost),
            sub: costIncomplete
              ? `${COST_INCOMPLETE_LABEL}: some calls had no price`
              : "measured from calls made so far",
          },
          {
            // Item 2 -- sampleCount/mentionedCount are organic-
            // question-only (ORGANIC_ONLY) and verified-mention-only
            // (EXCLUDE_UNVERIFIED), the exact scope the finished
            // page's own "Mentioned in k of n answers" headline uses.
            label: "Mentions found",
            value: String(mentionedCount),
            sub: `across ${sampleCount} answer${sampleCount === 1 ? "" : "s"} to everyday questions`,
          },
          {
            // Item 3 -- "Typical position" (was "Avg position"),
            // computed by the same read-time extractListRank median
            // the finished page's Position card uses, formatted by the
            // same function -- never a second implementation, and never
            // shown until at least one ranked mention exists.
            label: "Typical position",
            value: medianPosition !== null ? formatTypicalRank(medianPosition) : "—",
            sub:
              rankedCount > 0
                ? `${rankedCount} mention${rankedCount === 1 ? "" : "s"} ranked`
                : "when mentioned",
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

/**
 * "The Running audit page shows made-up numbers" (23 Oct), item 2 --
 * "N questions x M engines = K answers", never a fabricated figure
 * when one of the three isn't known yet (see AuditRunningProps' own
 * doc comment on why that happens, briefly, right after an audit
 * starts). "Usually about N minutes" (lib/audit/typical-duration.ts)
 * replaces the old flat "Estimated 1-2 minutes" guess, shown only
 * when there's real history for this exact answer count.
 */
function formatQueryLine(
  promptCount: number | null,
  engineCount: number | null,
  runCount: number | null,
  totalCalls: number | null,
  typicalDurationMinutes: number | null,
): string {
  if (promptCount === null || engineCount === null || totalCalls === null) {
    return "Preparing your audit…";
  }
  const runsClause = runCount !== null && runCount > 1 ? ` × ${runCount} runs` : "";
  const durationClause =
    typicalDurationMinutes !== null
      ? ` Usually about ${typicalDurationMinutes} minute${typicalDurationMinutes !== 1 ? "s" : ""}.`
      : "";
  return (
    `Querying ${promptCount} question${promptCount !== 1 ? "s" : ""} × ${engineCount} engine${engineCount !== 1 ? "s" : ""}` +
    `${runsClause} = ${totalCalls} answers.${durationClause}`
  );
}

/**
 * "Preparing your N questions (X everyday, Y about your business)" --
 * PROMPTS_PER_AUDIT (lib/llm/tier-engines.ts) is the organic/everyday
 * budget every prompt-building path (a frozen brand pack, a live-built
 * pack, or the generic vertical fallback) is given as its own
 * promptCount parameter (lib/audit/get-audit-prompts.ts); branded
 * extras, if any, are appended on top of that budget, never sliced
 * from inside it -- so promptCount - PROMPTS_PER_AUDIT is the real
 * branded count once promptCount itself is known, not a guess.
 */
function formatPromptStepLabel(promptCount: number | null): string {
  if (promptCount === null) return "Preparing your questions…";
  const brandedCount = Math.max(0, promptCount - PROMPTS_PER_AUDIT);
  if (brandedCount === 0) return `Preparing your ${promptCount} questions`;
  return `Preparing your ${promptCount} questions (${PROMPTS_PER_AUDIT} everyday, ${brandedCount} about your business)`;
}

export function deriveSteps(
  progress: number,
  engineCount: number | null,
  promptCount: number | null,
  runCount: number | null,
  completed: number,
  totalCalls: number | null,
): Step[] {
  const raw = [
    { id: 1, label: "Loading your brand details" },
    { id: 2, label: formatPromptStepLabel(promptCount) },
    {
      id: 3,
      // Vunnara Build 1, Part F.2: see the matching header comment --
      // "answers", never "calls"; the "x runs" clause only appears for
      // a legacy in-flight audit at runCount > 1.
      label:
        promptCount === null || engineCount === null || totalCalls === null
          ? "Querying your questions…"
          : `Querying ${promptCount} questions × ${engineCount} engines${runCount !== null && runCount > 1 ? ` × ${runCount} runs` : ""} (${completed}/${totalCalls} answers)`,
    },
    { id: 4, label: "Detecting brand mentions" },
    // "The Running audit page shows made-up numbers" (23 Oct), item 2
    // -- "Detecting competitors" removed: no step in either runner
    // (inngest/functions/run-audit.ts, lib/audit/run-audit-inline.ts)
    // does this DURING an audit's own run any more -- competitor
    // comparison (inngest/functions/calculate-share-of-voice.ts) is a
    // separate, later, post-completion job.
    { id: 5, label: "Finding your cited sources" },
    { id: 6, label: "Calculating your visibility" },
    // "Before pushing e53edf2" (24 Oct), item 4 -- was "Persisting
    // citations + audit row". tests/unit/components/audit-running-
    // plain-labels.test.ts keeps internal words out of every label here.
    { id: 7, label: "Saving your results" },
  ];

  const thresholds = [5, 10, 80, 85, 91, 95, 100];
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

const ENGINE_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

function PerEngineProgress({
  engines,
}: {
  engines: Array<{ engine: string; done: number; total: number | null }>;
}) {
  // "The Running audit page shows made-up numbers" (23 Oct), item 2 --
  // production showed "ChatGPT 8/0 - 0%": the API (app/api/audits/
  // [auditId]/route.ts) now passes total: null instead of a fabricated
  // 0 while audits.promptsCount is still unpopulated, and this skips
  // that engine's row entirely until the real total is known -- never
  // "/0" again.
  const known = engines.filter(
    (e): e is { engine: string; done: number; total: number } => e.total !== null,
  );
  return (
    <div
      style={{ marginTop: 10, marginLeft: 32, display: "flex", flexDirection: "column", gap: 10 }}
    >
      {known.map((e) => {
        const pct = e.total > 0 ? Math.round((e.done / e.total) * 100) : 0;
        const isDone = e.done >= e.total && e.total > 0;
        return (
          <div key={e.engine}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: isDone ? "var(--success, #22c55e)" : "var(--accent-blue)",
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>
                  {ENGINE_LABELS[e.engine] ?? e.engine}
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--text-tertiary)",
                }}
              >
                {e.done}/{e.total} &middot; {pct}%
              </span>
            </div>
            <div
              style={{
                height: 6,
                width: "100%",
                borderRadius: 9999,
                overflow: "hidden",
                background: "var(--accent-muted)",
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: 9999,
                  width: `${pct}%`,
                  background: isDone ? "var(--success, #22c55e)" : "var(--accent-blue)",
                  transition: "width 0.5s ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
