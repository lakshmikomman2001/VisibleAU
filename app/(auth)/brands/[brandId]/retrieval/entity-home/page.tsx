"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { EntityHomeCard } from "@/components/domain/retrieval/entity-home-card";

interface EntityHomeStatus {
  orgSchemaPresent: boolean;
  idFieldPresent: boolean;
  sameAsCount: number;
  pageUrl: string | null;
}

interface EntityHomeData {
  entityHomeStatus: EntityHomeStatus | null;
}

export default function EntityHomePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [data, setData] = useState<EntityHomeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/brands/${brandId}/entity-home`)
      .then(async (res) => {
        if (res.ok) setData(await res.json());
      })
      .finally(() => setLoading(false));
  }, [brandId]);

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <div className="h-32 animate-pulse rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="retrieval" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Entity Home</h1>

      <EntityHomeCard entityHomeStatus={data?.entityHomeStatus ?? null} />
    </div>
  );
}
