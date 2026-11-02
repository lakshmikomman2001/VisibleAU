"use client";

import { useId, useRef, useState } from "react";
import {
  LOGO_ACCEPT,
  LOGO_ERRORS,
  LOGO_MAX_BYTES,
  logoFormatOf,
  parseStoredLogoUrl,
} from "@/lib/branding/logo";
import { svgLogoProblem, svgToPng } from "@/lib/branding/svg-logo";

/**
 * 2 Nov ("Upload instead does nothing in Brand basics") -- one logo
 * uploader, for a brand's logo (the new-brand wizard) and the agency's
 * (Account -> Report branding).
 *
 * A real button opens the file picker (Enter and Space work as on any
 * button). PNG, JPEG or SVG up to 2 MB: checked here first -- a PNG or
 * JPEG by its own bytes, an SVG by svgLogoProblem and then drawn into a
 * PNG -- and again by POST /api/branding/logo, which stores it (owners and
 * admins only). Shows the file while it uploads, then the stored logo.
 * `value` is the saved URL; saving it on the brand or the branding row is
 * the page's job, through onChange.
 *
 * With no logo it says "No logo yet": the initials tile is a placeholder,
 * never presented as a detected logo.
 */
export interface LogoUploaderProps {
  /** The logo's URL, or null when there's none. */
  value: string | null;
  onChange: (url: string | null) => void;
  /** The placeholder tile's letters while there's no logo, e.g. "HA". */
  initials: string;
  /** Whose logo, for screen readers: "the brand", "your agency". */
  owner: string;
  /** What it's for: the server gates the agency's report branding by plan, never a brand's own logo. */
  purpose: "brand" | "agency";
}

function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer().then((b) => new Uint8Array(b));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function readText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/** The file as a data: URL, for the preview: the site's CSP (vercel.json) allows data: images, not blob: ones. */
function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function isSvg(file: File): boolean {
  return file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
}

function errorFor(status: number): string {
  if (status === 413) return LOGO_ERRORS.tooLarge;
  if (status === 415) return LOGO_ERRORS.wrongType;
  if (status === 403) return LOGO_ERRORS.forbidden;
  if (status === 409 || status === 429) return LOGO_ERRORS.tooMany;
  return LOGO_ERRORS.failed;
}

const LINK_BUTTON =
  "rounded-sm font-medium underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function LogoUploader({ value, onChange, initials, owner, purpose }: LogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (file.size > LOGO_MAX_BYTES) {
      setError(LOGO_ERRORS.tooLarge);
      return;
    }
    let body: Blob = file;
    let name = file.name;
    if (isSvg(file)) {
      const svg = await readText(file);
      if (svgLogoProblem(svg)) {
        setError(LOGO_ERRORS.unsafeSvg);
        return;
      }
      try {
        body = await svgToPng(svg);
        name = "logo.png";
      } catch {
        setError(LOGO_ERRORS.unreadableSvg);
        return;
      }
    } else if (!logoFormatOf(await readBytes(file.slice(0, 4)))) {
      setError(LOGO_ERRORS.wrongType);
      return;
    }

    setBusy(true);
    try {
      setPreview(await readDataUrl(body));
      const form = new FormData();
      form.append("file", body, name);
      form.append("purpose", purpose);
      const res = await fetch("/api/branding/logo", { method: "POST", body: form });
      if (!res.ok) {
        // A refusal says why: the person's role, the workspace's plan, or too many uploads.
        const refusal =
          res.status === 403 || res.status === 409 || res.status === 429
            ? ((await res.json().catch(() => ({}))) as { error?: unknown }).error
            : null;
        setError(typeof refusal === "string" ? refusal : errorFor(res.status));
        return;
      }
      const data = (await res.json()) as { logoUrl?: unknown };
      if (typeof data.logoUrl !== "string") {
        setError(LOGO_ERRORS.failed);
        return;
      }
      onChange(data.logoUrl);
    } catch {
      setError(LOGO_ERRORS.failed);
    } finally {
      setPreview(null);
      setBusy(false);
    }
  }

  const shown = preview ?? value;
  const status = busy
    ? "Uploading…"
    : value
      ? parseStoredLogoUrl(value)
        ? "Logo uploaded"
        : "Logo from a web address"
      : "No logo yet";

  return (
    <div data-logo-uploader style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        data-logo-tile
        style={{
          width: 40,
          height: 40,
          borderRadius: 6,
          flexShrink: 0,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 700,
          background: shown ? "var(--bg-elevated)" : "var(--accent-blue-soft)",
          border: "1px solid var(--border-subtle)",
          color: "var(--accent-blue)",
        }}
      >
        {shown ? (
          // biome-ignore lint/performance/noImgElement: an uploaded or local preview, not a static asset
          <img
            src={shown}
            alt={`Logo for ${owner}`}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          <span aria-hidden="true">{initials}</span>
        )}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p
          data-logo-status
          aria-live="polite"
          style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}
        >
          {status}
          {!busy && (
            <>
              {" · "}
              <button
                type="button"
                className={LINK_BUTTON}
                style={{
                  color: "var(--accent-blue)",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontSize: 12,
                }}
                aria-describedby={hintId}
                onClick={() => inputRef.current?.click()}
              >
                {value ? "Replace" : "Upload a logo"}{" "}
                <span className="sr-only">{value ? `the logo for ${owner}` : `for ${owner}`}</span>
              </button>
              {value && (
                <>
                  {" · "}
                  <button
                    type="button"
                    className={LINK_BUTTON}
                    style={{
                      color: "var(--text-secondary)",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                    onClick={() => {
                      setError(null);
                      onChange(null);
                    }}
                  >
                    Remove <span className="sr-only">the logo for {owner}</span>
                  </button>
                </>
              )}
            </>
          )}
        </p>
        <p id={hintId} style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "2px 0 0" }}>
          PNG, JPEG or SVG, up to 2 MB.
        </p>
        {error && (
          <p role="alert" style={{ fontSize: 12, color: "var(--danger)", margin: "4px 0 0" }}>
            {error}
          </p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={LOGO_ACCEPT}
        hidden
        data-logo-input
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared, so choosing the same file again still fires.
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
