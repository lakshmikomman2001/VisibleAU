"use client";

import { Bell, ChevronRight, Menu, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, type RefObject } from "react";
import { WorkspaceSwitcher } from "@/components/domain/agency/workspace-switcher";
import { AppLogo } from "@/components/domain/app-logo";
import { useOverrideBreadcrumbs } from "@/components/domain/breadcrumb-context";
import { MAIN_MENU_ID } from "@/components/domain/mobile-nav-drawer";
import { ThemeToggle } from "@/components/shared/theme-toggle";

interface AppTopbarProps {
  breadcrumbs?: string[];
  actions?: React.ReactNode;
  orgTier?: string;
  /** Below 1024px: whether the phone drawer is open, and how to open it. */
  menuOpen?: boolean;
  onOpenMenu?: () => void;
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
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
  if (pathname === "/agency" || pathname.startsWith("/agency/")) return ["Workspace", "Agency"];
  if (pathname === "/portfolio") return ["Workspace", "Portfolio"];
  if (pathname === "/verticals") return ["Workspace", "Vertical packs"];
  if (pathname.startsWith("/verticals/")) return ["Workspace", "Vertical packs", "Detail"];
  if (pathname === "/action-center") return ["Workspace", "Action Center"];
  if (pathname.startsWith("/action-center/")) return ["Workspace", "Action Center", "Detail"];
  if (pathname === "/methods") return ["Workspace", "Methodology"];
  if (pathname === "/settings/billing") return ["Settings", "Billing"];
  return ["Workspace"];
}

/**
 * 1024px and wider: breadcrumbs, the page action, the brand switcher, the
 * bell and the theme toggle, as always. Below that: a 56px bar with the
 * menu button, the logo, the brand switcher (truncated) and the bell --
 * the theme toggle moves into the drawer, and the page action (New brand)
 * isn't shown -- with the breadcrumb on its own line underneath.
 */
export function AppTopbar({
  breadcrumbs,
  actions,
  orgTier = "free",
  menuOpen = false,
  onOpenMenu,
  menuButtonRef,
}: AppTopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { overrideCrumbs } = useOverrideBreadcrumbs();
  const crumbs = overrideCrumbs ?? breadcrumbs ?? breadcrumbsForPath(pathname);

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
    <>
      <header
        className="flex items-center gap-1.5 px-4 lg:px-6 h-14 lg:h-12 shrink-0"
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--bg-base)",
        }}
      >
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onOpenMenu}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls={MAIN_MENU_ID}
          className="lg:hidden flex items-center justify-center rounded-md shrink-0"
          style={{
            width: 44,
            height: 44,
            marginLeft: -12,
            color: "var(--text-secondary)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <Menu style={{ width: 20, height: 20 }} />
        </button>
        <div className="lg:hidden shrink-0">
          <AppLogo />
        </div>
        <div className="hidden lg:flex" style={{ alignItems: "center", gap: 6 }}>
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
        <div className="flex-1" />
        <div className="flex items-center min-w-0" style={{ gap: 6 }}>
          {resolvedActions && (
            <div className="hidden lg:flex" style={{ alignItems: "center", gap: 6 }}>
              {resolvedActions}
              <div
                style={{
                  height: 20,
                  width: 1,
                  background: "var(--border-default)",
                  margin: "0 4px",
                }}
              />
            </div>
          )}
          <WorkspaceSwitcher tier={orgTier} />
          <div
            className="hidden lg:block"
            style={{ height: 20, width: 1, background: "var(--border-default)", margin: "0 4px" }}
          />
          <button
            type="button"
            className="flex items-center justify-center rounded-md shrink-0 w-11 h-11 lg:w-8 lg:h-8"
            style={{
              color: "var(--text-secondary)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
            aria-label="Notifications"
          >
            <Bell style={{ width: 16, height: 16 }} />
          </button>
          <div className="hidden lg:block">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <MobileBreadcrumb crumbs={crumbs} />
    </>
  );
}

/**
 * Below 1024px the breadcrumb is one line under the top bar. Anything
 * before the last two parts collapses to "…"; the parent shrinks first
 * and the current page truncates last, so its name always shows. (The
 * parts are labels, not links -- the same as the desktop breadcrumb.)
 */
function MobileBreadcrumb({ crumbs }: { crumbs: string[] }) {
  const shown = crumbs.length > 2 ? ["…", ...crumbs.slice(-2)] : crumbs;
  return (
    <nav
      aria-label="Breadcrumb"
      className="lg:hidden flex items-center px-4 shrink-0 min-w-0"
      style={{
        height: 36,
        gap: 6,
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--bg-base)",
        fontSize: 13,
        whiteSpace: "nowrap",
      }}
    >
      {shown.map((bc, i) => {
        const current = i === shown.length - 1;
        return (
          <Fragment key={bc}>
            {i > 0 && (
              <ChevronRight
                aria-hidden="true"
                style={{ width: 13, height: 13, color: "var(--text-tertiary)", flexShrink: 0 }}
              />
            )}
            <span
              aria-current={current ? "page" : undefined}
              style={{
                color: current ? "var(--text-primary)" : "var(--text-tertiary)",
                fontWeight: current ? 500 : 400,
                minWidth: bc === "…" ? undefined : 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                flexShrink: bc === "…" ? 0 : current ? 1 : 10,
              }}
            >
              {bc}
            </span>
          </Fragment>
        );
      })}
    </nav>
  );
}
