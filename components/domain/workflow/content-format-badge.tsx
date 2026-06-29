"use client";

interface ContentFormatBadgeProps {
  format: string;
  reason: string | null;
}

const FORMAT_LABELS: Record<string, string> = {
  listicle: "Listicle",
  how_to_guide: "How-To Guide",
  comparison_article: "Comparison",
  faq_block: "FAQ Block",
  expert_article: "Expert Article",
  case_study: "Case Study",
  press_release: "Press Release",
  linkedin_article: "LinkedIn Article",
};

export function ContentFormatBadge({ format, reason }: ContentFormatBadgeProps) {
  const label = FORMAT_LABELS[format] ?? format;

  return (
    <div>
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
        style={{
          backgroundColor: `color-mix(in srgb, var(--layer-content) 15%, transparent)`,
          color: "var(--layer-content)",
        }}
      >
        {label}
      </span>
      {reason && (
        <p
          className="text-xs mt-1"
          style={{ color: "var(--text-tertiary)" }}
        >
          {reason}
        </p>
      )}
    </div>
  );
}
