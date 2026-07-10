"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MemberRow } from "@/components/domain/governance/member-row";
import { InviteForm } from "@/components/domain/governance/invite-form";
import type { OrgRole } from "@/lib/governance";
import { TierGate } from "@/components/phase2/tier-gate";
import { isTierAtLeast, TIER_SEAT_LIMITS } from "@/lib/brands";

interface MemberData {
  id: string;
  userId: string;
  role: string;
  brandAccess: string[] | null;
  isActive: boolean;
  acceptedAt: string | null;
  name: string | null;
  email: string | null;
}

export default function TeamPage() {
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<OrgRole>("viewer");
  const [tier, setTier] = useState<string>("free");
  const [seatLimit, setSeatLimit] = useState<number>(1);

  const fetchMembers = useCallback(async () => {
    try {
      const meRes = await fetch("/api/auth/me");
      if (!meRes.ok) return;
      const me = await meRes.json();
      setOrgId(me.organizationId);
      setCurrentUserId(me.id);
      setCurrentRole((me.role as OrgRole) ?? "viewer");
      if (me.tier) {
        const t = me.tier as string;
        setTier(t);
        setSeatLimit(TIER_SEAT_LIMITS[t] ?? 1);
      }

      const res = await fetch(`/api/organizations/${me.organizationId}/members`);
      if (!res.ok) throw new Error("Failed to load team");
      const data = await res.json();
      setMembers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const canManage = currentRole === "owner" || currentRole === "admin";

  const handleRemove = async (memberId: string) => {
    if (!orgId || !confirm("Remove this member?")) return;
    await fetch(`/api/organizations/${orgId}/members/${memberId}`, { method: "DELETE" });
    fetchMembers();
  };

  const active = members.filter((m) => m.isActive || !m.acceptedAt);
  const pending = members.filter((m) => !m.acceptedAt);
  const accepted = members.filter((m) => m.acceptedAt && m.isActive);
  // TODO(seats): all roles count toward the limit; revisit exempting 'viewer'.
  const usedSeats = accepted.length + pending.length;
  const seatsAvailable = usedSeats < seatLimit;
  const tierLabel = tier.replace(/_/g, " ");
  const isTeamAvailable = isTierAtLeast(tier, "agency");

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 32 }}>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Team</h1>
            <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
              {accepted.length} member{accepted.length !== 1 ? "s" : ""}
              {" · "}{pending.length} pending invite{pending.length !== 1 ? "s" : ""}
              {tierLabel && ` · ${tierLabel} plan (${seatLimit} seat${seatLimit !== 1 ? "s" : ""})`}
            </p>
          </div>
        </div>

        {/* Role legend */}
        <div className="flex gap-3 mb-6 flex-wrap">
          {[
            { role: "Owner", desc: "Full access, billing" },
            { role: "Admin", desc: "Manage brands & team" },
            { role: "Analyst", desc: "Run audits, view reports" },
            { role: "Viewer", desc: "Read-only access" },
          ].map((r) => (
            <div
              key={r.role}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
            >
              <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{r.role}</span>
              <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{r.desc}</span>
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
            {error}
          </div>
        )}

        <TierGate requiredTier="Agency" locked={!isTeamAvailable}>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: "var(--bg-elevated)" }} />
              ))}
            </div>
          ) : (
            <>
              {/* Members table */}
              <div className="rounded-xl overflow-hidden mb-6" style={{ border: "1px solid var(--border-default)" }}>
                <div
                  className="grid px-5 py-3 text-[10px] font-semibold uppercase tracking-wider border-b"
                  style={{
                    gridTemplateColumns: "2fr 1fr 1fr 100px 80px",
                    borderColor: "var(--border-subtle)",
                    background: "var(--bg-elevated)",
                    color: "var(--text-tertiary)",
                  }}
                >
                  <div>Member</div>
                  <div>Role</div>
                  <div>Brand access</div>
                  <div>Joined</div>
                  <div>Actions</div>
                </div>
                {active.filter((m) => m.acceptedAt).map((m) => (
                  <MemberRow
                    key={m.id}
                    id={m.id}
                    name={m.name}
                    email={m.email}
                    role={m.role as OrgRole}
                    brandAccess={m.brandAccess}
                    isActive={m.isActive}
                    acceptedAt={m.acceptedAt}
                    isCurrentUser={m.userId === currentUserId}
                    canManage={canManage}
                    onRemove={canManage ? handleRemove : undefined}
                  />
                ))}
              </div>

              {/* Pending invites */}
              {pending.length > 0 && (
                <div className="rounded-xl p-5 mb-6" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
                  <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                    Pending invites
                    <span
                      className="ml-2 text-[11px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
                    >
                      {pending.length}
                    </span>
                  </h3>
                  {pending.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between py-2">
                      <div>
                        <div className="text-[13px]" style={{ color: "var(--text-primary)" }}>{inv.email}</div>
                        <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{inv.role}</div>
                      </div>
                      {canManage && (
                        <button
                          onClick={() => handleRemove(inv.id)}
                          className="h-7 px-3 text-[11px] font-medium rounded-md"
                          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Invite form */}
              {canManage && orgId && (
                <div className="rounded-xl p-5" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
                  <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Invite member</h3>
                  {seatsAvailable ? (
                    <InviteForm orgId={orgId} onInvited={fetchMembers} />
                  ) : (
                    <div className="flex items-center gap-3 py-2">
                      <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                        Seat limit reached ({usedSeats}/{seatLimit}).{" "}
                        <Link
                          href="/settings/billing"
                          className="font-medium underline"
                          style={{ color: "var(--accent-primary)" }}
                        >
                          Upgrade to add more
                        </Link>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </TierGate>
      </div>
    </div>
  );
}
