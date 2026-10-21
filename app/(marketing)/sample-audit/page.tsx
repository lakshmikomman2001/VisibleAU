"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AU_STATES } from "@/lib/constants/au";
import { AU_LOCATIONS } from "@/lib/locations";
import { SAMPLE_AUDIT_CONFIG } from "@/lib/sample-audit/config";

const VERTICALS = [
  { value: "tradies", label: "Tradies" },
  { value: "allied_health", label: "Allied Health" },
  { value: "saas", label: "SaaS" },
  { value: "professional_services", label: "Professional Services" },
  { value: "real_estate", label: "Real Estate" },
];

// Reliability follow-up, item 4 -- a sentinel the curated dropdown can
// select to reveal the free-text "my suburb isn't listed" fields
// below it. Never sent to the API itself (handleSubmit branches on it
// to build the real discriminated-union payload instead).
const CUSTOM_SUBURB_SENTINEL = "__custom__";

// Same character set app/api/sample-audit/route.ts's zod schema
// enforces server-side (the authority) -- this is just an earlier,
// friendlier error for the common case, never the only check.
const CUSTOM_SUBURB_REGEX = /^[A-Za-z][A-Za-z\s'-]{1,39}$/;

export default function SampleAuditPage() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [vertical, setVertical] = useState("tradies");
  // Audit reliability, Part C, item 4 -- required, no pre-selected
  // default: without a real location, every non-Sydney business got
  // questions about the wrong city and scored near 0 for a reason
  // that had nothing to do with their real AI visibility.
  const [location, setLocation] = useState("");
  // Reliability follow-up, item 4 -- only read when location ===
  // CUSTOM_SUBURB_SENTINEL.
  const [customSuburb, setCustomSuburb] = useState("");
  const [customState, setCustomState] = useState<string>(AU_STATES[0].code);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isCustomSuburb = location === CUSTOM_SUBURB_SENTINEL;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!location) {
      setError("Please select your suburb or city.");
      return;
    }
    if (isCustomSuburb && !CUSTOM_SUBURB_REGEX.test(customSuburb.trim())) {
      setError("Suburb: letters, spaces, hyphens and apostrophes only, 2-40 characters.");
      return;
    }
    setSubmitting(true);

    try {
      const locationPayload = isCustomSuburb
        ? { type: "custom" as const, suburb: customSuburb.trim(), state: customState }
        : { type: "curated" as const, value: location };
      const res = await fetch("/api/sample-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim(), vertical, location: locationPayload }),
      });

      if (res.status === 429) {
        setError("You've reached the limit of 3 sample audits per day. Please try again tomorrow.");
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      router.push(`/sample-audit/running?auditId=${data.auditId}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-20">
      <div className="text-center mb-10">
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(59,130,246,0.15)" }}
        >
          <Search style={{ width: 28, height: 28, color: "#3b82f6" }} />
        </div>
        <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
          Free AI Visibility Audit
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          See how your brand appears in AI-powered search engines. Takes under a minute, no signup
          required.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div
          className="rounded-lg p-6 space-y-4"
          style={{
            backgroundColor: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              Your website domain
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com.au"
              required
              className="w-full rounded-md px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              Industry
            </label>
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              className="w-full rounded-md px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            >
              {VERTICALS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              Your suburb or city
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
              className="w-full rounded-md px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                color: location ? "var(--text-primary)" : "var(--text-tertiary)",
              }}
            >
              <option value="" disabled>
                Select where your business is based
              </option>
              {AU_LOCATIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
              <option value={CUSTOM_SUBURB_SENTINEL}>My suburb isn&apos;t listed</option>
            </select>
            <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
              We ask AI engines location-specific questions, like a real customer would.
            </p>

            {isCustomSuburb && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={customSuburb}
                  onChange={(e) => setCustomSuburb(e.target.value)}
                  placeholder="Your suburb"
                  required
                  className="flex-1 rounded-md px-3 py-2 text-sm"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                />
                <select
                  value={customState}
                  onChange={(e) => setCustomState(e.target.value)}
                  className="rounded-md px-3 py-2 text-sm"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                >
                  {AU_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {error && (
            <div
              className="rounded-md px-4 py-3 text-sm"
              style={{
                backgroundColor: "rgba(239,68,68,0.12)",
                color: "#ef4444",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={
              submitting ||
              !domain.trim() ||
              !location ||
              (isCustomSuburb && !CUSTOM_SUBURB_REGEX.test(customSuburb.trim()))
            }
            className="w-full rounded-md px-4 py-2.5 text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: "#3b82f6", color: "#fff" }}
          >
            {submitting ? "Starting audit..." : "Run free audit"}
          </button>

          {/* Audit reliability, Part C -- read from SAMPLE_AUDIT_CONFIG
              instead of a hardcoded "1 engine and 5 prompts" that had
              already drifted out of sync with what actually runs (the
              result page's own footer was fixed the same way; this
              form page's footer never was). */}
          <p className="text-xs text-center" style={{ color: "var(--text-tertiary)" }}>
            {SAMPLE_AUDIT_CONFIG.engines.length} AI engines &middot; {SAMPLE_AUDIT_CONFIG.promptsCount}{" "}
            prompts &middot; under a minute &middot; 3 per day
          </p>
        </div>
      </form>
    </div>
  );
}
