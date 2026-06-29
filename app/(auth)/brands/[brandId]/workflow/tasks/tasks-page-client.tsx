"use client";

import { SectionHeader } from "@/components/phase2/section-header";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { TaskKanban } from "@/components/domain/workflow/task-kanban";
import { WorkflowSubNav } from "@/components/domain/workflow/workflow-sub-nav";

interface Task {
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
}

interface TasksPageClientProps {
  brandId: string;
  tasks: Task[];
}

export function TasksPageClient({ brandId, tasks }: TasksPageClientProps) {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div className="flex items-center gap-3 mb-6">
        <LayerBadge layer="workflow" />
        <h1
          className="text-2xl font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Remediation Tasks
        </h1>
      </div>

      <WorkflowSubNav brandId={brandId} />

      <TaskKanban tasks={tasks} brandId={brandId} />
    </div>
  );
}
