"use client";

import { useCallback } from "react";
import { LoadError } from "@/components/shared/load-error";
import { useLoad } from "@/lib/hooks/use-load";
import { fetchJson } from "@/lib/load/fetch-json";

interface PromptPreviewProps {
  packId: string;
  brandName: string;
  primaryRegion: string;
}

export function PromptPreview({ packId, brandName, primaryRegion }: PromptPreviewProps) {
  // Follow-ups from af8de42..d1eb5a1, part 1: a failed fetch read the error body (no expandedPrompts) or was
  // logged to the console, and the preview vanished as if the pack had no questions. It says so now.
  const load = useCallback(
    async (signal: AbortSignal) => {
      const region = primaryRegion || "NSW:Sydney CBD";
      const params = new URLSearchParams({ preview: "true", brandName, primaryRegion: region });
      const data = await fetchJson<{ expandedPrompts: string[] }>(
        `/api/vertical-packs/${packId}/prompts?${params}`,
        { signal },
      );
      return data.expandedPrompts;
    },
    [packId, brandName, primaryRegion],
  );
  const loaded = useLoad(load, {
    enabled: Boolean(packId && brandName),
    isEmpty: (rows) => rows.length === 0,
  });

  if (!packId || !brandName) return null;

  if (loaded.status === "loading") {
    return (
      <div style={{ marginTop: 12, color: "var(--text-tertiary)", fontSize: 12 }}>
        Loading sample prompts...
      </div>
    );
  }

  if (loaded.status === "error") {
    return (
      <LoadError
        what="the sample prompts"
        detail={loaded.detail}
        onRetry={loaded.retry}
        className="mt-3"
      />
    );
  }

  if (loaded.status === "empty") return null;
  const prompts = loaded.data;

  return (
    <div style={{ marginTop: 12 }}>
      <p
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-tertiary)",
          marginBottom: 8,
        }}
      >
        Sample prompts for this pack
      </p>
      {prompts.map((p) => (
        <p
          key={p}
          style={{
            fontSize: 13,
            fontStyle: "italic",
            color: "var(--text-secondary)",
            margin: "4px 0",
          }}
        >
          &ldquo;{p}&rdquo;
        </p>
      ))}
    </div>
  );
}
