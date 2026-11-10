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
  /** When this workspace's row was last written; null when it has none. The facts are the configuration's. */
  recordedAt: Date | null;
}

const CURRENT = new Map(RESIDENCY_CONFIG.map((entry) => [entry.dataType, entry]));

/**
 * Where a workspace's data is kept: every data type the product has (residency-config.ts), in its order, with
 * the configuration's values. The workspace's data_residency_log rows add only when each was last written
 * (provisioning writes them and the weekly audit-data-retention run refreshes them), so a corrected claim
 * (2 Nov: PDF reports' retention) shows at once.
 *
 * Playwright-run follow-ups (10 Nov), part 8: it returned the rows alone, so a workspace without any (made
 * before provisioning wrote them, or whose provisioning stopped part-way) got an empty list and a page that
 * said "loading" for good. The facts don't depend on the rows. A row whose type the configuration no longer
 * has keeps its own values, after the configured ones.
 */
export async function getDataResidency(organizationId: string): Promise<ResidencyEntry[]> {
  const rows = await withRlsContext(organizationId, (tx) =>
    tx.select().from(dataResidencyLog).where(eq(dataResidencyLog.organizationId, organizationId)),
  );
  const recordedAt = new Map(rows.map((r) => [r.dataType, r.recordedAt]));

  const configured: ResidencyEntry[] = RESIDENCY_CONFIG.map((c) => ({
    dataType: c.dataType,
    storageRegion: c.storageRegion,
    provider: c.provider,
    retentionPeriod: c.retentionPeriod,
    encryptionStatus: c.encryptionStatus,
    recordedAt: recordedAt.get(c.dataType) ?? null,
  }));
  const unconfigured: ResidencyEntry[] = rows
    .filter((r) => !CURRENT.has(r.dataType))
    .map((r) => ({
      dataType: r.dataType,
      storageRegion: r.storageRegion,
      provider: r.provider,
      retentionPeriod: r.retentionPeriod,
      encryptionStatus: r.encryptionStatus,
      recordedAt: r.recordedAt,
    }));
  return [...configured, ...unconfigured];
}
