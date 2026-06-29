"use client";

import { useRouter } from "next/navigation";

interface BrandFilterProps {
  brands: Array<{ id: string; name: string }>;
  selectedBrandId: string | null;
}

export function BrandFilter({ brands, selectedBrandId }: BrandFilterProps) {
  const router = useRouter();

  return (
    <select
      value={selectedBrandId ?? "all"}
      onChange={(e) => {
        const val = e.target.value;
        router.push(val === "all" ? "/action-center" : `/action-center?brand=${val}`);
      }}
      style={{
        height: 32,
        padding: "0 12px",
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        background: "var(--bg-elevated)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-default)",
        cursor: "pointer",
      }}
    >
      <option value="all">All brands</option>
      {brands.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
