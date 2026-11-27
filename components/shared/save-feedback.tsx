"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ActionError } from "@/components/shared/load-error";
import { fetchOrFail, LoadFailure, readJson } from "@/lib/load/fetch-json";

export type SaveStatus = "idle" | "saving" | "saved" | "unchanged" | "questions_kept" | "error";

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
  // 19 Nov (Sri's review of /admin/settings): one save at a time. The controls are disabled while `saving`, but two
  // clicks before React re-renders both got through; a save already on its way makes the next one a no-op.
  const inFlight = useRef(false);
  const save = async (change: Record<string, unknown>): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setStatus("saving");
    setError(null);
    try {
      const res = await fetchOrFail(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(change),
      });
      const body = await readJson<{ status?: "saved" | "unchanged" | "questions_kept" }>(res);
      // S04 part 0a: "questions_kept" -- the brand's details changed, but a person had applied its questions, so they
      // stayed and the new ones arrived as suggestions (PATCH /api/brands/:id; LLD amendment 84).
      setStatus(
        body.status === "unchanged"
          ? "unchanged"
          : body.status === "questions_kept"
            ? "questions_kept"
            : "saved",
      );
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
    } finally {
      inFlight.current = false;
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

/** S04 part 0a (LLD amendment 84): what brand settings says when a save kept the questions a person applied. */
export function QuestionsKeptStatus({ questionsHref }: { questionsHref: string }) {
  return (
    <span
      role="status"
      data-testid="questions-kept-status"
      className="text-[12px]"
      style={{ color: "var(--success)" }}
    >
      Saved. Your questions didn't change:{" "}
      <Link
        href={questionsHref}
        style={{ color: "var(--accent-blue)", textDecoration: "underline", textUnderlineOffset: 2 }}
      >
        review the new suggestions in Questions
      </Link>
      .
    </span>
  );
}

export function SaveFeedback({
  status,
  error,
  questionsHref,
}: {
  status: SaveStatus;
  error: string | null;
  /** S04 part 0a: the brand's Questions page, linked when a save kept its questions ("questions_kept"). */
  questionsHref?: string;
}) {
  if (status === "questions_kept") {
    return questionsHref ? (
      <QuestionsKeptStatus questionsHref={questionsHref} />
    ) : (
      <span role="status" className="text-[12px]" style={{ color: "var(--success)" }}>
        Saved. Your questions didn't change: review the new suggestions in Questions.
      </span>
    );
  }
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
