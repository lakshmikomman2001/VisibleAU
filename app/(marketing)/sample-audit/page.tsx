"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

const VERTICALS = [
  { value: "tradies", label: "Tradies" },
  { value: "allied_health", label: "Allied Health" },
  { value: "saas", label: "SaaS" },
  { value: "professional_services", label: "Professional Services" },
  { value: "real_estate", label: "Real Estate" },
];

export default function SampleAuditPage() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [vertical, setVertical] = useState("tradies");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/sample-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim(), vertical }),
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
        <h1
          className="text-3xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Free AI Visibility Audit
        </h1>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          See how your brand appears in AI-powered search engines. Takes about 90
          seconds, no signup required.
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
            disabled={submitting || !domain.trim()}
            className="w-full rounded-md px-4 py-2.5 text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: "#3b82f6", color: "#fff" }}
          >
            {submitting ? "Starting audit..." : "Run free audit"}
          </button>

          <p
            className="text-xs text-center"
            style={{ color: "var(--text-tertiary)" }}
          >
            1 AI engine &middot; 5 prompts &middot; ~90 seconds &middot; 3 per day
          </p>
        </div>
      </form>
    </div>
  );
}
