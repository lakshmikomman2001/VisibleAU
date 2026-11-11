"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { pageNavigation, useRetriedNavigation, useSafePoll } from "@/lib/hooks/use-safe-poll";

/**
 * Google AI surfaces, Phase 1, part 3 -- while an audit's Google answers are still coming in (the four
 * engines are done; Google takes 0.1-2 minutes in the standard queue, at most 15), polls the block's status
 * and reloads the page when it's complete. Says so if it falls behind or stops.
 */
export function GoogleSurfacesRefresher({ auditId }: { auditId: string }) {
  const router = useRouter();
  const [complete, setComplete] = useState(false);
  const poll = useCallback(
    async (signal: AbortSignal): Promise<{ status: string } | null> => {
      try {
        const res = await fetch(`/api/audits/${auditId}/google-surfaces`, {
          cache: "no-store",
          signal,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { status?: unknown };
        if (typeof data?.status !== "string") return null;
        if (data.status === "complete") setComplete(true);
        return { status: data.status };
      } catch {
        return null;
      }
    },
    [auditId],
  );
  const { behind, timedOut } = useSafePoll({
    enabled: !complete,
    poll,
    firstDelayMs: 15_000,
    intervalMs: 15_000,
    maxWaitMs: 20 * 60_000,
  });
  useRetriedNavigation(complete, {
    attempt: () => router.refresh(),
    fallback: () => pageNavigation.reload(),
  });
  if (timedOut) {
    return (
      <p className="text-[12px]" style={{ color: "var(--text-secondary)" }} data-google-refresh="">
        Google is taking longer than usual. Reload the page to see what's come back.
      </p>
    );
  }
  return (
    <p className="text-[12px]" style={{ color: "var(--text-secondary)" }} data-google-refresh="">
      {behind
        ? "Still checking Google · this will update when done"
        : "This updates when Google is done."}
    </p>
  );
}
