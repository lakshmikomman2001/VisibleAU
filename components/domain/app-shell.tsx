"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppSidebar } from "@/components/domain/app-sidebar";
import { AppTopbar } from "@/components/domain/app-topbar";
import { MobileNavDrawer } from "@/components/domain/mobile-nav-drawer";
import type { BrandUsage } from "@/lib/brands/limits";

interface AppShellProps {
  orgName: string;
  orgTier: string;
  userName: string;
  /** The workspace's brands against its plan: every "New brand" entry reads it. */
  brandUsage: BrandUsage;
  children: React.ReactNode;
}

/**
 * Every signed-in page's frame. From 1024px (Tailwind lg) up: the sidebar
 * and top bar as before. Below that the sidebar is hidden, the top bar
 * carries a menu button, and the sidebar's contents open as a drawer
 * (components/domain/mobile-nav-drawer.tsx). While the drawer is open the
 * page behind doesn't scroll; when it closes, focus goes back to the menu
 * button. `data-app-shell` lets the cookie banner, outside this frame, start
 * where the sidebar ends (app/globals.css).
 */
export function AppShell({ orgName, orgTier, userName, brandUsage, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (wasOpen.current && !menuOpen) menuButtonRef.current?.focus();
    wasOpen.current = menuOpen;
  }, [menuOpen]);

  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    // h-dvh: the visible height (on a phone, 100vh runs under the browser's own bars).
    <div
      data-app-shell
      className="flex h-dvh overflow-hidden"
      style={{ background: "var(--bg-base)" }}
    >
      <AppSidebar orgName={orgName} orgTier={orgTier} userName={userName} />
      <div className="flex-1 flex flex-col min-w-0">
        <AppTopbar
          orgTier={orgTier}
          brandUsage={brandUsage}
          menuOpen={menuOpen}
          onOpenMenu={openMenu}
          menuButtonRef={menuButtonRef}
        />
        <main
          data-app-main
          className="flex-1"
          style={{ background: "var(--bg-base)", overflowY: menuOpen ? "hidden" : "auto" }}
        >
          {children}
        </main>
      </div>
      <MobileNavDrawer
        open={menuOpen}
        onClose={closeMenu}
        orgName={orgName}
        orgTier={orgTier}
        userName={userName}
        brandUsage={brandUsage}
      />
    </div>
  );
}
