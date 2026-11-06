"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { COST_INCOMPLETE_LABEL, formatAudFromUsd } from "@/lib/constants/currency";
import {
  MAX_POLL_DELAY_MS,
  pageNavigation,
  useRetriedNavigation,
  useSafePoll,
} from "@/lib/hooks/use-safe-poll";
import { PROMPTS_PER_AUDIT } from "@/lib/llm/tier-engines";
import { formatTypicalRank } from "@/lib/scoring/measured-display";

/** The full reload, re-exported so tests can watch it (jsdom can't reload). */
export { pageNavigation };

/** 32px side padding on a desktop, down to 16px on a phone. */
const PAGE_PADDING = "48px clamp(16px, 4vw, 32px)";

/**
 * URGENT audit #37 (31 Oct), item 3 -- production stayed on "Audit in
 * progress" after the audit completed until a manual Ctrl+Shift+R. The
 * page used to refresh the route ONCE, on the first poll that read
 * "complete", and stop polling in the same moment -- if that one refresh
 * didn't bring back the finished view, nothing ever tried again. Now:
 * the page says the audit is complete straight away, refreshes every 4 s
 * until the finished view replaces it, and reloads the page as a last
 * resort -- within 15 s of the poll seeing "complete"
 * (lib/hooks/use-safe-poll.ts's useRetriedNavigation).
 *
 * URGENT audit #38 (1 Nov) -- production's running page froze early
 * (Perplexity 1 of 13). The 31 Oct change aborted any poll still out at
 * 10 s and threw its answer away, so while the endpoint was slower than
 * that, every poll was discarded and the page sat on its old numbers
 * with no sign anything was wrong. Now a poll slower than 10 s puts up
 * "Still running · results will appear when done" and is still waited
 * for (until 30 s, so a hung request can't stall the loop), and the page
 * then polls at the slowest rate instead of faster. One poll at a time,
 * and one timer. That loop is lib/hooks/use-safe-poll.ts's useSafePoll
 * (1 Nov follow-up), shared with the other pages that poll.
 */
const FIRST_POLL_DELAY_MS = 3_000;
export const FALLING_BEHIND_MESSAGE = "Still running · results will appear when done";

/**
 * The wait before the next poll: 1.4x the last, capped at 10 s (it was
 * 15 s, which alone could miss the 15 s budget), and 3 s once every call
 * has finished -- the audit is then seconds from completing.
 */
export function nextPollDelayMs(previousMs: number, allCallsFinished: boolean): number {
  if (allCallsFinished) return 3_000;
  return Math.min(MAX_POLL_DELAY_MS, Math.round(previousMs * 1.4));
}

/** A count or amount from the poll: a finite number, 0 or more. Anything else (null, NaN, a string) is 0. */
export function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** A total: a finite number above 0, else null ("not known yet"). */
export function safeTotal(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** part of total as 0-100, and 0 while the total isn't known -- never NaN or Infinity. */
export function percentOf(part: number, total: number | null): number {
  if (total === null || !Number.isFinite(total) || total <= 0 || !Number.isFinite(part)) return 0;
  return Math.min(100, Math.max(0, (part / total) * 100));
}

/** The poll endpoint's answer (app/api/audits/[auditId]/route.ts), read defensively. */
interface PollBody {
  audit?: {
    status?: unknown;
    totalCalls?: unknown;
    engines?: unknown;
    promptsCount?: unknown;
    runsPerPrompt?: unknown;
    metadata?: unknown;
  };
  answeredCount?: unknown;
  failedCount?: unknown;
  everydayFailedCount?: unknown;
  costSoFarUsd?: unknown;
  costIncomplete?: unknown;
  mentionedCount?: unknown;
  sampleCount?: unknown;
  medianPosition?: unknown;
  rankedCount?: unknown;
  engineProgress?: unknown;
}

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
  /** URGENT audit #37 (31 Oct), item 2: of initialCompletedCalls, how many
   * failed (engine_call_failures). */
  initialFailedCalls?: number;
  /** Item 4: of those, how many were everyday questions (the ones
   * "Mentions found" counts). */
  initialEverydayFailedCalls?: number;
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
  initialFailedCalls = 0,
  initialEverydayFailedCalls = 0,
  totalCalls,
  engineCount,
  promptCount,
  runCount,
  typicalDurationMinutes,
  errorMessage: initialError,
}: AuditRunningProps) {
  const router = useRouter();

  const [status, setStatus] = useState(initialStatus);
  const [progress, setProgress] = useState(() => percentOf(initialProgress, 100));
  const [cost, setCost] = useState(initialCost);
  const [costIncomplete, setCostIncomplete] = useState(initialCostIncomplete);
  const [mentionedCount, setMentionedCount] = useState(initialMentionedCount);
  const [sampleCount, setSampleCount] = useState(initialSampleCount);
  const [medianPosition, setMedianPosition] = useState(initialMedianPosition);
  const [rankedCount, setRankedCount] = useState(initialRankedCount);
  const [completed, setCompleted] = useState(initialCompletedCalls);
  const [failedCalls, setFailedCalls] = useState(initialFailedCalls);
  const [everydayFailed, setEverydayFailed] = useState(initialEverydayFailedCalls);
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
  const [engineProgress, setEngineProgress] = useState<EngineProgressRow[]>([]);
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

  /**
   * One poll. Resolves to null when it failed (network, non-OK, aborted),
   * else to whether every call has finished (for the next poll's delay).
   * Every number is checked (safeCount/safeTotal), so a missing or odd
   * field can't put NaN on the page; an answer identical to the last one
   * sets the same values, so it doesn't re-render the page.
   */
  const pollOnce = useCallback(
    async (signal: AbortSignal): Promise<{ allCallsFinished: boolean } | null> => {
      try {
        const res = await fetch(`/api/audits/${auditId}`, { cache: "no-store", signal });
        if (!res.ok) return null;
        const data = (await res.json()) as PollBody;
        const audit = data?.audit;
        if (typeof audit?.status !== "string") return null;
        setStatus(audit.status);
        const completedCalls = safeCount(data.answeredCount);
        const tc = safeTotal(audit.totalCalls);
        setCompleted(completedCalls);
        setFailedCalls(safeCount(data.failedCount));
        setEverydayFailed(safeCount(data.everydayFailedCount));
        setLiveTotalCalls(tc);
        setLiveEngineCount(Array.isArray(audit.engines) ? safeTotal(audit.engines.length) : null);
        setLivePromptCount(safeTotal(audit.promptsCount));
        setLiveRunCount(safeTotal(audit.runsPerPrompt));
        setProgress(percentOf(completedCalls, tc));
        // "Before pushing e53edf2" (24 Oct), items 1-3 -- all three are
        // already real numbers computed server-side (lib/audit/answered-
        // count.ts's getCostSoFarUsd, lib/scoring/resolve-audit-
        // dimensions.ts's own resolver); nothing left to parse or derive
        // here.
        setCost(safeCount(data.costSoFarUsd));
        setCostIncomplete(data.costIncomplete === true);
        setMentionedCount(safeCount(data.mentionedCount));
        setSampleCount(safeCount(data.sampleCount));
        setMedianPosition(
          typeof data.medianPosition === "number" && Number.isFinite(data.medianPosition)
            ? data.medianPosition
            : null,
        );
        setRankedCount(safeCount(data.rankedCount));
        const rows = toEngineRows(data.engineProgress);
        if (rows) setEngineProgress((prev) => (sameEngineRows(prev, rows) ? prev : rows));
        if (audit.status === "failed") {
          const error = (audit.metadata as { error?: unknown } | null | undefined)?.error;
          setErrorMsg(typeof error === "string" ? error : "Unknown error");
        }
        return { allCallsFinished: tc !== null && completedCalls >= tc };
      } catch {
        /* network errors and aborts are non-fatal — retry on the next poll */
        return null;
      }
    },
    [auditId],
  );

  // "Audits time out on Vercel" follow-up's own step-level deadlines
  // mean a long-running audit can legitimately take 10+ minutes --
  // polling with backoff (nextPollDelayMs) instead of a flat 5s interval
  // cuts request volume over that whole window. Polling continues until
  // the audit is terminal: one poll at a time, a slow poll is waited for,
  // and unmounting or a terminal status stops the timer and aborts the
  // request that's out (useSafePoll).
  const { behind } = useSafePoll({
    enabled: status !== "complete" && status !== "failed",
    poll: pollOnce,
    firstDelayMs: FIRST_POLL_DELAY_MS,
    intervalMs: FIRST_POLL_DELAY_MS,
    nextDelayMs: (previousMs, result) =>
      nextPollDelayMs(previousMs, result?.allCallsFinished === true),
  });

  // URGENT audit #37 (31 Oct), item 3: complete -> refresh the route now,
  // again every 4 s while this view is still on screen (the finished
  // view replacing it unmounts this and stops the retries), and reload
  // the page if 3 refreshes didn't do it.
  useRetriedNavigation(status === "complete", {
    attempt: () => router.refresh(),
    fallback: () => pageNavigation.reload(),
  });

  const steps = useMemo(
    () =>
      deriveSteps(
        progress,
        liveEngineCount,
        livePromptCount,
        liveRunCount,
        completed,
        liveTotalCalls,
        failedCalls,
      ),
    [
      progress,
      liveEngineCount,
      livePromptCount,
      liveRunCount,
      completed,
      liveTotalCalls,
      failedCalls,
    ],
  );
  const engineRows = useMemo(() => engineRowViews(engineProgress), [engineProgress]);

  if (status === "failed") {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: PAGE_PADDING }}>
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
    <div style={{ maxWidth: 720, margin: "0 auto", padding: PAGE_PADDING }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        {status === "complete" ? (
          // URGENT audit #37 (31 Oct), item 3: the poll already knows it's
          // complete -- say so while the results load, with a way there.
          <div
            role="status"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: 9999,
              marginBottom: 20,
              background: "var(--success-soft)",
              color: "var(--success)",
            }}
          >
            <Check style={{ width: 14, height: 14 }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Audit complete</span>
          </div>
        ) : (
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
        )}
        {status === "complete" && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>
            Loading your results…{" "}
            <a href={`/audits/${auditId}`} style={{ color: "var(--accent-blue)" }}>
              Show the results
            </a>
          </p>
        )}
        {/* URGENT audit #38 (1 Nov): the polls aren't keeping up -- say so
            instead of sitting on old numbers as if nothing had happened. */}
        {status !== "complete" && behind && (
          <p
            role="status"
            data-poll-behind
            style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}
          >
            {FALLING_BEHIND_MESSAGE}
          </p>
        )}

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
          {/* URGENT audit #37 (31 Oct), item 2: the bar counts calls
              FINISHED (answered or failed), so the label says how many
              of those failed -- 100% is never mistaken for 52 answers. */}
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>
            {formatCallsFinished(completed, liveTotalCalls)}
            {failedCalls > 0 && (
              <span style={{ color: "var(--warning)", fontWeight: 600 }}>
                {" "}
                · {failedCalls} failed
              </span>
            )}
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
              {s.id === 3 && engineRows.length > 0 && <PerEngineProgress rows={engineRows} />}
            </div>
          ))}
        </div>
      </div>

      {/* 3 live stat cards */}
      <div
        style={{
          display: "grid",
          // Three across on a desktop, fewer on a phone -- never wider than the screen.
          gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))",
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
            // URGENT audit #37 (31 Oct), item 4: with failures, say these
            // are the successful answers and how many failed.
            sub:
              everydayFailed > 0
                ? `across ${sampleCount} successful answer${sampleCount === 1 ? "" : "s"} to everyday questions (${everydayFailed} failed)`
                : `across ${sampleCount} answer${sampleCount === 1 ? "" : "s"} to everyday questions`,
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

/** "52 calls finished" once every call is done, "30 of 52 calls finished"
 * before that; "Progress" while the total isn't known yet. */
export function formatCallsFinished(completed: number, totalCalls: number | null): string {
  const total = safeTotal(totalCalls);
  if (total === null) return "Progress";
  const done = safeCount(completed);
  if (done >= total) return `${done} calls finished`;
  return `${done} of ${total} calls finished`;
}

export function deriveSteps(
  progress: number,
  engineCount: number | null,
  promptCount: number | null,
  runCount: number | null,
  completed: number,
  totalCalls: number | null,
  failed = 0,
): Step[] {
  const runsClause = runCount !== null && runCount > 1 ? ` × ${runCount} runs` : "";
  // URGENT audit #37 (31 Oct), item 2: `completed` counts failed calls
  // too, so with failures the step says how many actually answered.
  const countsClause =
    failed > 0
      ? `(${Math.max(0, completed - failed)}/${totalCalls} answered · ${failed} failed)`
      : `(${completed}/${totalCalls} answers)`;
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
          : `Querying ${promptCount} questions × ${engineCount} engines${runsClause} ${countsClause}`,
    },
    { id: 4, label: "Detecting brand mentions" },
    // "The Running audit page shows made-up numbers" (23 Oct), item 2
    // -- "Detecting competitors" removed: no step in either runner
    // (inngest/functions/run-audit.ts, lib/audit/run-audit-inline.ts)
    // does this DURING an audit's own run any more -- competitor
    // comparison (inngest/functions/run-comparison-prompts.ts) is a
    // separate, later, post-completion job.
    { id: 5, label: "Finding your cited sources" },
    { id: 6, label: "Calculating your visibility" },
    // "Before pushing e53edf2" (24 Oct), item 4 -- was "Persisting
    // citations + audit row". tests/unit/components/audit-running-
    // plain-labels.test.ts keeps internal words out of every label here.
    { id: 7, label: "Saving your results" },
  ];

  const thresholds = [5, 10, 80, 85, 91, 95, 100];
  // A NaN progress would tick every step (NaN < t is false for all t).
  const safeProgress = Number.isFinite(progress) ? progress : 0;
  const firstPending = thresholds.findIndex((t) => safeProgress < t);

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

/** One engine's row, as app/api/audits/[auditId]/route.ts sends it. */
interface EngineProgressRow {
  engine: string;
  /** Calls finished: answered + failed. */
  done: number;
  answered?: number;
  failed?: number;
  total: number | null;
  /** e.g. "Provider error: account/credit issue" -- never a raw message. */
  failureReason?: string | null;
}

/** The engineProgress array from a poll, every number checked; null when it isn't an array. */
function toEngineRows(raw: unknown): EngineProgressRow[] | null {
  if (!Array.isArray(raw)) return null;
  const rows: EngineProgressRow[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.engine !== "string") continue;
    rows.push({
      engine: r.engine,
      done: safeCount(r.done),
      answered: r.answered === undefined ? undefined : safeCount(r.answered),
      failed: safeCount(r.failed),
      total: safeTotal(r.total),
      failureReason: typeof r.failureReason === "string" ? r.failureReason : null,
    });
  }
  return rows;
}

/** Same rows, field for field -- an unchanged poll keeps the old array, so nothing re-renders. */
function sameEngineRows(a: EngineProgressRow[], b: EngineProgressRow[]): boolean {
  return (
    a.length === b.length &&
    a.every((r, i) => {
      const o = b[i];
      return (
        r.engine === o.engine &&
        r.done === o.done &&
        r.answered === o.answered &&
        r.failed === o.failed &&
        r.total === o.total &&
        r.failureReason === o.failureReason
      );
    })
  );
}

interface EngineRowView {
  engine: string;
  label: string;
  answered: number;
  failed: number;
  total: number;
  /** 0-100, never NaN. */
  answeredPct: number;
  /** 0-100, never more than what's left after answeredPct. */
  failedPct: number;
  answeredColor: string;
  failColor: string;
  dotColor: string;
  failureReason: string | null;
}

/**
 * One view per engine whose total is known. "The Running audit page shows
 * made-up numbers" (23 Oct), item 2 -- production showed "ChatGPT 8/0 -
 * 0%": the API (app/api/audits/[auditId]/route.ts) passes total: null
 * instead of a fabricated 0 while audits.promptsCount is still
 * unpopulated, and that engine's row is skipped until the real total is
 * known -- never "/0" again (a total of 0 is skipped the same way).
 */
export function engineRowViews(engines: EngineProgressRow[]): EngineRowView[] {
  const views: EngineRowView[] = [];
  for (const e of engines) {
    const total = safeTotal(e.total);
    if (total === null) continue;
    // URGENT audit #37 (31 Oct), item 2: production showed "13/13 ·
    // 100%" in green for an engine that failed every call. Answered
    // and failed are separate now, and failures are in the warning
    // colour -- the error colour when the engine answered nothing.
    const done = safeCount(e.done);
    const failed = safeCount(e.failed);
    const answered = e.answered !== undefined ? safeCount(e.answered) : Math.max(0, done - failed);
    const finished = done >= total;
    const allFailed = finished && answered === 0 && failed > 0;
    const failColor = allFailed ? "var(--danger)" : "var(--warning)";
    const answeredPct = percentOf(answered, total);
    const failedPct = Math.min(100 - answeredPct, percentOf(failed, total));
    const answeredColor = finished ? "var(--success, #22c55e)" : "var(--accent-blue)";
    views.push({
      engine: e.engine,
      label: ENGINE_LABELS[e.engine] ?? e.engine,
      answered,
      failed,
      total,
      answeredPct,
      failedPct,
      answeredColor,
      failColor,
      dotColor: failed > 0 ? failColor : answeredColor,
      failureReason: e.failureReason ?? null,
    });
  }
  return views;
}

function PerEngineProgress({ rows }: { rows: EngineRowView[] }) {
  return (
    <div
      style={{ marginTop: 10, marginLeft: 32, display: "flex", flexDirection: "column", gap: 10 }}
    >
      {rows.map((e) => {
        const {
          failed,
          answered,
          failColor,
          answeredPct,
          failedPct,
          answeredColor,
          dotColor,
          label,
        } = e;
        return (
          <div key={e.engine} data-engine-row={e.engine}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "2px 12px",
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
                    background: dotColor,
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>
                  {label}
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
                {answered} of {e.total} answered
                {failed > 0 && (
                  <span data-failed-count style={{ color: failColor, fontWeight: 600 }}>
                    {" "}
                    · {failed} failed
                  </span>
                )}
              </span>
            </div>
            <div
              role="img"
              aria-label={`${label}: ${answered} of ${e.total} answered${failed > 0 ? `, ${failed} failed` : ""}`}
              style={{
                display: "flex",
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
                  width: `${answeredPct}%`,
                  background: answeredColor,
                  transition: "width 0.5s ease",
                }}
              />
              <div
                style={{
                  height: "100%",
                  width: `${failedPct}%`,
                  background: failColor,
                  transition: "width 0.5s ease",
                }}
              />
            </div>
            {failed > 0 && e.failureReason && (
              <div
                data-failure-reason
                style={{ fontSize: 11, color: failColor, marginTop: 4, overflowWrap: "anywhere" }}
              >
                {e.failureReason}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
