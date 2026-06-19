"use client";

import { CheckCircle2, AlertCircle, Copy, Loader2 } from "lucide-react";
import { useState } from "react";

interface QuestionRow {
  heading: string;
  hasCapsule: boolean;
  excerpt: string;
}

export function CapsuleQuestionList({
  questions,
  brandId,
}: {
  questions: QuestionRow[];
  brandId: string;
}) {
  return (
    <div
      style={{
        borderRadius: 8,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          Questions found
        </h3>
      </div>
      {questions.map((q, i) => (
        <QuestionItem
          // biome-ignore lint/suspicious/noArrayIndexKey: static server data, no reordering
          key={`q-${i}`}
          question={q}
          brandId={brandId}
        />
      ))}
    </div>
  );
}

function QuestionItem({
  question,
  brandId,
}: {
  question: QuestionRow;
  brandId: string;
}) {
  const [capsule, setCapsule] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/answer-capsules/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.heading,
          existingContent: question.excerpt,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      const data = (await res.json()) as { capsule: string };
      setCapsule(data.capsule);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!capsule) return;
    navigator.clipboard.writeText(capsule);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {question.hasCapsule ? (
          <CheckCircle2
            style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0, color: "var(--success)" }}
          />
        ) : (
          <AlertCircle
            style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0, color: "var(--warning)" }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
              {question.heading}
            </div>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 600,
                whiteSpace: "nowrap",
                flexShrink: 0,
                background: question.hasCapsule ? "var(--success-soft)" : "var(--warning-soft)",
                color: question.hasCapsule ? "var(--success)" : "var(--warning)",
              }}
            >
              {question.hasCapsule ? "Has capsule" : "Needs capsule"}
            </span>
          </div>

          {!question.hasCapsule && !capsule && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                style={{
                  padding: "4px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-elevated)",
                  color: "var(--accent-primary)",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {loading && (
                  <Loader2
                    style={{
                      width: 12,
                      height: 12,
                      animation: "spin 1s linear infinite",
                    }}
                  />
                )}
                {loading ? "Generating…" : "Suggest Rewrite"}
              </button>
              {error && (
                <span style={{ fontSize: 12, color: "var(--danger)", marginLeft: 8 }}>{error}</span>
              )}
            </div>
          )}

          {capsule && (
            <div
              style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 6,
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span
                  style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--text-tertiary)" }}
                >
                  Generated answer capsule
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-elevated)",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Copy style={{ width: 11, height: 11 }} />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-primary)",
                  margin: 0,
                  fontFamily: "var(--font-mono)",
                  lineHeight: 1.5,
                }}
              >
                {capsule}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
