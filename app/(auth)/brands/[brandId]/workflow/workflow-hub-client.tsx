"use client";

import { LayerBadge } from "@/components/phase2/layer-badge";
import { IntelCard } from "@/components/phase2/intel-card";
import { EmptyState } from "@/components/phase2/empty-state";
import { CreateTaskModal } from "@/components/domain/workflow/create-task-modal";
import { WorkflowSubNav } from "@/components/domain/workflow/workflow-sub-nav";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface WorkflowHubClientProps {
  brandId: string;
  counts: Record<string, number>;
}

export function WorkflowHubClient({ brandId, counts }: WorkflowHubClientProps) {
  const router = useRouter();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const openCount = counts.open ?? 0;
  const inProgressCount = counts.in_progress ?? 0;
  const doneCount = counts.complete ?? 0;
  const total = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <div style={{ padding: "28px 32px" }}>
      <div className="flex items-center gap-3 mb-6">
        <LayerBadge layer="workflow" />
        <h1
          className="text-2xl font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Workflow
        </h1>
      </div>

      <WorkflowSubNav brandId={brandId} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <IntelCard title="Open tasks" value={openCount} />
        <IntelCard title="In progress" value={inProgressCount} />
        <IntelCard title="Completed" value={doneCount} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <Link
          href={`/brands/${brandId}/workflow/tasks`}
          className="px-4 py-2 rounded-md text-sm font-medium text-center"
          style={{
            backgroundColor: "var(--layer-content)",
            color: "#fff",
          }}
        >
          Generate draft
        </Link>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 rounded-md text-sm font-medium text-center"
          style={{
            backgroundColor: "var(--bg-elevated)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
          }}
        >
          New task
        </button>
      </div>

      {total === 0 && (
        <EmptyState message="No tasks yet — create one from a recommendation" />
      )}

      {showCreateModal && (
        <CreateTaskModal
          brandId={brandId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
