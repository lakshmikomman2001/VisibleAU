"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PackBrowser } from "@/components/domain/vertical/pack-browser";
import { PromptPreview } from "@/components/domain/vertical/prompt-preview";
import type { VerticalPack } from "@/db/schema";

export default function BrandWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [vertical, setVertical] = useState("");
  const [selectedPackId, setSelectedPackId] = useState("");
  const [selectedPackName, setSelectedPackName] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
  const [competitors, setCompetitors] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handlePackSelect = (pack: VerticalPack) => {
    setSelectedPackId(pack.id);
    setSelectedPackName(pack.name);
    setVertical(pack.vertical);
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
          domain: domain.replace(/^www\./i, ""),
          vertical,
          primaryRegions: regions.length > 0 ? regions : ["NSW:Sydney CBD"],
          competitors: competitors
            ? competitors
                .split(",")
                .map((c) => c.trim())
                .filter(Boolean)
            : [],
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

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 32px" }}>
      {/* Progress bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 9999,
              background: s <= step ? "var(--accent-primary)" : "var(--accent-muted)",
              transition: "background 0.2s ease",
            }}
          />
        ))}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 32 }}>
        Step {step} of 4
      </p>

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

      {step === 1 && (
        <div>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 20,
            }}
          >
            Tell us about your brand
          </h2>
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
          <div style={{ marginBottom: 24 }}>
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
            <input
              id="wiz-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="bondiplumbing.com.au"
              style={inputStyle}
            />
          </div>
          <button
            type="button"
            disabled={!name || !domain}
            onClick={() => setStep(2)}
            style={{
              height: 36,
              padding: "0 16px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              background: "var(--accent-primary)",
              color: "var(--accent-primary-fg)",
              border: "none",
              cursor: !name || !domain ? "not-allowed" : "pointer",
              opacity: !name || !domain ? 0.5 : 1,
            }}
          >
            Continue
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 20,
            }}
          >
            Choose your vertical
          </h2>
          <PackBrowser mode="wizard" onSelect={handlePackSelect} selectedPackId={selectedPackId} />
          {selectedPackId && (
            <PromptPreview
              packId={selectedPackId}
              brandName={name || "your brand"}
              primaryRegion={regions[0] ?? ""}
            />
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
            <button
              type="button"
              onClick={() => setStep(1)}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                background: "var(--bg-elevated)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default)",
                cursor: "pointer",
              }}
            >
              Back
            </button>
            <button
              type="button"
              disabled={!vertical}
              onClick={() => setStep(3)}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                background: "var(--accent-primary)",
                color: "var(--accent-primary-fg)",
                border: "none",
                cursor: !vertical ? "not-allowed" : "pointer",
                opacity: !vertical ? 0.5 : 1,
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 20,
            }}
          >
            Locations &amp; competitors
          </h2>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="wiz-region"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Primary region (e.g. NSW:Bondi)
            </label>
            <input
              id="wiz-region"
              value={regions[0] ?? ""}
              onChange={(e) => setRegions([e.target.value])}
              placeholder="NSW:Bondi"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="wiz-comp"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Competitors (comma-separated, optional)
            </label>
            <input
              id="wiz-comp"
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
              placeholder="Eastern Plumbing, Sydney Pipe Pros"
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setStep(2)}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                background: "var(--bg-elevated)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default)",
                cursor: "pointer",
              }}
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                background: "var(--accent-primary)",
                color: "var(--accent-primary-fg)",
                border: "none",
                cursor: "pointer",
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 20,
            }}
          >
            Confirm &amp; run first audit
          </h2>
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              marginBottom: 16,
            }}
          >
            {[
              { label: "Brand", value: name },
              { label: "Domain", value: domain },
              { label: "Vertical", value: vertical.replace("_", " ") },
              { label: "Pack", value: selectedPackName || vertical },
              { label: "Region", value: regions[0] || "Sydney CBD" },
              ...(competitors ? [{ label: "Competitors", value: competitors }] : []),
            ].map((row) => (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  borderBottom: "1px solid var(--border-subtle)",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "var(--text-tertiary)" }}>{row.label}</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{row.value}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
            Your first audit will run 10 prompts across your tier&apos;s engines. Estimated time:
            2-6 minutes.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setStep(3)}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                background: "var(--bg-elevated)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default)",
                cursor: "pointer",
              }}
            >
              Back
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleSubmit}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                background: "var(--accent-primary)",
                color: "var(--accent-primary-fg)",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? "Creating..." : "Create brand & run first audit"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
