"use client";

import { useCallback } from "react";
import type { ReportSection, ReportSectionType } from "@/lib/communication/types";

interface SectionToggleListProps {
  sections: ReportSection[];
  onChange: (sections: ReportSection[]) => void;
}

const SECTION_LABELS: Record<ReportSectionType, string> = {
  executive_summary: "Executive Summary",
  score_breakdown: "Score Breakdown",
  mention_source_divide: "Mention / Source Divide",
  fan_out_coverage: "Fan-Out Coverage",
  topical_gap_summary: "Topical Gap Summary",
  source_type_gaps: "Source Type Gaps",
  agent_readiness: "Agent Readiness",
  linkedin_performance: "LinkedIn Performance",
  consensus_score: "Consensus Score",
  knowledge_panel_status: "Knowledge Panel Status",
  entity_home_status: "Entity Home Status",
  evidence_snapshots: "Evidence Snapshots",
};

export function SectionToggleList({ sections, onChange }: SectionToggleListProps) {
  const handleToggle = useCallback(
    (idx: number) => {
      const next = sections.map((s, i) =>
        i === idx ? { ...s, include: !s.include } : s,
      );
      onChange(next);
    },
    [sections, onChange],
  );

  const handleMoveUp = useCallback(
    (idx: number) => {
      if (idx === 0) return;
      const next = [...sections];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      onChange(next.map((s, i) => ({ ...s, order: i })));
    },
    [sections, onChange],
  );

  const handleMoveDown = useCallback(
    (idx: number) => {
      if (idx === sections.length - 1) return;
      const next = [...sections];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      onChange(next.map((s, i) => ({ ...s, order: i })));
    },
    [sections, onChange],
  );

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        border: "1px solid var(--border-default)",
        backgroundColor: "var(--bg-elevated)",
      }}
      role="list"
      aria-label="Report sections"
    >
      {sections.map((section, idx) => {
        const toggleId = `section-toggle-${section.type}`;
        return (
          <div
            key={section.type}
            role="listitem"
            className="flex items-center gap-3 px-4 py-3"
            style={{
              borderBottom:
                idx < sections.length - 1
                  ? "1px solid var(--border-subtle)"
                  : "none",
            }}
          >
            {/* Reorder buttons */}
            <div className="flex flex-col gap-0.5 flex-shrink-0">
              <button
                type="button"
                aria-label={`Move ${SECTION_LABELS[section.type]} up`}
                disabled={idx === 0}
                onClick={() => handleMoveUp(idx)}
                className="rounded p-0.5 text-xs leading-none"
                style={{
                  border: "none",
                  background: "transparent",
                  color:
                    idx === 0
                      ? "var(--text-tertiary)"
                      : "var(--text-secondary)",
                  cursor: idx === 0 ? "default" : "pointer",
                  opacity: idx === 0 ? 0.4 : 1,
                }}
              >
                &#9650;
              </button>
              <button
                type="button"
                aria-label={`Move ${SECTION_LABELS[section.type]} down`}
                disabled={idx === sections.length - 1}
                onClick={() => handleMoveDown(idx)}
                className="rounded p-0.5 text-xs leading-none"
                style={{
                  border: "none",
                  background: "transparent",
                  color:
                    idx === sections.length - 1
                      ? "var(--text-tertiary)"
                      : "var(--text-secondary)",
                  cursor: idx === sections.length - 1 ? "default" : "pointer",
                  opacity: idx === sections.length - 1 ? 0.4 : 1,
                }}
              >
                &#9660;
              </button>
            </div>

            {/* Label */}
            <label
              htmlFor={toggleId}
              className="flex-1 text-sm font-medium select-none"
              style={{
                color: section.include
                  ? "var(--text-primary)"
                  : "var(--text-tertiary)",
                cursor: "pointer",
              }}
            >
              {SECTION_LABELS[section.type]}
            </label>

            {/* Toggle switch */}
            <button
              id={toggleId}
              type="button"
              role="switch"
              aria-checked={section.include}
              aria-label={`Include ${SECTION_LABELS[section.type]}`}
              onClick={() => handleToggle(idx)}
              className="relative flex-shrink-0 rounded-full transition-colors"
              style={{
                width: 36,
                height: 20,
                border: "none",
                cursor: "pointer",
                backgroundColor: section.include
                  ? "var(--layer-comm)"
                  : `color-mix(in srgb, var(--text-tertiary) 30%, transparent)`,
                padding: 0,
              }}
            >
              <span
                className="block rounded-full transition-transform"
                style={{
                  width: 16,
                  height: 16,
                  backgroundColor: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  transform: section.include
                    ? "translateX(18px)"
                    : "translateX(2px)",
                  marginTop: 2,
                }}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}
