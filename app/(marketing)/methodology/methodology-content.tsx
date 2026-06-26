"use client";

import { useState } from "react";
import type { CitabilityMethod } from "@/lib/methodology/methods";

export function MethodologyContent({
  remaining,
  total,
}: {
  remaining: CitabilityMethod[];
  total: number;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        {isOpen ? "Hide" : `Show all ${total} methods`}
        <span>{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="space-y-4 mt-4">
          {remaining.map((m) => (
            <div key={m.id} className="rounded-xl border p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{m.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {m.description}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-block rounded-full bg-primary/10 text-primary text-sm font-semibold px-3 py-1">
                    {m.effectSizeDelta}
                  </span>
                </div>
              </div>
              <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
                <span className="rounded bg-muted px-2 py-0.5">
                  {m.dimension}
                </span>
                <span className="rounded bg-muted px-2 py-0.5">
                  Effort: {m.effort}
                </span>
                <span className="rounded bg-muted px-2 py-0.5">
                  {m.citationUrl ? (
                    <a
                      href={m.citationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {m.citation}
                    </a>
                  ) : (
                    m.citation
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
