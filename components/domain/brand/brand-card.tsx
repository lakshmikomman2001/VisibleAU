"use client";

import { formatDistanceToNow } from "date-fns";
import { MapPin } from "lucide-react";
import Link from "next/link";
import { BrandFavicon } from "./brand-favicon";

interface BrandCardProps {
  id: string;
  name: string;
  domain: string;
  vertical: string;
  primaryRegions: string[];
  lastAuditScore: string | null;
  lastAuditAt: string | null;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

export function BrandCard({
  id,
  name,
  domain,
  vertical,
  primaryRegions,
  lastAuditScore,
  lastAuditAt,
}: BrandCardProps) {
  const regionDisplay = primaryRegions?.[0]?.split(":").pop() ?? "AU";

  return (
    <Link href={`/brands/${id}`} style={{ textDecoration: "none", display: "block" }}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: parent Link provides interactive role */}
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          padding: 20,
          cursor: "pointer",
          transition: "background 0.15s ease",
          height: "100%",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--bg-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--bg-elevated)";
        }}
      >
        {/* Top row: favicon + name + domain */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <BrandFavicon domain={domain} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {domain}
            </div>
          </div>
        </div>

        {/* Badges row: vertical + region */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 8px",
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 500,
              background: "var(--accent-muted)",
              color: "var(--text-secondary)",
              border: "none",
              whiteSpace: "nowrap",
            }}
          >
            {capitalize(vertical)}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              fontSize: 11,
              color: "var(--text-tertiary)",
            }}
          >
            <MapPin style={{ width: 11, height: 11 }} />
            {regionDisplay}
          </span>
        </div>

        {/* Bottom: score + time */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 16,
            paddingTop: 14,
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          {lastAuditScore != null ? (
            <div>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 1 }}>
                Visibility score
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-primary)",
                }}
              >
                {Number(lastAuditScore).toFixed(1)}
              </div>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontStyle: "italic" }}>
              Never audited
            </span>
          )}

          {lastAuditAt && (
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {formatDistanceToNow(new Date(lastAuditAt), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
