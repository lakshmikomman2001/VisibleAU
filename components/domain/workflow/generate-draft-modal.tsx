"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface GenerateDraftModalProps {
  brandId: string;
  taskId: string;
  taskTitle: string;
  onClose: () => void;
}

const CONTENT_FORMATS = [
  { value: "expert_article", label: "Expert Article" },
  { value: "how_to_guide", label: "How-To Guide" },
  { value: "listicle", label: "Listicle" },
  { value: "faq_block", label: "FAQ Block" },
  { value: "comparison_article", label: "Comparison Article" },
  { value: "case_study", label: "Case Study" },
  { value: "press_release", label: "Press Release" },
  { value: "linkedin_article", label: "LinkedIn Article" },
] as const;

export function GenerateDraftModal({
  brandId,
  taskId,
  taskTitle,
  onClose,
}: GenerateDraftModalProps) {
  const router = useRouter();
  const [contentFormat, setContentFormat] = useState("expert_article");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    selectRef.current?.focus();

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/brands/${brandId}/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, contentFormat }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to queue draft generation");
      }

      router.push(`/brands/${brandId}/workflow/drafts`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate draft");
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.5)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Generate content draft"
        style={{
          width: "100%",
          maxWidth: 440,
          backgroundColor: "var(--bg-elevated)",
          borderRadius: 12,
          border: "1px solid var(--border-default)",
          padding: 24,
          boxShadow: "var(--elevation-modal)",
        }}
      >
        <h2
          className="text-lg font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Generate content draft
        </h2>
        <p
          className="text-sm mb-4"
          style={{ color: "var(--text-secondary)" }}
        >
          From task: {taskTitle}
        </p>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="draft-format"
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Content format
          </label>
          <select
            ref={selectRef}
            id="draft-format"
            value={contentFormat}
            onChange={(e) => setContentFormat(e.target.value)}
            className="w-full rounded-md px-3 py-2 text-sm mb-4"
            style={{
              backgroundColor: "var(--bg-base)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          >
            {CONTENT_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          {error && (
            <p
              className="text-sm mb-3"
              style={{ color: "var(--danger)" }}
            >
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium"
              style={{
                backgroundColor: "var(--bg-hover)",
                color: "var(--text-secondary)",
                border: "none",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-md text-sm font-medium"
              style={{
                backgroundColor: "var(--layer-content)",
                color: "#fff",
                border: "none",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.5 : 1,
              }}
            >
              {submitting ? "Queuing…" : "Generate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
