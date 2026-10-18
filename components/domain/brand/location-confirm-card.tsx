"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AuStateCode } from "@/lib/constants/au";
import { AU_STATES } from "@/lib/constants/au";
import { findLocation, isValidSuburbEntry } from "@/lib/locations";

interface LocationConfirmCardProps {
  brandId: string;
  // Vunnara Build 1, Part D.4: prefilled from the brand's existing
  // primaryRegions so the user doesn't retype what they already
  // entered at the wizard -- but nothing is pre-selected as
  // "confirmed" until they actually click Confirm.
  currentPrimaryRegion?: string;
  isLegacyDefaultRegion: boolean;
}

export function LocationConfirmCard({
  brandId,
  currentPrimaryRegion,
  isLegacyDefaultRegion,
}: LocationConfirmCardProps) {
  const router = useRouter();
  const [currentState, currentSuburb] = (currentPrimaryRegion ?? "").split(":");
  const [isOnlineOnly, setIsOnlineOnly] = useState(false);
  const [selectedState, setSelectedState] = useState<AuStateCode>(
    (currentState as AuStateCode) || "NSW",
  );
  const [suburbInput, setSuburbInput] = useState(isLegacyDefaultRegion ? "" : currentSuburb || "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setError(null);

    if (isOnlineOnly) {
      setSaving(true);
      try {
        const res = await fetch(`/api/brands/${brandId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locationMode: "online_only", primaryRegions: [] }),
        });
        if (!res.ok) {
          setError("Couldn't save -- try again.");
          return;
        }
        router.refresh();
      } finally {
        setSaving(false);
      }
      return;
    }

    const suburb = suburbInput.trim();
    if (!suburb) {
      setError("Enter a suburb, or tick “no fixed location”.");
      return;
    }
    const entry = `${selectedState}:${suburb}`;
    if (!isValidSuburbEntry(entry)) {
      setError("Letters and spaces only.");
      return;
    }

    const curated = findLocation(entry);
    setSaving(true);
    try {
      const res = await fetch(`/api/brands/${brandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationMode: "fixed",
          suburb,
          city: curated?.city ?? suburb,
          state: selectedState,
          country: "Australia",
          primaryRegions: [entry],
        }),
      });
      if (!res.ok) {
        setError("Couldn't save -- try again.");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    height: 32,
    padding: "0 10px",
    borderRadius: 6,
    fontSize: 13,
    background: "var(--bg-base)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
    outline: "none",
  };

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
        Confirm your business location
      </h2>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 16px" }}>
        {isLegacyDefaultRegion
          ? `Currently set to ${currentSuburb || "Sydney CBD"}, ${currentState || "NSW"} -- a default, not something you confirmed. Confirm it below, or tell us your real location so prompts and reports are accurate.`
          : "We use your suburb or city to write accurate, local prompts -- confirm it below."}
      </p>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          cursor: "pointer",
          fontSize: 13,
          color: "var(--text-primary)",
        }}
      >
        <input
          type="checkbox"
          checked={isOnlineOnly}
          onChange={(e) => {
            setIsOnlineOnly(e.target.checked);
            setError(null);
          }}
          style={{ width: 16, height: 16, cursor: "pointer" }}
        />
        No fixed location — we operate online only
      </label>

      {!isOnlineOnly && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <select
            aria-label="State or territory"
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value as AuStateCode)}
            style={{ ...inputStyle, width: "auto", minWidth: 80, cursor: "pointer" }}
          >
            {AU_STATES.map((st) => (
              <option key={st.code} value={st.code}>
                {st.code}
              </option>
            ))}
          </select>
          <input
            value={suburbInput}
            onChange={(e) => {
              setSuburbInput(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Bondi"
            style={{ ...inputStyle, flex: "1 1 120px", minWidth: 120 }}
          />
        </div>
      )}

      {error && <p style={{ fontSize: 12, color: "var(--danger)", marginBottom: 12 }}>{error}</p>}

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
    </div>
  );
}
