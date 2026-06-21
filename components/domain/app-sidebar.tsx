"use client";

import {
  Activity,
  Bell,
  BookOpen,
  Boxes,
  Building2,
  MoreHorizontal,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth/client";

interface AppSidebarProps {
  orgName?: string;
  orgTier?: string;
  userName?: string;
}

const WORKSPACE_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: Activity },
  { href: "/brands", label: "Brands", icon: Building2 },
  { href: "/verticals", label: "Vertical packs", icon: BookOpen },
  { href: "/action-center", label: "Action Center", icon: Sparkles },
  { href: "/drift-alerts", label: "Drift Alerts", icon: Bell },
];

const ACCOUNT_ITEMS = [
  { href: "/settings/webhooks", label: "Webhooks", icon: Settings },
  { href: "/settings/billing", label: "View plans", icon: Boxes },
];

export function AppSidebar({
  orgName = "VisibleAU",
  orgTier = "free",
  userName = "",
}: AppSidebarProps) {
  const pathname = usePathname();
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
    <aside
      className="w-56 flex flex-col"
      style={{ background: "var(--bg-subtle)", borderRight: "1px solid var(--border-default)" }}
    >
      {/* FIX 1: Logo */}
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 22,
              height: 22,
              background: "var(--accent-primary)",
              color: "var(--accent-primary-fg)",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                fontSize: 13,
                position: "relative",
                zIndex: 1,
              }}
            >
              V
            </span>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(135deg, rgba(255,255,255,0.15), transparent 50%)",
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <span
              style={{
                fontWeight: 600,
                fontSize: 15,
                letterSpacing: "-0.02em",
                color: "var(--text-primary)",
              }}
            >
              visible
            </span>
            <span
              style={{
                fontWeight: 600,
                fontSize: 15,
                letterSpacing: "-0.02em",
                color: "var(--text-tertiary)",
              }}
            >
              au
            </span>
          </div>
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
      </div>
    </aside>
  );
}
