"use client";

import { useEffect, useRef, useState } from "react";

interface PromptPreviewProps {
  packId: string;
  brandName: string;
  primaryRegion: string;
}

export function PromptPreview({ packId, brandName, primaryRegion }: PromptPreviewProps) {
  const [prompts, setPrompts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!packId || !brandName) return;
    const controller = new AbortController();
    setLoading(true);

    const region = primaryRegion || "NSW:Sydney CBD";
    const params = new URLSearchParams({ preview: "true", brandName, primaryRegion: region });

    fetch(`/api/vertical-packs/${packId}/prompts?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (mountedRef.current) setPrompts(d.expandedPrompts ?? []);
      })
      .catch((e) => {
        if (e.name !== "AbortError") console.error(e);
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });

    return () => controller.abort();
  }, [packId, brandName, primaryRegion]);

  if (loading) {
    return (
      <div style={{ marginTop: 12, color: "var(--text-tertiary)", fontSize: 12 }}>
        Loading sample prompts...
      </div>
    );
  }

  if (!prompts.length) return null;

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
