/**
 * 16 Nov, part 7 -- the verticals the free sample audit offers: only those with a question pack (db/seed/verticals:
 * au-tradies, au-allied-health, au-saas). The sample brand isn't confirmed, so its questions come from its vertical's
 * pack -- and the page offered Professional Services and Real Estate, which have none, so those samples failed ("No
 * prompts available"). POST /api/sample-audit takes only these.
 */
export const SAMPLE_AUDIT_VERTICALS = [
  { value: "tradies", label: "Tradies" },
  { value: "allied_health", label: "Allied health" },
  { value: "saas", label: "SaaS" },
] as const;

export type SampleAuditVertical = (typeof SAMPLE_AUDIT_VERTICALS)[number]["value"];

export const SAMPLE_AUDIT_VERTICAL_VALUES = SAMPLE_AUDIT_VERTICALS.map((v) => v.value) as [
  SampleAuditVertical,
  ...SampleAuditVertical[],
];
