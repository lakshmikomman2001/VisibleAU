"use client";

import { Activity, ArrowRight, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { HEALTH_CHECK_TITLE } from "./health-check-panel";

/**
 * Overview (7 Nov), item 4: the Health Check banner for the brand the switcher shows. It used to say
 * "AI Visibility Health Check" for whichever brand Postgres returned first, and it couldn't be
 * dismissed. Health Check (7 Nov): the page has no combined score any more, and the banner shows none. Dismissing it is saved for this
 * person only (lib/onboarding/dismissed-notices.ts); if the save fails, the banner comes back.
 */
export function HealthCheckBanner({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    fetch(`/api/brands/${brandId}/health-check-banner`, { method: "DELETE" })
      .then((res) => {
        if (!res.ok) setDismissed(false);
      })
      .catch(() => setDismissed(false));
  };

  return (
    <div
      data-health-check-banner={brandId}
      className="w-full flex items-center gap-2 pl-5 pr-2 py-3 rounded-xl mb-6 motion-safe:animate-gradient-shift"
      style={{
        background: "var(--autopilot-gradient, linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa))",
        backgroundSize: "200% auto",
      }}
    >
      <Link
        href={`/brands/${brandId}/health-check`}
        className="flex-1 min-w-0 flex flex-wrap items-center justify-between gap-3 py-1 text-left"
        style={{ textDecoration: "none" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Activity
            aria-hidden="true"
            style={{ width: 18, height: 18, color: "rgba(255,255,255,0.9)", flexShrink: 0 }}
          />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold" style={{ color: "#fff" }}>
              {brandName}&apos;s Health Check is ready
            </div>
            <div className="text-[12px]" style={{ color: "rgba(255,255,255,0.8)" }}>
              {HEALTH_CHECK_TITLE}, each measured on its own, and your #1 recommended action.
            </div>
          </div>
        </div>
        <span
          className="flex items-center gap-1 text-[12px] font-medium shrink-0"
          style={{ color: "#fff" }}
        >
          View health check <ArrowRight aria-hidden="true" style={{ width: 12, height: 12 }} />
        </span>
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label={`Dismiss ${brandName}'s Health Check banner`}
        className="flex items-center justify-center rounded-md shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          width: 44,
          height: 44,
          border: "none",
          background: "transparent",
          color: "rgba(255,255,255,0.85)",
          cursor: "pointer",
        }}
      >
        <X aria-hidden="true" style={{ width: 16, height: 16 }} />
      </button>
    </div>
  );
}
