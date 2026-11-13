"use client";

import { useState } from "react";
import { SaveFeedback, useSave } from "@/components/shared/save-feedback";

const POSTCODE = /^\d{4}$/;

/**
 * 13 Nov, part 2 (Sri's live check): a confirmed location that only lacks the postcode (lib/brands/location-
 * need.ts "postcode") asks for that and nothing else -- one field, one Save. Omega and Hero showed the whole
 * "Confirm your business location" picker and a "Keep this location" link for it, which looked like two ways
 * to do one thing. Saves { postcode } alone (PATCH /api/brands/[id]): the suburb, its confirmation and the
 * questions stay as they are.
 */
export function PostcodeCard({
  brandId,
  locationLabel,
  onSaved,
}: {
  brandId: string;
  /** "Yennora, NSW": the confirmed location the postcode belongs to. */
  locationLabel: string | null;
  onSaved?: () => void;
}) {
  const [postcode, setPostcode] = useState("");
  const [invalid, setInvalid] = useState(false);
  const { status, error, saving, save, reset } = useSave(`/api/brands/${brandId}`, {
    method: "PATCH",
    onSaved,
  });

  async function handleSave() {
    const value = postcode.trim();
    if (!POSTCODE.test(value)) {
      setInvalid(true);
      return;
    }
    await save({ postcode: value });
  }

  return (
    <div
      data-postcode-card=""
      style={{
        padding: 20,
        borderRadius: 8,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        marginBottom: 32,
      }}
    >
      <h2
        style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}
      >
        Add your postcode so Google checks from your suburb
      </h2>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 12px" }}>
        {locationLabel ? `${locationLabel}: ` : ""}Google&apos;s AI answers are checked from a
        postcode. Without one, Google is checked from the nearest place it lists.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <input
          aria-label="Postcode"
          inputMode="numeric"
          maxLength={4}
          value={postcode}
          onChange={(e) => {
            setPostcode(e.target.value);
            setInvalid(false);
            reset();
          }}
          placeholder="Postcode"
          style={{
            height: 32,
            width: 96,
            padding: "0 10px",
            borderRadius: 6,
            fontSize: 13,
            background: "var(--bg-base)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={handleSave}
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
          Save
        </button>
        <SaveFeedback status={status} error={error} />
      </div>
      {invalid && (
        <p role="alert" style={{ fontSize: 12, color: "var(--danger)", margin: "8px 0 0" }}>
          An Australian postcode is four digits.
        </p>
      )}
    </div>
  );
}
