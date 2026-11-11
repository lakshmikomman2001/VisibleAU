"use client";

import type { OrgRole } from "@/lib/governance";

const ROLE_STYLES: Record<OrgRole, { bg: string; text: string; label: string }> = {
  owner: {
    bg: "color-mix(in srgb, var(--layer-governance) 12%, transparent)",
    text: "var(--layer-governance)",
    label: "Owner",
  },
  admin: {
    bg: "var(--accent-blue-soft, rgba(59,130,246,0.12))",
    text: "var(--accent-blue)",
    label: "Admin",
  },
  analyst: {
    bg: "color-mix(in srgb, var(--layer-workflow) 12%, transparent)",
    text: "var(--layer-workflow)",
    label: "Analyst",
  },
  viewer: {
    bg: "var(--bg-hover, rgba(0,0,0,0.06))",
    text: "var(--text-secondary)",
    label: "Viewer",
  },
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
