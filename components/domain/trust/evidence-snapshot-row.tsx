"use client";

import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { formatInOrgTimezone } from "@/lib/platform/org-timezone";

export interface EvidenceSnapshot {
  id: string;
  engine: string;
  prompt: string;
  rawResponse: string;
  capturedAt: string;
  /**
   * 17 Nov, part 3: true when the question named the business (citations.is_branded_prompt), which the audit
   * page doesn't count as an everyday answer; null when the snapshot's audit is gone and it can't be matched.
   */
  askedByName: boolean | null;
}

/**
 * One archived answer. 17 Nov, part 3: no "Sentiment: +N%" any more -- it came from
 * citations.sentiment_score, which nothing writes (sentiment isn't measured). An answer to a question that
 * named the business says so, so it isn't read as an everyday answer.
 */
export function EvidenceSnapshotRow({ snapshot }: { snapshot: EvidenceSnapshot }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
        backgroundColor: "var(--background)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
            {ENGINE_DISPLAY_NAMES[snapshot.engine as keyof typeof ENGINE_DISPLAY_NAMES] ??
              snapshot.engine}
          </span>
          {snapshot.askedByName === true && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: "color-mix(in srgb, var(--text-secondary) 15%, transparent)",
                color: "var(--text-secondary)",
              }}
              title="The question named the business, so the audit doesn't count this answer as an everyday one."
            >
              Question named the business
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {formatInOrgTimezone(new Date(snapshot.capturedAt), undefined, "d MMM yyyy")}
        </span>
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
        {snapshot.prompt}
      </p>
      <p className="mt-2 text-xs" style={{ color: "var(--foreground)", whiteSpace: "pre-wrap" }}>
        {snapshot.rawResponse.length > 200
          ? `${snapshot.rawResponse.slice(0, 200)}...`
          : snapshot.rawResponse}
      </p>
    </div>
  );
}
