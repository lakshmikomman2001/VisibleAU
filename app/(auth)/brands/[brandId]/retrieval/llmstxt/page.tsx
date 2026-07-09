"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { LlmstxtViewer } from "@/components/domain/retrieval/llmstxt-viewer";

interface LlmstxtVersion {
  id: string;
  content: string;
  depthScore: number | null;
  isCurrent: boolean;
  hostedUrl: string | null;
  generatedAt: string;
}

export default function LlmstxtPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [current, setCurrent] = useState<LlmstxtVersion | null>(null);
  const [history, setHistory] = useState<LlmstxtVersion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/brands/${brandId}/llmstxt`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setCurrent(data.current);
          setHistory(data.history);
        }
      })
      .finally(() => setLoading(false));
  }, [brandId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <div className="h-48 animate-pulse rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="retrieval" />
      <LlmstxtViewer
        current={current}
        history={history}
        brandId={brandId}
        onRefresh={load}
      />
    </div>
  );
}
