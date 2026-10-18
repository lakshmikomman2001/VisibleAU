"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markJustConfirmed } from "@/lib/brands/just-confirmed";
import { CATEGORY_KEYS, CATEGORY_LABELS, type CategoryKey } from "@/lib/prompts/templates";
import type { Audience } from "@/lib/types/brand";

interface ClassificationConfirmCardProps {
  brandId: string;
  suggestedCategory: string;
  // Vunnara hotfix (18 Oct, post-df27ef8): the owner's own confirmed
  // audience, or null/undefined when they haven't confirmed one yet --
  // never a classifier-derived guess (see the caller's own comment).
  suggestedAudience: Audience | null | undefined;
  suggestedCompetitors: string[];
  confidence: number;
}

const AUDIENCE_OPTIONS: Array<{ value: Audience; label: string; hint: string }> = [
  { value: "households", label: "Households", hint: "homeowners, individual customers" },
  { value: "businesses", label: "Businesses", hint: "other businesses, commercial clients" },
  { value: "both", label: "Both", hint: "a mix of households and businesses" },
];

export function ClassificationConfirmCard({
  brandId,
  suggestedCategory,
  suggestedAudience,
  suggestedCompetitors,
  confidence,
}: ClassificationConfirmCardProps) {
  const router = useRouter();
  const [selectedCategories, setSelectedCategories] = useState<Set<CategoryKey>>(
    new Set(CATEGORY_KEYS.includes(suggestedCategory as CategoryKey) ? [suggestedCategory as CategoryKey] : []),
  );
  // Vunnara hotfix (18 Oct, post-df27ef8): null (no selection) until
  // the owner actively picks one, OR their real confirmed value if
  // this is already set -- never defaults to a classifier guess.
  const [audience, setAudience] = useState<Audience | null>(suggestedAudience ?? null);
  const [confirmedCompetitors, setConfirmedCompetitors] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);

  // Build 1 addendum, item 10 (optional): a real re-run of the current
  // classifier (homepage crawl included, lib/brands/classify-brand.ts)
  // via the same event classify-on-brand-create.ts listens for -- never
  // a guess. app/api/brands/[brandId]/retry-classification/route.ts is
  // explicitly documented safe to call for a needs_confirmation brand.
  async function handleReanalyze() {
    setReanalyzing(true);
    try {
      await fetch(`/api/brands/${brandId}/retry-classification`, { method: "POST" });
      router.refresh();
    } finally {
      setReanalyzing(false);
    }
  }

  function toggleCategory(key: CategoryKey) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleCompetitor(name: string) {
    setConfirmedCompetitors((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleConfirm() {
    if (selectedCategories.size === 0) {
      setError("Select at least one category.");
      return;
    }
    if (audience == null) {
      setError("Select who pays this business.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/confirm-classification`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: [...selectedCategories],
          audience,
          confirmedCompetitors: [...confirmedCompetitors],
        }),
      });
      if (!res.ok) {
        setError("Couldn't save — try again.");
        return;
      }
      markJustConfirmed(brandId);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        padding: 20,
        borderRadius: 8,
        background: "var(--warning-soft)",
        border: "1px solid var(--warning)",
        marginBottom: 32,
      }}
    >
      <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>
        Confirm your business details
      </h2>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 16px" }}>
        We weren&apos;t fully confident in our automatic read of your business
        {confidence < 0.7 ? ` (${Math.round(confidence * 100)}% confidence)` : ""}. Confirming helps
        us ask the right AI visibility questions.
      </p>

      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "var(--text-tertiary)",
            marginBottom: 8,
          }}
        >
          What does your business do? (select all that apply)
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 180, overflowY: "auto" }}>
          {CATEGORY_KEYS.map((key) => {
            const selected = selectedCategories.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleCategory(key)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 9999,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  border: selected ? "1px solid var(--accent-primary)" : "1px solid var(--border-default)",
                  background: selected ? "var(--accent-primary)" : "var(--bg-base)",
                  color: selected ? "var(--accent-primary-fg)" : "var(--text-secondary)",
                }}
              >
                {CATEGORY_LABELS[key]}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "var(--text-tertiary)",
            marginBottom: 8,
          }}
        >
          Who pays this business?
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {AUDIENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAudience(opt.value)}
              title={opt.hint}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                border:
                  audience === opt.value
                    ? "1px solid var(--accent-primary)"
                    : "1px solid var(--border-default)",
                background: audience === opt.value ? "var(--accent-primary)" : "var(--bg-base)",
                color: audience === opt.value ? "var(--accent-primary-fg)" : "var(--text-secondary)",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {suggestedCompetitors.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--text-tertiary)",
              marginBottom: 8,
            }}
          >
            Are these real competitors? (confirm or leave unchecked)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {suggestedCompetitors.map((name) => {
              const confirmed = confirmedCompetitors.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleCompetitor(name)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 9999,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    border: confirmed
                      ? "1px solid var(--success)"
                      : "1px solid var(--border-default)",
                    background: confirmed ? "var(--success-soft)" : "var(--bg-base)",
                    color: confirmed ? "var(--success)" : "var(--text-secondary)",
                  }}
                >
                  {confirmed ? "✓ " : ""}
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && <p style={{ fontSize: 12, color: "var(--danger)", marginBottom: 12 }}>{error}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={saving}
          style={{
            height: 32,
            padding: "0 16px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            background: "var(--accent-primary)",
            color: "var(--accent-primary-fg)",
            border: "none",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.5 : 1,
          }}
        >
          {saving ? "Saving..." : "Confirm"}
        </button>
        <button
          type="button"
          onClick={handleReanalyze}
          disabled={reanalyzing}
          title="Re-runs our automatic classifier, including a fresh look at your homepage"
          style={{
            height: 32,
            padding: "0 16px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            cursor: reanalyzing ? "not-allowed" : "pointer",
            opacity: reanalyzing ? 0.5 : 1,
          }}
        >
          {reanalyzing ? "Re-analysing..." : "Re-analyse my business"}
        </button>
      </div>
    </div>
  );
}
