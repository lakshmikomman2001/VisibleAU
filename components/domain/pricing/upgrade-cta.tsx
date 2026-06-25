"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

interface Props {
  currentTier: string;
  context?: string;
}

const TIER_ORDER = ["free", "starter", "growth", "agency", "agency_pro", "enterprise"];

const TIER_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  agency: "Agency",
  agency_pro: "Agency Pro",
  enterprise: "Enterprise",
};

function nextTier(current: string): string | null {
  const idx = TIER_ORDER.indexOf(current);
  if (idx === -1 || idx >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}

const CONTEXT_MESSAGES: Record<string, (tier: string) => string> = {
  "quota-exceeded": (t) => `Upgrade to ${TIER_LABELS[t] ?? t} to increase your audit quota`,
  "brand-limit": (t) => `Upgrade to ${TIER_LABELS[t] ?? t} to track more brands`,
  "schedule-locked": (t) => `Upgrade to ${TIER_LABELS[t] ?? t} to unlock scheduled audits`,
  recommendations: (t) => `Upgrade to ${TIER_LABELS[t] ?? t} to unlock full recommendations`,
  default: (t) => `Upgrade to ${TIER_LABELS[t] ?? t}`,
};

export default function UpgradeCta({ currentTier, context }: Props) {
  const router = useRouter();
  const target = nextTier(currentTier);
  if (!target || target === "enterprise") return null;

  const getMessage = CONTEXT_MESSAGES[context ?? "default"] ?? CONTEXT_MESSAGES.default;
  const message = getMessage(target);

  return (
    <button
      onClick={() => router.push(`/pricing`)}
      className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
      style={{ backgroundColor: "#3b82f6", color: "#fff" }}
    >
      {message}
      <ArrowUpRight style={{ width: 14, height: 14 }} />
    </button>
  );
}
