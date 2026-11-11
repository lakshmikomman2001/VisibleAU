"use client";

import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import {
  pageNavigation,
  STILL_WORKING_MESSAGE,
  useRetriedNavigation,
  useSafePoll,
} from "@/lib/hooks/use-safe-poll";

/** Steady while the poll keeps up; useSafePoll slows it to 10 s when it falls behind. */
const POLL_INTERVAL_MS = 3_000;

function RunningContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auditId = searchParams.get("auditId");
  // Audit reliability, Part C, item 3 -- real progress, driven by the
  // actual answer count the status route now reports (citations +
  // engine_call_failures rows written so far), never a client-side
  // timer that climbs regardless of what's actually happened.
  const [answeredCount, setAnsweredCount] = useState(0);
  const [totalCalls, setTotalCalls] = useState<number | null>(null);
  const [status, setStatus] = useState("running");

  const poll = useCallback(
    async (signal: AbortSignal): Promise<true | null> => {
      try {
        const res = await fetch(`/api/sample-audit/${auditId}/status`, {
          cache: "no-store",
          signal,
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (typeof data?.status !== "string") return null;
        setStatus(data.status);
        setAnsweredCount(data.answeredCount ?? 0);
        setTotalCalls(data.totalCalls ?? null);
        return true;
      } catch {
        /* network errors and aborts: the next poll retries */
        return null;
      }
    },
    [auditId],
  );

  // Polling the other pages share (lib/hooks/use-safe-poll.ts): one
  // request at a time, a slow one waited for up to 30 s, and the page
  // says so when it falls behind. It used to poll on a fixed 3 s
  // setInterval with no time limit, so a slow endpoint stacked up
  // requests.
  const { behind } = useSafePoll({
    enabled: auditId !== null && status !== "complete" && status !== "failed",
    poll,
    firstDelayMs: 0,
    intervalMs: POLL_INTERVAL_MS,
  });

  // On "complete" it used to navigate once and stop polling: if that one
  // navigation didn't happen, the visitor sat on "Running your audit..."
  // (as audit #37's own page did). Now it tries again while this page is
  // still on screen, then loads the results page in full.
  const resultUrl = `/sample-audit/result/${auditId}`;
  useRetriedNavigation(status === "complete", {
    attempt: () => router.push(resultUrl),
    fallback: () => pageNavigation.assign(resultUrl),
  });

  if (!auditId) {
    return (
      <div className="text-center py-20">
        <p style={{ color: "var(--text-secondary)" }}>Missing audit ID.</p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          This audit timed out
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
          That shouldn&apos;t happen often. Please try again.
        </p>
        <a
          href="/sample-audit"
          className="inline-flex items-center justify-center rounded-md px-6 py-2.5 text-sm font-medium"
          style={{ backgroundColor: "var(--accent-blue)", color: "var(--accent-blue-fg)" }}
        >
          Try again
        </a>
      </div>
    );
  }

  if (status === "complete") {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          Your audit is ready
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
          Opening your results...
        </p>
        <a
          href={resultUrl}
          className="inline-flex items-center justify-center rounded-md px-6 py-2.5 text-sm font-medium"
          style={{ backgroundColor: "var(--accent-blue)", color: "var(--accent-blue-fg)" }}
        >
          See your results
        </a>
      </div>
    );
  }

  const progressPct =
    totalCalls && totalCalls > 0 ? Math.min(100, (answeredCount / totalCalls) * 100) : 0;

  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <Loader2
        className="mx-auto animate-spin mb-6"
        style={{ width: 48, height: 48, color: "var(--accent-blue)" }}
      />
      <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
        Running your audit...
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
        We&apos;re querying AI engines to see how your brand appears. This usually takes under a
        minute.
      </p>

      {/* Progress bar -- width tracks the real answer count, not a timer */}
      <div
        className="w-full h-2 rounded-full overflow-hidden mb-2"
        style={{ backgroundColor: "var(--bg-elevated)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${progressPct}%`,
            backgroundColor: "var(--accent-blue)",
          }}
        />
      </div>
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        {totalCalls ? `${answeredCount} of ${totalCalls} answers received` : "Starting..."}
      </p>
      {behind && (
        <p
          className="text-xs mt-3"
          style={{ color: "var(--text-secondary)" }}
          role="status"
          data-poll-behind
        >
          {STILL_WORKING_MESSAGE}
        </p>
      )}
    </div>
  );
}

export default function SampleAuditRunningPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-6 py-20 text-center">
          <Loader2
            className="mx-auto animate-spin mb-6"
            style={{ width: 48, height: 48, color: "var(--accent-blue)" }}
          />
        </div>
      }
    >
      <RunningContent />
    </Suspense>
  );
}
