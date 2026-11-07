import { Fragment } from "react";
import {
  ORG_ROLES,
  ROLE_NAMES,
  refusalMessage,
  roleDescription,
} from "@/lib/governance/permissions";

/**
 * What each role can do, on the Team page -- written from the permission matrix
 * (lib/governance/permissions.ts roleDescription), never by hand, so it says what the server
 * allows (Sri, 8 Nov). The chips it replaces said Admin "Manage brands & team", which read as if
 * an admin could delete a brand: only the owner can, and it says so.
 */
export function RoleLegend() {
  return (
    <div
      data-role-legend
      className="mb-6 rounded-md"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        padding: "12px 16px",
      }}
    >
      <dl
        className="grid gap-x-4 gap-y-2"
        style={{ gridTemplateColumns: "max-content minmax(0, 1fr)", margin: 0 }}
      >
        {ORG_ROLES.map((role) => (
          <Fragment key={role}>
            <dt className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
              {ROLE_NAMES[role]}
            </dt>
            <dd className="text-[12px]" style={{ color: "var(--text-secondary)", margin: 0 }}>
              {roleDescription(role)}
            </dd>
          </Fragment>
        ))}
      </dl>
      <p
        className="text-[12px] font-medium mt-3"
        style={{ color: "var(--text-primary)", margin: "12px 0 0" }}
        data-role-note="delete_brand"
      >
        {refusalMessage("delete_brand")}
      </p>
    </div>
  );
}
