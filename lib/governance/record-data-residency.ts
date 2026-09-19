import { and, eq, notInArray } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { dataResidencyLog } from "@/db/schema";
import { RESIDENCY_CONFIG } from "./residency-config";

export async function recordDataResidency(organizationId: string): Promise<void> {
  for (const entry of RESIDENCY_CONFIG) {
    await serviceDb
      .insert(dataResidencyLog)
      .values({
        organizationId,
        dataType: entry.dataType,
        storageRegion: entry.storageRegion,
        provider: entry.provider,
        retentionPeriod: entry.retentionPeriod,
        encryptionStatus: entry.encryptionStatus,
      })
      .onConflictDoUpdate({
        target: [dataResidencyLog.organizationId, dataResidencyLog.dataType],
        set: {
          storageRegion: entry.storageRegion,
          provider: entry.provider,
          retentionPeriod: entry.retentionPeriod,
          encryptionStatus: entry.encryptionStatus,
          recordedAt: new Date(),
        },
      });
  }

  await serviceDb.delete(dataResidencyLog).where(
    and(
      eq(dataResidencyLog.organizationId, organizationId),
      notInArray(
        dataResidencyLog.dataType,
        RESIDENCY_CONFIG.map((entry) => entry.dataType),
      ),
    ),
  );
}
