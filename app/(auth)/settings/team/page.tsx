"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { InviteForm } from "@/components/domain/governance/invite-form";
import { MemberRow } from "@/components/domain/governance/member-row";
import { PendingInviteRow } from "@/components/domain/governance/pending-invite-row";
import { RoleLegend } from "@/components/domain/governance/role-legend";
import type { OrgRole } from "@/lib/governance";
import { seatUsageText, takesSeat } from "@/lib/pricing/seats";
import { getTierDefinition, seatLimitFor } from "@/lib/pricing/tiers";

interface MemberData {
  id: string;
  userId: string;
  role: string;
  brandAccess: string[] | null;
  isActive: boolean;
  invitedAt: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  name: string | null;
  email: string | null;
  /** The address the invite went to (migration 0130). */
  invitedEmail: string | null;
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
        setSeatLimit(seatLimitFor(t));
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

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const canManage = currentRole === "owner" || currentRole === "admin";

  const [resendNotice, setResendNotice] = useState<Record<string, string>>({});
  const handleResend = async (
    invite: Pick<MemberData, "id" | "role" | "brandAccess" | "email" | "invitedEmail">,
  ) => {
    const address = invite.invitedEmail ?? invite.email;
    if (!orgId || !address) return;
    const res = await fetch(`/api/organizations/${orgId}/members/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: address,
        role: invite.role,
        brandAccess: invite.brandAccess,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { emailSent?: boolean; error?: string };
    setResendNotice((prev) => ({
      ...prev,
      [invite.id]: !res.ok
        ? (body.error ?? "Couldn't resend")
        : body.emailSent
          ? "Sent again"
          : "Email couldn't be sent",
    }));
  };

  const handleRemove = async (memberId: string) => {
    if (!orgId || !confirm("Remove this member?")) return;
    const res = await fetch(`/api/organizations/${orgId}/members/${memberId}`, {
      method: "DELETE",
    });
    // Follow-ups from 6e27afc..01a6a8c, part 3: a refusal (the last owner, say) reads as the server sent it.
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: unknown };
      setError(typeof body.error === "string" ? body.error : "Couldn't remove this member.");
      return;
    }
    setError(null);
    fetchMembers();
  };

  // 6 Nov: the seats the invite route counts (lib/pricing/seats.ts) against the plan's
  // (lib/pricing/tiers.ts), on every plan. It used to be a locked overlay below Agency.
  const active = members.filter(takesSeat);
  const pending = members.filter((m) => !m.acceptedAt);
  const accepted = members.filter((m) => m.acceptedAt && m.isActive);
  // TODO(seats): all roles count toward the limit; revisit exempting 'viewer'.
  const usedSeats = active.length;
  const seatsAvailable = usedSeats < seatLimit;
  const planName = getTierDefinition(tier)?.name ?? tier;

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 32 }}>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
              Team
            </h1>
            <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
              {accepted.length} member{accepted.length !== 1 ? "s" : ""}
              {" · "}
              {pending.length} pending invite{pending.length !== 1 ? "s" : ""}
              {` · ${planName} plan · ${seatUsageText(usedSeats, seatLimit)}`}
            </p>
          </div>
        </div>

        {/* What each role can do, from the permission matrix (Sri, 8 Nov). */}
        <RoleLegend />

        {error && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-lg"
            style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-14 rounded-lg animate-pulse"
                style={{ background: "var(--bg-elevated)" }}
              />
            ))}
          </div>
        ) : (
          <>
            {/* Members table */}
            {/* On a phone it scrolls sideways inside its card (rows keep
                  a 640px minimum) instead of clipping. */}
            <div
              className="rounded-xl overflow-x-auto mb-6"
              style={{ border: "1px solid var(--border-default)" }}
            >
              <div
                className="grid px-5 py-3 text-[10px] font-semibold uppercase tracking-wider border-b"
                style={{
                  gridTemplateColumns: "2fr 1fr 1fr 100px 80px",
                  minWidth: 640,
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
              {active
                .filter((m) => m.acceptedAt)
                .map((m) => (
                  <MemberRow
                    key={m.id}
                    id={m.id}
                    name={m.name}
                    email={m.email ?? m.invitedEmail}
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
              <div
                className="rounded-xl p-5 mb-6"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                }}
              >
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
                  <PendingInviteRow
                    key={inv.id}
                    invite={inv}
                    canManage={canManage}
                    notice={resendNotice[inv.id]}
                    onResend={handleResend}
                    onCancel={handleRemove}
                  />
                ))}
              </div>
            )}

            {/* Invite form */}
            {canManage && orgId && (
              <div
                className="rounded-xl p-5"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                }}
              >
                <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  Invite member
                </h3>
                {seatsAvailable ? (
                  <>
                    <p
                      className="text-[12px] mb-3"
                      style={{ color: "var(--text-tertiary)" }}
                      data-seat-usage
                    >
                      {seatUsageText(usedSeats, seatLimit)}
                    </p>
                    <InviteForm orgId={orgId} onInvited={fetchMembers} />
                  </>
                ) : (
                  <p
                    className="text-[13px] py-2"
                    style={{ color: "var(--text-secondary)" }}
                    data-seat-limit
                  >
                    {seatUsageText(usedSeats, seatLimit)}.{" "}
                    <Link
                      href="/pricing"
                      className="font-medium underline"
                      style={{ color: "var(--accent-primary)" }}
                    >
                      See the plans with more seats
                    </Link>
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
