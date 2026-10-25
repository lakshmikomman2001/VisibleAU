"use client";

import {
  Activity,
  Bell,
  BookOpen,
  Boxes,
  Briefcase,
  Building2,
  FileClock,
  Globe,
  ListChecks,
  MoreHorizontal,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppLogo } from "@/components/domain/app-logo";
import { signOut } from "@/lib/auth/client";

interface AppSidebarProps {
  orgName?: string;
  orgTier?: string;
  userName?: string;
}

interface SidebarContentProps extends AppSidebarProps {
  /** Called when any nav link is followed -- the phone drawer closes on
   * it, including a tap on the current page's own link. */
  onNavigate?: () => void;
  /** Next to the logo: the phone drawer's close button. */
  headerAction?: React.ReactNode;
  /** Under the user card: the phone drawer's theme toggle (the phone top
   * bar has no room for it at 320px). */
  footerExtra?: React.ReactNode;
}

const WORKSPACE_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: Activity },
  { href: "/brands", label: "Brands", icon: Building2 },
  { href: "/verticals", label: "Vertical packs", icon: BookOpen },
  { href: "/action-center", label: "Action Center", icon: Sparkles, tourId: "action-center" },
  { href: "/methods", label: "Methodology", icon: ListChecks },
  { href: "/drift-alerts", label: "Drift Alerts", icon: Bell },
];

const ACCOUNT_ITEMS = [
  { href: "/settings/team", label: "Team", icon: Users },
  { href: "/settings/audit-trail", label: "Audit Trail", icon: FileClock },
  { href: "/settings/data-residency", label: "Data residency", icon: Globe },
  { href: "/settings/webhooks", label: "Webhooks", icon: Settings },
  { href: "/settings/billing", label: "View plans", icon: Boxes },
];

const AGENCY_TIERS = ["agency", "agency_pro", "enterprise"];

/** The desktop sidebar (1024px and wider). Below that it's the phone drawer
 * (components/domain/mobile-nav-drawer.tsx), with the same contents. */
export function AppSidebar(props: AppSidebarProps) {
  return (
    <aside
      className="hidden lg:flex w-56 flex-col"
      data-tour="sidebar"
      style={{ background: "var(--bg-subtle)", borderRight: "1px solid var(--border-default)" }}
    >
      <SidebarContent {...props} />
    </aside>
  );
}

/** Logo, org card, Workspace and Account nav, user card -- shared by the
 * desktop sidebar and the phone drawer. */
export function SidebarContent({
  orgName = "VisibleAU",
  orgTier = "free",
  userName = "",
  onNavigate,
  headerAction,
  footerExtra,
}: SidebarContentProps) {
  const pathname = usePathname();
  const isAgency = AGENCY_TIERS.includes(orgTier);
  const orgInitials = orgName.slice(0, 2).toUpperCase();
  const nameParts = userName.trim().split(/\s+/);
  const userInitials =
    nameParts.length >= 2
      ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
      : userName.trim().slice(0, 2).toUpperCase() || "??";

  function isActive(href: string) {
    return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  }

  return (
    <>
      {/* FIX 1: Logo */}
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <AppLogo />
          {headerAction}
        </div>
      </div>

      {/* FIX 2: Org switcher card */}
      <div
        style={{
          margin: "12px 12px 0",
          padding: "8px 10px",
          borderRadius: 6,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            flexShrink: 0,
            background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            color: "#fff",
          }}
        >
          {orgInitials}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {orgName}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
            {orgTier.charAt(0).toUpperCase() + orgTier.slice(1)} · AU
          </div>
        </div>
      </div>

      {/* FIX 3: Nav with section labels */}
      <nav className="flex-1" style={{ padding: "12px 8px" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-tertiary)",
            padding: "4px 12px",
          }}
        >
          Workspace
        </div>
        {WORKSPACE_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              {...("tourId" in item && item.tourId ? { "data-tour": item.tourId } : {})}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 12px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                marginTop: 2,
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                background: active ? "var(--bg-elevated)" : "transparent",
                border: active ? "1px solid var(--border-default)" : "1px solid transparent",
                textDecoration: "none",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = "transparent";
              }}
            >
              <item.icon style={{ width: 14, height: 14, flexShrink: 0 }} />
              {item.label}
            </Link>
          );
        })}

        {isAgency &&
          (() => {
            const active = pathname === "/agency" || pathname.startsWith("/agency/");
            return (
              <Link
                href="/agency"
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 12px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: active ? 500 : 400,
                  marginTop: 2,
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  background: active ? "var(--bg-elevated)" : "transparent",
                  border: active ? "1px solid var(--border-default)" : "1px solid transparent",
                  textDecoration: "none",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                <Briefcase style={{ width: 14, height: 14, flexShrink: 0 }} />
                Agency Dashboard
              </Link>
            );
          })()}

        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-tertiary)",
            padding: "16px 12px 4px",
          }}
        >
          Account
        </div>
        {ACCOUNT_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              {...("tourId" in item && item.tourId ? { "data-tour": item.tourId } : {})}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 12px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                marginTop: 2,
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                background: active ? "var(--bg-elevated)" : "transparent",
                border: active ? "1px solid var(--border-default)" : "1px solid transparent",
                textDecoration: "none",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = "transparent";
              }}
            >
              <item.icon style={{ width: 14, height: 14, flexShrink: 0 }} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* FIX 4: User footer card */}
      <div style={{ padding: 12, borderTop: "1px solid var(--border-subtle)" }}>
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 6,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              flexShrink: 0,
              background: "linear-gradient(135deg, #f97316, #ec4899)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 600,
              color: "#fff",
            }}
          >
            {userInitials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {userName || "User"}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
              {orgTier.charAt(0).toUpperCase() + orgTier.slice(1)} tier · AU
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              signOut({
                fetchOptions: {
                  onSuccess: () => {
                    window.location.href = "/sign-in";
                  },
                },
              })
            }
            style={{
              color: "var(--text-tertiary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
            }}
            aria-label="Open user menu"
          >
            <MoreHorizontal style={{ width: 14, height: 14 }} />
          </button>
        </div>
        {footerExtra}
      </div>
    </>
  );
}
