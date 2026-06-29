"use client";

import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";

interface CreateTaskModalProps {
  brandId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateTaskModal({ brandId, onClose, onSuccess }: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [effort, setEffort] = useState<"low" | "medium" | "high">("medium");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/brands/${brandId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          effort,
          description: description.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to create task");
        return;
      }

      onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 36,
    padding: "0 12px",
    borderRadius: 6,
    fontSize: 13,
    background: "var(--bg-base)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: 4,
    display: "block",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create new task"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.6)",
      }}
    >
      <div
        style={{
          width: 440,
          maxWidth: "90vw",
          background: "var(--bg-elevated)",
          borderRadius: 12,
          border: "1px solid var(--border-default)",
          boxShadow: "var(--elevation-hover)",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            New task
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              border: "none",
              background: "transparent",
              color: "var(--text-tertiary)",
              cursor: "pointer",
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label htmlFor="task-title" style={labelStyle}>
              Title <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <input
              ref={titleRef}
              id="task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Update local directory listings"
              maxLength={500}
              required
              style={inputStyle}
              onFocus={(e) => { (e.target as HTMLInputElement).style.boxShadow = "var(--focus-ring)"; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.boxShadow = "none"; }}
            />
          </div>

          <div>
            <label htmlFor="task-effort" style={labelStyle}>
              Effort <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <select
              id="task-effort"
              value={effort}
              onChange={(e) => setEffort(e.target.value as "low" | "medium" | "high")}
              style={{ ...inputStyle, cursor: "pointer" }}
              onFocus={(e) => { (e.target as HTMLSelectElement).style.boxShadow = "var(--focus-ring)"; }}
              onBlur={(e) => { (e.target as HTMLSelectElement).style.boxShadow = "none"; }}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div>
            <label htmlFor="task-description" style={labelStyle}>
              Description
            </label>
            <textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details about this task"
              rows={3}
              style={{
                ...inputStyle,
                height: "auto",
                padding: "8px 12px",
                resize: "vertical",
              }}
              onFocus={(e) => { (e.target as HTMLTextAreaElement).style.boxShadow = "var(--focus-ring)"; }}
              onBlur={(e) => { (e.target as HTMLTextAreaElement).style.boxShadow = "none"; }}
            />
          </div>

          {error && (
            <p style={{ fontSize: 13, color: "var(--danger)", margin: 0 }}>{error}</p>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                background: "var(--bg-elevated)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                background: "var(--accent-primary)",
                color: "var(--accent-primary-fg)",
                border: "none",
                cursor: submitting || !title.trim() ? "not-allowed" : "pointer",
                opacity: submitting || !title.trim() ? 0.5 : 1,
              }}
            >
              {submitting ? "Creating…" : "Create task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
