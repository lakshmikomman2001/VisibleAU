import type { DbClient } from "@/db/client";
import { citations, hallucinationIncidents } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type ClaimType =
  | "wrong_price"
  | "wrong_location"
  | "wrong_product"
  | "wrong_founder"
  | "competitor_confusion"
  | "other";

export type Severity = "critical" | "warning" | "info";

const SEVERITY_MAP: Record<ClaimType, Severity> = {
  wrong_price: "critical",
  wrong_founder: "critical",
  competitor_confusion: "critical",
  wrong_product: "warning",
  wrong_location: "warning",
  other: "info",
};

export function classifyClaimType(
  hallucinationFlags: Record<string, unknown>[] | string[] | null,
): ClaimType {
  if (!hallucinationFlags || !Array.isArray(hallucinationFlags)) return "other";

  const flagStrings = hallucinationFlags.map((f) =>
    typeof f === "string" ? f : JSON.stringify(f),
  );
  const joined = flagStrings.join(" ").toLowerCase();

  if (joined.includes("price_mismatch")) return "wrong_price";
  if (joined.includes("location_mismatch")) return "wrong_location";
  if (joined.includes("competitor_mention")) return "competitor_confusion";
  if (joined.includes("founder_mismatch")) return "wrong_founder";
  if (joined.includes("product_mismatch")) return "wrong_product";
  return "other";
}

export function getSeverity(claimType: ClaimType): Severity {
  return SEVERITY_MAP[claimType];
}

export interface DetectResult {
  inserted: number;
  criticalCount: number;
  warningCount: number;
}

export async function detectHallucinations(
  tx: DbClient,
  auditId: string,
  brandId: string,
  organizationId: string,
): Promise<DetectResult> {
  const inaccurate = await tx
    .select()
    .from(citations)
    .where(
      and(
        eq(citations.auditId, auditId),
        eq(citations.isAccurate, false),
      ),
    );

  let inserted = 0;
  let criticalCount = 0;
  let warningCount = 0;

  for (const cit of inaccurate) {
    const flags = cit.hallucinationFlags as Record<string, unknown>[] | null;
    const claimType = classifyClaimType(flags);
    const severity = getSeverity(claimType);

    await tx.insert(hallucinationIncidents).values({
      brandId,
      organizationId,
      citationId: cit.id,
      engine: cit.engine,
      prompt: cit.prompt,
      incorrectClaim: cit.responseSnippet ?? "Unknown claim",
      correctValue: null,
      claimType,
      severity,
    });

    inserted++;
    if (severity === "critical") criticalCount++;
    if (severity === "warning") warningCount++;
  }

  return { inserted, criticalCount, warningCount };
}
