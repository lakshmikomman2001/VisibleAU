"use client";

import { Activity, ArrowRight, Building2, Eye, Globe, MapPin, Shield } from "lucide-react";
import Link from "next/link";

type Persona = "agency" | "smb" | "local_tradie";

interface PersonaSectionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  color: string;
}

function PersonaSection({ title, description, icon, href, color }: PersonaSectionProps) {
  return (
    <Link
      href={href}
      className="rounded-xl p-5 flex items-start gap-4 hover:shadow-sm transition-shadow"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}
      >
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>
          {title}
        </div>
        <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {description}
        </div>
      </div>
      <ArrowRight size={14} style={{ color: "var(--text-tertiary)", marginTop: 4 }} />
    </Link>
  );
}

function derivePersona(vertical: string, tier: string): Persona {
  if (tier === "agency" || tier === "agency_pro" || tier === "enterprise") return "agency";
  const localVerticals = [
    "plumber",
    "electrician",
    "tradie",
    "builder",
    "landscaper",
    "trades",
    "home_services",
    "dental",
    "medical",
    "allied_health",
    "fitness",
    "beauty",
    "real_estate",
    "restaurant",
    "cafe",
    "retail",
    "automotive",
    "cleaning",
    "pest_control",
    "removalist",
    "locksmith",
    "roofing",
    "hvac",
    "painting",
  ];
  if (localVerticals.includes((vertical ?? "").toLowerCase())) return "local_tradie";
  return "smb";
}

/**
 * No arbitrary "first brand" (7 Nov): the agency section is workspace-wide -- it links to every brand's
 * work, so it needs no brand. The other sections link into ONE brand's pages, so they show only for the
 * brand the switcher shows (`brandId`); with none selected they show nothing, never whichever brand a
 * query happened to return first.
 */
export function PersonaDashboard({
  brandId,
  brandName,
  vertical,
  tier,
}: {
  brandId: string | null;
  brandName: string;
  vertical: string;
  tier: string;
}) {
  const persona = derivePersona(vertical, tier);
  if (persona !== "agency" && brandId === null) return null;

  if (persona === "agency") {
    return (
      <div className="space-y-3">
        <h3
          className="text-[13px] font-semibold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <Building2 size={14} style={{ color: "var(--layer-workflow)" }} />
          Agency Command Centre
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <PersonaSection
            title="Cross-brand task queue"
            description="View all open remediation tasks across your portfolio"
            icon={<Activity size={16} />}
            href="/action-center"
            color="var(--layer-workflow)"
          />
          <PersonaSection
            title="Brand comparison"
            description="Compare visibility scores across all brands"
            icon={<Eye size={16} />}
            href="/brands"
            color="var(--layer-visibility)"
          />
        </div>
      </div>
    );
  }

  if (persona === "local_tradie") {
    return (
      <div className="space-y-3">
        <h3
          className="text-[13px] font-semibold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <MapPin size={14} style={{ color: "var(--layer-trust)" }} />
          Local Business Insights
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PersonaSection
            title="Agent readiness"
            description="How ready is your site for AI agent discovery?"
            icon={<Globe size={16} />}
            href={`/brands/${brandId}/retrieval`}
            color="var(--layer-retrieval)"
          />
          <PersonaSection
            title="Entity & trust"
            description="ABN, consensus, Knowledge Panel, Wikidata status"
            icon={<Shield size={16} />}
            href={`/brands/${brandId}/trust`}
            color="var(--layer-trust)"
          />
          <PersonaSection
            title="Health check"
            description="AI presence, site readiness and local authority, side by side"
            icon={<Activity size={16} />}
            href={`/brands/${brandId}/health-check`}
            color="var(--success)"
          />
          <PersonaSection
            title="Top 5 actions"
            description="Your highest-priority fixes to improve visibility"
            icon={<Activity size={16} />}
            href={`/brands/${brandId}/autopilot`}
            color="var(--layer-workflow)"
          />
        </div>
      </div>
    );
  }

  // SMB
  return (
    <div className="space-y-3">
      <h3
        className="text-[13px] font-semibold flex items-center gap-2"
        style={{ color: "var(--text-primary)" }}
      >
        <Activity size={14} style={{ color: "var(--accent-blue)" }} />
        {brandName} Overview
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PersonaSection
          title="Health check"
          description="AI presence, site readiness and local authority, side by side"
          icon={<Activity size={16} />}
          href={`/brands/${brandId}/health-check`}
          color="var(--success)"
        />
        <PersonaSection
          title="Top fixes"
          description="Priority actions to improve your citation rate"
          icon={<Activity size={16} />}
          href={`/brands/${brandId}/autopilot`}
          color="var(--layer-workflow)"
        />
        <PersonaSection
          title="Visibility trends"
          description="How your AI presence is changing over time"
          icon={<Eye size={16} />}
          href={`/brands/${brandId}/visibility`}
          color="var(--layer-visibility)"
        />
        <PersonaSection
          title="Trust & entity"
          description="Entity authority, LinkedIn, Knowledge Panel status"
          icon={<Shield size={16} />}
          href={`/brands/${brandId}/trust`}
          color="var(--layer-trust)"
        />
      </div>
    </div>
  );
}
