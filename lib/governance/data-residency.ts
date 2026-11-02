import { eq } from "drizzle-orm";
import { withRlsContext } from "@/db/client";
import { dataResidencyLog } from "@/db/schema";
import { RESIDENCY_CONFIG } from "./residency-config";

export interface ResidencyEntry {
  dataType: string;
  storageRegion: string;
  provider: string;
  retentionPeriod: string;
  encryptionStatus: string;
  recordedAt: Date;
}

const CURRENT = new Map(RESIDENCY_CONFIG.map((entry) => [entry.dataType, entry]));

/**
 * The workspace's residency rows, each with the current configuration's
 * values (residency-config.ts). The rows are written from it when a
 * workspace is created and refreshed by the weekly audit-data-retention run,
 * so a corrected claim (2 Nov: PDF reports' retention) would otherwise show
 * its old text until the next Sunday.
 */
export async function getDataResidency(organizationId: string): Promise<ResidencyEntry[]> {
  return withRlsContext(organizationId, async (tx) => {
    const rows = await tx
      .select()
      .from(dataResidencyLog)
      .where(eq(dataResidencyLog.organizationId, organizationId));

    return rows.map((r) => {
      const current = CURRENT.get(r.dataType);
      return {
        dataType: r.dataType,
        storageRegion: current?.storageRegion ?? r.storageRegion,
        provider: current?.provider ?? r.provider,
        retentionPeriod: current?.retentionPeriod ?? r.retentionPeriod,
        encryptionStatus: current?.encryptionStatus ?? r.encryptionStatus,
        recordedAt: r.recordedAt,
      };
    });
  });
}
