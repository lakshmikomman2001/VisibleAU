"use client";

import { BookOpen, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { LoadError } from "@/components/shared/load-error";
import type { VerticalPack } from "@/db/schema";
import { useLoad } from "@/lib/hooks/use-load";
import { fetchJson } from "@/lib/load/fetch-json";

const VERTICAL_DESCRIPTIONS: Record<string, string> = {
  tradies: "Plumber, electrician, builder, landscaper",
  saas: "B2B software, dev tools",
  allied_health: "Physio, psych, dietitian and other clinics.",
};

// 16 Nov, part 7: no "coming v1.1" (Professional Services, Real Estate) or "coming soon" (Hospitality, Retail, Beauty)
// cards. A law firm, an agent, a café, a shop or a salon is supported now -- as the business type it confirms (the
// wizard's "Other local business"), not a pack -- so those cards promised something that had already happened another
// way.

interface PackBrowserProps {
  mode: "wizard" | "browser";
  onSelect?: (pack: VerticalPack) => void;
  selectedPackId?: string;
}

type ActiveCard = VerticalPack & { status: "active"; brandsCount?: number };
type CardItem = ActiveCard;

// Follow-ups from af8de42..d1eb5a1, part 1: a failed fetch was `.catch(() => {})` (and an error body was set
// as the pack list), so only the coming-soon packs showed, none of them selectable. It says so now.
async function loadPacks(signal: AbortSignal) {
  return fetchJson<(VerticalPack & { brandsCount?: number })[]>("/api/vertical-packs", { signal });
}

export function PackBrowser({ mode, onSelect, selectedPackId }: PackBrowserProps) {
  const router = useRouter();
  const packs = useLoad(loadPacks);
  const activePacks = packs.data ?? [];

  if (packs.status === "error") {
    return <LoadError what="the industry packs" detail={packs.detail} onRetry={packs.retry} />;
  }

  const allCards: CardItem[] = activePacks.map((p) => ({ ...p, status: "active" as const }));

  const handleCardClick = (card: CardItem) => {
    if (card.status !== "active") return;
    if (mode === "browser") {
      router.push(`/verticals/${card.id}`);
    } else {
      onSelect?.(card as VerticalPack);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 16 }}>
      {allCards.map((card) => {
        const isActive = card.status === "active";
        const isSelected = isActive && selectedPackId === card.id;

        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: non-active cards have no role; active cards have role="button"
          <div
            key={card.id}
            onClick={() => handleCardClick(card)}
            onKeyDown={(e) => e.key === "Enter" && handleCardClick(card)}
            role={isActive ? "button" : undefined}
            tabIndex={isActive ? 0 : undefined}
            style={{
              padding: 20,
              borderRadius: 8,
              cursor: isActive ? "pointer" : "default",
              opacity: isActive ? 1 : 0.5,
              background: isSelected ? "var(--accent-blue-soft)" : "var(--bg-elevated)",
              border: isSelected
                ? "1px solid var(--accent-blue)"
                : "1px solid var(--border-default)",
              transition: "background 0.15s ease, border-color 0.15s ease",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isActive ? "var(--accent-blue-soft)" : "var(--accent-muted)",
                  color: isActive ? "var(--accent-blue)" : "var(--text-tertiary)",
                }}
              >
                {isActive ? (
                  <BookOpen style={{ width: 16, height: 16 }} />
                ) : (
                  <Lock style={{ width: 14, height: 14 }} />
                )}
              </div>
              {isActive && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: "2px 8px",
                    borderRadius: 9999,
                    background: "var(--success-soft)",
                    color: "var(--success)",
                  }}
                >
                  Active
                </span>
              )}
            </div>

            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 4,
              }}
            >
              {card.name}
            </div>

            {isActive ? (
              <>
                {VERTICAL_DESCRIPTIONS[(card as ActiveCard).vertical] && (
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>
                    {VERTICAL_DESCRIPTIONS[(card as ActiveCard).vertical]}
                  </div>
                )}
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
                  {(card as ActiveCard).promptsCount} prompts &middot;{" "}
                  {(card as ActiveCard).version ?? "v1.0"}
                </div>
                {(card as ActiveCard).brandsCount !== undefined && (
                  <div
                    style={{ fontSize: 11, color: "var(--text-tertiary)" }}
                    title="Brands still drawing prompts from this shared pack. Brands with AI-classified prompt packs run brand-specific prompts instead."
                  >
                    {(card as ActiveCard).brandsCount} brand
                    {(card as ActiveCard).brandsCount !== 1 ? "s" : ""} using pack
                  </div>
                )}
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
