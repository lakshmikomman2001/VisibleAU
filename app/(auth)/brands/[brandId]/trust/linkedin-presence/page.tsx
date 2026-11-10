"use client";

import { useParams } from "next/navigation";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockedCard } from "@/components/domain/pricing/plan-lock";
import { LinkedinGapRow } from "@/components/domain/trust/linkedin-gap-row";
import { LinkedinPresenceScorecard } from "@/components/domain/trust/linkedin-presence-scorecard";
import { NotYetMeasuredCard } from "@/components/domain/trust/not-yet-measured-card";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { ActionError, LoadError } from "@/components/shared/load-error";
import { usePostAction } from "@/lib/hooks/use-action";
import { useGatedJson } from "@/lib/hooks/use-load";

interface LinkedinData {
  implemented?: false;
  presenceScore: number | null;
  companyPageExists: boolean | null;
  companyPageFollowers: number | null;
  companyPosts30d: number | null;
  founderProfileExists: boolean | null;
  founderFollowers: number | null;
  founderPosts30d: number | null;
  gaps: string[];
  rationale: string;
  confidence_label: string | null;
  scoreLevel: "Low" | "Medium" | "High" | null;
  top_action: string | null;
}

export default function LinkedinPresencePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const { locked, planRefused } = useBrandFeatureGate("linkedin_presence");
  // Follow-ups from af8de42..d1eb5a1, part 1: a failed fetch fell through to the never-checked state, and a
  // failed Refresh reloaded the old data saying nothing. Each says so now.
  const loaded = useGatedJson<LinkedinData>(
    `/api/brands/${brandId}/linkedin-presence`,
    planRefused,
    { enabled: !locked },
  );
  const data = loaded.data;
  const refresh = usePostAction(`/api/brands/${brandId}/linkedin-presence/refresh`, {
    planRefused,
    onDone: loaded.retry,
    failure: "The LinkedIn check couldn't be run.",
  });
  const refreshing = refresh.running;
  const handleRefresh = () => refresh.run();

  if (locked) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          LinkedIn Presence
        </h1>
        <PlanLockedCard feature="linkedin_presence" />
      </div>
    );
  }

  if (loaded.status === "error") {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          LinkedIn Presence
        </h1>
        <LoadError what="your LinkedIn presence" detail={loaded.detail} onRetry={loaded.retry} />
      </div>
    );
  }

  if (loaded.status === "loading") {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          LinkedIn Presence
        </h1>
        <div
          className="h-48 animate-pulse rounded-lg"
          style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          LinkedIn Presence
        </h1>
        <div
          className="flex flex-col items-center gap-2 py-12 text-center"
          style={{ color: "var(--text-secondary)" }}
        >
          <p className="text-lg font-medium">Add your LinkedIn URLs and run an audit</p>
        </div>
      </div>
    );
  }

  if (data.implemented === false) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
            LinkedIn Presence
          </h1>
          <button
            disabled
            className="rounded px-3 py-1.5 text-sm font-medium opacity-50"
            style={{ backgroundColor: "var(--accent-primary)", color: "var(--accent-primary-fg)" }}
          >
            Not yet available
          </button>
        </div>
        <NotYetMeasuredCard metric="LinkedIn presence" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <LayerBadge layer="trust" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          LinkedIn Presence
        </h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: "var(--accent-primary)", color: "var(--accent-primary-fg)" }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      <ActionError message={refresh.error} />

      <LinkedinPresenceScorecard data={data} />

      {data.gaps.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-medium" style={{ color: "var(--foreground)" }}>
            Gaps
          </h2>
          {data.gaps.map((gap, i) => (
            <LinkedinGapRow key={i} gap={gap} />
          ))}
        </div>
      )}
    </div>
  );
}
