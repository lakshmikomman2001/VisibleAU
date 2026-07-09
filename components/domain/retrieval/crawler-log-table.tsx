"use client";

interface CrawlerLog {
  id: string;
  crawlerName: string | null;
  crawlerTier: string | null;
  visitedUrl: string;
  statusCode: number | null;
  isActiveAgent: boolean | null;
  visitPurpose: string | null;
  visitedAt: string;
}

interface CrawlerLogTableProps {
  logs: CrawlerLog[];
}

const TIER_COLORS: Record<string, string> = {
  must_allow: "var(--success)",
  emerging: "var(--warning)",
  data: "var(--muted)",
};

export function CrawlerLogTable({ logs }: CrawlerLogTableProps) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: "var(--muted)" }}>
        No crawler visits recorded yet. Install the tracking snippet to start collecting data.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 5%, transparent)" }}>
            <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--muted)" }}>Crawler</th>
            <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--muted)" }}>Tier</th>
            <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--muted)" }}>URL</th>
            <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--muted)" }}>Status</th>
            <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--muted)" }}>Purpose</th>
            <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--muted)" }}>Time</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-t" style={{ borderColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}>
              <td className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>
                {log.crawlerName ?? "Unknown"}
                {log.isActiveAgent && <span className="ml-1 text-xs" style={{ color: "var(--success)" }}>(Active)</span>}
              </td>
              <td className="px-3 py-2">
                <span className="text-xs font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${TIER_COLORS[log.crawlerTier ?? "data"]} 15%, transparent)`, color: TIER_COLORS[log.crawlerTier ?? "data"] }}>
                  {log.crawlerTier ?? "unknown"}
                </span>
              </td>
              <td className="px-3 py-2 max-w-[200px] truncate" style={{ color: "var(--foreground)" }}>{log.visitedUrl}</td>
              <td className="px-3 py-2" style={{ color: log.statusCode === 200 ? "var(--success)" : "var(--destructive)" }}>{log.statusCode ?? "—"}</td>
              <td className="px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>{log.visitPurpose ?? "—"}</td>
              <td className="px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>{new Date(log.visitedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
