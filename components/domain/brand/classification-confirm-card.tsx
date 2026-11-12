"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { LocationConfirmCard } from "@/components/domain/brand/location-confirm-card";
import { categoryChoices } from "@/lib/brands/category-choices";
import { markJustConfirmed } from "@/lib/brands/just-confirmed";
import { actionFailureMessage } from "@/lib/load/fetch-json";
import { CATEGORY_KEYS, CATEGORY_LABELS, type CategoryKey } from "@/lib/prompts/templates";
import type { Audience } from "@/lib/types/brand";

/** The brand's location as the panel shows it, with what "Change" needs (13 Nov, part 1). */
export interface ConfirmCardLocation {
  /** "Yennora, NSW", or null when it has none yet. */
  label: string | null;
  onlineOnly: boolean;
  primaryRegion?: string;
  isLegacyDefaultRegion: boolean;
}

interface ClassificationConfirmCardProps {
  brandId: string;
  /** The classifier's suggestion; null when it failed or timed out (13 Nov, part 1). */
  suggestedCategory: string | null;
  // Vunnara hotfix (18 Oct, post-df27ef8): the owner's own confirmed
  // audience, or null/undefined when they haven't confirmed one yet --
  // never a classifier-derived guess (see the caller's own comment).
  suggestedAudience: Audience | null | undefined;
  suggestedCompetitors: string[];
  confidence: number | null;
  /**
   * 13 Nov (part 1): "low_confidence" -- the classifier finished but isn't sure; "could_not_classify" -- it
   * failed or never finished, so there is no suggestion and the owner chooses.
   */
  mode?: "low_confidence" | "could_not_classify";
  /** The brand's vertical: its business types are shown first, the rest behind "Other types". */
  vertical?: string;
  /** The brand's location, shown with "Change" (the audit uses it as much as the business type). */
  location?: ConfirmCardLocation | null;
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
  mode = "low_confidence",
  vertical,
  location,
}: ClassificationConfirmCardProps) {
  const router = useRouter();
  const [selectedCategories, setSelectedCategories] = useState<Set<CategoryKey>>(
    new Set(
      suggestedCategory && CATEGORY_KEYS.includes(suggestedCategory as CategoryKey)
        ? [suggestedCategory as CategoryKey]
        : [],
    ),
  );
  // The vertical's types first, from the suggestion as it was when the panel opened -- chips don't move
  // while the owner picks.
  const choices = useMemo(
    () => categoryChoices(vertical, suggestedCategory ? [suggestedCategory] : []),
    [vertical, suggestedCategory],
  );
  const [showOtherTypes, setShowOtherTypes] = useState(false);
  const [changingLocation, setChangingLocation] = useState(false);
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
  // Follow-ups from af8de42..d1eb5a1, part 1: the answer was never read (and a network failure was an
  // unhandled rejection), so a refused re-analysis looked like nothing happening. It says why now.
  async function handleReanalyze() {
    setReanalyzing(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/retry-classification`, { method: "POST" });
      if (!res.ok) {
        setError(await actionFailureMessage(res, "The re-analysis couldn't be started."));
        return;
      }
      router.refresh();
    } catch {
      setError("The re-analysis couldn't be started. Check your connection and try again.");
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
      <h2
        style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}
      >
        Confirm your business details
      </h2>
      <p
        style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 16px" }}
        data-confirm-mode={mode}
      >
        {mode === "could_not_classify" ? (
          <>We couldn&apos;t work this out automatically — choose below.</>
        ) : (
          <>
            We weren&apos;t fully confident in our automatic read of your business
            {confidence !== null && confidence < 0.7
              ? ` (${Math.round(confidence * 100)}% confidence)`
              : ""}
            . Confirming helps us ask the right AI visibility questions.
          </>
        )}
      </p>

      {location && (
        <div style={{ marginBottom: 16 }} data-confirm-location="">
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
            Where is your business?
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
              {location.onlineOnly
                ? "Online only (no fixed location)"
                : (location.label ?? "No location yet")}
            </span>
            <button
              type="button"
              onClick={() => setChangingLocation((open) => !open)}
              aria-expanded={changingLocation}
              style={{
                fontSize: 12,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--accent-primary)",
                textDecoration: "underline",
              }}
            >
              {changingLocation ? "Keep this location" : "Change"}
            </button>
          </div>
          {changingLocation && (
            <div style={{ marginTop: 12 }}>
              <LocationConfirmCard
                brandId={brandId}
                currentPrimaryRegion={location.primaryRegion}
                isLegacyDefaultRegion={location.isLegacyDefaultRegion}
              />
            </div>
          )}
        </div>
      )}

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
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 180, overflowY: "auto" }}
          data-category-choices=""
        >
          {[...choices.first, ...(showOtherTypes ? choices.others : [])].map((key) => {
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
                  border: selected
                    ? "1px solid var(--accent-primary)"
                    : "1px solid var(--border-default)",
                  background: selected ? "var(--accent-primary)" : "var(--bg-base)",
                  color: selected ? "var(--accent-primary-fg)" : "var(--text-secondary)",
                }}
              >
                {CATEGORY_LABELS[key]}
              </button>
            );
          })}
        </div>
        {choices.others.length > 0 && (
          <button
            type="button"
            onClick={() => setShowOtherTypes((open) => !open)}
            aria-expanded={showOtherTypes}
            style={{
              marginTop: 8,
              fontSize: 12,
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--accent-primary)",
              textDecoration: "underline",
            }}
          >
            {showOtherTypes ? "Fewer types" : `Other types (${choices.others.length})`}
          </button>
        )}
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
                color:
                  audience === opt.value ? "var(--accent-primary-fg)" : "var(--text-secondary)",
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
