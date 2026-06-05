"use client";

import { Bell, ChevronRight, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Fragment } from "react";
import { ThemeToggle } from "@/components/shared/theme-toggle";

interface AppTopbarProps {
  breadcrumbs?: string[];
  actions?: React.ReactNode;
}

function breadcrumbsForPath(pathname: string): string[] {
  if (pathname === "/dashboard") return ["Workspace", "Overview"];
  if (pathname === "/brands/wizard" || pathname === "/brands/new")
    return ["Workspace", "Brands", "New Brand"];
  if (pathname === "/brands") return ["Workspace", "Brands"];
  if (pathname.startsWith("/brands/")) return ["Workspace", "Brands", "Detail"];
  if (pathname === "/audits/compare") return ["Workspace", "Audits", "Compare"];
  if (pathname === "/audits") return ["Workspace", "Audits"];
  if (pathname.startsWith("/audits/")) return ["Workspace", "Audits", "Detail"];
  if (pathname === "/portfolio") return ["Workspace", "Portfolio"];
  if (pathname === "/verticals") return ["Workspace", "Vertical packs"];
  if (pathname.startsWith("/verticals/")) return ["Workspace", "Vertical packs", "Detail"];
  if (pathname === "/action-center") return ["Workspace", "Action Center"];
  if (pathname.startsWith("/action-center/")) return ["Workspace", "Action Center", "Detail"];
  if (pathname === "/settings/billing") return ["Account", "Billing"];
  return ["Workspace"];
}

export function AppTopbar({ breadcrumbs, actions }: AppTopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const crumbs = breadcrumbs ?? breadcrumbsForPath(pathname);

  const showNewBrand = pathname === "/dashboard" || pathname === "/brands";
  const defaultAction = showNewBrand ? (
    <button
      type="button"
      onClick={() => router.push("/brands/wizard")}
      style={{
        height: 32,
        padding: "0 12px",
        borderRadius: 6,
        background: "var(--accent-primary)",
        color: "var(--accent-primary-fg)",
        border: "none",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 500,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <Plus style={{ width: 14, height: 14 }} /> New brand
    </button>
  ) : null;

  const resolvedActions = actions ?? defaultAction;

  return (
    <header
      className="flex items-center justify-between px-6"
      style={{
        height: 48,
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--bg-base)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {crumbs.map((bc, i) => (
          <Fragment key={bc}>
            {i > 0 && (
              <ChevronRight style={{ width: 14, height: 14, color: "var(--text-tertiary)" }} />
            )}
            <span
              style={{
                color: i === crumbs.length - 1 ? "var(--text-primary)" : "var(--text-tertiary)",
                fontWeight: i === crumbs.length - 1 ? 500 : 400,
                fontSize: 14,
              }}
            >
              {bc}
            </span>
          </Fragment>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {resolvedActions}
        {resolvedActions && (
          <div
            style={{ height: 20, width: 1, background: "var(--border-default)", margin: "0 4px" }}
          />
        )}
        <button
          type="button"
          className="flex items-center justify-center rounded-md"
          style={{
            width: 32,
            height: 32,
            color: "var(--text-secondary)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
          aria-label="Notifications"
        >
          <Bell style={{ width: 16, height: 16 }} />
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
