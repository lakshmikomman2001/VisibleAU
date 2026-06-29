"use client";

import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  message: string;
  action?: ReactNode;
}

export function EmptyState({ icon, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      {icon && (
        <div
          className="mb-3"
          style={{ color: "var(--text-tertiary)" }}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <p
        className="text-sm text-center mb-4"
        style={{ color: "var(--text-secondary)" }}
      >
        {message}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
}
