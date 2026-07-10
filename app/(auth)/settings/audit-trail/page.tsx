"use client";

import { useCallback, useEffect, useState } from "react";
import { AuditLogRow } from "@/components/domain/governance/audit-log-row";

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
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchEntries = useCallback(async () => {
    try {
      const meRes = await fetch("/api/auth/me");
      if (!meRes.ok) return;
      const me = await meRes.json();

      const res = await fetch(
        `/api/organizations/${me.organizationId}/audit-trail?page=${page}&limit=50`,
      );
      if (!res.ok) throw new Error("Failed to load audit trail");
      const data = await res.json();
      setEntries(data.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}>
        <div className="mb-8">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Audit Trail</h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
            Action history across your organization
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: "var(--bg-elevated)" }} />
            ))}
          </div>
        ) : entries.length === 0 ? (
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
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-default)" }}>
              {entries.map((entry) => (
                <AuditLogRow key={entry.id} entry={entry} />
              ))}
            </div>

            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 px-3 text-[12px] font-medium rounded-md disabled:opacity-30"
                style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
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
                style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
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
