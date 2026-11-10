"use client";

import { useCallback, useState } from "react";
import { AuditLogRow } from "@/components/domain/governance/audit-log-row";
import { LoadError } from "@/components/shared/load-error";
import { useLoad } from "@/lib/hooks/use-load";
import { fetchJson } from "@/lib/load/fetch-json";

interface AuditEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string | null; email: string | null } | null;
}

export default function AuditTrailPage() {
  const [page, setPage] = useState(1);

  // Follow-ups from af8de42..d1eb5a1, part 1: a failed /api/auth/me returned as if it had worked, so the page
  // said "No activity yet" having loaded nothing. A failure now says it couldn't load, with Try again.
  const loadEntries = useCallback(
    async (signal: AbortSignal) => {
      const me = await fetchJson<{ organizationId: string }>("/api/auth/me", { signal });
      const data = await fetchJson<{ entries: AuditEntry[] }>(
        `/api/organizations/${me.organizationId}/audit-trail?page=${page}&limit=50`,
        { signal },
      );
      return data.entries;
    },
    [page],
  );
  const loaded = useLoad(loadEntries, { isEmpty: (rows) => rows.length === 0 });
  const entries = loaded.data ?? [];

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}>
        <div className="mb-8">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Audit Trail
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
            Action history across your organization
          </p>
        </div>

        {loaded.status === "error" ? (
          <LoadError what="the audit trail" detail={loaded.detail} onRetry={loaded.retry} />
        ) : loaded.status === "loading" ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-12 rounded-lg animate-pulse"
                style={{ background: "var(--bg-elevated)" }}
              />
            ))}
          </div>
        ) : loaded.status === "empty" && page === 1 ? (
          <div className="text-center py-16">
            <p className="text-[15px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>
              No activity yet
            </p>
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Actions will appear here as your team uses VisibleAU.
            </p>
          </div>
        ) : (
          <>
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--border-default)" }}
            >
              {entries.map((entry) => (
                <AuditLogRow key={entry.id} entry={entry} />
              ))}
            </div>

            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 px-3 text-[12px] font-medium rounded-md disabled:opacity-30"
                style={{
                  background: "var(--bg-elevated)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-default)",
                }}
              >
                Previous
              </button>
              <span className="text-[12px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                Page {page}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={entries.length < 50}
                className="h-8 px-3 text-[12px] font-medium rounded-md disabled:opacity-30"
                style={{
                  background: "var(--bg-elevated)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-default)",
                }}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
