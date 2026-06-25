"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Check, X } from "lucide-react";

interface Invite {
  id: string;
  inviteToken: string;
  brandId: string;
  brandName?: string;
  inviteeName: string | null;
  status: string;
  expiresAt: string | null;
  isRevoked: boolean;
  createdAt: string;
}

interface Brand {
  id: string;
  name: string;
  domain: string;
}

export default function ClientPortalsPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch("/api/client-portal/invites");
      const data = await res.json();
      if (data.invites) {
        setInvites(data.invites);
      } else if (Array.isArray(data)) {
        setInvites(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBrands = useCallback(async () => {
    try {
      const res = await fetch("/api/brands");
      const data = await res.json();
      if (data.brands) setBrands(data.brands);
    } catch {}
  }, []);

  useEffect(() => {
    fetchInvites();
    fetchBrands();
  }, [fetchInvites, fetchBrands]);

  const handleCreateSubmit = useCallback(
    async (brandId: string, inviteeName: string, expiresInDays: number) => {
      setActionLoading(true);
      setMessage("");
      try {
        const res = await fetch("/api/client-portal/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandId,
            inviteeName: inviteeName || undefined,
            expiresInDays,
          }),
        });
        if (res.ok) {
          setMessage("Invite created.");
          setShowCreateModal(false);
          fetchInvites();
        } else {
          const err = await res.json();
          setMessage(err.error || "Failed to create invite.");
        }
      } catch {
        setMessage("Network error.");
      } finally {
        setActionLoading(false);
      }
    },
    [fetchInvites],
  );

  const handleRevoke = useCallback(
    async (inviteId: string) => {
      if (!confirm("Revoke this invite?")) return;
      setActionLoading(true);
      setMessage("");
      try {
        const res = await fetch(`/api/client-portal/invites/${inviteId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setMessage("Invite revoked.");
          fetchInvites();
        } else {
          const err = await res.json();
          setMessage(err.error || "Failed to revoke.");
        }
      } catch {
        setMessage("Network error.");
      } finally {
        setActionLoading(false);
      }
    },
    [fetchInvites],
  );

  const handleCopyLink = useCallback(async (token: string, inviteId: string) => {
    const url = `${window.location.origin}/client-portal/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(inviteId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading client portals...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Client Portals</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          disabled={actionLoading}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
        >
          Create Invite
        </button>
      </div>

      {message && (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Token</th>
              <th className="px-4 py-3 text-left font-medium">Brand</th>
              <th className="px-4 py-3 text-left font-medium">Invitee</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Expires</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invites.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  No invites yet. Create one to share read-only access with a client.
                </td>
              </tr>
            ) : (
              invites.map((invite) => (
                <tr key={invite.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      {invite.inviteToken.slice(0, 12)}...
                    </code>
                  </td>
                  <td className="px-4 py-3">{invite.brandName || invite.brandId.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {invite.inviteeName || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        invite.isRevoked
                          ? "bg-red-100 text-red-700"
                          : invite.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {invite.isRevoked ? "revoked" : invite.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {invite.expiresAt
                      ? new Date(invite.expiresAt).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleCopyLink(invite.inviteToken, invite.id)}
                        className="inline-flex items-center gap-1 text-xs hover:underline disabled:opacity-50"
                        style={{ color: "var(--text-secondary)" }}
                        title="Copy portal link"
                      >
                        {copiedId === invite.id ? (
                          <>
                            <Check style={{ width: 12, height: 12, color: "#22c55e" }} />
                            <span style={{ color: "#22c55e" }}>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy style={{ width: 12, height: 12 }} />
                            Copy link
                          </>
                        )}
                      </button>
                      {!invite.isRevoked && (
                        <button
                          onClick={() => handleRevoke(invite.id)}
                          disabled={actionLoading}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <CreateInviteModal
          brands={brands}
          loading={actionLoading}
          onSubmit={handleCreateSubmit}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

function CreateInviteModal({
  brands,
  loading,
  onSubmit,
  onClose,
}: {
  brands: Brand[];
  loading: boolean;
  onSubmit: (brandId: string, inviteeName: string, expiresInDays: number) => void;
  onClose: () => void;
}) {
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [inviteeName, setInviteeName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [colorScheme, setColorScheme] = useState<"dark" | "light">("dark");
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    selectRef.current?.focus();
    const theme = document.documentElement.getAttribute("data-theme");
    setColorScheme(theme === "light" ? "light" : "dark");
  }, []);

  const canSubmit = selectedBrandId && !loading;

  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--bg-base)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
    colorScheme,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-lg w-full max-w-md p-6 relative"
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Create client portal invite"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4"
          style={{ color: "var(--text-tertiary)" }}
          aria-label="Close"
        >
          <X style={{ width: 18, height: 18 }} />
        </button>

        <h2
          className="text-lg font-semibold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          Create Client Portal Invite
        </h2>

        {brands.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              No brands found. Add a brand first before creating portal invites.
            </p>
            <button
              onClick={onClose}
              className="mt-4 rounded-md px-4 py-2 text-sm font-medium"
              style={{
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            >
              Close
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) onSubmit(selectedBrandId, inviteeName, expiresInDays);
            }}
            className="space-y-4"
          >
            <div>
              <label
                htmlFor="brand-select"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--text-primary)" }}
              >
                Brand <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <select
                ref={selectRef}
                id="brand-select"
                value={selectedBrandId}
                onChange={(e) => setSelectedBrandId(e.target.value)}
                required
                className="w-full rounded-md px-3 py-2 text-sm"
                style={inputStyle}
              >
                <option value="">Select a brand...</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.domain}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="invitee-name"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--text-primary)" }}
              >
                Invitee name{" "}
                <span className="font-normal" style={{ color: "var(--text-tertiary)" }}>
                  (optional)
                </span>
              </label>
              <input
                id="invitee-name"
                type="text"
                value={inviteeName}
                onChange={(e) => setInviteeName(e.target.value)}
                placeholder="e.g. Jane Smith"
                maxLength={100}
                className="w-full rounded-md px-3 py-2 text-sm"
                style={inputStyle}
              />
            </div>

            <div>
              <label
                htmlFor="expires-select"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--text-primary)" }}
              >
                Link expires in
              </label>
              <select
                id="expires-select"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                className="w-full rounded-md px-3 py-2 text-sm"
                style={inputStyle}
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-md px-4 py-2 text-sm font-medium"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex-1 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{
                  backgroundColor: "var(--accent-primary)",
                  color: "var(--accent-primary-fg, #fff)",
                }}
              >
                {loading ? "Creating..." : "Create Invite"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
