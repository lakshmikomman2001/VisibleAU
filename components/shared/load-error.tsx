"use client";

import { loadFailedMessage } from "@/lib/load/fetch-json";

/** Why a button's action failed (lib/hooks/use-action.ts), or nothing. */
export function ActionError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" data-action-error className="text-sm" style={{ color: "var(--danger)" }}>
      {message}
    </p>
  );
}

/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 1 -- what every page shows when it couldn't load something:
 * "Couldn't load <what>.", the server's reason when it gave one, and Try again. Never an empty state or
 * defaults in its place (lib/hooks/use-load.ts).
 */
export function LoadError({
  what,
  detail = null,
  onRetry,
  className = "",
}: {
  /** What didn't load, as the sentence needs it: "your team", "your brands". */
  what: string;
  /** The server's own reason, when it gave one. */
  detail?: string | null;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      data-load-error
      className={`rounded-lg p-4 text-[13px] ${className}`}
      style={{
        background: "var(--danger-soft)",
        border: "1px solid var(--border-default)",
        color: "var(--text-primary)",
      }}
    >
      <p className="font-medium" style={{ color: "var(--danger)" }}>
        {loadFailedMessage(what)}
      </p>
      {detail && (
        <p className="mt-1" style={{ color: "var(--text-secondary)" }}>
          {detail}
        </p>
      )}
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 h-8 px-3 rounded-md text-[12px] font-medium focus-visible:outline focus-visible:outline-2"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          color: "var(--text-primary)",
        }}
      >
        Try again
      </button>
    </div>
  );
}
