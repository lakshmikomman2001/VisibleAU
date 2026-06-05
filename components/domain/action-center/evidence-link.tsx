"use client";

import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";

interface EvidenceLinkProps {
  evidenceRefs: Array<{ source: string; url: string; summary: string }>;
}

export function EvidenceLink({ evidenceRefs }: EvidenceLinkProps) {
  const [open, setOpen] = useState(false);

  if (!evidenceRefs || evidenceRefs.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 500,
          color: "var(--accent-blue)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {open ? (
          <ChevronDown style={{ width: 14, height: 14 }} />
        ) : (
          <ChevronRight style={{ width: 14, height: 14 }} />
        )}
        View research ({evidenceRefs.length} citation{evidenceRefs.length !== 1 ? "s" : ""})
      </button>
      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {evidenceRefs.map((ref) => (
            <div
              key={`${ref.source}-${ref.url}`}
              style={{
                padding: "10px 14px",
                borderRadius: 6,
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {ref.url ? (
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--accent-blue)",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {ref.source}
                  <ExternalLink style={{ width: 12, height: 12 }} />
                </a>
              ) : (
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                  {ref.source}
                </span>
              )}
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0" }}>
                {ref.summary}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
