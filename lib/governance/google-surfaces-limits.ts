/**
 * Google AI surfaces -- limits both the server (lib/governance/google-surfaces.ts) and the operator's page
 * (components/domain/admin/google-surfaces-admin.tsx, a client component) need. Kept apart so the page
 * doesn't import the database client.
 */

/** A per-audit ceiling above this is refused (a typo shouldn't spend dollars per audit). */
export const MAX_COST_CEILING_USD = 1;
