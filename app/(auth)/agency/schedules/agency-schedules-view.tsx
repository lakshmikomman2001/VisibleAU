"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";

interface Schedule {
  id: string;
  brandId: string;
  brandName: string;
  domain: string;
  frequency: string;
  status: string;
  nextRunAt: Date;
  lastRunAt: Date | null;
  pausedReason: string | null;
}

interface Props {
  schedules: Schedule[];
  activeCount: number;
  maxScheduled: number;
}

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  "3x_weekly": "3× weekly",
  "2x_daily": "2× daily",
  monthly: "Monthly",
  fortnightly: "Fortnightly",
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: "rgba(34,197,94,0.15)", text: "#22c55e", label: "Active" },
    paused: { bg: "rgba(161,161,170,0.15)", text: "#a1a1aa", label: "Paused" },
    quota_exceeded: { bg: "rgba(245,158,11,0.15)", text: "#f59e0b", label: "Quota exceeded" },
  };
  const s = styles[status] ?? styles.paused;
  return (
    <span
      style={{ backgroundColor: s.bg, color: s.text }}
      className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
    >
      {s.label}
    </span>
  );
}

export default function AgencySchedulesView({ schedules, activeCount, maxScheduled }: Props) {
  const router = useRouter();
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = useCallback(
    async (scheduleId: string, currentStatus: string, brandName: string) => {
      const newStatus = currentStatus === "active" ? "paused" : "active";
      setToggling(scheduleId);
      setError(null);
      try {
        const res = await fetch(`/api/audit-schedules/${scheduleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Request failed" }));
          setError(data.error || `Failed to update schedule for ${brandName}`);
          return;
        }
        router.refresh();
      } catch {
        setError(`Network error updating schedule for ${brandName}`);
      } finally {
        setToggling(null);
      }
    },
    [router],
  );

  const maxLabel = maxScheduled === Infinity ? "∞" : String(maxScheduled);

  return (
    <div className="p-8 space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href="/agency" className="hover:underline">
            Agency workspace
          </Link>
          <span>/</span>
          <span>Scheduled audits</span>
        </div>
        <h1 className="text-2xl font-semibold">Scheduled Audits</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {activeCount} of {maxLabel} schedules active
        </p>
      </div>

      {error && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#ef4444" }}
        >
          {error}
        </div>
      )}

      {schedules.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 max-w-lg">
          <p className="text-sm font-medium mb-2">No schedules configured yet.</p>
          <p className="text-sm text-muted-foreground">
            Schedules run audits automatically at the cadence you choose.
            {maxScheduled > 0 && (
              <>
                {" "}
                You can add a schedule from any brand{"'"}s page under{" "}
                <span className="font-medium">Audit Schedule</span>.
              </>
            )}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Brand</th>
                  <th className="px-4 py-3 font-medium">Frequency</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Next run</th>
                  <th className="px-4 py-3 font-medium">Last run</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/brands/${s.brandId}/schedule`}
                        className="font-medium hover:underline"
                      >
                        {s.brandName}
                      </Link>
                      <p className="text-xs text-muted-foreground">{s.domain}</p>
                    </td>
                    <td className="px-4 py-3">
                      {FREQUENCY_LABELS[s.frequency] ?? s.frequency}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                      {s.status === "paused" && s.pausedReason && (
                        <p className="text-xs text-muted-foreground mt-1">{s.pausedReason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.status === "active"
                        ? format(new Date(s.nextRunAt), "d MMM yyyy, h:mm a")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {s.lastRunAt
                        ? formatDistanceToNow(new Date(s.lastRunAt), { addSuffix: true })
                        : "Never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.status === "quota_exceeded" ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <button
                          onClick={() => handleToggle(s.id, s.status, s.brandName)}
                          disabled={toggling === s.id}
                          aria-label={
                            s.status === "active"
                              ? `Pause schedule for ${s.brandName}`
                              : `Resume schedule for ${s.brandName}`
                          }
                          className="px-3 py-1 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
                          style={
                            s.status === "active"
                              ? { backgroundColor: "rgba(245,158,11,0.15)", color: "#f59e0b" }
                              : { backgroundColor: "rgba(34,197,94,0.15)", color: "#22c55e" }
                          }
                        >
                          {toggling === s.id
                            ? "..."
                            : s.status === "active"
                              ? "Pause"
                              : "Resume"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="md:hidden space-y-3">
            {schedules.map((s) => (
              <div key={s.id} className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <Link
                      href={`/brands/${s.brandId}/schedule`}
                      className="font-medium text-sm hover:underline"
                    >
                      {s.brandName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{s.domain}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                {s.status === "paused" && s.pausedReason && (
                  <p className="text-xs text-muted-foreground">{s.pausedReason}</p>
                )}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Frequency</p>
                    <p className="font-medium">{FREQUENCY_LABELS[s.frequency] ?? s.frequency}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Next run</p>
                    <p className="font-medium">
                      {s.status === "active"
                        ? format(new Date(s.nextRunAt), "d MMM, h:mm a")
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last run</p>
                    <p className="font-medium">
                      {s.lastRunAt
                        ? formatDistanceToNow(new Date(s.lastRunAt), { addSuffix: true })
                        : "Never"}
                    </p>
                  </div>
                </div>
                {s.status !== "quota_exceeded" && (
                  <button
                    onClick={() => handleToggle(s.id, s.status, s.brandName)}
                    disabled={toggling === s.id}
                    aria-label={
                      s.status === "active"
                        ? `Pause schedule for ${s.brandName}`
                        : `Resume schedule for ${s.brandName}`
                    }
                    className="w-full px-3 py-2 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
                    style={
                      s.status === "active"
                        ? { backgroundColor: "rgba(245,158,11,0.15)", color: "#f59e0b" }
                        : { backgroundColor: "rgba(34,197,94,0.15)", color: "#22c55e" }
                    }
                  >
                    {toggling === s.id
                      ? "..."
                      : s.status === "active"
                        ? "Pause"
                        : "Resume"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
