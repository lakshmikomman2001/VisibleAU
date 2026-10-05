import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { citabilityMethods } from "@/db/schema";

export async function getCitabilityCatalogue(limit?: number) {
  // Task XXX: select() returned every column, including effectSizeNotes --
  // which can still carry live-row text not yet re-attributed by the
  // gated VVV/UUU prod update. Narrowed to the fields safe for any future
  // caller to display without re-auditing this function again.
  const methods = await db
    .select({
      methodKey: citabilityMethods.methodKey,
      title: citabilityMethods.title,
      description: citabilityMethods.description,
      source: citabilityMethods.source,
      effectSizePct: citabilityMethods.effectSizePct,
      appliesTo: citabilityMethods.appliesTo,
      citationUrl: citabilityMethods.citationUrl,
      sourceType: citabilityMethods.sourceType,
    })
    .from(citabilityMethods)
    .orderBy(desc(citabilityMethods.effectSizePct))
    .limit(limit ?? 100);
  return methods;
}

export async function getTopCitabilityMethods(n = 10) {
  return getCitabilityCatalogue(n);
}
