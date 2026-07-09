"use client";

import { useState } from "react";

interface CdnBlockAlertProps {
  detectedFirewall: string;
  remediationSnippet: string;
  brandDomain: string;
}

export function CdnBlockAlert({ detectedFirewall, remediationSnippet, brandDomain }: CdnBlockAlertProps) {
  const [copied, setCopied] = useState(false);
  const snippet = remediationSnippet.replace(/<brand domain>/g, brandDomain);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="rounded-lg border p-5"
      role="alert"
      aria-label="AI Crawler Access Blocked"
      style={{
        borderColor: "color-mix(in srgb, var(--destructive) 40%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--destructive) 8%, transparent)",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold" style={{ color: "var(--destructive)" }}>
            AI Crawler Access Blocked
          </h3>
          <p className="mt-1 text-sm" style={{ color: "var(--foreground)" }}>
            {detectedFirewall} is blocking AI search engines from reading your site.
          </p>
        </div>
        <button
          onClick={handleCopy}
          className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors shrink-0"
          aria-label="Copy remediation snippet"
          style={{
            backgroundColor: copied ? "color-mix(in srgb, var(--success) 15%, transparent)" : "color-mix(in srgb, var(--foreground) 10%, transparent)",
            color: copied ? "var(--success)" : "var(--foreground)",
            cursor: "pointer",
          }}
        >
          {copied ? "Copied!" : "Copy Fix"}
        </button>
      </div>

      <pre
        className="mt-3 rounded-md p-3 text-sm whitespace-pre-wrap overflow-x-auto"
        style={{
          backgroundColor: "color-mix(in srgb, var(--foreground) 5%, transparent)",
          color: "var(--foreground)",
          fontFamily: "monospace",
        }}
      >
        {snippet}
      </pre>
    </div>
  );
}
