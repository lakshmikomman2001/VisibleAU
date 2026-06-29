"use client";

import type { ReactNode } from "react";

interface TierGateProps {
  requiredTier: string;
  locked: boolean;
  children: ReactNode;
}

export function TierGate({ requiredTier, locked, children }: TierGateProps) {
  if (!locked) return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none" aria-hidden="true">
        {children}
      </div>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center rounded-lg"
        style={{
          backdropFilter: "blur(6px)",
          backgroundColor: "color-mix(in srgb, var(--bg-base) 70%, transparent)",
        }}
      >
        <svg
          className="w-8 h-8 mb-2"
          style={{ color: "var(--text-tertiary)" }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
        <p
          className="text-sm font-medium mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          {requiredTier} plan required
        </p>
        <button
          className="text-xs font-medium px-3 py-1 rounded-full"
          style={{
            backgroundColor: "var(--accent-primary)",
            color: "var(--accent-primary-fg)",
          }}
          onClick={() => {
            window.location.href = "/settings/billing";
          }}
        >
          Upgrade
        </button>
      </div>
    </div>
  );
}
