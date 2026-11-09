"use client";

import { Bell, ChevronRight, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RefObject } from "react";
import { WorkspaceSwitcher } from "@/components/domain/agency/workspace-switcher";
import { AppLogo } from "@/components/domain/app-logo";
import { useOverrideBreadcrumbs } from "@/components/domain/breadcrumb-context";
import { MAIN_MENU_ID } from "@/components/domain/mobile-nav-drawer";
import { NewBrandButton } from "@/components/domain/new-brand-button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import type { BrandUsage } from "@/lib/brands/limits";
import { type Breadcrumbs, breadcrumbsForPath, type Crumb } from "@/lib/navigation/breadcrumbs";

interface AppTopbarProps {
  breadcrumbs?: Breadcrumbs;
  actions?: React.ReactNode;
  orgTier?: string;
  /** The workspace's brands against its plan, for the Overview's "New brand". */
  brandUsage?: BrandUsage;
  /** Below 1024px: whether the phone drawer is open, and how to open it. */
  menuOpen?: boolean;
  onOpenMenu?: () => void;
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
}

/**
 * 1024px and wider: breadcrumbs, the page action, the brand switcher, the
 * bell and the theme toggle, as always. Below that: a 56px bar with the
 * menu button, the logo, the brand switcher (truncated) and the bell --
 * the theme toggle moves into the drawer, and so does "New brand" -- with
 * the breadcrumb on its own line underneath. The Overview's page action is
 * "New brand"; the Brands page has its own in its header.
 */
export function AppTopbar({
  breadcrumbs,
  actions,
  orgTier = "free",
  brandUsage,
  menuOpen = false,
  onOpenMenu,
  menuButtonRef,
}: AppTopbarProps) {
  const pathname = usePathname();
  const { overrideCrumbs } = useOverrideBreadcrumbs();
  const crumbs = overrideCrumbs ?? breadcrumbs ?? breadcrumbsForPath(pathname);

  const defaultAction =
    pathname === "/dashboard" && brandUsage ? (
      <NewBrandButton usage={brandUsage} variant="toolbar" />
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
        <nav aria-label="Breadcrumb" className="hidden lg:block min-w-0">
          <ol
            className="flex items-center"
            style={{ gap: 6, margin: 0, padding: 0, listStyle: "none", fontSize: 14 }}
          >
            {crumbs.map((crumb, i) => (
              <li key={crumbKey(crumb)} className="flex items-center" style={{ gap: 6 }}>
                {i > 0 && <Chevron size={14} />}
                <CrumbPart crumb={crumb} current={i === crumbs.length - 1} />
              </li>
            ))}
          </ol>
        </nav>
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
          <WorkspaceSwitcher tier={orgTier} brandCount={brandUsage?.count} />
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

function crumbKey(crumb: Crumb): string {
  return crumb.href ?? `current:${crumb.label}`;
}

function Chevron({ size }: { size: number }) {
  return (
    <ChevronRight
      aria-hidden="true"
      style={{ width: size, height: size, color: "var(--text-tertiary)", flexShrink: 0 }}
    />
  );
}

/** A parent links to its page; the page you're on is plain text, aria-current="page". */
function CrumbPart({
  crumb,
  current,
  shrink,
}: {
  crumb: Crumb;
  current: boolean;
  /** Below 1024px: how readily it gives up width (the current page truncates last). */
  shrink?: number;
}) {
  const fit = shrink === undefined ? {} : { minWidth: 0, flexShrink: shrink };
  const text = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    ...fit,
  } as const;
  if (current || !crumb.href) {
    return (
      <span
        aria-current={current ? "page" : undefined}
        style={{
          color: current ? "var(--text-primary)" : "var(--text-tertiary)",
          fontWeight: current ? 500 : 400,
          ...text,
        }}
      >
        {crumb.label}
      </span>
    );
  }
  return (
    <Link
      href={crumb.href}
      className="hover:underline focus-visible:underline"
      style={{ color: "var(--text-tertiary)", textDecoration: "none", ...text }}
    >
      {crumb.label}
    </Link>
  );
}

/**
 * Below 1024px the breadcrumb is one line under the top bar. Anything
 * before the last two parts collapses to "…" and is left out (the drawer
 * has every page); the parent still links to its page, shrinks first, and
 * the current page truncates last, so its name always shows.
 */
function MobileBreadcrumb({ crumbs }: { crumbs: Breadcrumbs }) {
  const collapsed = crumbs.length > 2;
  const shown = collapsed ? crumbs.slice(-2) : crumbs;
  return (
    <nav
      aria-label="Breadcrumb"
      className="lg:hidden flex items-center px-4 shrink-0 min-w-0"
      style={{
        height: 36,
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--bg-base)",
        fontSize: 13,
      }}
    >
      <ol
        className="flex items-center min-w-0"
        style={{ gap: 6, margin: 0, padding: 0, listStyle: "none", whiteSpace: "nowrap" }}
      >
        {collapsed && (
          <li aria-hidden="true" className="flex items-center shrink-0" style={{ gap: 6 }}>
            <span style={{ color: "var(--text-tertiary)" }}>…</span>
          </li>
        )}
        {shown.map((crumb, i) => {
          const current = i === shown.length - 1;
          return (
            <li
              key={crumbKey(crumb)}
              className="flex items-center min-w-0"
              style={{ gap: 6, flexShrink: current ? 1 : 10 }}
            >
              {(i > 0 || collapsed) && <Chevron size={13} />}
              <CrumbPart crumb={crumb} current={current} shrink={current ? 1 : 10} />
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
