"use client";

import { useCallback, useEffect, useState } from "react";

interface Invite {
  id: string;
  inviteToken: string;
  brandId: string;
  brandName?: string;
  inviteeName: string | null;
  inviteeEmail: string | null;
  status: string;
  expiresAt: string | null;
  isRevoked: boolean;
  createdAt: string;
}

export default function ClientPortalsPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState("");

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch("/api/client-portal/invites");
      const data = await res.json();
      if (Array.isArray(data)) {
        setInvites(data);
      } else if (data.invites) {
        setInvites(data.invites);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const handleCreate = useCallback(async () => {
    const brandId = prompt("Enter Brand ID to create invite for:");
    if (!brandId) return;
    const email = prompt("Invitee email (optional):") || undefined;

    setActionLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/client-portal/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, inviteeEmail: email }),
      });
      if (res.ok) {
        setMessage("Invite created.");
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
  }, [fetchInvites]);

  const handleRevoke = useCallback(
    async (inviteId: string) => {
      if (!confirm("Revoke this invite?")) return;
      setActionLoading(true);
      setMessage("");
      try {
        const res = await fetch(`/api/client-portal/invites/${inviteId}/revoke`, {
          method: "POST",
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
          onClick={handleCreate}
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
                    {invite.inviteeEmail || invite.inviteeName || "—"}
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
                    {!invite.isRevoked && (
                      <button
                        onClick={() => handleRevoke(invite.id)}
                        disabled={actionLoading}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
