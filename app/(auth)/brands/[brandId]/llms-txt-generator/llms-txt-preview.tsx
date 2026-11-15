"use client";

import { Check, Clipboard, Download } from "lucide-react";
import { useCallback, useState } from "react";

interface LlmsTxtPreviewProps {
  brandName: string;
  domain: string;
  vertical: string;
  regions: string;
}

/**
 * 17 Nov, part 2 -- the llms.txt a business copies onto its own site never claims anything for it: a licence, a
 * registration, insurance, an accreditation, a government scheme or availability we haven't checked is a bracketed
 * line the owner completes or deletes (FILL_IN_NOTE says so above the preview). The templates said "Licensed, insured,
 * and locally trusted.", "AHPRA registered, Medicare & NDIS accepted.", "24/7 callouts", "Remote consultations
 * available" and "Cloud-based, secure, and scalable." for every business of the vertical. Questions ("Are you licensed
 * and insured?") stay: they point at the business's own answers. tests/unit/retrieval/no-claims-for-the-business.test.ts
 * guards it.
 */
export const FILL_IN_NOTE =
  "Lines in [square brackets] are for you: complete them or delete them before you publish. We don't know your licence, registrations, cover or hours, so we never fill them in for you.";

interface LlmsTemplate {
  tagline: string;
  /** The lines only the owner can fill in: each one bracketed. */
  facts: string[];
  services: Array<{ name: string; slug: string; desc: string }>;
  faqs: Array<{ q: string; anchor: string }>;
  blog: string;
}

const VERTICAL_TEMPLATES: Record<string, LlmsTemplate> = {
  tradies: {
    tagline: "Trade services in {regions}.",
    facts: [
      "Licence number: [add yours, or delete this line]",
      "Public liability insurance: [your insurer and cover, or delete this line]",
    ],
    services: [
      {
        name: "Emergency repairs",
        slug: "emergency",
        desc: "[your call-out hours (e.g. 24/7), or delete this line]",
      },
      { name: "Installations", slug: "installations", desc: "New installations and upgrades" },
      { name: "Maintenance", slug: "maintenance", desc: "Servicing and maintenance" },
    ],
    faqs: [
      { q: "How much does a callout cost?", anchor: "cost" },
      { q: "What areas do you service?", anchor: "areas" },
      { q: "Are you licensed and insured?", anchor: "licence" },
    ],
    blog: "Trade tips for homeowners",
  },
  allied_health: {
    tagline: "Allied health services in {regions}.",
    facts: [
      "AHPRA registration: [add yours, or delete this line]",
      "Bulk billing / Medicare: [yes / no, or delete this line]",
      "NDIS: [registered provider? yes / no, or delete this line]",
    ],
    services: [
      {
        name: "Initial assessment",
        slug: "assessment",
        desc: "Intake and evaluation",
      },
      { name: "Treatment plans", slug: "treatment", desc: "Personalised care programs" },
      {
        name: "Telehealth",
        slug: "telehealth",
        desc: "[remote consultations? yes / no, or delete this line]",
      },
    ],
    faqs: [
      { q: "Do you accept Medicare?", anchor: "medicare" },
      { q: "What are your opening hours?", anchor: "hours" },
      { q: "Do you offer NDIS services?", anchor: "ndis" },
    ],
    blog: "Health tips and practice updates",
  },
  saas: {
    tagline: "Software for Australian businesses.",
    facts: ["Where customer data is stored: [add yours, or delete this line]"],
    services: [
      { name: "Platform overview", slug: "platform", desc: "Core features and capabilities" },
      { name: "Integrations", slug: "integrations", desc: "Connect with your existing tools" },
      { name: "Pricing", slug: "pricing", desc: "Plans and pricing" },
    ],
    faqs: [
      { q: "Is there a free trial?", anchor: "trial" },
      { q: "How does billing work?", anchor: "billing" },
      { q: "Is my data stored in Australia?", anchor: "data-residency" },
    ],
    blog: "Product updates and industry insights",
  },
  // 16 Nov, part 3: every other business (a café, a gym, a law firm, an agent...) gets this, not the tradie template.
  local: {
    tagline: "Local business serving {regions}.",
    facts: [],
    services: [
      { name: "About us", slug: "about", desc: "Who we are and what we do" },
      { name: "Services", slug: "services", desc: "What we offer" },
      { name: "Contact", slug: "contact", desc: "How to reach us" },
    ],
    faqs: [
      { q: "What areas do you serve?", anchor: "areas" },
      { q: "What are your opening hours?", anchor: "hours" },
      { q: "How do I get in touch?", anchor: "contact" },
    ],
    blog: "News and updates",
  },
};

export function generateLlmsTxt(
  brandName: string,
  domain: string,
  vertical: string,
  regions: string,
): string {
  const tmpl = VERTICAL_TEMPLATES[vertical] ?? VERTICAL_TEMPLATES.local;
  const base = `https://${domain}`;
  const regionText = regions || "your local area";

  const tagline = tmpl.tagline.replace("{regions}", regionText);

  const lines = [
    `# ${brandName}`,
    `> ${tagline}`,
    ...tmpl.facts.map((fact) => `> ${fact}`),
    "",
    "## About",
    `- [About us](${base}/about): Who we are`,
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
      <p
        data-fill-in-note=""
        style={{
          fontSize: 12,
          margin: 0,
          padding: "10px 20px",
          color: "var(--text-primary)",
          background: "var(--warning-soft)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {FILL_IN_NOTE}
      </p>
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
