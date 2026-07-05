"use client";

import type { ReportStatus } from "@/lib/communication/types";

interface ReportStatusBadgeProps {
  status: ReportStatus;
}

const STATUS_CONFIG: Record<
  ReportStatus,
  { label: string; bg: string; fg: string }
> = {
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
    bg: `color-mix(in srgb, var(--layer-comm) 19%, transparent)`,
    fg: "var(--layer-comm)",
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
