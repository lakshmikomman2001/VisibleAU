"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { HallucinationIncidentRow } from "@/components/domain/trust/hallucination-incident-row";

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
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/brands/${brandId}/hallucinations`)
      .then(async (res) => { if (res.ok) setIncidents(await res.json()); })
      .finally(() => setLoading(false));
  }, [brandId]);

  const handleAction = async (id: string, action: "acknowledge" | "false_positive") => {
    const body = action === "acknowledge"
      ? { isAcknowledged: true }
      : { isFalsePositive: true };

    const res = await fetch(`/api/brands/${brandId}/hallucinations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setIncidents((prev) =>
        prev.map((i) => i.id === id
          ? { ...i, ...(action === "acknowledge" ? { isAcknowledged: true } : { isFalsePositive: true }) }
          : i,
        ),
      );
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Hallucination Incidents</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <LayerBadge layer="trust" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Hallucination Incidents</h1>

      {incidents.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center" style={{ color: "var(--muted)" }}>
          <p className="text-lg font-medium">No hallucinations detected</p>
          <p className="text-sm">Your brand facts are consistent across AI engines.</p>
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
