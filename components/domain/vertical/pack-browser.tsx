"use client";

import { BookOpen, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { VerticalPack } from "@/db/schema";

const VERTICAL_DESCRIPTIONS: Record<string, string> = {
  tradies: "Plumber, electrician, builder, landscaper",
  saas: "B2B software, dev tools",
  allied_health: "Physio, psych, dietitian. AHPRA-aware framing.",
};

const COMING_V1_1_PACKS = [
  {
    id: "professional_services",
    name: "Professional Services",
    desc: "Accountants, lawyers, consultants.",
    status: "coming-v1.1" as const,
  },
  {
    id: "real_estate",
    name: "Real Estate",
    desc: "Sales agents, property managers, buyer agents.",
    status: "coming-v1.1" as const,
  },
];

const COMING_SOON_PACKS = [
  {
    id: "hospitality",
    name: "Hospitality",
    desc: "Cafe, restaurant, accommodation.",
    status: "coming-soon" as const,
  },
  {
    id: "retail_ecommerce",
    name: "Retail / E-commerce",
    desc: "Online stores, ChatGPT Shopping surfaces.",
    status: "coming-soon" as const,
  },
  {
    id: "beauty",
    name: "Beauty / Personal Care",
    desc: "Salon, clinic, spa.",
    status: "coming-soon" as const,
  },
];

interface PackBrowserProps {
  mode: "wizard" | "browser";
  onSelect?: (pack: VerticalPack) => void;
  selectedPackId?: string;
}

type ActiveCard = VerticalPack & { status: "active"; brandsCount?: number };
type FutureCard = { id: string; name: string; desc: string; status: "coming-v1.1" | "coming-soon" };
type CardItem = ActiveCard | FutureCard;

export function PackBrowser({ mode, onSelect, selectedPackId }: PackBrowserProps) {
  const router = useRouter();
  const [activePacks, setActivePacks] = useState<(VerticalPack & { brandsCount?: number })[]>([]);

  useEffect(() => {
    fetch("/api/vertical-packs")
      .then((r) => r.json())
      .then(setActivePacks)
      .catch(() => {});
  }, []);

  const allCards: CardItem[] = [
    ...activePacks.map((p) => ({ ...p, status: "active" as const })),
    ...COMING_V1_1_PACKS,
    ...(mode === "browser" ? COMING_SOON_PACKS : []),
  ];

  const handleCardClick = (card: CardItem) => {
    if (card.status !== "active") return;
    if (mode === "browser") {
      router.push(`/verticals/${card.id}`);
    } else {
      onSelect?.(card as VerticalPack);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
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
              {!isActive && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    padding: "2px 6px",
                    borderRadius: 9999,
                    background: "var(--accent-muted)",
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {card.status === "coming-v1.1" ? "v1.1" : "Soon"}
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
                    {(card as ActiveCard).brandsCount !== 1 ? "s" : ""} using
                    pack
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                {(card as FutureCard).desc}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
