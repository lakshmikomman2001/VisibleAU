"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { CrawlerLogTable } from "@/components/domain/retrieval/crawler-log-table";
import { CdnBlockAlert } from "@/components/domain/retrieval/cdn-block-alert";

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

interface CdnDiagnostic {
  isBlockedByCDN: boolean;
  detectedFirewall: string;
  remediationSnippet: string;
  brandDomain: string;
}

export default function CrawlerLogsPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [logs, setLogs] = useState<CrawlerLog[]>([]);
  const [cdnDiag, setCdnDiag] = useState<CdnDiagnostic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/brands/${brandId}/crawler-logs?limit=100`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/brands/${brandId}/cdn-shield`).then((r) => r.ok ? r.json() : null),
    ]).then(([logData, cdnData]) => {
      if (logData) setLogs(logData.logs);
      if (cdnData) setCdnDiag(cdnData);
    }).finally(() => setLoading(false));
  }, [brandId]);

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
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Crawler Visit Logs</h1>

      {cdnDiag?.isBlockedByCDN && (
        <CdnBlockAlert
          detectedFirewall={cdnDiag.detectedFirewall}
          remediationSnippet={cdnDiag.remediationSnippet}
          brandDomain={cdnDiag.brandDomain}
        />
      )}

      <CrawlerLogTable logs={logs} />
    </div>
  );
}
