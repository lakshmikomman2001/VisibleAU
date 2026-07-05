"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { TierGate } from "@/components/phase2/tier-gate";

interface Schedule {
  id: string;
  brandId: string | null;
  frequency: "weekly" | "monthly";
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  recipientEmails: string[];
  isActive: boolean;
  lastSentAt: string | null;
  createdAt: string;
}

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function DeliverySchedulesPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [tierLocked, setTierLocked] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [frequency, setFrequency] = useState<"weekly" | "monthly">("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/organizations/${orgId}/delivery-schedules`)
      .then(async (res) => {
        if (res.status === 403) {
          setTierLocked(true);
          return;
        }
        if (res.ok) setSchedules(await res.json());
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  const addEmail = () => {
    const trimmed = emailInput.trim();
    if (trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && !emails.includes(trimmed)) {
      setEmails((prev) => [...prev, trimmed]);
      setEmailInput("");
    }
  };

  const removeEmail = (email: string) => {
    setEmails((prev) => prev.filter((e) => e !== email));
  };

  const handleSave = async () => {
    if (emails.length === 0) {
      setError("Add at least one recipient email");
      return;
    }
    setError(null);
    setSaving(true);

    const res = await fetch(`/api/organizations/${orgId}/delivery-schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        frequency,
        dayOfWeek: frequency === "weekly" ? dayOfWeek : undefined,
        dayOfMonth: frequency === "monthly" ? dayOfMonth : undefined,
        timeOfDay,
        recipientEmails: emails,
        isActive: true,
      }),
    });

    if (res.ok) {
      const created = await res.json();
      setSchedules((prev) => [...prev, created]);
      setShowForm(false);
      setFrequency("weekly");
      setDayOfWeek(1);
      setDayOfMonth(1);
      setTimeOfDay("09:00");
      setEmails([]);
    } else {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to create schedule");
    }
    setSaving(false);
  };

  if (tierLocked) {
    return (
      <TierGate requiredTier="Agency" locked>
        <div className="rounded-lg p-8 text-center" style={{ backgroundColor: "var(--bg-elevated)" }}>
          <p style={{ color: "var(--text-secondary)" }}>
            Delivery schedules are available on Agency tier and above
          </p>
        </div>
      </TierGate>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 32 }}>
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
                Delivery Schedules
              </h1>
              <LayerBadge layer="communication" />
            </div>
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Automate report delivery to your team
            </p>
          </div>
          {!showForm && (
            <button
              className="h-9 px-4 text-[13px] font-medium rounded-md"
              style={{ background: "var(--layer-comm)", color: "#fff" }}
              onClick={() => setShowForm(true)}
            >
              New schedule
            </button>
          )}
        </div>

        {showForm && (
          <div
            className="rounded-xl p-6 mb-6"
            style={{ backgroundColor: "var(--bg-elevated)", boxShadow: "var(--elevation-rest)" }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  Frequency
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as "weekly" | "monthly")}
                  className="w-full h-9 px-3 rounded-md text-[13px]"
                  style={{
                    backgroundColor: "var(--bg-base)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              {frequency === "weekly" ? (
                <div>
                  <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                    Day of Week
                  </label>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(Number(e.target.value))}
                    className="w-full h-9 px-3 rounded-md text-[13px]"
                    style={{
                      backgroundColor: "var(--bg-base)",
                      border: "1px solid var(--border-default)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {DAYS_OF_WEEK.map((d, i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                    Day of Month (1-28)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(Number(e.target.value))}
                    className="w-full h-9 px-3 rounded-md text-[13px]"
                    style={{
                      backgroundColor: "var(--bg-base)",
                      border: "1px solid var(--border-default)",
                      color: "var(--text-primary)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  />
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Time of Day (UTC)
              </label>
              <input
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="w-40 h-9 px-3 rounded-md text-[13px]"
                style={{
                  backgroundColor: "var(--bg-base)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                }}
              />
              <span className="ml-2 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                All times in UTC
              </span>
            </div>

            <div className="mb-5">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Recipient Emails
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addEmail();
                    }
                  }}
                  placeholder="name@company.com"
                  className="flex-1 h-9 px-3 rounded-md text-[13px]"
                  style={{
                    backgroundColor: "var(--bg-base)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                />
                <button
                  className="h-9 px-3 rounded-md text-[12px] font-medium"
                  style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
                  onClick={addEmail}
                >
                  Add
                </button>
              </div>
              {emails.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {emails.map((em) => (
                    <span
                      key={em}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px]"
                      style={{
                        backgroundColor: "color-mix(in srgb, var(--layer-comm) 12%, transparent)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {em}
                      <button
                        className="ml-0.5 text-[9px] leading-none"
                        style={{ color: "var(--text-tertiary)" }}
                        onClick={() => removeEmail(em)}
                        aria-label={`Remove ${em}`}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <p className="text-[12px] mb-3" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                className="h-9 px-5 text-[13px] font-medium rounded-md"
                style={{ background: "var(--layer-comm)", color: "#fff" }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Create schedule"}
              </button>
              <button
                className="h-9 px-4 text-[13px] rounded-md"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
                onClick={() => {
                  setShowForm(false);
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 rounded-xl anim-shimmer" style={{ backgroundColor: "var(--bg-hover)" }} />
            ))}
          </div>
        ) : schedules.length === 0 && !showForm ? (
          <div
            className="rounded-xl p-12 text-center"
            style={{ backgroundColor: "var(--bg-elevated)", boxShadow: "var(--elevation-rest)" }}
          >
            <p className="text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              No schedules yet
            </p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Set up automatic report delivery for your team
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map((s) => (
              <div
                key={s.id}
                className="rounded-xl p-5"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                  opacity: s.isActive ? 1 : 0.6,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>
                      {s.frequency === "weekly"
                        ? `Every ${DAYS_OF_WEEK[s.dayOfWeek ?? 0]}`
                        : `Monthly on day ${s.dayOfMonth}`}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: s.isActive ? "var(--success)" : "var(--bg-hover)",
                        color: s.isActive ? "#fff" : "var(--text-tertiary)",
                      }}
                    >
                      {s.isActive ? "Active" : "Paused"}
                    </span>
                  </div>
                  <span className="text-[11px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                    {s.timeOfDay} UTC
                  </span>
                </div>
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {s.recipientEmails.length} recipient{s.recipientEmails.length !== 1 ? "s" : ""}
                  {s.lastSentAt && (
                    <> · Last sent {new Date(s.lastSentAt).toLocaleDateString()}</>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
