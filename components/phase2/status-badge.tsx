"use client";

type TaskStatus = "open" | "in_progress" | "ready_for_review" | "complete" | "wont_fix";
type WorkflowStatus = "scheduled" | "running" | "completed" | "failed";
type DraftStatus = "draft" | "pending" | "approved" | "published" | "rejected";

type Status = TaskStatus | WorkflowStatus | DraftStatus;

interface StatusBadgeProps {
  status: Status;
}

const STATUS_CONFIG: Record<Status, { label: string; bg: string; fg: string }> = {
  open: { label: "Open", bg: "var(--info-soft)", fg: "var(--info)" },
  in_progress: { label: "In Progress", bg: "var(--warning-soft)", fg: "var(--warning)" },
  ready_for_review: { label: "Review", bg: "var(--accent-blue-soft)", fg: "var(--accent-blue)" },
  complete: { label: "Done", bg: "var(--success-soft)", fg: "var(--success)" },
  wont_fix: { label: "Won't Fix", bg: "var(--danger-soft)", fg: "var(--danger)" },
  scheduled: { label: "Scheduled", bg: "var(--info-soft)", fg: "var(--info)" },
  running: { label: "Running", bg: "var(--warning-soft)", fg: "var(--warning)" },
  completed: { label: "Completed", bg: "var(--success-soft)", fg: "var(--success)" },
  failed: { label: "Failed", bg: "var(--danger-soft)", fg: "var(--danger)" },
  draft: { label: "Draft", bg: "var(--info-soft)", fg: "var(--info)" },
  pending: { label: "Generating…", bg: "var(--warning-soft)", fg: "var(--warning)" },
  approved: { label: "Approved", bg: "var(--success-soft)", fg: "var(--success)" },
  published: { label: "Published", bg: "var(--success-soft)", fg: "var(--success)" },
  rejected: { label: "Rejected", bg: "var(--danger-soft)", fg: "var(--danger)" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: config.bg,
        color: config.fg,
      }}
    >
      {config.label}
    </span>
  );
}
