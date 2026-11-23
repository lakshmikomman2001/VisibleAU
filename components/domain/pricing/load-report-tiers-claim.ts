import { connection } from "next/server";
import { isEnabled } from "@/lib/flags/flags";

/**
 * S01 part 8 (LLD 8.1.7 "Public claims"): whether the pricing page may list report types -- only while report_v2 is on
 * globally (the workspace overrides used to try it on one workspace never reach a public page). Read per request
 * (connection()), so switching the setting off takes the row off the next page load. With no database configured (a
 * build without one, unit tests) there's no claim, as lib/directories/registry-store.ts reads nothing then.
 * isEnabled never throws: if the settings can't be read, the row isn't shown.
 */
export async function loadReportTiersClaim(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  await connection();
  return isEnabled("report_v2", null);
}
