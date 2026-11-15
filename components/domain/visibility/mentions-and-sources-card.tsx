"use client";

import { visibilityColorVar } from "@/lib/scoring/visibility-display";
import {
  MENTIONS_VERDICTS,
  type MentionsAndSources,
  type MentionsVerdictKey,
} from "@/lib/visibility/mentions-and-sources";

/**
 * 17 Nov, part 1 -- the Visibility page's "Mentions and sources" card (was "Mention-Source Divide": "Mention 81.8%,
 * Citation 0.0%, Ratio 0.00, Known but Untrusted" beside an audit that said 13 of 40 and 13 of 13). Every figure is
 * the latest complete audit's own, by the audit page's definitions (lib/visibility/mentions-and-sources.ts), with
 * its counts and the audit's number; the state comes only from those two figures and isn't shown when either can't
 * be measured.
 */

const ORDER: MentionsVerdictKey[] = [
  "often_with_sources",
  "often_few_sources",
  "rarely_with_sources",
  "rarely_few_sources",
];

const CARD_STYLE = {
  backgroundColor: "var(--bg-elevated)",
  border: "1px solid var(--border-default)",
  borderLeft: "3px solid color-mix(in srgb, var(--layer-visibility) 40%, transparent)",
} as const;

export function MentionsAndSourcesCard({
  data,
  loading,
}: {
  data: MentionsAndSources | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl p-5" style={CARD_STYLE} aria-busy="true">
        <div
          className="h-3 w-32 rounded anim-shimmer mb-4"
          style={{ backgroundColor: "var(--bg-hover)" }}
        />
        <div
          className="h-40 w-full rounded anim-shimmer"
          style={{ backgroundColor: "var(--bg-hover)" }}
        />
      </div>
    );
  }

  const auditNumber = data && data.state !== "no_audit" ? data.auditNumber : null;

  return (
    <div className="rounded-xl p-5 space-y-3" style={CARD_STYLE} data-mentions-card="">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Mentions and sources
        </p>
        {auditNumber !== null && (
          <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            Audit #{auditNumber}
          </p>
        )}
      </div>

      {data && data.state !== "no_audit" && (data.coverage || data.excludedFromTrends) && (
        <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          {[data.coverage, data.excludedFromTrends].filter(Boolean).join(" · ")}
        </p>
      )}

      {(!data || data.state === "no_audit") && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {data?.reason ?? "No audit yet"}
        </p>
      )}

      {data?.state === "not_measured" && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }} data-not-measured="">
          {data.reason}
        </p>
      )}

      {data?.state === "measured" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Figure
              label="Mentioned"
              value={data.mentioned.value}
              valueColor={visibilityColorVar(data.mentioned.band)}
              detail={`in ${data.mentioned.counts} everyday answers`}
              explanation="How often AI named you when asked an everyday question about your kind of business."
            />
            {data.sources.state === "measured" ? (
              <Figure
                label="Linked a source"
                value={data.sources.value}
                detail={`${data.sources.detail} (${data.sources.percent})`}
                note={data.sources.smallSampleNote}
                explanation="Of the answers that named you, how many linked a website as their source: any site, not only yours."
              />
            ) : (
              <Figure
                label="Linked a source"
                value="—"
                detail={data.sources.reason}
                explanation="Of the answers that named you, how many linked a website as their source: any site, not only yours."
              />
            )}
          </div>

          {data.verdict && (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                {ORDER.map((key) => {
                  const active = data.verdict?.key === key;
                  return (
                    <div
                      key={key}
                      className="p-2.5 rounded-lg text-center text-[11px] font-medium"
                      data-state-cell={key}
                      data-active={active ? "" : undefined}
                      style={{
                        backgroundColor: active ? "var(--bg-subtle)" : "var(--bg-hover)",
                        border: active
                          ? "1px solid var(--border-strong, var(--border-default))"
                          : "1px solid transparent",
                        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                      }}
                    >
                      {MENTIONS_VERDICTS[key].label}
                    </div>
                  );
                })}
              </div>
              <div
                className="rounded-md px-3 py-2"
                style={{ backgroundColor: "var(--bg-subtle)" }}
                data-verdict={data.verdict.key}
              >
                <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                  {data.verdict.label}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  {data.verdict.explanation}
                </p>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  valueColor,
  detail,
  note,
  explanation,
}: {
  label: string;
  value: string;
  valueColor?: string;
  detail: string;
  note?: string | null;
  explanation: string;
}) {
  return (
    <div className="rounded-md px-3 py-2.5" style={{ backgroundColor: "var(--bg-subtle)" }}>
      <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </p>
      <p
        className="text-lg font-semibold mt-0.5"
        style={{
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          color: valueColor ?? "var(--text-primary)",
        }}
      >
        {value}
      </p>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
        {detail}
      </p>
      {note && (
        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
          {note}
        </p>
      )}
      <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
        {explanation}
      </p>
    </div>
  );
}
