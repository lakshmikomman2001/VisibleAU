"use client";

import { useState } from "react";
import { SectionHeader } from "@/components/phase2/section-header";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { EmptyState } from "@/components/phase2/empty-state";
import { StatusBadge } from "@/components/phase2/status-badge";
import { ContentFormatBadge } from "@/components/domain/workflow/content-format-badge";
import { ContentDraftViewer } from "@/components/domain/workflow/content-draft-viewer";
import { WorkflowSubNav } from "@/components/domain/workflow/workflow-sub-nav";

interface Draft {
  id: string;
  title: string;
  body: string;
  status: string;
  draftType: string;
  contentFormat: string;
  formatRecommendationReason: string | null;
  targetWordCount: number | null;
  wordCount: number | null;
  createdAt: string;
}

interface DraftsPageClientProps {
  brandId: string;
  drafts: Draft[];
}

export function DraftsPageClient({ brandId, drafts }: DraftsPageClientProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedDraft = drafts.find((d) => d.id === selectedId);

  async function handleApprove(draftId: string) {
    await fetch(`/api/brands/${brandId}/drafts/${draftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    window.location.reload();
  }

  async function handleReject(draftId: string) {
    await fetch(`/api/brands/${brandId}/drafts/${draftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected" }),
    });
    window.location.reload();
  }

  if (selectedDraft) {
    return (
      <div style={{ padding: "28px 32px" }}>
        <button
          onClick={() => setSelectedId(null)}
          className="text-sm mb-4 flex items-center gap-1"
          style={{ color: "var(--accent-blue)" }}
        >
          ← Back to drafts
        </button>
        <ContentDraftViewer
          draft={selectedDraft}
          onApprove={() => handleApprove(selectedDraft.id)}
          onReject={() => handleReject(selectedDraft.id)}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <div className="flex items-center gap-3 mb-6">
        <LayerBadge layer="content" />
        <h1
          className="text-2xl font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Content Drafts
        </h1>
      </div>

      <WorkflowSubNav brandId={brandId} />

      {drafts.length === 0 ? (
        <EmptyState message="No drafts yet — generate one from a task on the Remediation Tasks board" />
      ) : (
        <div className="space-y-2">
          {drafts.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              className="w-full text-left p-4 rounded-lg transition-shadow"
              style={{
                backgroundColor: "var(--bg-elevated)",
                boxShadow: "var(--elevation-rest)",
                border: "1px solid var(--border-subtle)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.boxShadow = "var(--elevation-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.boxShadow = "var(--elevation-rest)")
              }
              onFocus={(e) =>
                (e.currentTarget.style.boxShadow = "var(--focus-ring)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.boxShadow = "var(--elevation-rest)")
              }
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="font-medium text-sm"
                  style={{ color: "var(--text-primary)" }}
                >
                  {d.title}
                </span>
                <StatusBadge status={d.status as "draft"} />
              </div>
              <div className="flex items-center gap-2">
                <ContentFormatBadge format={d.contentFormat} reason={null} />
                {d.wordCount != null && (
                  <span
                    className="text-xs"
                    style={{
                      color: "var(--text-tertiary)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {d.wordCount} words
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
