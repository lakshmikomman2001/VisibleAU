"use client";

import { createContext, useContext } from "react";
import {
  canPerformAction,
  type OrgRole,
  type PermissionAction,
} from "@/lib/governance/permissions";

/**
 * Team follow-ups (31 Oct), items 6 and 10 -- the signed-in user's role, for client components that hide
 * or disable what it can't do. The (auth) layout reads it with roleOf(), the same read every server check
 * makes, so a control shows only where the server would allow it. The server refuses either way: this only
 * spares a click that would end in a 403.
 */
const RoleContext = createContext<OrgRole | null>(null);

export function RoleProvider({ role, children }: { role: OrgRole; children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

/** The role, or null outside the (auth) layout. */
export function useRole(): OrgRole | null {
  return useContext(RoleContext);
}

/**
 * Whether the signed-in user's role may do `action`. Outside the (auth) layout (a component rendered on its
 * own) it can't tell, so it doesn't hide anything: the server's check is what holds.
 */
export function useCan(action: PermissionAction): boolean {
  const role = useRole();
  return role === null || canPerformAction(role, action);
}
