"use client";

import { useState } from "react";

export function BrandFavicon({ domain }: { domain: string }) {
  const [error, setError] = useState(false);
  const initials = (domain ?? "").split(".")[0].slice(0, 2).toUpperCase() || "??";

  if (!domain || error) {
    return (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          background: "var(--accent-blue-soft)",
          color: "var(--accent-blue)",
        }}
      >
        {initials}
      </div>
    );
  }

  return (
    // biome-ignore lint/performance/noImgElement: external favicon URLs not in next.config images domains
    <img
      src={`https://${domain}/favicon.ico`}
      alt={`${domain} logo`}
      width={32}
      height={32}
      style={{ borderRadius: 4, flexShrink: 0 }}
      onError={() => setError(true)}
    />
  );
}
