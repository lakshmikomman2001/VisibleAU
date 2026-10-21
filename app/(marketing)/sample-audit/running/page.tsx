"use client";

import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!auditId) return;
    try {
      const res = await fetch(`/api/sample-audit/${auditId}/status`);
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data.status);
      setAnsweredCount(data.answeredCount ?? 0);
      setTotalCalls(data.totalCalls ?? null);
      if (data.status === "complete") {
        if (intervalRef.current) clearInterval(intervalRef.current);
        router.push(`/sample-audit/result/${auditId}`);
      } else if (data.status === "failed") {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    } catch {}
  }, [auditId, router]);

  useEffect(() => {
    if (!auditId) return;
    poll();
    intervalRef.current = setInterval(poll, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [auditId, poll]);

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
          style={{ backgroundColor: "#3b82f6", color: "#fff" }}
        >
          Try again
        </a>
      </div>
    );
  }

  const progressPct = totalCalls && totalCalls > 0 ? Math.min(100, (answeredCount / totalCalls) * 100) : 0;

  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <Loader2
        className="mx-auto animate-spin mb-6"
        style={{ width: 48, height: 48, color: "#3b82f6" }}
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
            backgroundColor: "#3b82f6",
          }}
        />
      </div>
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        {totalCalls ? `${answeredCount} of ${totalCalls} answers received` : "Starting..."}
      </p>
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
            style={{ width: 48, height: 48, color: "#3b82f6" }}
          />
        </div>
      }
    >
      <RunningContent />
    </Suspense>
  );
}
