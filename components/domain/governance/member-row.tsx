"use client";

import { RoleBadge } from "./role-badge";
import type { OrgRole } from "@/lib/governance";

interface MemberRowProps {
  id: string;
  name: string | null;
  email: string | null;
  role: OrgRole;
  brandAccess: string[] | null;
  isActive: boolean;
  acceptedAt: string | null;
  isCurrentUser: boolean;
  canManage: boolean;
  onEdit?: (id: string) => void;
  onRemove?: (id: string) => void;
}

export function MemberRow({
  id,
  name,
  email,
  role,
  brandAccess,
  isActive,
  acceptedAt,
  isCurrentUser,
  canManage,
  onEdit,
  onRemove,
}: MemberRowProps) {
  const initials = (name ?? email ?? "?")[0].toUpperCase();
  const brandLabel = brandAccess === null ? "All brands" : `${brandAccess.length} brand${brandAccess.length !== 1 ? "s" : ""}`;

  return (
    <div
      className="grid px-5 py-3.5 items-center border-b last:border-b-0 gap-2"
      style={{
        gridTemplateColumns: "2fr 1fr 1fr 100px 80px",
        borderColor: "var(--border-subtle)",
        background: "var(--bg-elevated)",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0"
          style={{ background: "var(--bg-active)", color: "var(--text-primary)" }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {name ?? email}
            </span>
            {isCurrentUser && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                style={{ background: "var(--accent-muted)", color: "var(--text-tertiary)" }}
              >
                you
              </span>
            )}
            {!isActive && (
              <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ color: "var(--text-tertiary)" }}>
                inactive
              </span>
            )}
          </div>
          {name && <div className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>{email}</div>}
        </div>
      </div>

      <div><RoleBadge role={role} /></div>

      <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{brandLabel}</div>

      <div className="text-[12px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
        {acceptedAt
          ? new Date(acceptedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
          : "—"}
      </div>

      <div className="flex items-center gap-1">
        {canManage && !isCurrentUser && (
          <>
            {onEdit && (
              <button
                onClick={() => onEdit(id)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-[12px]"
                style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
                aria-label={`Edit ${name ?? email}`}
              >
                ✎
              </button>
            )}
            {onRemove && (
              <button
                onClick={() => onRemove(id)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-[12px]"
                style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
                aria-label={`Remove ${name ?? email}`}
              >
                ✕
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
