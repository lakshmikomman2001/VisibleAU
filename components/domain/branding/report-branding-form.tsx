"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { LogoUploader } from "@/components/domain/branding/logo-uploader";
import { possessive } from "@/lib/copy/possessive";
import { PDF_PAPER_COLOUR } from "@/lib/pdf/theme";
import { agencyInitials } from "@/lib/reports/agency-branding";

/**
 * 2 Nov -- Account -> Report branding (app/(auth)/settings/report-branding).
 * The workspace's agency name, logo, footer text and contact line -- what
 * every report PDF prints on its cover and page footers -- and an optional
 * override per brand: only the fields filled in replace the workspace's,
 * as the PDF reads them (lib/reports/agency-branding.ts). The preview is
 * the report's own cover top bar and footer, drawn by
 * /api/report-branding/preview with the values on screen.
 */
export interface BrandingScopeValues {
  agencyName: string;
  logoUrl: string | null;
  footerText: string;
  contactLine: string;
}

export interface WorkspaceBrandingValues extends BrandingScopeValues {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

interface Props {
  workspace: WorkspaceBrandingValues;
  /** brand id -> that brand's own branding. */
  overrides: Record<string, BrandingScopeValues>;
  brands: Array<{ id: string; name: string }>;
}

const WORKSPACE = "workspace";
const EMPTY: BrandingScopeValues = {
  agencyName: "",
  logoUrl: null,
  footerText: "",
  contactLine: "",
};

const inputClass =
  "w-full rounded-md px-3 py-2 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1";
const inputStyle = {
  background: "var(--bg-base)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
};
const helpStyle = { fontSize: 11, color: "var(--text-tertiary)", margin: "4px 0 0" };
const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-secondary)",
  marginBottom: 6,
};

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function ReportBrandingForm({ workspace, overrides, brands }: Props) {
  const ids = {
    scope: useId(),
    name: useId(),
    nameHelp: useId(),
    footer: useId(),
    footerHelp: useId(),
    contact: useId(),
    contactHelp: useId(),
  };
  const [savedWorkspace, setSavedWorkspace] = useState(workspace);
  const [savedOverrides, setSavedOverrides] = useState(overrides);
  const [scope, setScope] = useState<string>(WORKSPACE);
  const [draft, setDraft] = useState<BrandingScopeValues>(workspace);
  const [colours, setColours] = useState({
    primaryColor: workspace.primaryColor,
    secondaryColor: workspace.secondaryColor,
    accentColor: workspace.accentColor,
  });
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfViewer, setPdfViewer] = useState(true);

  useEffect(() => {
    // Browsers without a built-in PDF viewer (Chrome on Android) get a link instead.
    const enabled = (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled;
    if (enabled === false) setPdfViewer(false);
  }, []);

  const isBrand = scope !== WORKSPACE;
  const brandName = isBrand ? brands.find((b) => b.id === scope)?.name : brands[0]?.name;
  const hasOverride = isBrand && Boolean(savedOverrides[scope]);

  function selectScope(next: string) {
    setScope(next);
    setDraft(next === WORKSPACE ? savedWorkspace : (savedOverrides[next] ?? EMPTY));
    setStatus(null);
  }

  // What the PDF prints for this scope: the brand's own value, else the workspace's.
  const inherit = (own: string, fromWorkspace: string) =>
    own.trim() || (isBrand ? fromWorkspace.trim() : "");
  const effective = {
    name: inherit(draft.agencyName, savedWorkspace.agencyName),
    footerText: inherit(draft.footerText, savedWorkspace.footerText),
    contactLine: inherit(draft.contactLine, savedWorkspace.contactLine),
    logoUrl: draft.logoUrl ?? (isBrand ? savedWorkspace.logoUrl : null),
  };

  const previewQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (effective.name) params.set("agencyName", effective.name);
    if (effective.footerText) params.set("footerText", effective.footerText);
    if (effective.contactLine) params.set("contactLine", effective.contactLine);
    if (effective.logoUrl) params.set("logoUrl", effective.logoUrl);
    if (brandName) params.set("brandName", brandName);
    return params.toString();
  }, [effective.name, effective.footerText, effective.contactLine, effective.logoUrl, brandName]);
  const previewSrc = `/api/report-branding/preview?${useDebounced(previewQuery, 500)}`;

  function backToWorkspaceBranding() {
    setSavedOverrides((prev) => {
      const next = { ...prev };
      delete next[scope];
      return next;
    });
    setDraft(EMPTY);
    setStatus({
      tone: "ok",
      text: `${brandName ?? "This brand"} now uses the workspace branding.`,
    });
  }

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/report-branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: isBrand ? scope : null,
          agencyName: draft.agencyName,
          logoUrl: draft.logoUrl,
          footerText: draft.footerText,
          contactLine: draft.contactLine,
          ...(isBrand ? {} : colours),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        saved?: Partial<Record<keyof WorkspaceBrandingValues, string | null>>;
      };
      if (!res.ok || !body.saved) {
        setStatus({ tone: "error", text: body.error ?? "Couldn't save: try again" });
        return;
      }
      const saved: BrandingScopeValues = {
        agencyName: body.saved.agencyName ?? "",
        logoUrl: body.saved.logoUrl ?? null,
        footerText: body.saved.footerText ?? "",
        contactLine: body.saved.contactLine ?? "",
      };
      // Saved with nothing in it, a brand has no branding of its own.
      if (
        isBrand &&
        !saved.agencyName &&
        !saved.logoUrl &&
        !saved.footerText &&
        !saved.contactLine
      ) {
        backToWorkspaceBranding();
        return;
      }
      setDraft(saved);
      if (isBrand) {
        setSavedOverrides((prev) => ({ ...prev, [scope]: saved }));
      } else {
        setSavedWorkspace((prev) => ({ ...prev, ...saved, ...colours }));
      }
      setStatus({ tone: "ok", text: "Saved. Reports generated from now on use it." });
    } catch {
      setStatus({ tone: "error", text: "Couldn't save: try again" });
    } finally {
      setBusy(false);
    }
  }

  async function removeOverride() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/report-branding?brandId=${encodeURIComponent(scope)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({ tone: "error", text: body.error ?? "Couldn't remove it: try again" });
        return;
      }
      backToWorkspaceBranding();
    } catch {
      setStatus({ tone: "error", text: "Couldn't remove it: try again" });
    } finally {
      setBusy(false);
    }
  }

  const overrideBrands = brands.filter((b) => savedOverrides[b.id]);

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 16px" }}>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Report branding
        </h1>
        <p className="text-[13px] mt-1 mb-6" style={{ color: "var(--text-secondary)" }}>
          Your agency on every report PDF: the name and logo at the top of the cover, and the footer
          on every page.
        </p>

        <div className="grid gap-6 lg:grid-cols-2">
          <form
            className="rounded-lg p-5 space-y-5"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            data-report-branding-form
          >
            <div>
              <label htmlFor={ids.scope} style={labelStyle}>
                Branding for
              </label>
              <select
                id={ids.scope}
                value={scope}
                onChange={(e) => selectScope(e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value={WORKSPACE}>All brands (workspace default)</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {savedOverrides[b.id] ? " (its own branding)" : ""}
                  </option>
                ))}
              </select>
              <p style={helpStyle}>
                {isBrand
                  ? "Fill in only what's different for this brand; empty fields use the workspace's."
                  : "Used on every brand's reports, unless a brand has its own."}
              </p>
              {overrideBrands.length > 0 && !isBrand && (
                <p style={helpStyle} data-override-list>
                  With their own branding: {overrideBrands.map((b) => b.name).join(", ")}.
                </p>
              )}
            </div>

            <div>
              <label htmlFor={ids.name} style={labelStyle}>
                Agency name
              </label>
              <input
                id={ids.name}
                value={draft.agencyName}
                maxLength={100}
                onChange={(e) => setDraft({ ...draft, agencyName: e.target.value })}
                placeholder={(isBrand && savedWorkspace.agencyName) || "Your agency's name"}
                aria-describedby={ids.nameHelp}
                className={inputClass}
                style={inputStyle}
              />
              <p id={ids.nameHelp} style={helpStyle}>
                Required for the cover to show your agency: without it the cover shows only
                &quot;Powered by Vunnara&quot;. Also in every page&apos;s footer.
              </p>
            </div>

            <div>
              <span style={labelStyle}>Logo</span>
              <LogoUploader
                value={draft.logoUrl}
                onChange={(logoUrl) => setDraft({ ...draft, logoUrl })}
                initials={agencyInitials(effective.name) || "?"}
                owner="your agency"
                purpose="agency"
              />
              {isBrand && !draft.logoUrl && savedWorkspace.logoUrl && (
                <p style={helpStyle}>Empty: this brand uses the workspace logo.</p>
              )}
              <p style={helpStyle}>Shown beside the agency name on the cover.</p>
            </div>

            <div>
              <label htmlFor={ids.footer} style={labelStyle}>
                Footer text
              </label>
              <input
                id={ids.footer}
                value={draft.footerText}
                maxLength={200}
                onChange={(e) => setDraft({ ...draft, footerText: e.target.value })}
                placeholder={isBrand ? savedWorkspace.footerText || "Confidential" : "Confidential"}
                aria-describedby={ids.footerHelp}
                className={inputClass}
                style={inputStyle}
              />
              <p id={ids.footerHelp} style={helpStyle}>
                Starts every page&apos;s footer. Empty: &quot;Confidential&quot;.
              </p>
            </div>

            <div>
              <label htmlFor={ids.contact} style={labelStyle}>
                Contact line
              </label>
              <input
                id={ids.contact}
                value={draft.contactLine}
                maxLength={200}
                onChange={(e) => setDraft({ ...draft, contactLine: e.target.value })}
                placeholder={
                  isBrand
                    ? savedWorkspace.contactLine || "hello@example.com · 02 5550 0000"
                    : "hello@example.com · 02 5550 0000"
                }
                aria-describedby={ids.contactHelp}
                className={inputClass}
                style={inputStyle}
              />
              <p id={ids.contactHelp} style={helpStyle}>
                Phone, email or website, at the end of every page&apos;s footer.
              </p>
            </div>

            {!isBrand && (
              <fieldset>
                <legend style={labelStyle}>Client portal colours</legend>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {(
                    [
                      ["primaryColor", "Primary"],
                      ["secondaryColor", "Secondary"],
                      ["accentColor", "Accent"],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
                    >
                      <input
                        type="color"
                        value={colours[key]}
                        onChange={(e) => setColours({ ...colours, [key]: e.target.value })}
                        style={{ width: 32, height: 24, border: "none", background: "none" }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <p style={helpStyle}>
                  Used by the client portal and the audit export, not the report PDF.
                </p>
              </fieldset>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md px-4 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                style={{
                  height: 36,
                  background: "var(--accent-primary)",
                  color: "var(--accent-primary-fg)",
                  border: "none",
                }}
              >
                {busy ? "Saving…" : "Save"}
              </button>
              {hasOverride && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeOverride()}
                  className="rounded-md px-3 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                  style={{
                    height: 36,
                    background: "var(--bg-elevated)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  Use the workspace branding for this brand
                </button>
              )}
            </div>
            <p
              role="status"
              aria-live="polite"
              data-branding-status
              style={{
                fontSize: 12,
                margin: 0,
                color: status?.tone === "error" ? "var(--danger)" : "var(--text-secondary)",
              }}
            >
              {status?.text ?? ""}
            </p>
          </form>

          <section
            aria-labelledby="branding-preview-heading"
            className="rounded-lg p-5"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
          >
            <h2
              id="branding-preview-heading"
              className="text-[13px] font-semibold mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              Preview
            </h2>
            <p style={{ ...helpStyle, margin: "0 0 12px" }}>
              The report&apos;s own cover top bar and page footer, with what&apos;s on the left
              {brandName ? ` (as on ${possessive(brandName)} reports)` : ""}. Not saved until you
              press Save.
            </p>
            {!effective.name && (
              <p
                data-no-agency-name
                style={{ fontSize: 12, color: "var(--warning)", margin: "0 0 8px" }}
              >
                No agency name yet: the cover shows only &quot;Powered by Vunnara&quot;.
              </p>
            )}
            {pdfViewer && (
              <iframe
                title="Preview of the report cover's top bar and page footer"
                src={`${previewSrc}#toolbar=0&navpanes=0&view=FitH`}
                style={{
                  width: "100%",
                  aspectRatio: "595 / 300",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 6,
                  background: PDF_PAPER_COLOUR,
                }}
                data-branding-preview
              />
            )}
            <p style={{ ...helpStyle, marginTop: 8 }}>
              <a
                href={previewSrc}
                target="_blank"
                rel="noreferrer"
                className="underline focus-visible:outline focus-visible:outline-2"
                style={{ color: "var(--accent-blue)" }}
              >
                Open the preview as a PDF
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
