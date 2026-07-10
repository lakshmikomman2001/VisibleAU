import { eq } from "drizzle-orm";
import { withRlsContext } from "@/db/client";
import { dataResidencyLog } from "@/db/schema";

export interface ResidencyEntry {
  dataType: string;
  storageRegion: string;
  provider: string;
  retentionPeriod: string;
  encryptionStatus: string;
  recordedAt: Date;
}

export async function getDataResidency(
  organizationId: string,
): Promise<ResidencyEntry[]> {
  return withRlsContext(organizationId, async (tx) => {
    const rows = await tx
      .select()
      .from(dataResidencyLog)
      .where(eq(dataResidencyLog.organizationId, organizationId));

    return rows.map((r) => ({
      dataType: r.dataType,
      storageRegion: r.storageRegion,
      provider: r.provider,
      retentionPeriod: r.retentionPeriod,
      encryptionStatus: r.encryptionStatus,
      recordedAt: r.recordedAt,
    }));
  });
}
