"use client";

import { useId, useState } from "react";

interface AuditLogEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string | null; email: string | null } | null;
}

const ACTION_LABELS: Record<string, string> = {
  audit_triggered: "Triggered audit",
  recommendation_dismissed: "Dismissed recommendation",
  task_completed: "Completed task",
  report_generated: "Generated report",
  brand_deleted: "Deleted brand",
  member_invited: "Invited member",
  tier_changed: "Changed tier",
  draft_approved: "Approved draft",
  draft_dismissed: "Dismissed draft",
  journey_triggered: "Triggered journey",
  hallucination_acknowledged: "Acknowledged hallucination",
  feature_flag_changed: "Changed feature flag",
  data_residency_accessed: "Viewed data residency",
  competitive_benchmark_viewed: "Viewed competitive benchmark",
  member_role_changed: "Changed member role",
  member_removed: "Removed member",
};

function truncateValue(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(v)) return `${v.slice(0, 8)}…`;
  return s.length > 48 ? `${s.slice(0, 48)}…` : s;
}

export function AuditLogRow({ entry }: { entry: AuditLogEntry }) {
  const label = ACTION_LABELS[entry.action] ?? entry.action;
  const actor = entry.actor?.name ?? entry.actor?.email ?? "System";
  const ts = new Date(entry.createdAt);
  const panelId = useId();

  const hasMetadata = entry.metadata && Object.keys(entry.metadata).length > 0;
  const [open, setOpen] = useState(false);

  return (
    <div
      className="border-b last:border-b-0"
      style={{ borderColor: "var(--border-subtle)", background: "var(--bg-elevated)" }}
    >
      <div className="px-5 py-3 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
              {label}
            </span>
            <span
              className="text-[11px] px-1.5 py-0.5 rounded"
              style={{ background: "var(--bg-active)", color: "var(--text-tertiary)" }}
            >
              {entry.resourceType}
            </span>
            {hasMetadata && (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-controls={panelId}
                className="text-[11px] px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                style={{
                  background: "var(--bg-active)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  border: "none",
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  style={{
                    transform: open ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 150ms ease",
                  }}
                  aria-hidden="true"
                >
                  <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Details
              </button>
            )}
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            by {actor}
            {entry.resourceId && (
              <span style={{ color: "var(--text-tertiary)" }}> · {entry.resourceId.slice(0, 8)}…</span>
            )}
          </div>
        </div>
        <div
          className="text-[12px] shrink-0 tabular-nums"
          style={{ color: "var(--text-tertiary)" }}
        >
          {ts.toLocaleDateString()} {ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {hasMetadata && open && (
        <div
          id={panelId}
          role="region"
          className="px-5 pb-3"
        >
          <dl
            className="rounded-md px-3 py-2 grid gap-x-4 gap-y-1"
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border-subtle)",
              gridTemplateColumns: "auto 1fr",
            }}
          >
            {Object.entries(entry.metadata!).map(([key, val]) => (
              <div key={key} className="contents">
                <dt className="text-[11px] font-medium tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                  {key}
                </dt>
                <dd
                  className="text-[11px] tabular-nums truncate"
                  style={{ color: "var(--text-secondary)" }}
                  title={typeof val === "string" ? val : JSON.stringify(val)}
                >
                  {truncateValue(val)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
