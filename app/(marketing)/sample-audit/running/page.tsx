"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

function RunningContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auditId = searchParams.get("auditId");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("running");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!auditId) return;
    try {
      const res = await fetch(`/api/sample-audit/${auditId}/status`);
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data.status);
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
    intervalRef.current = setInterval(() => {
      poll();
      setProgress((p) => Math.min(p + 2, 95));
    }, 3000);
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

  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <Loader2
        className="mx-auto animate-spin mb-6"
        style={{ width: 48, height: 48, color: "#3b82f6" }}
      />
      <h1
        className="text-2xl font-bold mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        Running your audit...
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
        We&apos;re querying AI engines to see how your brand appears. This
        usually takes about 90 seconds.
      </p>

      {/* Progress bar */}
      <div
        className="w-full h-2 rounded-full overflow-hidden mb-2"
        style={{ backgroundColor: "var(--bg-elevated)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${progress}%`,
            backgroundColor: "#3b82f6",
          }}
        />
      </div>
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        {status === "failed" ? "Audit failed. Please try again." : `${progress}%`}
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
