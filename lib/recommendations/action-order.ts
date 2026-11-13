/**
 * 14 Nov (Sri approved): one order for an audit's open action items, wherever they're listed -- the audit page's
 * general advice and the PDF's Action Plan (app/api/audits/[auditId]/export/route.ts), so the two match:
 * priority (expected impact: high, medium, low), then the date it was made (oldest first), then title.
 *
 * The export read them with no ORDER BY, so the PDF's order was whatever Postgres returned: the off-parity
 * snapshot saw the same audit's three items in two orders (13 Nov).
 */
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export interface OrderedActionItem {
  expectedImpactScore: string;
  createdAt: Date | string;
  title: string;
}

function time(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function compareActionItems(a: OrderedActionItem, b: OrderedActionItem): number {
  const priority =
    (PRIORITY_RANK[a.expectedImpactScore] ?? 3) - (PRIORITY_RANK[b.expectedImpactScore] ?? 3);
  if (priority !== 0) return priority;
  const created = time(a.createdAt) - time(b.createdAt);
  if (created !== 0) return created;
  return a.title.localeCompare(b.title);
}
