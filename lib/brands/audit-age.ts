/**
 * Live invite test follow-ups (8 Nov), part 4 -- the "Last audit" badge's colour comes from how long ago the
 * brand was last audited, not just from whether that audit finished: Sri saw a green badge on an audit 22
 * days old. The bands: green within 7 days, amber from 7 to 30 days, red after 30. A latest audit that is
 * running, queued or failed keeps the colour that says so (blue, grey, red) -- what happened, not how fresh.
 * One rule for every badge that shows it (the brands list, the brand row).
 */
export const AUDIT_AGE_BANDS = { freshDays: 7, ageingDays: 30 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export type LastAuditTone =
  | "fresh"
  | "ageing"
  | "stale"
  | "running"
  | "queued"
  | "failed"
  | "never";

export function lastAuditTone(
  lastAuditAt: string | Date | null,
  status: string | null,
  now: Date = new Date(),
): LastAuditTone {
  if (!lastAuditAt) return "never";
  if (status === "running") return "running";
  if (status === "pending") return "queued";
  if (status === "failed") return "failed";
  const days = (now.getTime() - new Date(lastAuditAt).getTime()) / DAY_MS;
  if (days <= AUDIT_AGE_BANDS.freshDays) return "fresh";
  if (days <= AUDIT_AGE_BANDS.ageingDays) return "ageing";
  return "stale";
}

/** The badge's colours for each tone, from the theme's semantic tokens. */
export const LAST_AUDIT_TONE_STYLE: Record<LastAuditTone, { bg: string; color: string }> = {
  fresh: { bg: "var(--success-soft)", color: "var(--success)" },
  ageing: { bg: "var(--warning-soft)", color: "var(--warning)" },
  stale: { bg: "var(--danger-soft)", color: "var(--danger)" },
  running: { bg: "var(--info-soft)", color: "var(--info)" },
  queued: { bg: "var(--accent-muted)", color: "var(--text-secondary)" },
  failed: { bg: "var(--danger-soft)", color: "var(--danger)" },
  never: { bg: "var(--accent-muted)", color: "var(--text-tertiary)" },
};
