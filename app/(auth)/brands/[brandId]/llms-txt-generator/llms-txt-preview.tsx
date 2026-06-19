"use client";

import { Check, Clipboard, Download } from "lucide-react";
import { useCallback, useState } from "react";

interface LlmsTxtPreviewProps {
  brandName: string;
  domain: string;
  vertical: string;
  regions: string;
}

const VERTICAL_TEMPLATES: Record<
  string,
  {
    tagline: [string, string];
    services: Array<{ name: string; slug: string; desc: string }>;
    faqs: Array<{ q: string; anchor: string }>;
    blog: string;
  }
> = {
  tradies: {
    tagline: [
      "Professional trade services in {regions}.",
      "Licensed, insured, and locally trusted.",
    ],
    services: [
      { name: "Emergency repairs", slug: "emergency", desc: "24/7 callouts" },
      { name: "Installations", slug: "installations", desc: "New installations and upgrades" },
      { name: "Maintenance", slug: "maintenance", desc: "Scheduled maintenance plans" },
    ],
    faqs: [
      { q: "How much does a callout cost?", anchor: "cost" },
      { q: "What areas do you service?", anchor: "areas" },
      { q: "Are you licensed and insured?", anchor: "licence" },
    ],
    blog: "Trade tips for homeowners",
  },
  allied_health: {
    tagline: [
      "Allied health services in {regions}.",
      "AHPRA registered, Medicare & NDIS accepted.",
    ],
    services: [
      {
        name: "Initial assessment",
        slug: "assessment",
        desc: "Comprehensive intake and evaluation",
      },
      { name: "Treatment plans", slug: "treatment", desc: "Personalised care programs" },
      { name: "Telehealth", slug: "telehealth", desc: "Remote consultations available" },
    ],
    faqs: [
      { q: "Do you accept Medicare?", anchor: "medicare" },
      { q: "What are your opening hours?", anchor: "hours" },
      { q: "Do you offer NDIS services?", anchor: "ndis" },
    ],
    blog: "Health tips and practice updates",
  },
  saas: {
    tagline: [
      "Software solutions for Australian businesses.",
      "Cloud-based, secure, and scalable.",
    ],
    services: [
      { name: "Platform overview", slug: "platform", desc: "Core features and capabilities" },
      { name: "Integrations", slug: "integrations", desc: "Connect with your existing tools" },
      { name: "Pricing", slug: "pricing", desc: "Plans for teams of every size" },
    ],
    faqs: [
      { q: "Is there a free trial?", anchor: "trial" },
      { q: "How does billing work?", anchor: "billing" },
      { q: "Is my data stored in Australia?", anchor: "data-residency" },
    ],
    blog: "Product updates and industry insights",
  },
};

function generateLlmsTxt(
  brandName: string,
  domain: string,
  vertical: string,
  regions: string,
): string {
  const tmpl = VERTICAL_TEMPLATES[vertical] ?? VERTICAL_TEMPLATES.tradies;
  const base = `https://${domain}`;
  const regionText = regions || "your local area";

  const tagline0 = tmpl.tagline[0].replace("{regions}", regionText);
  const tagline1 = tmpl.tagline[1].replace("{regions}", regionText);

  const lines = [
    `# ${brandName}`,
    `> ${tagline0}`,
    `> ${tagline1}`,
    "",
    "## About",
    `- [About us](${base}/about): Company overview and credentials`,
    `- [Service areas](${base}/areas): ${regionText}`,
    `- [Reviews](${base}/reviews): Customer testimonials and ratings`,
    "",
    "## Services",
    ...tmpl.services.map((s) => `- [${s.name}](${base}/${s.slug}): ${s.desc}`),
    "",
    "## FAQs",
    ...tmpl.faqs.map((f) => `- [${f.q}](${base}/faq#${f.anchor})`),
    "",
    "## Optional",
    `- [Blog](${base}/blog): ${tmpl.blog}`,
  ];

  return lines.join("\n");
}

export function LlmsTxtPreview({ brandName, domain, vertical, regions }: LlmsTxtPreviewProps) {
  const [copied, setCopied] = useState(false);
  const content = generateLlmsTxt(brandName, domain, vertical, regions);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "llms.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [content]);

  return (
    <div
      style={{
        borderRadius: 8,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Generated llms.txt (preview)
        </h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              height: 28,
              padding: "0 10px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {copied ? (
              <Check style={{ width: 12, height: 12 }} />
            ) : (
              <Clipboard style={{ width: 12, height: 12 }} />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            style={{
              height: 28,
              padding: "0 10px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              background: "var(--accent-primary)",
              color: "var(--accent-primary-fg)",
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Download style={{ width: 12, height: 12 }} />
            Download
          </button>
        </div>
      </div>
      <pre
        style={{
          fontSize: 12,
          padding: 20,
          margin: 0,
          overflowX: "auto",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
          lineHeight: 1.7,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {content}
      </pre>
    </div>
  );
}
