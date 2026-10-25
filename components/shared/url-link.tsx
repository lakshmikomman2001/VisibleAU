import type { CSSProperties } from "react";

/** "hipages.com.au/connect/norwestelectricalgroup": the host (no www.) and
 * path, without the protocol, query or trailing slash. */
export function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return `${host}${path}`;
  } catch {
    return url;
  }
}

interface UrlLinkProps {
  url: string;
  /** What to show; defaults to displayUrl(url). */
  label?: string;
  rel?: string;
  style?: CSSProperties;
}

/**
 * An external URL on one line: host and path, cut off with an ellipsis when
 * it doesn't fit (it used to break every few characters on a phone). The
 * full URL stays in the href and the title; the accessible name says where
 * it goes. Its flex or grid parent needs min-width: 0 for the ellipsis to
 * kick in.
 */
export function UrlLink({ url, label, rel = "noopener noreferrer", style }: UrlLinkProps) {
  const shown = label ?? displayUrl(url);
  return (
    <a
      href={url}
      target="_blank"
      rel={rel}
      title={url}
      aria-label={`Open ${shown} in a new tab`}
      style={{
        display: "block",
        minWidth: 0,
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {shown}
    </a>
  );
}
