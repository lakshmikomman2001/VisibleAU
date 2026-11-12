"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionError } from "@/components/shared/load-error";
import { fetchOrFail, LoadFailure, readJson } from "@/lib/load/fetch-json";

export type SaveStatus = "idle" | "saving" | "saved" | "unchanged" | "error";

/**
 * 12 Nov, part 5 (moved here 13 Nov, part 2, so the brand page's Save says the same): one save's feedback --
 * "Saving…" while it's sent, then "Saved" (or "No change" when the server answers { status: "unchanged" }),
 * or the server's own reason, through the shared fetch helpers (lib/load/fetch-json.ts). A successful save
 * reloads what the page shows (router.refresh) and runs `onSaved`; a failed one leaves what was typed as it
 * is. Used by /admin/settings (components/domain/admin/google-surfaces-admin.tsx) and the brand settings.
 */
export function useSave(
  url: string,
  { method = "POST", onSaved }: { method?: "POST" | "PATCH"; onSaved?: () => void } = {},
) {
  const router = useRouter();
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const save = async (change: Record<string, unknown>): Promise<boolean> => {
    setStatus("saving");
    setError(null);
    try {
      const res = await fetchOrFail(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(change),
      });
      const body = await readJson<{ status?: "saved" | "unchanged" }>(res);
      setStatus(body.status === "unchanged" ? "unchanged" : "saved");
      onSaved?.();
      router.refresh();
      return true;
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof LoadFailure && err.detail
          ? err.detail
          : "The change couldn't be saved. Check your connection and try again.",
      );
      return false;
    }
  };
  /** Typing again clears the last "Saved" / error. */
  const reset = () => {
    if (status !== "saving") {
      setStatus("idle");
      setError(null);
    }
  };
  return { status, error, saving: status === "saving", save, reset };
}

export function SaveFeedback({ status, error }: { status: SaveStatus; error: string | null }) {
  if (status === "saving") {
    return (
      <span role="status" className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        Saving…
      </span>
    );
  }
  if (status === "saved" || status === "unchanged") {
    return (
      <span role="status" className="text-[12px]" style={{ color: "var(--success)" }}>
        {status === "saved" ? "Saved" : "No change: that was already the value"}
      </span>
    );
  }
  return <ActionError message={status === "error" ? error : null} />;
}
