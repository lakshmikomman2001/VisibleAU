"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { HallucinationIncidentRow } from "@/components/domain/trust/hallucination-incident-row";
import { NotYetMeasuredCard } from "@/components/domain/trust/not-yet-measured-card";
import { LayerBadge } from "@/components/phase2/layer-badge";

interface Incident {
  id: string;
  engine: string;
  claimType: string;
  severity: "critical" | "warning" | "info";
  incorrectClaim: string;
  correctValue: string | null;
  isAcknowledged: boolean;
  isFalsePositive: boolean;
  createdAt: string;
}

export default function HallucinationsPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [implemented, setImplemented] = useState(true);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [citationCount, setCitationCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/brands/${brandId}/hallucinations`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data.implemented === false) {
            setImplemented(false);
            return;
          }
          setIncidents(data.incidents);
          setCitationCount(data.citationCount);
        }
      })
      .finally(() => setLoading(false));
  }, [brandId]);

  const handleAction = async (id: string, action: "acknowledge" | "false_positive") => {
    const body = action === "acknowledge" ? { isAcknowledged: true } : { isFalsePositive: true };

    const res = await fetch(`/api/brands/${brandId}/hallucinations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setIncidents((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                ...(action === "acknowledge"
                  ? { isAcknowledged: true }
                  : { isFalsePositive: true }),
              }
            : i,
        ),
      );
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Hallucination Incidents
        </h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg"
            style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
          />
        ))}
      </div>
    );
  }

  // Task #38: detectHallucinations() can never find an incident --
  // citations.is_accurate is never written by any code path, so
  // hallucination_incidents is permanently empty regardless of whether
  // this brand's facts are actually consistent. Must not render as a
  // measured clean record. See
  // docs/ops/post-launch-db-hardening.md section 38.
  if (!implemented) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
            Hallucination Incidents
          </h1>
          <button
            disabled
            className="rounded px-3 py-1.5 text-sm font-medium opacity-50"
            style={{ backgroundColor: "var(--accent-primary)", color: "var(--accent-primary-fg)" }}
          >
            Not yet available
          </button>
        </div>
        <NotYetMeasuredCard metric="Hallucination detection" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <LayerBadge layer="trust" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
        Hallucination Incidents
      </h1>

      {incidents.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 py-12 text-center"
          style={{ color: "var(--muted)" }}
        >
          {citationCount === 0 ? (
            <>
              <p className="text-lg font-medium">Not enough AI coverage to assess</p>
              <p className="text-sm">
                No AI responses have been recorded for this brand yet — run an audit first.
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">No hallucinations detected</p>
              <p className="text-sm">
                Your brand facts are consistent across {citationCount} AI response
                {citationCount === 1 ? "" : "s"}.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((incident) => (
            <HallucinationIncidentRow
              key={incident.id}
              incident={incident}
              onAcknowledge={() => handleAction(incident.id, "acknowledge")}
              onMarkFalsePositive={() => handleAction(incident.id, "false_positive")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
