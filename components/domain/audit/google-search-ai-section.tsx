import type { CSSProperties } from "react";
import {
  type GoogleSurfaceSummary,
  googleCheckedAnything,
  googleOutcomeText,
  googleSurfaceDetail,
  googleSurfaceReasons,
} from "@/lib/audit/google-surfaces/summary";
import { GoogleSurfacesRefresher } from "./google-surfaces-refresher";

/**
 * Google AI surfaces, Phase 1, part 3 -- the audit page's "Google Search AI" block: one row per surface, the
 * place, device and date it was checked for, what couldn't be checked and why, and each question's outcome.
 * Shown only for an audit that ran with Google (lib/audit/google-surfaces/summary.ts returns null otherwise),
 * so an audit without it looks exactly as it did.
 */

const muted: CSSProperties = { color: "var(--text-secondary)" };
const strong: CSSProperties = { color: "var(--text-primary)" };

// 14 Nov, part 3: the per-question words and the surface detail are lib/audit/google-surfaces/summary.ts's, shared
// with the report PDF.

export function GoogleSearchAiSection({
  auditId,
  summary,
}: {
  auditId: string;
  summary: GoogleSurfaceSummary;
}) {
  // 12 Nov: when Google answered nothing on any surface there's no per-question result to list (each would
  // only repeat "couldn't be checked"), so the list isn't shown; the lines above say why.
  const questions = googleCheckedAnything(summary) ? (summary.rows[0]?.results ?? []) : [];
  return (
    <section
      className="mt-6 p-5 rounded-xl"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
      data-google-search-ai=""
      data-google-status={summary.status}
    >
      <h2 className="text-sm font-semibold" style={strong}>
        Google Search AI
      </h2>
      <p className="text-[12px] mt-1" style={muted} data-google-label="">
        {summary.labelLine}
      </p>
      {summary.locationNote ? (
        <p
          className="text-[12px] mt-1"
          style={{ color: "var(--warning)" }}
          data-google-location-note=""
        >
          {summary.locationNote}
        </p>
      ) : null}

      {summary.rows.length === 0 ||
      (summary.status === "complete" && summary.statusReason && questions.length === 0) ? (
        <p className="text-[13px] mt-3" style={strong}>
          Google couldn't be checked for this audit
          {summary.statusReason ? `: ${summary.statusReason}` : "."}
        </p>
      ) : (
        <div className="flex flex-col gap-3 mt-3">
          {summary.rows.map((row) => (
            <div key={row.surface} data-google-surface={row.surface}>
              <p className="text-[13px]" style={strong}>
                {row.line}
              </p>
              <p className="text-[12px] mt-0.5" style={muted}>
                {googleSurfaceDetail(row)}
              </p>
              {row.directories.length > 0 ? (
                <p className="text-[12px] mt-0.5" style={muted}>
                  Directories cited: {row.directories.join(", ")}
                </p>
              ) : null}
            </div>
          ))}
          {/* 12 Nov, part 2: why, in the customer's words, once each (never the provider's message). */}
          {googleSurfaceReasons(summary).map((reason) => (
            <p key={reason} className="text-[12px]" style={muted} data-google-reason="">
              {reason}
            </p>
          ))}
        </div>
      )}

      <p className="text-[12px] mt-3" style={muted} data-google-headline-note="">
        {summary.countInHeadline
          ? "Counted in the Visibility % above, for the questions where Google showed an AI answer."
          : "Not counted in the Visibility % above: Google is shown on its own."}{" "}
        Checked through {summary.provider === "dataforseo" ? "DataForSEO" : summary.provider},
        logged out, for this place and device; Google's AI answers change with time and place.
      </p>

      {questions.length > 0 ? (
        <details className="mt-3">
          <summary className="text-[12px] cursor-pointer" style={strong}>
            Each question
          </summary>
          <div style={{ overflowX: "auto" }}>
            <table className="text-[12px] mt-2 w-full" style={muted}>
              <thead>
                <tr style={strong}>
                  <th className="text-left pr-3 pb-1">Question</th>
                  {summary.rows.map((row) => (
                    <th key={row.surface} className="text-left pr-3 pb-1 whitespace-nowrap">
                      {row.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.promptIndex} data-google-question={q.promptIndex}>
                    <td className="pr-3 py-1">
                      {q.prompt}
                      {q.isBranded ? " (names you)" : ""}
                    </td>
                    {summary.rows.map((row) => {
                      const r = row.results.find((x) => x.promptIndex === q.promptIndex);
                      return (
                        <td key={row.surface} className="pr-3 py-1 whitespace-nowrap">
                          {r ? googleOutcomeText(r, row.surface) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      {summary.status !== "complete" ? <GoogleSurfacesRefresher auditId={auditId} /> : null}
    </section>
  );
}
