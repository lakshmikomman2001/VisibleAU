export interface OpenIncident {
  severity: "critical" | "warning" | "info";
  isFalsePositive: boolean;
}

export function computeHallucinationRisk(incidents: OpenIncident[]): number {
  const open = incidents.filter((i) => !i.isFalsePositive);
  const critical = open.filter((i) => i.severity === "critical").length;
  const warning = open.filter((i) => i.severity === "warning").length;
  const info = open.filter((i) => i.severity === "info").length;
  return Math.min(100, 15 * critical + 5 * warning + 1 * info);
}
