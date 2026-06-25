"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";

interface Brand {
  id: string;
  name: string;
  domain: string;
}

interface Schedule {
  id: string;
  brandId: string;
  frequency: string;
  status: string;
  nextRunAt: string;
  lastRunAt: string | null;
  pausedReason: string | null;
}

interface Props {
  brand: Brand;
  schedule: Schedule | null;
  tierFrequency: string;
  maxScheduled: number;
  tier: string;
}

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  "3x_weekly": "3× weekly",
  "2x_daily": "2× daily",
  monthly: "Monthly",
  fortnightly: "Fortnightly",
  manual: "Manual only",
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    active: { bg: "rgba(34,197,94,0.15)", color: "#22c55e", label: "Active" },
    paused: { bg: "rgba(161,161,170,0.15)", color: "#a1a1aa", label: "Paused" },
    quota_exceeded: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "Quota exceeded" },
  };
  const s = styles[status] ?? styles.paused;
  return (
    <span
      style={{ backgroundColor: s.bg, color: s.color }}
      className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
    >
      {s.label}
    </span>
  );
}

export default function BrandScheduleView({
  brand,
  schedule,
  tierFrequency,
  maxScheduled,
  tier,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleCreate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/audit-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.id }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        setError(data.error || "Failed to create schedule.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }, [brand.id, router]);

  const handleToggle = useCallback(async () => {
    if (!schedule) return;
    const newStatus = schedule.status === "active" ? "paused" : "active";
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/audit-schedules/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        setError(data.error || "Failed to update schedule.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }, [schedule, router]);

  const handleDelete = useCallback(async () => {
    if (!schedule) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/audit-schedules/${schedule.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setShowDeleteConfirm(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        setError(data.error || "Failed to remove schedule.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }, [schedule, router]);

  const humanFrequency = FREQUENCY_LABELS[tierFrequency] ?? tierFrequency;
  const tierLabel = tier.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="p-8 space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href="/brands" className="hover:underline">
            Brands
          </Link>
          <span>/</span>
          <Link href={`/brands/${brand.id}`} className="hover:underline">
            {brand.name}
          </Link>
          <span>/</span>
          <span>Audit Schedule</span>
        </div>
        <h1 className="text-2xl font-semibold">Audit Schedule</h1>
        <p className="text-sm text-muted-foreground mt-1">{brand.domain}</p>
      </div>

      {error && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#ef4444" }}
        >
          {error}
        </div>
      )}

      {maxScheduled === 0 ? (
        <div className="rounded-lg border bg-card p-6 max-w-lg">
          <p className="text-sm font-medium mb-2">
            Scheduled audits are available on Agency plans.
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            Upgrade to automatically run audits on a recurring cadence for each of your brands.
          </p>
          <a
            href="/settings/billing"
            className="inline-block px-4 py-2 rounded-md text-sm font-medium"
            style={{ backgroundColor: "#3b82f6", color: "#fff" }}
          >
            View plans
          </a>
        </div>
      ) : schedule ? (
        <div className="rounded-lg border bg-card p-6 space-y-4 max-w-lg">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Frequency</p>
              <p className="text-sm font-medium">{humanFrequency}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Set by your {tierLabel} plan
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <StatusBadge status={schedule.status} />
              {schedule.status === "paused" && schedule.pausedReason && (
                <p className="text-xs text-muted-foreground mt-1">
                  {schedule.pausedReason}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Next run</p>
              <p className="text-sm font-medium">
                {schedule.status === "active"
                  ? format(new Date(schedule.nextRunAt), "d MMM yyyy, h:mm a")
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Last run</p>
              <p className="text-sm font-medium">
                {schedule.lastRunAt
                  ? formatDistanceToNow(new Date(schedule.lastRunAt), {
                      addSuffix: true,
                    })
                  : "Never"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            {schedule.status !== "quota_exceeded" && (
              <button
                onClick={handleToggle}
                disabled={busy}
                aria-label={
                  schedule.status === "active"
                    ? `Pause audit schedule for ${brand.name}`
                    : `Resume audit schedule for ${brand.name}`
                }
                className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
                style={
                  schedule.status === "active"
                    ? {
                        backgroundColor: "rgba(245,158,11,0.15)",
                        color: "#f59e0b",
                      }
                    : {
                        backgroundColor: "rgba(34,197,94,0.15)",
                        color: "#22c55e",
                      }
                }
              >
                {busy
                  ? "..."
                  : schedule.status === "active"
                    ? "Pause"
                    : "Resume"}
              </button>
            )}

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={busy}
                className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
                style={{
                  backgroundColor: "rgba(239,68,68,0.12)",
                  color: "#ef4444",
                }}
                aria-label={`Remove audit schedule for ${brand.name}`}
              >
                Remove
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Remove this schedule?
                </span>
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50"
                  style={{
                    backgroundColor: "rgba(239,68,68,0.15)",
                    color: "#ef4444",
                  }}
                >
                  {busy ? "..." : "Confirm"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-6 space-y-4 max-w-lg">
          <p className="text-sm text-muted-foreground">
            Run an automatic audit for {brand.name} on a recurring schedule.
          </p>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Frequency</p>
            <p className="text-sm font-medium">{humanFrequency}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your {tierLabel} plan runs audits {humanFrequency.toLowerCase()}
            </p>
          </div>

          <button
            onClick={handleCreate}
            disabled={busy}
            aria-label={`Create audit schedule for ${brand.name}`}
            className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: "#3b82f6", color: "#fff" }}
          >
            {busy ? "Creating..." : "Create schedule"}
          </button>
        </div>
      )}
    </div>
  );
}
