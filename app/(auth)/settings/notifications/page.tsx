"use client";

import { useCallback, useEffect, useState } from "react";

interface NotificationPrefs {
  weeklyDigest: boolean;
  digestEmail: string;
  emailOnDrift: boolean;
  emailOnAuditComplete: boolean;
  emailOnScheduleFailure: boolean;
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        height: 24,
        width: 44,
        flexShrink: 0,
        borderRadius: 9999,
        cursor: "pointer",
        border: "none",
        transition: "background-color 0.2s",
        backgroundColor: checked ? "#3b82f6" : "#3f3f46",
      }}
    >
      <span
        style={{
          display: "inline-block",
          height: 16,
          width: 16,
          borderRadius: 9999,
          backgroundColor: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          transition: "transform 0.2s",
          transform: checked ? "translateX(24px)" : "translateX(4px)",
        }}
      />
    </button>
  );
}

export default function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    weeklyDigest: true,
    digestEmail: "",
    emailOnDrift: true,
    emailOnAuditComplete: false,
    emailOnScheduleFailure: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/notification-preferences")
      .then((r) => r.json())
      .then((data) => {
        const p = data?.preferences ?? data;
        if (p && !p.error) {
          setPrefs({
            weeklyDigest: p.weeklyDigest ?? true,
            digestEmail: p.digestEmail || "",
            emailOnDrift: p.emailOnDrift ?? true,
            emailOnAuditComplete: p.emailOnAuditComplete ?? false,
            emailOnScheduleFailure: p.emailOnScheduleFailure ?? true,
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        setMessage("Preferences saved.");
      } else {
        const err = await res.json();
        setMessage(err.error || "Failed to save preferences.");
      }
    } catch {
      setMessage("Network error.");
    } finally {
      setSaving(false);
    }
  }, [prefs]);

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading notification preferences...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Notification Preferences</h1>

      <div className="rounded-lg border bg-card p-6 space-y-6 max-w-lg">
        {/* Weekly Digest */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Weekly Digest</p>
            <p className="text-xs text-muted-foreground">
              Receive a weekly summary of all brand scores
            </p>
          </div>
          <Toggle
            checked={prefs.weeklyDigest}
            onChange={() => setPrefs({ ...prefs, weeklyDigest: !prefs.weeklyDigest })}
          />
        </div>

        {/* Digest Email */}
        <div>
          <label className="block text-sm font-medium mb-1">Digest Email Address</label>
          <input
            type="email"
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            value={prefs.digestEmail}
            onChange={(e) => setPrefs({ ...prefs, digestEmail: e.target.value })}
            placeholder="you@example.com"
          />
        </div>

        {/* Email on Drift Alert */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Email on Drift Alert</p>
            <p className="text-xs text-muted-foreground">
              Get notified when a score drops significantly
            </p>
          </div>
          <Toggle
            checked={prefs.emailOnDrift}
            onChange={() => setPrefs({ ...prefs, emailOnDrift: !prefs.emailOnDrift })}
          />
        </div>

        {/* Email on Audit Complete */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Email on Audit Complete</p>
            <p className="text-xs text-muted-foreground">
              Notified when each audit finishes running
            </p>
          </div>
          <Toggle
            checked={prefs.emailOnAuditComplete}
            onChange={() =>
              setPrefs({ ...prefs, emailOnAuditComplete: !prefs.emailOnAuditComplete })
            }
          />
        </div>

        {/* Email on Schedule Failure */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Email on Schedule Failure</p>
            <p className="text-xs text-muted-foreground">
              Alert when a scheduled audit fails to run
            </p>
          </div>
          <Toggle
            checked={prefs.emailOnScheduleFailure}
            onChange={() =>
              setPrefs({ ...prefs, emailOnScheduleFailure: !prefs.emailOnScheduleFailure })
            }
          />
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 16px",
              backgroundColor: "#3b82f6",
              color: "#fff",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Saving..." : "Save Preferences"}
          </button>
          {message && (
            <span className="text-sm text-muted-foreground">{message}</span>
          )}
        </div>
      </div>
    </div>
  );
}
