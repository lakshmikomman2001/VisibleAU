"use client";

import type { ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  action?: ReactNode;
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2
        className="text-lg font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </h2>
      {action && <div>{action}</div>}
    </div>
  );
}
