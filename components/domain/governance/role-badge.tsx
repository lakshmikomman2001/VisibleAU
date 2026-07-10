"use client";

import type { OrgRole } from "@/lib/governance";

const ROLE_STYLES: Record<OrgRole, { bg: string; text: string; label: string }> = {
  owner: { bg: "var(--layer-governance-soft, rgba(168,85,247,0.12))", text: "var(--layer-governance, #a855f7)", label: "Owner" },
  admin: { bg: "var(--accent-blue-soft, rgba(59,130,246,0.12))", text: "var(--accent-blue, #3b82f6)", label: "Admin" },
  analyst: { bg: "var(--layer-workflow-soft, rgba(245,158,11,0.12))", text: "var(--layer-workflow, #f59e0b)", label: "Analyst" },
  viewer: { bg: "var(--bg-hover, rgba(0,0,0,0.06))", text: "var(--text-secondary, #6b7280)", label: "Viewer" },
};

export function RoleBadge({ role }: { role: OrgRole }) {
  const s = ROLE_STYLES[role] ?? ROLE_STYLES.viewer;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-medium"
      style={{ background: s.bg, color: s.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.text }} />
      {s.label}
    </span>
  );
}
