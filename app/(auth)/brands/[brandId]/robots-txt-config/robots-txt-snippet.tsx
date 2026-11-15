"use client";

import { Check, Clipboard, Download } from "lucide-react";
import { useCallback, useState } from "react";

interface RobotsTxtSnippetProps {
  domain: string;
  allowedBotAgents: string[];
}

function generateSnippet(domain: string, agents: string[]): string {
  const lines = [`# AI-crawler-friendly robots.txt (${agents.length} bots allowed)`];
  for (const agent of agents) {
    lines.push("", `User-agent: ${agent}`, "Allow: /");
  }
  lines.push(
    "",
    `Sitemap: https://${domain}/sitemap.xml`,
    `LLM-Content: https://${domain}/llms.txt`,
  );
  return lines.join("\n");
}

export function RobotsTxtSnippet({ domain, allowedBotAgents }: RobotsTxtSnippetProps) {
  const [copied, setCopied] = useState(false);
  const snippet = generateSnippet(domain, allowedBotAgents);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [snippet]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([snippet], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "robots.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [snippet]);

  return (
    <div
      style={{
        borderRadius: 8,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        padding: 20,
      }}
    >
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text-primary)",
          margin: "0 0 12px",
        }}
      >
        Generated robots.txt (AI-crawler-friendly)
      </h3>
      {/* 17 Nov, part 3: the list is the crawlers we recommend allowing, less any your own robots.txt blocks on
          purpose (lib/robots-txt/display.ts snippetAgents). It used to be every crawler not in a 5-crawler
          blocked list, so "(27 bots allowed)" counted crawlers nothing had checked. */}
      <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 12px" }}>
        A suggested file, not your current one. It allows the AI crawlers we recommend allowing,
        leaving out any your robots.txt blocks by name.
      </p>
      <pre
        style={{
          fontSize: 11,
          padding: 16,
          borderRadius: 6,
          overflowX: "auto",
          background: "var(--bg-subtle)",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
          margin: 0,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {snippet}
      </pre>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            background: "var(--accent-primary)",
            color: "var(--accent-primary-fg)",
            border: "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {copied ? (
            <Check style={{ width: 14, height: 14 }} />
          ) : (
            <Clipboard style={{ width: 14, height: 14 }} />
          )}
          {copied ? "Copied" : "Copy to clipboard"}
        </button>
        <button
          type="button"
          onClick={handleDownload}
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
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Download style={{ width: 14, height: 14 }} />
          Download
        </button>
      </div>
    </div>
  );
}
