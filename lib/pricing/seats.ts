/**
 * 6 Nov -- the seats the team page shows: the count POST
 * /api/organizations/[orgId]/members/invite makes inside its transaction (active
 * members plus every invite not yet accepted), against the plan's seats in
 * lib/pricing/tiers.ts.
 */

/** Whether a member row takes a seat. */
export function takesSeat(member: {
  isActive: boolean;
  acceptedAt: string | Date | null;
}): boolean {
  return member.isActive || member.acceptedAt === null;
}

/** "3 of 5 seats used", "1 of 1 seat used", or "3 seats used" on a plan with no limit. */
export function seatUsageText(used: number, limit: number): string {
  const seats = (n: number) => (n === 1 ? "seat" : "seats");
  return Number.isFinite(limit)
    ? `${used} of ${limit} ${seats(limit)} used`
    : `${used} ${seats(used)} used`;
}
