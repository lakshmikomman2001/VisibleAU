"use client";

import { useCallback } from "react";
import { usePlanTier } from "@/components/domain/plan-tier-context";
import { PlanGatedLink } from "@/components/domain/pricing/plan-lock";
import { LoadError } from "@/components/shared/load-error";
import { useLoad } from "@/lib/hooks/use-load";
import { fetchJson } from "@/lib/load/fetch-json";

interface ReportBrandingAnswer {
  agencyName: string | null;
  available: boolean;
}

/**
 * 2 Nov -- on the reports pages: when this brand's reports print no agency
 * name (its own or the workspace's), their cover shows only "Powered by
 * Vunnara", so say where to add one. Nothing until the answer is in, and
 * nothing on a plan without report branding: never a hint that may be false.
 * Follow-ups from af8de42..d1eb5a1, part 1: an answer that couldn't be read
 * hid the hint silently; it says it couldn't check now, with Try again.
 */
export function ReportBrandingHint({ brandId }: { brandId: string }) {
  const planTier = usePlanTier();
  const load = useCallback(
    (signal: AbortSignal) =>
      fetchJson<ReportBrandingAnswer>(
        `/api/report-branding?brandId=${encodeURIComponent(brandId)}`,
        { signal },
      ),
    [brandId],
  );
  const branding = useLoad(load);

  if (branding.status === "error") {
    return (
      <LoadError
        what="your report branding"
        detail={branding.detail}
        onRetry={branding.retry}
        className="mb-6"
      />
    );
  }
  if (branding.status !== "ready") return null;
  if (!branding.data.available || branding.data.agencyName !== null) return null;

  return (
    <div
      className="rounded-lg px-4 py-3 mb-6 text-[13px]"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        color: "var(--text-secondary)",
      }}
      data-branding-hint
    >
      Your report covers show only &quot;Powered by Vunnara&quot;.{" "}
      <PlanGatedLink
        feature="white_label_reports"
        tier={planTier}
        className="underline focus-visible:outline focus-visible:outline-2"
        style={{ color: "var(--accent-blue)" }}
      >
        Add your agency name and logo in Account → Report branding
      </PlanGatedLink>
      .
    </div>
  );
}
