"use client";

import { formatDistanceToNow } from "date-fns";
import { ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { formatLocation } from "@/lib/verticals/expand-prompt";
import { LAST_AUDIT_TONE_STYLE, lastAuditTone } from "@/lib/brands/audit-age";

const GRADIENTS = [
  "linear-gradient(135deg, #f97316, #ea580c)",
  "linear-gradient(135deg, #06b6d4, #0891b2)",
  "linear-gradient(135deg, #8b5cf6, #6366f1)",
  "linear-gradient(135deg, #22c55e, #16a34a)",
  "linear-gradient(135deg, #ec4899, #db2777)",
];

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

interface BrandRowProps {
  brand: {
    id: string;
    name: string;
    domain: string;
    vertical: string;
    primaryRegions: string[];
    lastAuditScore: string | null;
    lastAuditAt: string | null;
    lastAuditStatus: string | null;
  };
  index: number;
  isLast: boolean;
}

export function BrandRow({ brand, index, isLast }: BrandRowProps) {
  const regionLabel = formatLocation(brand.primaryRegions?.[0]);
  const timeLabel = brand.lastAuditAt
    ? formatDistanceToNow(new Date(brand.lastAuditAt), { addSuffix: true })
    : "Never";
  // Live invite test follow-ups (8 Nov), part 4: the badge's colour says how old the audit is.
  const toneName = lastAuditTone(brand.lastAuditAt, brand.lastAuditStatus);
  const tone = LAST_AUDIT_TONE_STYLE[toneName];

  return (
    <Link
      href={`/brands/${brand.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "4fr 2fr 2fr 2fr 2fr",
        padding: "14px 20px",
        alignItems: "center",
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        textDecoration: "none",
        cursor: "pointer",
        transition: "background 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            background: GRADIENTS[index % GRADIENTS.length],
          }}
        >
          {brand.name[0].toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {brand.name}
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
            {brand.domain}
          </div>
        </div>
      </div>

      <div>
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
          }}
        >
          {capitalize(brand.vertical)}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12.5,
          color: "var(--text-secondary)",
        }}
      >
        <MapPin style={{ width: 12, height: 12 }} />
        {regionLabel}
      </div>

      <div
        style={{
          textAlign: "right",
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {brand.lastAuditScore ? Number.parseFloat(brand.lastAuditScore).toFixed(1) : "—"}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            padding: "2px 8px",
            borderRadius: 9999,
            background: tone.bg,
            color: tone.color,
          }}
          data-audit-tone={toneName}
        >
          {timeLabel}
        </span>
        <ChevronRight style={{ width: 14, height: 14, color: "var(--text-tertiary)" }} />
      </div>
    </Link>
  );
}
