"use client";

import { ArrowRight, FileText } from "lucide-react";
import { StatusBadge } from "@/components/phase2/status-badge";
import { PriorityBadge } from "@/components/phase2/priority-badge";
import { ConfidenceBadge } from "@/components/phase2/confidence-badge";

interface TaskCardProps {
  id: string;
  title: string;
  status: string;
  priority: number;
  effort: string | null;
  confidenceLabel: string | null;
  dimension: string | null;
  scoreBefore: string | null;
  scoreAfter: string | null;
  assignedTo: string | null;
  dueDate: string | null;
  reauditDeferredReason: string | null;
  allowedMoves?: Array<{ key: string; label: string }>;
  onMove?: (taskId: string, newStatus: string) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onClick?: () => void;
  pending?: boolean;
  onGenerateDraft?: (taskId: string, title: string) => void;
}

function deriveImpactBand(scoreBefore: string | null): "high" | "medium" | "low" {
  if (scoreBefore == null) return "medium";
  const score = Number(scoreBefore);
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

export function TaskCard({
  id,
  title,
  status,
  priority,
  effort,
  confidenceLabel,
  dimension,
  scoreBefore,
  scoreAfter,
  reauditDeferredReason,
  allowedMoves,
  onMove,
  onDragStart,
  onClick,
  pending,
  onGenerateDraft,
}: TaskCardProps) {
  const band = deriveImpactBand(scoreBefore);
  const canDrag = !!onDragStart && !pending;

  return (
    <div
      draggable={canDrag}
      onDragStart={(e) => {
        if (!canDrag) { e.preventDefault(); return; }
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.(e);
      }}
      className="w-full text-left rounded-lg p-3 mb-2 transition-shadow"
      aria-busy={pending || undefined}
      style={{
        backgroundColor: "var(--bg-elevated)",
        boxShadow: "var(--elevation-rest)",
        border: "1px solid var(--border-subtle)",
        cursor: canDrag ? "grab" : "default",
        opacity: pending ? 0.5 : 1,
        pointerEvents: pending ? "none" : undefined,
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.boxShadow = "var(--elevation-hover)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.boxShadow = "var(--elevation-rest)")
      }
      role="article"
      aria-label={`Task: ${title}, status ${status}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className="text-sm font-medium line-clamp-2"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </span>
        <StatusBadge status={status as "open"} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <PriorityBadge band={band} />
        {confidenceLabel && (
          <ConfidenceBadge level={confidenceLabel as "High"} />
        )}
        {dimension && (
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: "var(--bg-hover)",
              color: "var(--text-tertiary)",
            }}
          >
            {dimension}
          </span>
        )}
      </div>

      {scoreBefore != null && (
        <div
          className="mt-2 text-xs flex items-center gap-1"
          style={{
            fontVariantNumeric: "tabular-nums",
            color: "var(--text-secondary)",
          }}
        >
          <span>{Number(scoreBefore).toFixed(0)}</span>
          <span>→</span>
          {scoreAfter != null ? (
            <span style={{ color: "var(--success)" }}>
              {Number(scoreAfter).toFixed(0)}
            </span>
          ) : reauditDeferredReason ? (
            <span style={{ color: "var(--warning)" }}>
              validation pending — {reauditDeferredReason.replace("_", " ")}
            </span>
          ) : (
            <span style={{ color: "var(--text-tertiary)" }}>—</span>
          )}
        </div>
      )}

      {!pending && (allowedMoves?.length || onGenerateDraft) && (
        <div className="flex gap-1.5 mt-2 pt-2 flex-wrap" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          {allowedMoves && allowedMoves.length > 0 && onMove &&
            allowedMoves.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(id, m.key);
                }}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
                style={{
                  background: "var(--bg-hover)",
                  color: "var(--text-secondary)",
                  border: "none",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--accent-primary)";
                  e.currentTarget.style.color = "var(--accent-primary-fg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
                onFocus={(e) => {
                  e.currentTarget.style.boxShadow = "var(--focus-ring)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.boxShadow = "none";
                }}
                aria-label={`Move to ${m.label}`}
              >
                <ArrowRight style={{ width: 10, height: 10 }} />
                {m.label}
              </button>
            ))}
          {onGenerateDraft && status !== "complete" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onGenerateDraft(id, title);
              }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
              style={{
                background: "color-mix(in srgb, var(--layer-content) 15%, transparent)",
                color: "var(--layer-content)",
                border: "none",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--layer-content)";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "color-mix(in srgb, var(--layer-content) 15%, transparent)";
                e.currentTarget.style.color = "var(--layer-content)";
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow = "var(--focus-ring)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = "none";
              }}
              aria-label="Generate content draft"
            >
              <FileText style={{ width: 10, height: 10 }} />
              Generate draft
            </button>
          )}
        </div>
      )}
    </div>
  );
}
