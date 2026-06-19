import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { citabilityMethods } from "@/db/schema";

export async function getCitabilityCatalogue(limit?: number) {
  const methods = await db
    .select()
    .from(citabilityMethods)
    .orderBy(desc(citabilityMethods.effectSizePct))
    .limit(limit ?? 100);
  return methods;
}

export async function getTopCitabilityMethods(n = 10) {
  return getCitabilityCatalogue(n);
}
