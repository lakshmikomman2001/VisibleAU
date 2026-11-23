"use client";

import type { ReportStatus } from "@/lib/communication/types";

interface ReportStatusBadgeProps {
  status: ReportStatus;
}

const STATUS_CONFIG: Record<ReportStatus, { label: string; bg: string; fg: string }> = {
  // S01 part 9 (contract P17): an Enhanced report's checks run before its PDF is made.
  running_checks: {
    label: "Running checks…",
    bg: "var(--warning-soft)",
    fg: "var(--warning)",
  },
  generating: {
    label: "Generating…",
    bg: "var(--warning-soft)",
    fg: "var(--warning)",
  },
  ready: {
    label: "Ready",
    bg: "var(--success-soft)",
    fg: "var(--success)",
  },
  published: {
    label: "Published",
    bg: `color-mix(in srgb, var(--layer-communication) 19%, transparent)`,
    fg: "var(--layer-communication)",
  },
  failed: {
    label: "Failed",
    bg: "var(--danger-soft)",
    fg: "var(--danger)",
  },
};

export function ReportStatusBadge({ status }: ReportStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 font-medium"
      style={{
        fontSize: 10,
        backgroundColor: config.bg,
        color: config.fg,
      }}
    >
      {config.label}
    </span>
  );
}
