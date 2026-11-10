"use client";

import { useState } from "react";
import { CRAWLER_NAME } from "@/lib/product";

/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 2 -- what the Crawler Logs page says about AI crawlers reaching
 * the site, from what was really checked (lib/crawler/crawler-access.ts), as us. It said "Cloudflare is blocking
 * AI search engines from reading your site" after one request sent as GPTBot.
 * - robots.txt's own rules: "robots.txt blocks GPTBot" is a fact we read.
 * - our checker refused: a fact about our checker; whether AI crawlers are refused too isn't known.
 * - the rest can't be tested from outside: the crawler's verified visits in the logs are what show it.
 */
interface CdnBlockAlertProps {
  detectedFirewall: string;
  remediationSnippet: string;
  brandDomain: string;
  /** The HTTP status our checker got. */
  probeStatus?: number | null;
}

/** The site refused our checker. Its fix is said as a condition: we don't know it refuses AI crawlers. */
export function CdnBlockAlert({
  detectedFirewall,
  remediationSnippet,
  brandDomain,
  probeStatus = null,
}: CdnBlockAlertProps) {
  const [copied, setCopied] = useState(false);
  const snippet = remediationSnippet.replace(/<brand domain>/g, brandDomain);
  const who =
    detectedFirewall === "Unknown" ? "A security layer in front of your site" : detectedFirewall;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="rounded-lg border p-5"
      role="alert"
      aria-label="Your site refused our site checker"
      style={{
        borderColor: "color-mix(in srgb, var(--warning) 40%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold" style={{ color: "var(--warning)" }}>
            Your site refused our site checker
          </h3>
          <p className="mt-1 text-sm" style={{ color: "var(--foreground)" }}>
            {who} answered our checker ({CRAWLER_NAME})
            {probeStatus ? ` with HTTP ${probeStatus}` : " with a block"}. If it refuses AI crawlers
            the same way, they can&apos;t read your site; whether it does can&apos;t be tested from
            outside.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors shrink-0"
          aria-label="Copy remediation snippet"
          style={{
            backgroundColor: copied
              ? "color-mix(in srgb, var(--success) 15%, transparent)"
              : "color-mix(in srgb, var(--foreground) 10%, transparent)",
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

export interface CrawlerAccessCheckView {
  brandDomain: string;
  robotsTxt: "found" | "absent" | "unreachable";
  robots: Array<{ agent: string; verdict: "allowed" | "blocked"; sentence: string }> | null;
  robotsBlocks: string[];
  checkerRefused: boolean;
  probeStatus: number | null;
  detectedFirewall: string;
  remediationSnippet: string | null;
  untestable: string;
}

/** Everything the page can say about AI crawler access: robots.txt, our checker, and what can't be known. */
export function CrawlerAccessNotice({
  check,
  hasVisits,
  logsHref,
}: {
  check: CrawlerAccessCheckView;
  /** The page's logs have visits: they're what show which crawlers get through. */
  hasVisits: boolean;
  /** Where the log upload is (the brand's Agent Analytics page). */
  logsHref: string;
}) {
  const blocked = (check.robots ?? []).filter((r) => r.verdict === "blocked");
  return (
    <div className="space-y-3" data-crawler-access>
      {blocked.length > 0 && (
        <div
          role="alert"
          aria-label="robots.txt blocks AI crawlers"
          className="rounded-lg border p-5"
          style={{
            borderColor: "color-mix(in srgb, var(--danger) 40%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
          }}
        >
          <h3 className="text-lg font-semibold" style={{ color: "var(--danger)" }}>
            robots.txt blocks {blocked.map((r) => r.agent).join(", ")}
          </h3>
          <ul className="mt-2 space-y-1 text-sm" style={{ color: "var(--foreground)" }}>
            {blocked.map((r) => (
              <li key={r.agent}>{r.sentence}.</li>
            ))}
          </ul>
          <p className="mt-2 text-sm" style={{ color: "var(--foreground)" }}>
            To let them read your site, remove or narrow those Disallow rules in robots.txt.
          </p>
        </div>
      )}
      {check.checkerRefused && check.remediationSnippet && (
        <CdnBlockAlert
          detectedFirewall={check.detectedFirewall}
          remediationSnippet={check.remediationSnippet}
          brandDomain={check.brandDomain}
          probeStatus={check.probeStatus}
        />
      )}
      {check.robotsTxt === "unreachable" && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          robots.txt couldn&apos;t be read, so what it allows each AI crawler isn&apos;t known.
        </p>
      )}
      <p className="text-sm" style={{ color: "var(--text-secondary)" }} data-cdn-untestable>
        {hasVisits
          ? "The verified visits below show which AI crawlers get through. A crawler your CDN or firewall refuses never reaches these logs, and that can't be tested from outside."
          : check.untestable}{" "}
        <a href={logsHref} className="underline" style={{ color: "var(--accent-blue)" }}>
          Connect your logs
        </a>
      </p>
    </div>
  );
}
