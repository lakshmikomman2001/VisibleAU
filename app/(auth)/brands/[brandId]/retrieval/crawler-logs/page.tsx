"use client";

import { useParams } from "next/navigation";
import { useCallback } from "react";
import { CdnBlockAlert } from "@/components/domain/retrieval/cdn-block-alert";
import { CrawlerLogTable } from "@/components/domain/retrieval/crawler-log-table";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { LoadError } from "@/components/shared/load-error";
import { useLoad } from "@/lib/hooks/use-load";
import { fetchJson } from "@/lib/load/fetch-json";

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
  // Follow-ups from af8de42..d1eb5a1, part 1: a failed fetch was `null`, so the page showed no visits, and
  // no CDN block alert -- as if nothing blocked AI crawlers. It says it couldn't load now, with Try again.
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [logData, cdnDiag] = await Promise.all([
        fetchJson<{ logs: CrawlerLog[] }>(`/api/brands/${brandId}/crawler-logs?limit=100`, {
          signal,
        }),
        fetchJson<CdnDiagnostic>(`/api/brands/${brandId}/cdn-shield`, { signal }),
      ]);
      return { logs: logData.logs, cdnDiag };
    },
    [brandId],
  );
  const loaded = useLoad(load);

  if (loaded.status === "error") {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Crawler Visit Logs
        </h1>
        <LoadError what="your crawler visit logs" detail={loaded.detail} onRetry={loaded.retry} />
      </div>
    );
  }

  if (loaded.status === "loading") {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <div
          className="h-48 animate-pulse rounded-lg"
          style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
        />
      </div>
    );
  }

  const { logs, cdnDiag } = loaded.data;

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="retrieval" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
        Crawler Visit Logs
      </h1>

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
