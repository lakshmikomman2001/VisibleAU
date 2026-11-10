"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 4 -- the one confirm dialog for an action that can't be undone
 * (deleting a brand). It was a plain div over a scrim: no role, nothing to say what it was, Tab walked out of it
 * into the page behind, and Escape did nothing.
 *
 * - role="alertdialog" and aria-modal, labelled by its title and described by its message.
 * - Focus moves to Cancel when it opens (the safe choice for something that can't be undone), Tab and
 *   Shift+Tab stay inside it, and Escape is Cancel.
 * - When it closes, focus goes back to whatever had it before (the button that opened it).
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  busy = false,
  destructive = false,
}: {
  title: string;
  /** What will happen, and anything that went wrong (role="alert" inside, as the page sets it). */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  destructive?: boolean;
}) {
  const titleId = useId();
  const messageId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      const panel = panelRef.current;
      if (!panel) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCancelRef.current();
        return;
      }
      if (e.key !== "Tab") return;
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
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--overlay-scrim)" }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="w-full rounded-lg p-6"
        style={{
          maxWidth: 420,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
        <h2
          id={titleId}
          className="mb-2 text-base font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h2>
        <div id={messageId} className="mb-6 text-[13px]" style={{ color: "var(--text-secondary)" }}>
          {children}
        </div>
        <div className="flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="h-8 rounded-md px-3 text-[13px] font-medium focus-visible:outline focus-visible:outline-2"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="h-8 rounded-md px-3 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 disabled:opacity-50"
            style={
              destructive
                ? { background: "var(--danger)", color: "var(--danger-fg)", border: "none" }
                : {
                    background: "var(--accent-primary)",
                    color: "var(--accent-primary-fg)",
                    border: "none",
                  }
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
