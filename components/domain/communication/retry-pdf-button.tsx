"use client";

import { type MouseEvent, useState } from "react";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockBadge } from "@/components/domain/pricing/plan-lock";

const RETRY_FAILED = "Couldn't start it again. Please try again in a minute.";

/**
 * URGENT PDF reports (1 Nov), part 2 -- "Try again" on a report whose PDF
 * couldn't be created: POST .../retry-pdf (owner, admin or analyst; the
 * server enforces it), then `onRetrying` so the page shows "Generating..."
 * and polls again. A refusal says why instead of failing silently.
 */
export function RetryPdfButton({
  brandId,
  reportId,
  onRetrying,
}: {
  brandId: string;
  reportId: string;
  onRetrying: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { locked, planRefused } = useBrandFeatureGate("reports");

  const retry = async (e: MouseEvent) => {
    // On the reports list the button sits inside a row that opens the report.
    e.stopPropagation();
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/reports/${reportId}/retry-pdf`, {
        method: "POST",
      });
      if (res.status === 202) {
        onRetrying();
        return;
      }
      if (await planRefused(res)) return;
      const body: unknown = await res.json().catch(() => null);
      const message =
        typeof body === "object" &&
        body !== null &&
        typeof (body as { error?: unknown }).error === "string"
          ? (body as { error: string }).error
          : null;
      // A refusal (a role that can't, a PDF already being made) says why; anything else is a failure.
      setError(res.status >= 400 && res.status < 500 ? (message ?? RETRY_FAILED) : RETRY_FAILED);
    } catch {
      setError(RETRY_FAILED);
    } finally {
      setSending(false);
    }
  };

  if (locked) return <PlanLockBadge feature="reports" />;

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={retry}
        // Enter on the button mustn't also reach the row's own Enter (open the report).
        onKeyDown={(e) => e.stopPropagation()}
        disabled={sending}
        className="text-[12px] font-medium px-3 py-1 rounded-md"
        style={{ background: "var(--danger)", color: "#fff", opacity: sending ? 0.7 : 1 }}
      >
        {sending ? "Starting…" : "Try again"}
      </button>
      {error && (
        <span role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
