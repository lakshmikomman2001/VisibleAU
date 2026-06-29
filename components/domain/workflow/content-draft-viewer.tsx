"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/phase2/status-badge";
import { ContentFormatBadge } from "./content-format-badge";

interface ContentDraftViewerProps {
  draft: {
    id: string;
    title: string;
    body: string;
    status: string;
    draftType: string;
    contentFormat: string;
    formatRecommendationReason: string | null;
    targetWordCount: number | null;
    wordCount: number | null;
  };
  onApprove?: () => void;
  onReject?: () => void;
  onUpdateBody?: (body: string) => void;
  onUpdateTitle?: (title: string) => void;
}

export function ContentDraftViewer({
  draft,
  onApprove,
  onReject,
  onUpdateBody,
  onUpdateTitle,
}: ContentDraftViewerProps) {
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);

  const editable = draft.status === "draft";

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <div className="flex-1 space-y-4">
        <div
          role="textbox"
          aria-label="Draft title"
          contentEditable={editable}
          suppressContentEditableWarning
          className="text-xl font-semibold outline-none px-1 py-0.5 rounded"
          style={{
            color: "var(--text-primary)",
            ...(editable
              ? {}
              : { pointerEvents: "none" as const, opacity: 0.8 }),
          }}
          onFocus={(e) =>
            (e.currentTarget.style.boxShadow = "var(--focus-ring)")
          }
          onBlur={(e) => {
            e.currentTarget.style.boxShadow = "none";
            const val = e.currentTarget.textContent ?? "";
            if (val !== title) {
              setTitle(val);
              onUpdateTitle?.(val);
            }
          }}
        >
          {title}
        </div>

        <div
          role="textbox"
          aria-label="Draft body"
          aria-multiline="true"
          contentEditable={editable}
          suppressContentEditableWarning
          className="min-h-[300px] text-sm leading-relaxed outline-none px-3 py-3 rounded-lg"
          style={{
            backgroundColor: "var(--bg-elevated)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-subtle)",
            whiteSpace: "pre-wrap",
            ...(editable
              ? {}
              : { pointerEvents: "none" as const, opacity: 0.8 }),
          }}
          onFocus={(e) =>
            (e.currentTarget.style.boxShadow = "var(--focus-ring)")
          }
          onBlur={(e) => {
            e.currentTarget.style.boxShadow = "none";
            const val = e.currentTarget.textContent ?? "";
            if (val !== body) {
              setBody(val);
              onUpdateBody?.(val);
            }
          }}
        >
          {body}
        </div>
      </div>

      {/* Sidebar — moves above editor on mobile */}
      <div className="w-full md:w-64 order-first md:order-last space-y-3">
        <div className="flex items-center gap-2">
          <StatusBadge status={draft.status as "draft"} />
        </div>

        <ContentFormatBadge
          format={draft.contentFormat}
          reason={draft.formatRecommendationReason}
        />

        {draft.targetWordCount && (
          <p
            className="text-xs"
            style={{
              color: "var(--text-secondary)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            Target: {draft.targetWordCount} words
            {draft.wordCount != null && ` · Current: ${draft.wordCount}`}
          </p>
        )}

        {editable && (
          <div className="flex gap-2 pt-2">
            <button
              onClick={onApprove}
              className="flex-1 px-3 py-1.5 rounded-md text-sm font-medium"
              style={{
                backgroundColor: "var(--success)",
                color: "#fff",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.boxShadow = "var(--focus-ring)")
              }
              onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
            >
              Approve
            </button>
            <button
              onClick={onReject}
              className="flex-1 px-3 py-1.5 rounded-md text-sm font-medium"
              style={{
                backgroundColor: "var(--danger-soft)",
                color: "var(--danger)",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.boxShadow = "var(--focus-ring)")
              }
              onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
