"use client";

import { type ReactNode, useId, useState } from "react";

/**
 * "Record costs from what each provider actually reports" (6 Nov), item 4 -- a cost in A$, the
 * figure people read, with the provider's own US$ usage as its detail. The figure is a real button,
 * so a keyboard reaches it and a tap shows the detail, and the detail is its accessible description
 * (aria-describedby) -- never only a hover title, which phones, keyboards and screen readers never
 * see. Hover and keyboard focus show it too; Escape, or leaving the figure, hides it.
 *
 * The detail opens inline, just after the figure, rather than floating over the page: at rest it
 * takes no space (display: none -- still the button's description), and open it wraps with the
 * line, so it can't push a phone's page sideways.
 */
export function ProviderUsageCost({
  children,
  detail,
  className,
}: {
  children: ReactNode;
  /** e.g. "Provider usage: US$0.47". */
  detail: string;
  className?: string;
}) {
  const detailId = useId();
  const [open, setOpen] = useState(false);
  return (
    <span>
      <button
        type="button"
        aria-describedby={detailId}
        data-provider-usage-cost=""
        onClick={() => setOpen((shown) => !shown)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className={`peer cursor-help underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 ${className ?? ""}`}
      >
        {children}
      </button>
      <span
        id={detailId}
        role="tooltip"
        data-open={open ? "" : undefined}
        className="ml-1 hidden rounded-md px-1.5 py-0.5 align-middle text-xs font-normal peer-hover:inline peer-focus-visible:inline data-[open]:inline"
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          color: "var(--text-primary)",
        }}
      >
        {detail}
      </span>
    </span>
  );
}
