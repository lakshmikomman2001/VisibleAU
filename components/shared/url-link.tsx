import type { CSSProperties } from "react";
import { linkHref } from "@/lib/urls/strip-tracking";

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
  // 9 Nov (part 6): without the AI's tracking tags (?utm_source=chatgpt.com), so a click from here isn't counted
  // as a ChatGPT referral; the stored URL is unchanged.
  const href = linkHref(url);
  return (
    <a
      href={href}
      target="_blank"
      rel={rel}
      title={href}
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
