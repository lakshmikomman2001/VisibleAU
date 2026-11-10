"use client";

import { useParams } from "next/navigation";
import { EntityHomeCard } from "@/components/domain/retrieval/entity-home-card";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { LoadError } from "@/components/shared/load-error";
import { useJson } from "@/lib/hooks/use-load";

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
  // Follow-ups from af8de42..d1eb5a1, part 1: a failed fetch showed the card with no status, as if never
  // checked. It says it couldn't load now, with Try again.
  const loaded = useJson<EntityHomeData>(`/api/brands/${brandId}/entity-home`);
  const data = loaded.data;

  if (loaded.status === "error") {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Entity Home
        </h1>
        <LoadError what="your entity home" detail={loaded.detail} onRetry={loaded.retry} />
      </div>
    );
  }

  if (loaded.status === "loading") {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <div
          className="h-32 animate-pulse rounded-lg"
          style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="retrieval" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
        Entity Home
      </h1>

      <EntityHomeCard entityHomeStatus={data?.entityHomeStatus ?? null} />
    </div>
  );
}
