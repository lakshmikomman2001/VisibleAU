"use client";

import type { OrgRole } from "@/lib/governance";
import { RoleBadge } from "./role-badge";

export interface PendingInvite {
  id: string;
  role: string;
  brandAccess: string[] | null;
  invitedAt: string | null;
  expiresAt: string;
  /** The invitee's profile address: only there when their profile is in this workspace. */
  email: string | null;
  /** The address the invite was emailed to (migration 0130); null on invites sent before it. */
  invitedEmail: string | null;
}

/** "14 Nov", in Sydney time, with the year when it isn't this one. */
function inviteDate(iso: string, now: Date): string {
  const when = new Date(iso);
  const year = (d: Date) =>
    d.toLocaleDateString("en-AU", { year: "numeric", timeZone: "Australia/Sydney" });
  return when.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    ...(year(when) !== year(now) ? { year: "numeric" } : {}),
    timeZone: "Australia/Sydney",
  });
}

/**
 * Team follow-ups (31 Oct), item 1 -- one pending invite on the Team page: who it's for, the role and
 * brands it gives, when it was sent and when it expires (or did), with Resend and Cancel for those who
 * manage the team. Wraps instead of overflowing on a phone.
 */
export function PendingInviteRow({
  invite,
  canManage,
  notice,
  onResend,
  onCancel,
  now = new Date(),
}: {
  invite: PendingInvite;
  canManage: boolean;
  notice?: string;
  onResend: (invite: PendingInvite) => void;
  onCancel: (id: string) => void;
  now?: Date;
}) {
  const address = invite.invitedEmail ?? invite.email;
  const expired = new Date(invite.expiresAt).getTime() <= now.getTime();
  const brands =
    invite.brandAccess === null
      ? "All brands"
      : `${invite.brandAccess.length} brand${invite.brandAccess.length !== 1 ? "s" : ""}`;

  return (
    <div
      data-pending-invite
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 border-b last:border-b-0"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <div className="min-w-0 flex-1" style={{ flexBasis: 220 }}>
        <div
          data-invite-email
          className="text-[13px] font-medium break-all"
          style={{ color: address ? "var(--text-primary)" : "var(--text-tertiary)" }}
        >
          {address ?? "Address not recorded (sent before addresses were kept)"}
        </div>
        <div
          className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]"
          style={{ color: "var(--text-tertiary)" }}
        >
          <RoleBadge role={invite.role as OrgRole} />
          <span>{brands}</span>
          {invite.invitedAt && <span>Sent {inviteDate(invite.invitedAt, now)}</span>}
          <span
            data-invite-expiry
            style={expired ? { color: "var(--warning)", fontWeight: 500 } : undefined}
          >
            {expired ? "Expired" : "Expires"} {inviteDate(invite.expiresAt, now)}
          </span>
        </div>
      </div>
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          {notice && (
            <span role="status" className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
              {notice}
            </span>
          )}
          <button
            type="button"
            onClick={() => onResend(invite)}
            disabled={!address}
            title={address ? undefined : "Cancel it and invite the address again"}
            className="h-7 px-3 text-[11px] font-medium rounded-md"
            style={{
              background: "var(--bg-hover)",
              color: "var(--text-primary)",
              opacity: address ? 1 : 0.5,
            }}
          >
            Resend
          </button>
          <button
            type="button"
            onClick={() => onCancel(invite.id)}
            className="h-7 px-3 text-[11px] font-medium rounded-md"
            style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
