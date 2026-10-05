import { ExternalLink } from "lucide-react";

interface VerifiedSourceProps {
  /** The public source's name, e.g. "Australian Business Register". */
  source: string;
  /** A real, checkable URL for this specific result. Renders as a link when
   * set. When null (no evidence URL for this result), renders inert text
   * instead -- never a link to nowhere. */
  url: string | null;
  /** Link text when `url` is set. Defaults to "Verified against {source}"
   * -- override for results that found/linked something without being a
   * positive confirmation (e.g. a provided-but-unconfirmed ABN), so the
   * link's own wording never overclaims beyond what was actually checked. */
  label?: string;
  /** Text when `url` is null. Defaults to "Checked against {source}". */
  fallbackLabel?: string;
}

/**
 * Task RRR: every Brand & Entity signal genuinely queries a real source
 * (confirmed task PPP) -- this turns a bare verdict into a checkable claim
 * by linking the actual record/page/profile a reader can click through to,
 * instead of leaving that evidence as inert text or discarding it.
 */
export function VerifiedSource({ source, url, label, fallbackLabel }: VerifiedSourceProps) {
  if (!url) {
    return (
      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
        {fallbackLabel ?? `Checked against ${source}`}
      </span>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        color: "var(--accent-primary)",
        textDecoration: "none",
      }}
    >
      {label ?? `Verified against ${source}`}
      <ExternalLink style={{ width: 11, height: 11 }} />
    </a>
  );
}
