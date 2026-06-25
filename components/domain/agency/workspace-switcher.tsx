"use client";

import { ChevronDown, Globe, LayoutGrid } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface Brand {
  id: string;
  name: string;
  domain: string;
}

const AGENCY_TIERS = ["agency", "agency_pro", "enterprise"];

export function WorkspaceSwitcher({ tier }: { tier: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const brandIdMatch = pathname.match(/^\/brands\/([^/]+)/);
  const currentBrandId = brandIdMatch?.[1];
  const isAgency = AGENCY_TIERS.includes(tier);
  const isOnAgencyPage = pathname === "/agency" || pathname.startsWith("/agency/");

  useEffect(() => {
    fetch("/api/brands")
      .then((r) => r.json())
      .then((data) => setBrands(data.brands ?? []))
      .catch(() => setBrands([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    },
    [],
  );

  const currentBrand = currentBrandId ? brands.find((b) => b.id === currentBrandId) : null;

  let displayLabel = "Select brand";
  if (isOnAgencyPage) {
    displayLabel = `All brands (${brands.length})`;
  } else if (currentBrand) {
    displayLabel = currentBrand.name;
  } else if (brands.length === 1) {
    displayLabel = brands[0].name;
  }

  if (loading) {
    return (
      <div
        style={{
          height: 32,
          padding: "0 10px",
          borderRadius: 6,
          border: "1px solid var(--border-default)",
          background: "var(--bg-elevated)",
          color: "var(--text-tertiary)",
          fontSize: 13,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          minWidth: 140,
        }}
      >
        <Globe style={{ width: 14, height: 14 }} />
        Loading...
      </div>
    );
  }

  if (brands.length === 0 && !isAgency) {
    return (
      <div
        style={{
          height: 32,
          padding: "0 10px",
          borderRadius: 6,
          border: "1px solid var(--border-default)",
          background: "var(--bg-elevated)",
          color: "var(--text-tertiary)",
          fontSize: 13,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Globe style={{ width: 14, height: 14 }} />
        No brands
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch workspace"
        style={{
          height: 32,
          padding: "0 8px 0 10px",
          borderRadius: 6,
          border: "1px solid var(--border-default)",
          background: open ? "var(--bg-elevated)" : "transparent",
          color: "var(--text-primary)",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          maxWidth: 220,
          whiteSpace: "nowrap",
        }}
      >
        {isOnAgencyPage ? (
          <LayoutGrid style={{ width: 14, height: 14, color: "var(--accent-primary)", flexShrink: 0 }} />
        ) : (
          <Globe style={{ width: 14, height: 14, color: "var(--text-secondary)", flexShrink: 0 }} />
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{displayLabel}</span>
        <ChevronDown
          style={{
            width: 12,
            height: 12,
            color: "var(--text-tertiary)",
            flexShrink: 0,
            transition: "transform 0.15s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Workspaces"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            minWidth: 220,
            maxHeight: 320,
            overflowY: "auto",
            borderRadius: 8,
            border: "1px solid var(--border-default)",
            background: "var(--bg-elevated)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 50,
            padding: 4,
          }}
        >
          {isAgency && (
            <>
              <button
                type="button"
                role="option"
                aria-selected={isOnAgencyPage}
                onClick={() => {
                  router.push("/agency");
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: isOnAgencyPage ? "var(--accent-primary)" : "transparent",
                  color: isOnAgencyPage ? "var(--accent-primary-fg)" : "var(--text-primary)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  if (!isOnAgencyPage) e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!isOnAgencyPage) e.currentTarget.style.background = "transparent";
                }}
              >
                <LayoutGrid style={{ width: 14, height: 14, flexShrink: 0 }} />
                All brands ({brands.length})
              </button>
              <div
                style={{
                  height: 1,
                  background: "var(--border-subtle)",
                  margin: "4px 0",
                }}
              />
            </>
          )}

          {brands.map((brand) => {
            const isActive = brand.id === currentBrandId;
            return (
              <button
                key={brand.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  router.push(`/brands/${brand.id}`);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: isActive ? "var(--accent-primary)" : "transparent",
                  color: isActive ? "var(--accent-primary-fg)" : "var(--text-primary)",
                  fontSize: 13,
                  fontWeight: isActive ? 500 : 400,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 2,
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                <span>{brand.name}</span>
                <span
                  style={{
                    fontSize: 11,
                    color: isActive ? "var(--accent-primary-fg)" : "var(--text-tertiary)",
                    opacity: isActive ? 0.8 : 1,
                  }}
                >
                  {brand.domain}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
