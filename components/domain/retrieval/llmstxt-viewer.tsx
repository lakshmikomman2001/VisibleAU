"use client";

import { useState } from "react";

interface LlmstxtVersion {
  id: string;
  content: string;
  depthScore: number | null;
  isCurrent: boolean;
  hostedUrl: string | null;
  generatedAt: string;
}

interface LlmstxtViewerProps {
  current: LlmstxtVersion | null;
  history: LlmstxtVersion[];
  brandId: string;
  onRefresh: () => void;
}

export function LlmstxtViewer({ current, history, brandId, onRefresh }: LlmstxtViewerProps) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await fetch(`/api/brands/${brandId}/llmstxt/generate`, { method: "POST" });
      onRefresh();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>llms.txt</h3>
          {current && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Depth: {current.depthScore ?? 0}/18 &middot; Last generated: {new Date(current.generatedAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          style={{
            backgroundColor: generating ? "color-mix(in srgb, var(--foreground) 10%, transparent)" : "var(--accent-primary)",
            color: generating ? "var(--muted)" : "var(--accent-primary-fg)",
            cursor: generating ? "not-allowed" : "pointer",
          }}
        >
          {generating ? "Generating..." : "Generate New"}
        </button>
      </div>

      {current ? (
        <pre
          className="rounded-lg p-4 text-sm overflow-x-auto whitespace-pre-wrap"
          style={{
            backgroundColor: "color-mix(in srgb, var(--foreground) 5%, transparent)",
            color: "var(--foreground)",
            fontFamily: "monospace",
          }}
        >
          {current.content}
        </pre>
      ) : (
        <div className="text-center py-8" style={{ color: "var(--muted)" }}>
          No llms.txt generated yet. Click &quot;Generate New&quot; to create one.
        </div>
      )}

      {history.length > 1 && (
        <details>
          <summary className="text-sm cursor-pointer" style={{ color: "var(--muted)" }}>
            Version history ({history.length})
          </summary>
          <div className="mt-2 space-y-2">
            {history.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded p-2 text-sm" style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 3%, transparent)" }}>
                <span style={{ color: "var(--foreground)" }}>
                  {new Date(v.generatedAt).toLocaleDateString()} — Depth {v.depthScore ?? 0}/18
                </span>
                {v.isCurrent && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--success) 15%, transparent)", color: "var(--success)" }}>Current</span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
