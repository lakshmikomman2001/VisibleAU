"use client";

import { useCallback, useEffect, useState } from "react";

interface Brand {
  id: string;
  name: string;
}

interface InviteFormProps {
  orgId: string;
  onInvited?: () => void;
}

export function InviteForm({ orgId, onInvited }: InviteFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "analyst" | "viewer">("viewer");
  const [accessMode, setAccessMode] = useState<"all" | "specific">("all");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBrands = useCallback(async () => {
    try {
      const res = await fetch("/api/brands");
      if (res.ok) {
        const data = await res.json();
        setBrands(data.map((b: { id: string; name: string }) => ({ id: b.id, name: b.name })));
      }
    } catch {
      // brand list is optional — "All brands" still works
    }
  }, []);

  useEffect(() => { fetchBrands(); }, [fetchBrands]);

  function toggleBrand(id: string) {
    setSelectedBrands((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const brandAccess = accessMode === "all" ? null : selectedBrands;

    try {
      const res = await fetch(`/api/organizations/${orgId}/members/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, brandAccess }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to invite");
        return;
      }

      setEmail("");
      setRole("viewer");
      setAccessMode("all");
      setSelectedBrands([]);
      onInvited?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            Email address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@company.com"
            className="h-9 w-full px-3 text-[13px] rounded-md"
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          />
        </div>

        <div className="w-32">
          <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "analyst" | "viewer")}
            className="h-9 w-full px-2 text-[13px] rounded-md"
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          >
            <option value="admin">Admin</option>
            <option value="analyst">Analyst</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>

        <div className="w-40">
          <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            Brand access
          </label>
          <select
            value={accessMode}
            onChange={(e) => {
              const mode = e.target.value as "all" | "specific";
              setAccessMode(mode);
              if (mode === "all") setSelectedBrands([]);
            }}
            className="h-9 w-full px-2 text-[13px] rounded-md"
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          >
            <option value="all">All brands</option>
            <option value="specific">Specific brands</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={submitting || (accessMode === "specific" && selectedBrands.length === 0)}
          className="h-9 px-4 text-[13px] font-medium rounded-md flex items-center gap-2 disabled:opacity-50"
          style={{ background: "var(--accent-primary)", color: "var(--accent-primary-fg)" }}
        >
          {submitting ? "Inviting…" : "Invite"}
        </button>
      </div>

      {accessMode === "specific" && (
        <div
          className="rounded-md p-3"
          style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)" }}
        >
          {brands.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
              No brands found for this organization.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {brands.map((b) => {
                const checked = selectedBrands.includes(b.id);
                return (
                  <label
                    key={b.id}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md cursor-pointer text-[12px]"
                    style={{
                      background: checked ? "var(--accent-muted)" : "var(--bg-elevated)",
                      border: `1px solid ${checked ? "var(--accent-primary)" : "var(--border-default)"}`,
                      color: "var(--text-primary)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleBrand(b.id)}
                      className="sr-only"
                      aria-label={`Select ${b.name}`}
                    />
                    <span
                      className="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0"
                      style={{
                        borderColor: checked ? "var(--accent-primary)" : "var(--border-default)",
                        background: checked ? "var(--accent-primary)" : "transparent",
                      }}
                    >
                      {checked && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5L4 7L8 3" stroke="var(--accent-primary-fg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    {b.name}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {error && <p className="w-full text-[12px]" style={{ color: "var(--danger)" }}>{error}</p>}
    </form>
  );
}
