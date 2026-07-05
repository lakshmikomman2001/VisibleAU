"use client";

import type { ReportTone } from "@/lib/communication/types";

interface ToneSelectorProps {
  value: ReportTone;
  onChange: (tone: ReportTone) => void;
}

const TONE_OPTIONS: { value: ReportTone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "plain_english", label: "Plain English" },
  { value: "executive", label: "Executive" },
];

export function ToneSelector({ value, onChange }: ToneSelectorProps) {
  return (
    <div
      className="inline-flex rounded-lg overflow-hidden"
      style={{
        border: "1px solid var(--border-default)",
        backgroundColor: "var(--bg-subtle)",
      }}
      role="radiogroup"
      aria-label="Report tone"
    >
      {TONE_OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              border: "none",
              cursor: "pointer",
              backgroundColor: selected
                ? `color-mix(in srgb, var(--layer-comm) 19%, transparent)`
                : "transparent",
              color: selected
                ? "var(--layer-comm)"
                : "var(--text-secondary)",
              borderRight: "1px solid var(--border-subtle)",
              outline: "none",
            }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = `0 0 0 2px var(--focus-ring)`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
