"use client";

import { Info, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PackBrowser } from "@/components/domain/vertical/pack-browser";
import { PromptPreview } from "@/components/domain/vertical/prompt-preview";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import type { VerticalPack } from "@/db/schema";

export default function BrandWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [vertical, setVertical] = useState("");
  const [selectedPackId, setSelectedPackId] = useState("");
  const [selectedPackName, setSelectedPackName] = useState("");
  const [selectedPackPrompts, setSelectedPackPrompts] = useState(0);
  const [suburbs, setSuburbs] = useState<string[]>([]);
  const [suburbInput, setSuburbInput] = useState("");
  const [competitorInput, setCompetitorInput] = useState("");
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handlePackSelect = (pack: VerticalPack) => {
    setSelectedPackId(pack.id);
    setSelectedPackName(pack.name);
    setSelectedPackPrompts(pack.promptsCount);
    setVertical(pack.vertical);
  };

  const addSuburb = () => {
    const v = suburbInput.trim();
    if (v && suburbs.length < 3 && !suburbs.includes(v)) {
      setSuburbs([...suburbs, v]);
      setSuburbInput("");
    }
  };

  const addCompetitor = () => {
    const v = competitorInput.trim();
    if (v && !competitors.includes(v)) {
      setCompetitors([...competitors, v]);
      setCompetitorInput("");
    }
  };

  async function handleSubmit() {
    setLoading(true);
    setError("");
    try {
      const brandRes = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          domain: domain.replace(/^(https?:\/\/)?/i, "").replace(/^www\./i, ""),
          vertical,
          primaryRegions: suburbs.length > 0 ? suburbs.map((s) => `NSW:${s}`) : ["NSW:Sydney CBD"],
          competitors,
        }),
      });
      if (!brandRes.ok) {
        const data = await brandRes.json();
        setError(typeof data.error === "string" ? data.error : "Failed to create brand");
        setLoading(false);
        return;
      }
      const brandData = await brandRes.json();
      const brandId = brandData.brand?.id;
      if (brandId) {
        const auditRes = await fetch("/api/audits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId }),
        });
        if (auditRes.ok) {
          const auditData = await auditRes.json();
          router.push(`/audits/${auditData.auditId}`);
          return;
        }
      }
      router.push("/brands");
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 36,
    padding: "0 12px",
    borderRadius: 6,
    fontSize: 14,
    background: "var(--bg-base)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
    outline: "none",
  };

  const btnPrimary: React.CSSProperties = {
    height: 36,
    padding: "0 16px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    background: "var(--accent-primary)",
    color: "var(--accent-primary-fg)",
    border: "none",
    cursor: "pointer",
  };
  const btnSecondary: React.CSSProperties = {
    height: 36,
    padding: "0 16px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-default)",
    cursor: "pointer",
  };

  const canContinue = step === 1 ? name && domain : step === 2 ? !!vertical : true;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs crumbs={["Workspace", "Add brand"]} />

      {/* Page h1 */}
      <h1
        style={{
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: "var(--text-primary)",
          margin: "0 0 4px",
        }}
      >
        Add a brand
      </h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 24px" }}>
        Step {step} of 4 &middot; ~3 minutes total
      </p>

      {/* Progress bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 9999,
              background: s <= step ? "var(--accent-blue)" : "var(--bg-subtle)",
              transition: "background 0.2s ease",
            }}
          />
        ))}
      </div>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 6,
            fontSize: 13,
            background: "var(--danger-soft)",
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
      )}

      {/* Card wrapper */}
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          padding: 24,
          marginBottom: 16,
        }}
      >
        {/* ═══ STEP 1: Brand basics ═══ */}
        {step === 1 && (
          <div>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 20,
              }}
            >
              Brand basics
            </h2>

            {/* Brand name */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="wiz-name"
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                Brand name
              </label>
              <input
                id="wiz-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Bondi Plumbing"
                style={inputStyle}
              />
            </div>

            {/* Domain with https:// prefix */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="wiz-domain"
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                Domain
              </label>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span
                  style={{
                    height: 36,
                    padding: "0 10px",
                    display: "flex",
                    alignItems: "center",
                    fontSize: 13,
                    color: "var(--text-tertiary)",
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border-default)",
                    borderRight: "none",
                    borderRadius: "6px 0 0 6px",
                  }}
                >
                  https://
                </span>
                <input
                  id="wiz-domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="bondiplumbing.com.au"
                  style={{ ...inputStyle, borderRadius: "0 6px 6px 0" }}
                />
              </div>
              <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                We&apos;ll auto-detect your logo from the favicon once you save.
              </p>
            </div>

            {/* Logo auto-detect box */}
            {name && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  borderRadius: 6,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-subtle)",
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                    background: "var(--accent-blue-soft)",
                    color: "var(--accent-blue)",
                    flexShrink: 0,
                  }}
                >
                  {name[0]?.toUpperCase() ?? "?"}
                </div>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Logo auto-detected from favicon.ico &middot;{" "}
                  <span style={{ color: "var(--accent-blue)", cursor: "pointer" }}>
                    Upload instead
                  </span>
                </span>
              </div>
            )}

            {/* Region select */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                Region
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { value: "au", label: "Australia", enabled: true },
                  { value: "nz", label: "New Zealand", enabled: false },
                  { value: "uk", label: "United Kingdom", enabled: false },
                ].map((r) => (
                  <div
                    key={r.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      borderRadius: 6,
                      border:
                        r.value === "au"
                          ? "1px solid var(--accent-blue)"
                          : "1px solid var(--border-default)",
                      background: r.value === "au" ? "var(--accent-blue-soft)" : "transparent",
                      opacity: r.enabled ? 1 : 0.4,
                      cursor: r.enabled ? "pointer" : "not-allowed",
                    }}
                  >
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        border:
                          r.value === "au"
                            ? "4px solid var(--accent-blue)"
                            : "1px solid var(--border-strong)",
                        background: r.value === "au" ? "var(--accent-blue)" : "transparent",
                      }}
                    />
                    <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{r.label}</span>
                    {!r.enabled && (
                      <span
                        style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: "auto" }}
                      >
                        Coming soon
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                Region determines vertical packs and prompt library.
              </p>
            </div>
          </div>
        )}

        {/* ═══ STEP 2: Vertical pack ═══ */}
        {step === 2 && (
          <div>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 4,
              }}
            >
              Vertical pack
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
              Pick the closest match. We&apos;ll use AU-tuned prompts and vertical-specific
              recommendations.
            </p>
            <PackBrowser
              mode="wizard"
              onSelect={handlePackSelect}
              selectedPackId={selectedPackId}
            />
            {selectedPackId && (
              <PromptPreview
                packId={selectedPackId}
                brandName={name || "your brand"}
                primaryRegion={suburbs[0] ? `NSW:${suburbs[0]}` : ""}
              />
            )}
          </div>
        )}

        {/* ═══ STEP 3: Locations & competitors ═══ */}
        {step === 3 && (
          <div>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 20,
              }}
            >
              Locations &amp; competitors
            </h2>

            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                Primary suburbs (up to 3)
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {suburbs.map((s) => (
                  <span
                    key={s}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "4px 10px",
                      borderRadius: 9999,
                      fontSize: 12,
                      background: "var(--accent-muted)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => setSuburbs(suburbs.filter((x) => x !== s))}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        color: "var(--text-tertiary)",
                        display: "flex",
                      }}
                    >
                      <X style={{ width: 12, height: 12 }} />
                    </button>
                  </span>
                ))}
              </div>
              {suburbs.length < 3 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={suburbInput}
                    onChange={(e) => setSuburbInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSuburb())}
                    placeholder="e.g. Bondi"
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={addSuburb}
                    style={{ ...btnSecondary, flexShrink: 0 }}
                  >
                    Add
                  </button>
                </div>
              )}
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                Add competitor (optional)
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {competitors.map((c) => (
                  <span
                    key={c}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "4px 10px",
                      borderRadius: 9999,
                      fontSize: 12,
                      background: "var(--accent-muted)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => setCompetitors(competitors.filter((x) => x !== c))}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        color: "var(--text-tertiary)",
                        display: "flex",
                      }}
                    >
                      <X style={{ width: 12, height: 12 }} />
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={competitorInput}
                  onChange={(e) => setCompetitorInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCompetitor())}
                  placeholder="Eastern Plumbing Co"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={addCompetitor}
                  style={{ ...btnSecondary, flexShrink: 0 }}
                >
                  Add
                </button>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                We&apos;ll detect when LLMs mention them alongside you.
              </p>
            </div>
          </div>
        )}

        {/* ═══ STEP 4: Confirm & first audit ═══ */}
        {step === 4 && (
          <div>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 20,
              }}
            >
              Confirm &amp; run first audit
            </h2>

            {/* Summary box */}
            <div
              style={{
                padding: 16,
                borderRadius: 8,
                background: "var(--bg-subtle)",
                marginBottom: 16,
              }}
            >
              {[
                { label: "Brand", value: name },
                { label: "Domain", value: domain },
                { label: "Vertical", value: vertical.replace(/_/g, " ") },
                {
                  label: "Pack",
                  value: `${selectedPackName || vertical} · ${selectedPackPrompts || "—"} prompts`,
                },
                {
                  label: "Locations",
                  value: suburbs.length > 0 ? suburbs.join(", ") : "Sydney CBD (default)",
                },
                ...(competitors.length > 0
                  ? [{ label: "Competitors", value: competitors.join(", ") }]
                  : []),
                { label: "First audit cost", value: "Free tier: ~A$0.30–0.50 · Paid: ~A$2.50–3" },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--border-subtle)",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "var(--text-tertiary)" }}>{row.label}</span>
                  <span
                    style={{
                      color: "var(--text-primary)",
                      fontWeight: 500,
                      textAlign: "right",
                      maxWidth: "60%",
                    }}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Info box */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "12px 16px",
                borderRadius: 8,
                background: "var(--accent-blue-soft)",
                marginBottom: 8,
              }}
            >
              <Info
                style={{
                  width: 16,
                  height: 16,
                  color: "var(--accent-blue)",
                  flexShrink: 0,
                  marginTop: 1,
                }}
              />
              <p
                style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}
              >
                Your first audit will run on your tier&apos;s engines. Paid: 4 engines &times; 10
                prompts &times; 5 runs = 200 calls (~3–5 min). Free: 2 engines &times; 10 prompts
                &times; 1 run = 20 calls (~1–2 min).
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button
          type="button"
          disabled={step === 1}
          onClick={() => setStep(step - 1)}
          style={{
            ...btnSecondary,
            opacity: step === 1 ? 0.4 : 1,
            cursor: step === 1 ? "not-allowed" : "pointer",
          }}
        >
          Back
        </button>
        {step < 4 ? (
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => setStep(step + 1)}
            style={{
              ...btnPrimary,
              opacity: canContinue ? 1 : 0.5,
              cursor: canContinue ? "pointer" : "not-allowed",
            }}
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={handleSubmit}
            style={{
              ...btnPrimary,
              opacity: loading ? 0.5 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating..." : "Create brand & run first audit"}
          </button>
        )}
      </div>
    </div>
  );
}
