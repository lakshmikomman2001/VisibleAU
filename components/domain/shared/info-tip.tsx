"use client";

import { Info } from "lucide-react";
import { useId, useState } from "react";

/**
 * Overview (7 Nov): a card's "how this is counted" note. The same rules the cost figure's provider-usage
 * detail had (removed 13 Nov, part 14): a real button, so a keyboard reaches it and a tap opens it, with the note
 * as its accessible description (aria-describedby) -- never only a hover title, which phones, keyboards
 * and screen readers never see. Hover and focus show it too; Escape, or leaving the button, hides it.
 *
 * The note is a following sibling (for the peer-* rules) that takes a whole line of a wrapping flex row
 * (order-last basis-full), so it opens under the card's label rather than floating over the page.
 */
export function InfoTip({ label, note }: { label: string; note: string }) {
  const noteId = useId();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-describedby={noteId}
        aria-expanded={open}
        data-info-tip=""
        onClick={() => setOpen((shown) => !shown)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="peer inline-flex items-center justify-center rounded-sm cursor-help focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          width: 24,
          height: 24,
          margin: -5,
          border: "none",
          background: "transparent",
          color: "var(--text-tertiary)",
        }}
      >
        <Info aria-hidden="true" style={{ width: 13, height: 13 }} />
      </button>
      <span
        id={noteId}
        role="tooltip"
        data-open={open ? "" : undefined}
        className="order-last basis-full hidden rounded-md px-2 py-1.5 text-xs font-normal peer-hover:block peer-focus-visible:block data-[open]:block"
        style={{
          marginTop: 6,
          backgroundColor: "var(--bg-base)",
          border: "1px solid var(--border-default)",
          color: "var(--text-primary)",
          lineHeight: 1.45,
        }}
      >
        {note}
      </span>
    </>
  );
}
