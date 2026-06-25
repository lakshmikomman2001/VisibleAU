"use client";

import { useCallback, useEffect, useState } from "react";

interface BrandingData {
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  footerText: string;
  contactLine: string;
  agencyName: string;
}

export default function AgencyBrandingPage() {
  const [branding, setBranding] = useState<BrandingData>({
    logoUrl: "",
    primaryColor: "#0066CC",
    secondaryColor: "#1A1A1A",
    accentColor: "#FF6B35",
    footerText: "",
    contactLine: "",
    agencyName: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/agency/branding")
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          setBranding({
            logoUrl: data.logoUrl || "",
            primaryColor: data.primaryColor || "#0066CC",
            secondaryColor: data.secondaryColor || "#1A1A1A",
            accentColor: data.accentColor || "#FF6B35",
            footerText: data.footerText || "",
            contactLine: data.contactLine || "",
            agencyName: data.agencyName || "",
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/agency/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(branding),
      });
      if (res.ok) {
        setMessage("Branding saved successfully.");
      } else {
        const err = await res.json();
        setMessage(err.error || "Failed to save branding.");
      }
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [branding]);

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading branding settings...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Agency Branding</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Agency Name</label>
            <input
              type="text"
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={branding.agencyName}
              onChange={(e) => setBranding({ ...branding, agencyName: e.target.value })}
              placeholder="Your Agency Name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Logo URL</label>
            <input
              type="text"
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={branding.logoUrl}
              onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Primary Color</label>
              <input
                type="color"
                className="w-full h-10 border rounded-md cursor-pointer"
                value={branding.primaryColor}
                onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
              />
              <span className="text-xs text-muted-foreground mt-1 block">
                {branding.primaryColor}
              </span>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Secondary Color</label>
              <input
                type="color"
                className="w-full h-10 border rounded-md cursor-pointer"
                value={branding.secondaryColor}
                onChange={(e) => setBranding({ ...branding, secondaryColor: e.target.value })}
              />
              <span className="text-xs text-muted-foreground mt-1 block">
                {branding.secondaryColor}
              </span>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Accent Color</label>
              <input
                type="color"
                className="w-full h-10 border rounded-md cursor-pointer"
                value={branding.accentColor}
                onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
              />
              <span className="text-xs text-muted-foreground mt-1 block">
                {branding.accentColor}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Footer Text</label>
            <input
              type="text"
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={branding.footerText}
              onChange={(e) => setBranding({ ...branding, footerText: e.target.value })}
              placeholder="Confidential - Prepared by Your Agency"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Contact Line</label>
            <input
              type="text"
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={branding.contactLine}
              onChange={(e) => setBranding({ ...branding, contactLine: e.target.value })}
              placeholder="hello@agency.com | 1300 000 000"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Branding"}
            </button>
            {message && (
              <span className="text-sm text-muted-foreground">{message}</span>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Preview</h2>
          <div
            className="rounded-lg overflow-hidden border"
            style={{ minHeight: 300 }}
          >
            {/* Header preview */}
            <div
              className="p-4 flex items-center gap-3"
              style={{ backgroundColor: branding.primaryColor }}
            >
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt="Logo"
                  className="h-8 w-auto"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="h-8 w-8 rounded bg-white/20" />
              )}
              <span className="text-white font-semibold text-sm">
                {branding.agencyName || "Agency Name"}
              </span>
            </div>

            {/* Body preview */}
            <div className="p-4 bg-white">
              <h3
                className="font-semibold text-lg mb-2"
                style={{ color: branding.secondaryColor }}
              >
                AI Visibility Report
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                Brand visibility audit results for your client.
              </p>
              <div
                className="inline-block px-3 py-1 rounded text-white text-xs font-medium"
                style={{ backgroundColor: branding.accentColor }}
              >
                Score: --.-
              </div>
            </div>

            {/* Footer preview */}
            <div
              className="p-3 text-xs"
              style={{
                backgroundColor: branding.secondaryColor,
                color: "rgba(255,255,255,0.7)",
              }}
            >
              <p>{branding.footerText || "Footer text appears here"}</p>
              <p className="mt-1">{branding.contactLine || "Contact line appears here"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
