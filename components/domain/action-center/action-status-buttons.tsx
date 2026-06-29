"use client";

import { Check, X, ListTodo, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ActionStatusButtonsProps {
  itemId: string;
  brandId: string;
  existingTaskUrl?: string | null;
}

export function ActionStatusButtons({
  itemId,
  brandId,
  existingTaskUrl,
}: ActionStatusButtonsProps) {
  const router = useRouter();
  const [showDismiss, setShowDismiss] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  async function patchStatus(status: string, dismissedReason?: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/action-items/${itemId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(dismissedReason ? { dismissedReason } : {}) }),
      });
      if (res.ok) {
        router.refresh();
        router.push("/action-center");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTask() {
    setCreatingTask(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId: itemId }),
      });
      if (res.ok) {
        router.push(`/brands/${brandId}/workflow/tasks`);
      }
    } finally {
      setCreatingTask(false);
    }
  }

  const btnBase: React.CSSProperties = {
    height: 36,
    padding: "0 16px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
  };

  return (
    <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {existingTaskUrl ? (
          <a
            href={existingTaskUrl}
            style={{
              ...btnBase,
              background: "var(--success-soft)",
              color: "var(--success)",
              border: "none",
              textDecoration: "none",
            }}
          >
            <ListTodo style={{ width: 14, height: 14 }} />
            Task created
            <ExternalLink style={{ width: 12, height: 12 }} />
          </a>
        ) : (
          <button
            type="button"
            disabled={creatingTask || loading}
            onClick={handleCreateTask}
            style={{
              ...btnBase,
              background: "var(--layer-workflow)",
              color: "#fff",
              border: "none",
              opacity: creatingTask || loading ? 0.5 : 1,
              cursor: creatingTask || loading ? "not-allowed" : "pointer",
            }}
          >
            <ListTodo style={{ width: 14, height: 14 }} />
            {creatingTask ? "Creating…" : "Create task"}
          </button>
        )}
        <button
          type="button"
          disabled={loading || creatingTask}
          onClick={() => patchStatus("done")}
          style={{
            ...btnBase,
            background: "var(--accent-primary)",
            color: "var(--accent-primary-fg)",
            border: "none",
            opacity: loading ? 0.5 : 1,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          <Check style={{ width: 14, height: 14 }} />
          Mark as done
        </button>
        <button
          type="button"
          disabled={loading || creatingTask}
          onClick={() => setShowDismiss(!showDismiss)}
          style={{
            ...btnBase,
            background: "var(--bg-elevated)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-default)",
          }}
        >
          <X style={{ width: 14, height: 14 }} />
          Dismiss
        </button>
      </div>

      {showDismiss && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you dismissing this? (required)"
            rows={3}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              fontSize: 13,
              background: "var(--bg-base)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
              resize: "vertical",
            }}
          />
          <button
            type="button"
            disabled={loading || !reason.trim()}
            onClick={() => patchStatus("dismissed", reason.trim())}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              background: "var(--danger-soft)",
              color: "var(--danger)",
              border: "none",
              cursor: loading || !reason.trim() ? "not-allowed" : "pointer",
              opacity: loading || !reason.trim() ? 0.5 : 1,
              alignSelf: "flex-start",
            }}
          >
            Confirm dismiss
          </button>
        </div>
      )}
    </div>
  );
}
