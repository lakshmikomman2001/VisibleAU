"use client";

import { useId, useState } from "react";
import type { AbnSuggestion } from "@/lib/brand-entity/abn-lookup";
import { formatAbn } from "@/lib/brands/abn";
import { useJson } from "@/lib/hooks/use-load";
import { actionFailureMessage, fetchOrFail } from "@/lib/load/fetch-json";

/**
 * S01 part 11 (contract P01.abn; LLD 8.8.6; flag abn_suggestion): "Is this your ABN?" in brand settings, for a brand
 * with no ABN when the ABR has one confident match for its name in its place. Confirm (owners and admins) saves it as
 * the brand's ABN and the register is checked; Not mine hides it for this brand for good. Nothing shows while the
 * suggestion loads, when there's none, or if it can't be read (the ABN field still works).
 */
export function AbnSuggestionBanner({
  brandId,
  canEdit,
  onConfirmed,
}: {
  brandId: string;
  canEdit: boolean;
  onConfirmed: (abn: string) => void;
}) {
  const titleId = useId();
  const loaded = useJson<{ suggestion: AbnSuggestion | null }>(
    `/api/brands/${brandId}/abn-suggestion`,
  );
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = loaded.data?.suggestion ?? null;
  if (gone || !s) return null;

  async function answer(action: "confirm" | "dismiss") {
    if (!s) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetchOrFail(`/api/brands/${brandId}/abn-suggestion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        setError(await actionFailureMessage(res, "We couldn't save that. Try again."));
        return;
      }
      setGone(true);
      if (action === "confirm") onConfirmed(s.abn);
    } catch {
      setError("We couldn't save that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const place = [s.state, s.postcode].filter(Boolean).join(" ");
  return (
    <section
      aria-labelledby={titleId}
      data-testid="p01-abn"
      className="rounded-lg"
      style={{
        padding: "12px 14px",
        background: "var(--info-soft, var(--bg-subtle))",
        border: "1px solid var(--border-default)",
      }}
    >
      <div className="flex flex-col gap-2 min-[641px]:flex-row min-[641px]:items-start min-[641px]:justify-between">
        <div style={{ minWidth: 0 }}>
          <p
            id={titleId}
            className="text-[13px] font-semibold"
            style={{ color: "var(--text-primary)", margin: 0 }}
          >
            Is this your ABN?
          </p>
          <p
            data-testid="p01-abn-line"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12.5,
              color: "var(--text-primary)",
              margin: "4px 0 0",
            }}
          >
            {[formatAbn(s.abn), s.entity ?? s.businessName, place, s.abnStatus]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)", margin: "4px 0 0" }}>
            Found on the Australian Business Register by your business name.
          </p>
          {error && (
            <p
              role="alert"
              className="text-[12px]"
              style={{ color: "var(--danger)", margin: "4px 0 0" }}
            >
              {error}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-2" style={{ flexShrink: 0 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void answer("confirm")}
              className="h-8 rounded-md px-3 text-[13px] font-medium"
              style={{ background: "var(--accent-primary)", color: "var(--accent-primary-fg)" }}
            >
              Confirm
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void answer("dismiss")}
              className="h-8 rounded-md px-3 text-[13px]"
              style={{ color: "var(--text-primary)" }}
            >
              Not mine
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
