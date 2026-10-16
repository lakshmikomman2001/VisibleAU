"use client";

import { useState } from "react";

/**
 * Task #46 Phase 3, Part B: the Responses tab's answer body.
 *
 * - `responseText` present (audits run after migration 0045): the FULL
 *   answer is always in the markup; long answers are visually clamped
 *   until "Show full answer" is clicked, so nothing is hidden from
 *   server rendering or in-page search -- the toggle is presentation only.
 * - `responseText` null (historical rows): only the stored 500-char
 *   snippet exists. It's shown as-is with an explicit note, never
 *   dressed up as the full answer.
 */
const COLLAPSE_THRESHOLD_CHARS = 500;

export function ResponseAnswerText({
  responseText,
  responseSnippet,
}: {
  responseText: string | null;
  responseSnippet: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const body = responseText ?? responseSnippet;
  if (!body) return null;

  const isFull = responseText !== null;
  const collapsible = isFull && responseText.length > COLLAPSE_THRESHOLD_CHARS;
  const clamped = collapsible && !expanded;

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        data-answer-kind={isFull ? "full" : "snippet"}
        style={{
          fontSize: 12,
          lineHeight: 1.6,
          color: "var(--text-secondary)",
          paddingLeft: 12,
          borderLeft: "2px solid var(--accent-blue)",
          whiteSpace: "pre-wrap",
          ...(clamped ? { maxHeight: "7.2em", overflow: "hidden" } : {}),
        }}
      >
        {body}
      </div>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          style={{
            marginTop: 4,
            marginLeft: 12,
            padding: 0,
            border: "none",
            background: "none",
            fontSize: 11,
            fontWeight: 500,
            color: "var(--accent-blue)",
            cursor: "pointer",
          }}
        >
          {expanded ? "Show less" : "Show full answer"}
        </button>
      )}
      {!isFull && (
        <div style={{ marginTop: 4, marginLeft: 12, fontSize: 11, color: "var(--text-tertiary)" }}>
          Stored excerpt (up to the first 500 characters) &mdash; full answer not stored for audits
          run before this feature existed.
        </div>
      )}
    </div>
  );
}
