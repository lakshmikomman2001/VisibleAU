"use client";

import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { SidebarContent } from "@/components/domain/app-sidebar";
import { ThemeToggle } from "@/components/shared/theme-toggle";

/** The drawer's id, for the menu button's aria-controls. */
export const MAIN_MENU_ID = "main-menu";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  orgName: string;
  orgTier: string;
  userName: string;
}

/**
 * Below 1024px the sidebar is this drawer: the same contents, sliding in
 * from the left over a scrim. A modal dialog -- focus moves to the first
 * link on open and stays inside until it closes (Esc, a tap on the scrim,
 * the close button, any nav link, any route change). The app shell
 * (components/domain/app-shell.tsx) returns focus to the menu button and
 * stops the page behind from scrolling.
 */
export function MobileNavDrawer({
  open,
  onClose,
  orgName,
  orgTier,
  userName,
}: MobileNavDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Any route change closes it (a tap on the current page's own link is
  // handled by SidebarContent's onNavigate).
  const lastPathname = useRef(pathname);
  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    onCloseRef.current();
  }, [pathname]);

  // Focus the first link on open; Esc closes; Tab and Shift+Tab stay inside.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("a[href]")?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // An open menu inside the drawer (the account menu) takes Esc
        // first and closes just itself. React listens on the document
        // too, so its stopPropagation can't keep this handler out --
        // hence the check, not the propagation.
        const target = e.target instanceof Element ? e.target : null;
        if (e.defaultPrevented || target?.closest('[role="menu"]')) return;
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="lg:hidden">
      {open && (
        // The scrim: a tap anywhere outside the drawer closes it. Not in the
        // tab order -- the close button inside the drawer is the keyboard way out.
        // z-50 like the cookie banner, and later in the page, so it covers that too.
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close menu"
          data-testid="main-menu-scrim"
          onClick={onClose}
          className="fixed inset-0 z-50 cursor-default"
          style={{ background: "var(--overlay-scrim)", border: "none" }}
        />
      )}
      <div
        ref={panelRef}
        id={MAIN_MENU_ID}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        className="fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden transition-[transform,visibility] duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: "min(85vw, 320px)",
          background: "var(--bg-subtle)",
          borderRight: "1px solid var(--border-default)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          visibility: open ? "visible" : "hidden",
        }}
      >
        <SidebarContent
          orgName={orgName}
          orgTier={orgTier}
          userName={userName}
          onNavigate={onClose}
          headerAction={
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="flex items-center justify-center rounded-md"
              style={{
                width: 44,
                height: 44,
                marginRight: -10,
                color: "var(--text-secondary)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              <X style={{ width: 20, height: 20 }} />
            </button>
          }
          footerExtra={
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 12,
                color: "var(--text-secondary)",
              }}
            >
              Theme
              <ThemeToggle />
            </div>
          }
        />
      </div>
    </div>
  );
}
