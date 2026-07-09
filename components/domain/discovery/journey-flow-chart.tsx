"use client";

interface Turn {
  turn: number;
  prompt: string;
  intent?: string;
}

interface JourneyFlowChartProps {
  turns: Turn[];
  brandName?: string;
}

export function JourneyFlowChart({ turns, brandName }: JourneyFlowChartProps) {
  return (
    <div className="flex flex-col gap-2">
      {turns.map((t, i) => (
        <div key={t.turn} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{
                backgroundColor: "color-mix(in srgb, var(--layer-discovery) 18%, transparent)",
                color: "var(--layer-discovery)",
              }}
            >
              {t.turn}
            </div>
            {i < turns.length - 1 && (
              <div className="w-px grow" style={{ backgroundColor: "var(--border-default)", minHeight: 16 }} />
            )}
          </div>
          <div className="min-w-0 flex-1 pb-3">
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              {brandName ? t.prompt.replace(/\{brandName\}/g, brandName) : t.prompt}
            </p>
            {t.intent && (
              <span
                className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--layer-discovery) 10%, transparent)",
                  color: "var(--text-secondary)",
                }}
              >
                {t.intent}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
