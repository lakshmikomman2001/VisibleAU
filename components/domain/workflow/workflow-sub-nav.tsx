"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface WorkflowSubNavProps {
  brandId: string;
}

const TABS = [
  { key: "tasks", label: "Tasks" },
  { key: "drafts", label: "Drafts" },
] as const;

export function WorkflowSubNav({ brandId }: WorkflowSubNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Workflow sections"
      className="flex gap-0 mb-6"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      {TABS.map((tab) => {
        const href = `/brands/${brandId}/workflow/${tab.key}`;
        const isActive = pathname.endsWith(`/workflow/${tab.key}`);
        return (
          <Link
            key={tab.key}
            href={href}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 500,
              color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
              borderBottom: isActive
                ? "2px solid var(--accent-blue)"
                : "2px solid transparent",
              textDecoration: "none",
              transition: "color 0.15s ease",
              marginBottom: -1,
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
